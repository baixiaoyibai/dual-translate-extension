'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function loadModule(file, dependencies, exports) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
    .replace(/^import[^\n]*\n/gm, '')
    .replace(/^export\s*\{[^}]*\};?\s*$/m, '');
  return new Function(...Object.keys(dependencies), source + '\nreturn {' + exports + '};')(...Object.values(dependencies));
}

async function main() {
  const { BaseTranslator } = loadModule('lib/api-adapters/base.js', {}, 'BaseTranslator');
  const base = new BaseTranslator({ name: 'test' });
  assert.deepEqual(base._mapTranslations(['first', 'second'], [{ src: 'second', dst: '二' }, { src: 'first', dst: '一' }]).map(row => row.translation), ['一', '二']);
  assert.equal(base._mapTranslations(['line one\nline two'], [{ src: 'line one', dst: '第一行' }, { src: 'line two', dst: '第二行' }])[0].translation, '第一行\n第二行');
  assert.equal(base._mapTranslations(['complete paragraph'], [{ src: 'partial', dst: '片段' }])[0].translation, '');
  const { LLMGenericTranslator } = loadModule('lib/api-adapters/llm-generic.js', { BaseTranslator }, 'LLMGenericTranslator');
  const translator = new LLMGenericTranslator({ apiKey: 'test-key', baseUrl: 'https://provider.example', model: 'test-model' });
  const requested = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    requested.push({ url, options });
    return { ok: true, json: async () => ({ choices: [{ message: { content: '["第一段\n保留换行", "第二段"]'.replace(/\n/g, '\\n') } }] }) };
  };
  try {
    const results = await translator.translate(['First line\nSecond line', 'Next paragraph'], 'en', 'zh');
    assert.equal(results[0].translation, '第一段\n保留换行');
    const options = requested[0].options;
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
    assert.equal(options.cache, 'no-store');
    assert.deepEqual(JSON.parse(JSON.parse(options.body).messages[1].content.match(/<user_text>\n([\s\S]*)\n<\/user_text>/)[1]), ['First line\nSecond line', 'Next paragraph']);
    assert.throws(() => translator._splitTranslations('["only one"]', 2), /INCOMPLETE_BATCH/);
    assert.throws(() => translator._splitTranslations('1. one\n2. two', 2), /INCOMPLETE_BATCH/);
    assert.throws(() => translator._splitTranslations('["one", ""]', 2), /INCOMPLETE_BATCH/);
    let readErrorBody = false;
    await assert.rejects(translator._handleHttpError({ status: 401, json: () => { readErrorBody = true; } }), /^Error: AUTH_ERROR$/);
    assert.equal(readErrorBody, false, 'provider error bodies can contain echoed credentials');
  } finally { global.fetch = originalFetch; }

  const managerSettings = {
    settings: { advanced: { requestTimeout: 1, retryCount: 0 } },
    getGlossaryForDomain: async domain => domain === 'article.example' ? [
      { source: 'valley', target: '山谷' },
      { source: 'unmentioned', target: 'PrivateGlossarySentinel' }
    ] : [{ source: 'private', target: 'OtherDomainSentinel' }]
  };
  const { apiManager } = loadModule('lib/api-manager.js', { settingsManager: managerSettings }, 'apiManager');
  const calls = [];
  const malformed = {
    translate: async texts => {
      calls.push(texts);
      return texts.length > 1 ? [{ original: texts[0], translation: 'wrong batch' }] : [{ original: texts[0], translation: '译·' + texts[0] }];
    }
  };
  const repaired = await apiManager._translateWithTimeout(malformed, ['one', 'two'], 'en', 'zh', '');
  assert.deepEqual(repaired.map(row => row.translation), ['译·one', '译·two']);
  assert.deepEqual(calls, [['one', 'two'], ['one'], ['two']]);
  const hint = await apiManager._glossaryForTexts('article.example', ['Walk through the valley.']);
  assert(hint.includes('山谷'));
  assert(!hint.includes('PrivateGlossarySentinel') && !hint.includes('OtherDomainSentinel'));

  const storage = {};
  const chrome = { storage: { session: {
    QUOTA_BYTES: 1024 * 1024,
    get: async key => ({ [key]: structuredClone(storage[key]) }),
    set: async values => Object.assign(storage, structuredClone(values)),
    remove: async key => { delete storage[key]; }
  } } };
  const { translationCache: cache } = loadModule('lib/translation-cache.js', { chrome }, 'translationCache');
  const row = [{ original: 'public paragraph', translation: '公共段落' }];
  await cache.store(row, 'en', 'zh', 'one.example', cache.generation);
  assert.equal((await cache.lookup(['public paragraph'], 'en', 'zh', 'one.example')).hits.size, 1);
  assert.equal((await cache.lookup(['public paragraph'], 'en', 'zh', 'two.example')).hits.size, 0);
  assert.equal((await cache.lookup(['public paragraph'], 'en', 'ja', 'one.example')).hits.size, 0);
  const oldGeneration = cache.generation;
  await Promise.all([cache.clear(), cache.store(row, 'en', 'zh', 'one.example', oldGeneration)]);
  assert.equal((await cache.getStats()).active, 0, 'a request begun before clear must not repopulate the cache');
  assert.equal(storage.dual_translate_text_cache, undefined);
  console.log('PASS translation boundaries, singleton repair, request privacy, scoped glossary and concurrent cache clearing');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
