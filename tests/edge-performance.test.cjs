'use strict';

// Optional, synthetic performance probe. Requires Edge and playwright-core.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright-core');

async function run() {
  const extension = process.env.EXTENSION_UNDER_TEST || path.resolve(__dirname, '..');
  const baseline = process.argv.includes('--baseline');
  const context = await chromium.launchPersistentContext('', {
    channel: 'msedge', headless: true, ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--disable-sync', '--disable-background-networking', '--disable-extensions-except=' + extension, '--load-extension=' + extension]
  });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const root = 'chrome-extension://' + new URL(worker.url()).hostname;
    const options = await context.newPage();
    await options.goto(root + '/options/options.html');
    const send = message => options.evaluate(value => chrome.runtime.sendMessage(value), message);
    const { settings } = await send({ action: 'getSettings' });
    settings.trigger.autoTranslate = false;
    settings.advanced.lazyTranslate = false;
    settings.display.translatePageTitle = false;
    settings.display.translateImgAlt = false;
    assert.equal((await send({ action: 'saveSettings', settings })).success, true);
    const texts = Array.from({ length: 1800 }, (_, i) => `Performance sample paragraph ${i} across the valley.`);
    const updates = Array.from({ length: 5 }, (_, i) => `Updated sample paragraph ${i} across the valley.`);
    const glossary = { _global: [...texts, ...updates].map((source, i) => ({ source, target: '已译示例' + i, matchType: 'exact' })) };
    await send({ action: 'saveGlossary', glossary });
    const fixture = '<!doctype html><meta charset="utf-8"><html lang="en"><body>' +
      texts.map((text, i) => `<p id="p${i}">${text}</p>`).join('') + '<div contenteditable="true" id="editor">Draft</div></body></html>';
    await context.route('https://performance.example.test/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: fixture }));
    const page = await context.newPage();
    await page.goto('https://performance.example.test/article');
    const cdp = await context.newCDPSession(page);
    const worlds = [];
    cdp.on('Runtime.executionContextCreated', event => worlds.push(event.context));
    await cdp.send('Runtime.enable');
    await cdp.send('Performance.enable');
    const world = worlds.find(item => item.origin === root || item.name === new URL(root).hostname);
    const evaluate = async expression => (await cdp.send('Runtime.evaluate', { contextId: world.id, expression, returnByValue: true, awaitPromise: true })).result.value;
    await evaluate(`globalThis.styleReads = 0; globalThis.walks = 0;
      const nativeStyle = getComputedStyle;
      window.getComputedStyle = (...args) => { styleReads++; return nativeStyle(...args); };
      const nativeWalk = document.createTreeWalker.bind(document);
      document.createTreeWalker = (...args) => { walks++; return nativeWalk(...args); };`);
    await options.evaluate(async () => {
      const tab = (await chrome.tabs.query({})).find(item => item.url?.startsWith('https://performance.example.test/'));
      await chrome.tabs.sendMessage(tab.id, { action: 'startTranslation' });
    });
    await page.waitForFunction(() => document.querySelectorAll('.dual-translate-translation').length === 1800, null, { timeout: 30000 });
    await page.waitForTimeout(800);
    const before = await evaluate('({ styleReads, walks })');
    const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(item => [item.name, item.value]));
    const initial = await metrics();
    for (let i = 0; i < updates.length; i++) {
      await page.evaluate(({ text }) => { document.querySelector('#p900').firstChild.data = text; }, { text: updates[i] });
      await page.waitForFunction(index => document.querySelector('#p900 .dual-translate-translation')?.textContent === '已译示例' + (1800 + index), i);
    }
    await page.waitForTimeout(600);
    const after = await evaluate('({ styleReads, walks })');
    const end = await metrics();
    const editorBefore = await evaluate('walks');
    for (let i = 0; i < 3; i++) {
      await page.evaluate(index => { document.querySelector('#editor').firstChild.data = 'Private draft ' + index; }, i);
      await page.waitForTimeout(400);
    }
    const editorWalks = await evaluate('walks') - editorBefore;
    const idleBefore = await evaluate('walks');
    await page.waitForTimeout(1000);
    const idleWalks = await evaluate('walks') - idleBefore;
    const result = {
      version: await options.evaluate(() => chrome.runtime.getManifest().version), paragraphs: 1800, mutations: 5,
      mutationStyleReads: after.styleReads - before.styleReads,
      mutationWalks: after.walks - before.walks,
      mutationTaskMs: Math.round((end.TaskDuration - initial.TaskDuration) * 1000),
      heapMB: +(end.JSHeapUsedSize / 1024 / 1024).toFixed(2), editorWalks, idleWalks
    };
    if (!baseline) {
      assert(result.mutationStyleReads < 1000, 'a local edit scanned unrelated paragraphs');
      assert.equal(editorWalks, 0, 'editing excluded content triggered translation scans');
      assert.equal(idleWalks, 0, 'an idle page performed translation scans');
      const bounded = await evaluate(`(() => {
        for (let i=0; i<100; i++) rememberText('memory-'+i, 'x'.repeat(30000));
        const bytes = textCacheBytes; clearTextCache(); return bytes;
      })()`);
      assert(bounded <= 2 * 1024 * 1024, 'page cache exceeded its memory budget');
    }
    console.log(JSON.stringify(result));
  } finally { await context.close(); }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
