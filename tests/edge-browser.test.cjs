// Optional integration test. Requires Microsoft Edge and playwright-core.
// npm install --no-save --package-lock=false playwright-core
// node tests/edge-browser.test.cjs
'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { once } = require('node:events');
const { chromium } = require('playwright-core');

const articleUrl = 'https://article.example.test/guide';
const fixture = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Walking through the valley</title>
<style>.inactive {display:none}</style><body style="margin-right:17px"><main>
<section id="first"><p id="intro">Follow the <strong>silver river</strong> through the valley.</p></section>
<section id="second" class="inactive"><p id="canyon">Explore the southern canyon.</p></section>
<p id="terms">The tank follows the river toward the distant bridge.</p>
<p id="link">Read the guide at <a href="https://guide.example.test/private-url-sentinel">https://guide.example.test</a> before continuing.</p>
<p id="label">Files</p><p id="japanese">森の道を歩いて村まで進んでください。</p>
<p id="long">${'The valley stretches beyond the mountain range. '.repeat(240)}LongEndSentinel.</p>
<img id="cover" alt="Mountains above the valley" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=">
<p id="mixed">Read the public announcement.<span contenteditable="true"><b>PrivateSentinel editor</b></span></p>
<textarea>PrivateSentinel draft</textarea><input type="password" value="PrivateSentinel password">
<form><p>PrivateSentinel form label</p></form>
<div translate="no"><span>PrivateSentinel excluded</span><img alt="PrivateSentinel excluded image"></div>
<div aria-hidden="true"><span>PrivateSentinel hidden</span></div>
<p id="later" style="margin-top:3000px">Watch the distant mountains at sunrise.</p>
</main></body></html>`;

async function run() {
  const payloads = [];
  const requestHeaders = [];
  const pageErrors = [];
  let breakNextBatch = false;
  let failNextRequest = false;
  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/chat/completions') {
      res.writeHead(404).end();
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    payloads.push(body);
    requestHeaders.push(req.headers);
    const prompt = body.messages.find(m => m.role === 'user').content;
    const source = prompt.match(/<user_text>\n([\s\S]*)\n<\/user_text>/);
    if (!source) {
      res.writeHead(400).end();
      return;
    }
    if (failNextRequest) { failNextRequest = false; res.writeHead(500).end(); return; }
    const isBatch = prompt.includes('JSON 数组');
    let content = isBatch ? JSON.stringify(JSON.parse(source[1]).map(text => '译·' + text.trim())) : '译·' + source[1].trim();
    if (isBatch && breakNextBatch) { content = '["missing rows"]'; breakNextBatch = false; }
    if (source[1].includes('DelayedSentinel')) await new Promise(resolve => setTimeout(resolve, 700));
    if (source[1].includes('SlowLegacySentinel')) await new Promise(resolve => setTimeout(resolve, 9000));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  let context;
  try {
    const extension = path.resolve(__dirname, '..');
    context = await chromium.launchPersistentContext('', {
      channel: 'msedge', headless: true, ignoreDefaultArgs: ['--disable-extensions'],
      args: ['--disable-sync', '--disable-background-networking',
        '--disable-extensions-except=' + extension, '--load-extension=' + extension]
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    context.on('page', opened => opened.on('pageerror', error => pageErrors.push(error.message)));
    const root = 'chrome-extension://' + new URL(worker.url()).hostname;
    const settingsPage = await context.newPage();
    await settingsPage.goto(root + '/options/options.html');
    const send = message => settingsPage.evaluate(m => chrome.runtime.sendMessage(m), message);
    const { settings } = await send({ action: 'getSettings' });
    assert.equal(settings.trigger.autoTranslate, false, 'fresh install should start manually');
    settings.api.apiKeys.deepseek.apiKey = 'mock-local-key';
    settings.api.apiEndpoints.deepseek = 'http://127.0.0.1:' + server.address().port;
    settings.api.apiPriority = ['deepseek'];
    settings.api.enabledApis.deepseek = true;
    assert.deepEqual(await send({ action: 'saveSettings', settings }), { success: true });
    await send({ action: 'saveGlossary', glossary: {
      _global: [{ source: 'tank', target: '坦克', matchType: 'exact' }],
      'article.example.test': [{ source: 'valley', target: '山谷', matchType: 'exact' }],
      'private.example.test': [{ source: 'river', target: 'OtherDomainSentinel', matchType: 'exact' }]
    } });

    await context.route('https://article.example.test/**', route =>
      route.fulfill({ contentType: 'text/html', body: fixture }));
    const page = await context.newPage();
    await page.goto(articleUrl);
    const tabMessage = (action, fields = {}) => settingsPage.evaluate(async ({ action, url, fields }) => {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find(t => t.url?.startsWith(url));
      return chrome.tabs.sendMessage(tab.id, { action, ...fields });
    }, { action, fields, url: articleUrl });
    const setMode = async mode => {
      await send({ action: 'updateSettings', path: 'general.lastMode', value: mode });
      await tabMessage('switchMode', { mode });
    };
    const translated = async (selector, snippet) => {
      await page.locator(selector).scrollIntoViewIfNeeded();
      await page.waitForFunction(({ selector, snippet }) => {
        const translations = document.querySelectorAll(selector + ' .dual-translate-translation');
        return [...translations].some(el => el.textContent.includes(snippet));
      }, { selector, snippet }, { timeout: 15000 }).catch(async error => {
        console.error('Translation failed for', selector, await page.locator(selector).innerHTML());
        throw error;
      });
    };
    await page.waitForTimeout(1200);
    assert.equal(payloads.length, 0, 'opening the page should not send any text');
    assert.equal((await tabMessage('getStatus')).pageActive, false);

    // A real popup is outside the tab strip. Load its document in a background
    // tab and keep the synthetic article active for its chrome.tabs queries.
    const popup = await context.newPage();
    await page.bringToFront();
    await popup.goto(root + '/popup/popup.html');
    await popup.waitForFunction(() => !document.getElementById('pageTranslateBtn')?.disabled);
    await popup.locator('#pageTranslateBtn').evaluate(button => button.click());
    await translated('#intro', 'silver river');
    await translated('#mixed', 'public announcement');
    await translated('#terms', 'distant bridge');
    await translated('#link', 'before continuing');
    await translated('#label', 'Files');
    await translated('#japanese', '歩いて');
    assert.equal((await tabMessage('getStatus')).pageActive, true);
    assert(!JSON.stringify(payloads).includes('PrivateSentinel'), 'private text was sent to the provider');
    assert(!JSON.stringify(payloads).includes('southern canyon'), 'hidden tab was translated before activation');
    assert(!JSON.stringify(payloads).includes('OtherDomainSentinel'), 'unrelated glossary scope reached the provider');
    assert(!JSON.stringify(payloads).includes('private-url-sentinel'), 'link destinations must not be extracted');
    assert(requestHeaders.every(headers => !headers.cookie && !headers.referer));
    await page.locator('#long').scrollIntoViewIfNeeded();
    await translated('#long', 'LongEndSentinel');
    assert.equal(await page.locator('#long .dual-translate-translation').count(), 1);
    console.log('PASS scoped glossary, prose containing URLs, Japanese and a paragraph over 10000 characters');
    console.log('PASS manual popup translation, inline text, hidden and editable content');

    await page.evaluate(() => {
      document.querySelector('#first').classList.add('inactive');
      document.querySelector('#second').classList.remove('inactive');
    });
    await translated('#canyon', 'southern canyon');
    await page.evaluate(() => {
      const extra = document.createElement('p');
      extra.id = 'news';
      extra.textContent = 'Today the bridge reopened.';
      document.querySelector('#second').append(extra);
    });
    await translated('#news', 'bridge reopened');
    await page.evaluate(() => {
      history.pushState({}, '', '?section=updates');
      document.querySelector('#news').firstChild.data = 'Tomorrow the ferry returns.';
    });
    await translated('#news', 'ferry returns');
    assert.equal(await page.locator('#news .dual-translate-translation').count(), 1);
    await page.locator('#later').scrollIntoViewIfNeeded();
    await translated('#later', 'distant mountains');
    console.log('PASS CSS-only tab switch, inserted text, reused SPA node and lazy scrolling');

    breakNextBatch = true;
    await page.evaluate(() => {
      const group = document.createElement('div');
      group.id = 'deferred';
      group.innerHTML = '<p id="delay">DelayedSentinel the ferry crosses the river.</p><p id="repaired">The second vessel follows.</p>';
      document.body.prepend(group);
      window.scrollTo(0, 0);
    });
    const waitForPayload = async fragment => {
      for (let tries = 0; tries < 100; tries++) {
        if (JSON.stringify(payloads).includes(fragment)) return;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error('No provider request for ' + fragment);
    };
    await waitForPayload('DelayedSentinel');
    await page.evaluate(() => {
      const next = document.createElement('p');
      next.id = 'during';
      next.textContent = 'This content arrived during the request.';
      document.querySelector('#deferred').append(next);
    });
    await translated('#delay', 'ferry crosses');
    await translated('#repaired', 'second vessel');
    await translated('#during', 'arrived during');
    console.log('PASS content added during a slow request and recovery from an incomplete provider batch');

    // Inspect the extension's real isolated content world, without adding permissions.
    const cdp = await context.newCDPSession(page);
    const worlds = [];
    cdp.on('Runtime.executionContextCreated', event => worlds.push(event.context));
    await cdp.send('Runtime.enable');
    const contentWorld = worlds.find(world => world.origin === root || world.name === new URL(root).hostname);
    assert(contentWorld, 'extension isolated world was not found');
    const privacy = await cdp.send('Runtime.evaluate', { contextId: contentWorld.id, awaitPromise: true, returnByValue: true,
      expression: `(async () => {
        const data = await chrome.runtime.sendMessage({ action: 'getSettings' });
        const denied = {};
        for (const area of ['local', 'sync', 'session']) {
          try { await chrome.storage[area].get(null); denied[area] = false; }
          catch { denied[area] = true; }
        }
        return { settings: data.settings, denied };
      })()` });
    assert.deepEqual(privacy.result.value.denied, { local: true, sync: true, session: true });
    assert(!JSON.stringify(privacy.result.value.settings).includes('mock-local-key'));
    assert.deepEqual(Object.keys(privacy.result.value.settings.api), ['sourceLanguage']);
    await cdp.detach();
    const disk = await settingsPage.evaluate(() => chrome.storage.local.get(null));
    assert.equal(disk.dual_translate_text_cache, undefined, 'raw page cache reached disk storage');
    const exported = await send({ action: 'exportAllSettings' });
    assert(!JSON.stringify(exported).includes('mock-local-key'));
    console.log('PASS content-world storage restrictions, sanitized settings, exported secrets and session cache');

    const other = await context.newPage();
    await other.bringToFront();
    await page.evaluate(() => { document.querySelector('#later').firstChild.data = 'Snow covers the ridge.'; });
    await page.bringToFront();
    await translated('#later', 'covers the ridge');
    await popup.waitForFunction(() => document.getElementById('pageTranslateBtn')?.textContent === '还原此页');
    await popup.locator('#pageTranslateBtn').evaluate(button => button.click());
    await page.waitForFunction(() => !document.querySelector('.dual-translate-translation,.dual-translate-placeholder'));
    assert.equal((await tabMessage('getStatus')).pageActive, false);
    await page.waitForTimeout(500);
    const countAfterRestore = payloads.length;
    await page.evaluate(() => { document.querySelector('#news').textContent = 'StopSentinel after restore.'; });
    await page.waitForTimeout(1000);
    assert.equal(payloads.length, countAfterRestore, 'restored pages should remain inactive');
    assert.equal(await page.locator('#intro strong').textContent(), 'silver river');
    assert.equal(await page.title(), 'Walking through the valley');
    assert.equal(await page.locator('#cover').getAttribute('alt'), 'Mountains above the valley');
    assert.equal(await page.locator('body').evaluate(el => el.style.marginRight), '17px');
    assert(!JSON.stringify(payloads).includes('PrivateSentinel'));
    console.log('PASS returning to the browser tab and restoring from popup');

    assert.equal((await send({ action: 'updateSettings', path: 'trigger.autoTranslate', value: true })).success, true);
    await page.reload();
    await page.evaluate(() => window.scrollTo(0, 0));
    await translated('#intro', 'silver river');
    assert.equal((await tabMessage('getStatus')).pageActive, true);
    console.log('PASS opt-in automatic translation on navigation; Edge ' + context.browser().version());

    await tabMessage('restoreAll');
    const beforeMode = payloads.length;
    await setMode('translation-only');
    await page.waitForTimeout(400);
    assert.equal((await tabMessage('getStatus')).pageActive, false);
    assert.equal(payloads.length, beforeMode, 'changing mode on an inactive page must not send text');
    await tabMessage('startTranslation');
    await translated('#intro', 'silver river');
    await send({ action: 'updateSettings', path: 'advanced.requestTimeout', value: 15 });
    await page.evaluate(() => {
      const slow = document.createElement('p');
      slow.id = 'slow';
      slow.textContent = 'SlowLegacySentinel the journey continues.';
      document.body.prepend(slow);
      window.scrollTo(0, 0);
    });
    await translated('#slow', 'journey continues');
    console.log('PASS provider response taking longer than the previous eight-second content timeout');
    assert.equal(await page.locator('#intro strong').isVisible(), false);
    await tabMessage('restoreAll');
    assert.equal(await page.locator('#intro strong').textContent(), 'silver river');
    assert.equal(await page.locator('#intro strong').isVisible(), true);
    assert.equal(await page.locator('.dual-translate-original-hidden').count(), 0);
    for (const mode of ['hover', 'panel']) {
      await setMode(mode);
      await tabMessage('startTranslation');
      if (mode === 'hover') {
        await page.waitForFunction(() => document.querySelector('#intro[data-dt-hover-id]'));
        await page.locator('#intro').hover();
        await page.waitForFunction(() => document.querySelector('.dual-translate-hover')?.textContent.includes('silver river'));
      } else {
        await page.waitForFunction(() => document.querySelector('.dual-translate-panel')?.textContent.includes('silver river'));
        assert.equal(await page.locator('body').evaluate(el => el.style.marginRight), '400px');
      }
      await tabMessage('restoreAll');
      assert.equal(await page.locator('body').evaluate(el => el.style.marginRight), '17px');
      assert.equal(await page.locator('.dual-translate-hover,.dual-translate-panel').count(), 0);
    }
    console.log('PASS translation-only, hover, panel, inactive mode selection and exact inline/layout restoration');

    await setMode('bilingual');
    await send({ action: 'updateSettings', path: 'advanced.retryCount', value: 0 });
    await tabMessage('startTranslation');
    await translated('#intro', 'silver river');
    failNextRequest = true;
    await page.evaluate(() => {
      const failed = document.createElement('p');
      failed.id = 'failed';
      failed.textContent = 'RetrySentinel the bridge remains open.';
      document.body.prepend(failed);
      window.scrollTo(0, 0);
    });
    await page.waitForFunction(() => document.querySelector('#failed .dual-translate-failed'));
    await page.locator('#failed .dual-translate-failed').click();
    await translated('#failed', 'bridge remains');
    console.log('PASS user retry after a failed segment request');
    await send({ action: 'clearCache' });
    await page.evaluate(() => {
      const pending = document.createElement('p');
      pending.id = 'cancelled';
      pending.textContent = 'DelayedSentinelCancel at the northern dock.';
      document.body.prepend(pending);
      window.scrollTo(0, 0);
    });
    await waitForPayload('DelayedSentinelCancel');
    await tabMessage('restoreAll');
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('.dual-translate-translation,.dual-translate-placeholder').count(), 0);
    assert.equal((await tabMessage('getStatus')).pageActive, false);
    await send({ action: 'updateSettings', path: 'trigger.excludeList', value: ['*.example.test'] });
    assert((await tabMessage('startTranslation')).error);
    await page.waitForTimeout(400);
    const beforeExcluded = payloads.length;
    await page.evaluate(() => { document.querySelector('#intro').textContent = 'ExcludedSiteSentinel should stay local.'; });
    await page.waitForTimeout(600);
    assert.equal(payloads.length, beforeExcluded);
    assert.equal((await tabMessage('getStatus')).siteAllowed, false);
    console.log('PASS stale response suppression and excluded-site rules for manual and dynamic translation');

    await send({ action: 'updateSettings', path: 'trigger.excludeList', value: [] });
    await send({ action: 'updateSettings', path: 'general.translationEnabled', value: false });
    assert((await tabMessage('startTranslation')).error);
    assert.equal((await tabMessage('getStatus')).pageActive, false);
    assert.deepEqual(pageErrors, [], 'extension documents or content scripts threw uncaught errors');
    console.log('PASS global pause and uncaught-error checks');
  } finally {
    try { await context?.close(); }
    finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
