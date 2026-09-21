// Settings persistence, migration, sensitive-key isolation, and usage concurrency.
'use strict';

const fs = require('fs');

const source = fs.readFileSync(require.resolve('../lib/settings-manager.js'), 'utf8')
  .replace(/^import[^;]+;\s*/m, '')
  .replace(/^export\s*\{[^}]*\};?\s*$/m, '')
  + '\nreturn { settingsManager, DEFAULT_SETTINGS };';

const syncData = {};
const localData = {};
const syncWrites = [];
const chromeMock = {
  // v1.3.3: getGlossary 需要 runtime.getURL（种子默认术语表）
  runtime: { id: 'test-extension', getURL: p => p },
  storage: {
    sync: {
      // v1.3.3: sync.get 支持数组形式（getGlossary 迁移路径），并补充 sync.remove
      get: async keys => {
        const list = Array.isArray(keys) ? keys : [keys];
        const out = {};
        for (const key of list) {
          if (syncData[key] !== undefined) out[key] = syncData[key];
        }
        return out;
      },
      set: async value => {
        syncWrites.push(value);
        Object.assign(syncData, value);
      },
      remove: async keys => { const list = [].concat(keys); for (const key of list) delete syncData[key]; }
    },
    local: {
      get: async keys => {
        const list = Array.isArray(keys) ? keys : [keys];
        const out = {};
        for (const key of list) {
          if (localData[key] !== undefined) out[key] = localData[key];
        }
        return out;
      },
      set: async value => Object.assign(localData, value),
      remove: async keys => { const list = [].concat(keys); for (const key of list) delete localData[key]; }
    }
  }
};

const factory = new Function('console', 'chrome', 'structuredClone', source);
const { settingsManager, DEFAULT_SETTINGS } = factory(console, chromeMock, value => JSON.parse(JSON.stringify(value)));

async function main() {
  if (DEFAULT_SETTINGS.settingsVersion !== 1) throw new Error('missing settingsVersion');

  syncData.dual_translate_settings = {
    display: { tooltipDelay: 777 },
    rules: { translateUI: false },
    api: {
      apiKeys: { deepseek: { apiKey: 'legacy-sync-secret' } },
      customProviders: [{ id: 'p1', name: 'P1', endpoint: 'https://example.com', model: 'm', apiKey: 'custom-secret' }]
    }
  };
  await settingsManager.loadSettings();
  if (settingsManager.settings.settingsVersion !== 1) throw new Error('migration did not set version');
  if (settingsManager.settings.display.tooltipDelay !== 777) throw new Error('legacy field lost');
  if (settingsManager.settings.rules.translateUI !== false) throw new Error('legacy boolean lost');
  if (localData.dual_translate_api_keys_local?.deepseek?.apiKey !== 'legacy-sync-secret') {
    throw new Error('legacy sync key was not migrated');
  }
  if (localData.dual_translate_api_keys_local?.custom_p1?.apiKey !== 'custom-secret') {
    throw new Error('custom provider key was not migrated');
  }

  syncWrites.length = 0;
  await settingsManager.saveSettings({
    display: { defaultMode: 'translation-only' },
    api: { apiKeys: { deepseek: { apiKey: 'new-secret' } } }
  });
  const persisted = syncWrites.at(-1).dual_translate_settings;
  if (persisted.api.apiKeys) throw new Error('apiKeys leaked to sync');
  if (localData.dual_translate_api_keys_local.deepseek.apiKey !== 'new-secret') {
    throw new Error('local key was not updated');
  }

  // v1.3.0 fix P2-1: 清空单个密钥字段（null）应显式删除 local 中已存密钥
  await settingsManager.saveSettings({
    api: { apiKeys: { deepseek: { apiKey: null } } }
  });
  if (localData.dual_translate_api_keys_local.deepseek?.apiKey !== undefined) {
    throw new Error('P2-1: cleared key field should be deleted from local');
  }
  if (persisted.display.tooltipDelay !== 777) throw new Error('partial save removed legacy field');

  await Promise.all(Array.from({ length: 10 }, () => settingsManager.addDailyUsage('deepseek', 3)));
  const daily = localData.dual_translate_daily_usage;
  if (daily.deepseek !== 30) throw new Error(`daily usage mismatch: ${daily.deepseek}`);
  // v1.2.16 security: M3 — saveSettings 统一 HTTPS 端点校验（localhost/127.0.0.1 例外）
  async function assertRejected(promise, label) {
    let rejected = false;
    try {
      await promise;
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error(label);
  }

  await assertRejected(
    settingsManager.saveSettings({ api: { apiEndpoints: { custom: 'http://example.com/v1' } } }),
    'saveSettings should reject http apiEndpoints'
  );
  await assertRejected(
    settingsManager.saveSettings({ api: { customProviders: [{ id: 'p', name: 'P', endpoint: 'http://example.com', model: 'm', apiKey: 'k' }] } }),
    'saveSettings should reject http customProviders endpoint'
  );
  await settingsManager.saveSettings({ api: { apiEndpoints: { custom: 'http://127.0.0.1:8000/v1' } } });
  if (settingsManager.settings.api.apiEndpoints.custom !== 'http://127.0.0.1:8000/v1') {
    throw new Error('localhost http endpoint should be allowed');
  }
  await settingsManager.saveSettings({ api: { apiEndpoints: { custom: 'https://api.example.com/v1' } } });

  // v1.2.16 security: M2 — PIN 改为 PBKDF2 慢哈希，并兼容旧 SHA-256 哈希平滑升级
  await settingsManager.setupPin('123456');
  if (!String(localData.dual_translate_pin_hash).startsWith('pbkdf2$')) {
    throw new Error('PIN hash should be PBKDF2 prefixed');
  }
  const pinOk = await settingsManager.verifyPin('123456');
  if (!pinOk.success) throw new Error(`PIN verify failed: ${pinOk.error}`);
  const pinBad = await settingsManager.verifyPin('000000');
  if (pinBad.success) throw new Error('wrong PIN should fail');

  async function sha256Hex(text) {
    const data = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  const legacySalt = settingsManager._generateSalt();
  const legacyHash = await sha256Hex('654321' + legacySalt);
  localData.dual_translate_pin_hash = legacyHash;
  localData.dual_translate_pin_salt = legacySalt;
  const legacyOk = await settingsManager.verifyPin('654321');
  if (!legacyOk.success) throw new Error(`legacy SHA-256 PIN verify failed: ${legacyOk.error}`);
  if (!String(localData.dual_translate_pin_hash).startsWith('pbkdf2$')) {
    throw new Error('legacy PIN should be upgraded to PBKDF2 hash');
  }

  // ===== v1.3.3 fix F-1: 术语表存储区域迁移到 local =====

  // 旧版本数据迁移：sync 中存有 ≤8KB 旧术语表 → 迁移到 local 并清理 sync 旧键（幂等）
  delete localData.dual_translate_glossary;
  delete localData.dual_translate_glossary_initialized;
  syncData.dual_translate_glossary = { _global: [{ source: 'tank', target: '坦克' }] };
  syncData.dual_translate_glossary_initialized = true;
  const migrated = await settingsManager.getGlossary();
  if (migrated._global?.[0]?.source !== 'tank') {
    throw new Error('F-1: sync→local glossary migration returned wrong data');
  }
  if (JSON.stringify(localData.dual_translate_glossary) !== JSON.stringify(migrated)) {
    throw new Error('F-1: migrated glossary not persisted to local');
  }
  if (syncData.dual_translate_glossary !== undefined || syncData.dual_translate_glossary_initialized !== undefined) {
    throw new Error('F-1: legacy sync glossary keys were not removed after migration');
  }

  // 旧 array 格式兼容：sync 中的裸数组 → 包成 _global 迁移
  delete localData.dual_translate_glossary;
  delete localData.dual_translate_glossary_initialized;
  syncData.dual_translate_glossary = [{ source: 'aggro', target: '仇恨' }];
  const migratedArray = await settingsManager.getGlossary();
  if (!Array.isArray(migratedArray._global) || migratedArray._global[0]?.source !== 'aggro') {
    throw new Error('F-1: legacy array-format glossary was not wrapped as _global');
  }

  // saveGlossary 写 local、不写 sync
  await settingsManager.saveGlossary({ _global: [{ source: 'load order', target: '加载顺序' }], 'example.com': [{ source: 'a', target: 'b' }] });
  if (localData.dual_translate_glossary?._global?.[0]?.source !== 'load order') {
    throw new Error('F-1: saveGlossary should persist to local storage');
  }
  if (syncWrites.some(w => w.dual_translate_glossary !== undefined || w.dual_translate_glossary_initialized !== undefined)) {
    throw new Error('F-1: saveGlossary must never write glossary to sync storage');
  }

  // 首次初始化：种子默认术语表写入 local，成功后置位 INIT
  delete localData.dual_translate_glossary;
  delete localData.dual_translate_glossary_initialized;
  delete syncData.dual_translate_glossary;
  delete syncData.dual_translate_glossary_initialized;
  syncWrites.length = 0;
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => [{ source: 'boss', target: '首领' }] });
  try {
    const seeded = await settingsManager.getGlossary();
    if (seeded._global?.[0]?.source !== 'boss') {
      throw new Error('F-1: default glossary seed returned wrong data');
    }
    if (localData.dual_translate_glossary_initialized !== true) {
      throw new Error('F-1: INIT flag should be set in local after successful seed');
    }
    if (!Array.isArray(localData.dual_translate_glossary?._global)) {
      throw new Error('F-1: seeded glossary not persisted to local');
    }
    if (syncWrites.some(w => Object.keys(w).some(k => k.startsWith('dual_translate_glossary')))) {
      throw new Error('F-1: glossary seed must not write to sync storage');
    }

    // 种子失败：不置位 INIT（下次调用重试），不再出现「永久返回空表」
    delete localData.dual_translate_glossary;
    delete localData.dual_translate_glossary_initialized;
    globalThis.fetch = async () => { throw new Error('network down'); };
    const failedSeed = await settingsManager.getGlossary();
    if (failedSeed._global?.length !== 0) {
      throw new Error('F-1: failed seed should return empty glossary');
    }
    if (localData.dual_translate_glossary_initialized !== undefined) {
      throw new Error('F-1: INIT flag must NOT be set when seed fails (would permanently disable defaults)');
    }
  } finally {
    globalThis.fetch = origFetch;
  }

  // ===== v1.3.3 security P2-3: 内置厂商端点域名白名单 =====
  await assertRejected(
    settingsManager.saveSettings({ api: { apiEndpoints: { baidu_llm: 'https://attacker.example/steal' } } }),
    'P2-3: built-in vendor endpoint hijacked to arbitrary https host should be rejected'
  );
  await assertRejected(
    settingsManager.saveSettings({ api: { apiEndpoints: { deepseek: 'https://api.deepseek.com.evil.com/v1' } } }),
    'P2-3: suffix-spoofed built-in endpoint host should be rejected'
  );
  await settingsManager.saveSettings({ api: { apiEndpoints: { deepseek: 'https://api.deepseek.com/v1' } } });
  if (settingsManager.settings.api.apiEndpoints.deepseek !== 'https://api.deepseek.com/v1') {
    throw new Error('P2-3: official built-in endpoint should be allowed');
  }
  // 内置厂商 localhost 测试地址仍放行
  await settingsManager.saveSettings({ api: { apiEndpoints: { deepseek: 'http://127.0.0.1:8000/v1' } } });
  if (settingsManager.settings.api.apiEndpoints.deepseek !== 'http://127.0.0.1:8000/v1') {
    throw new Error('P2-3: localhost built-in endpoint should be allowed');
  }
  // custom 槽位保持任意 HTTPS
  await settingsManager.saveSettings({ api: { apiEndpoints: { custom: 'https://my-proxy.example.com/v1' } } });
  if (settingsManager.settings.api.apiEndpoints.custom !== 'https://my-proxy.example.com/v1') {
    throw new Error('P2-3: custom slot endpoint (arbitrary https) should stay allowed');
  }
  // 自定义供应商端点不受内置白名单限制
  await settingsManager.saveSettings({ api: { customProviders: [{ id: 'p2', name: 'P2', endpoint: 'https://any-host.example.com/v1', model: 'm', apiKey: 'k' }] } });

  // ===== v1.3.3 security P2-2 / compat F-9: 导入字段类型归一 + null 剥离 =====
  syncWrites.length = 0;
  await settingsManager.applyImportedSettings({
    display: { defaultMode: null },
    trigger: { autoTranslate: null },
    general: { logLevel: '<img src=x onerror=alert(1)>' },
    advanced: { batchSize: '<img>', requestTimeout: 5 },
    api: {
      apiPriority: ['baidu'],
      enabledApis: { baidu: true },
      customProviders: [],
      apiEndpoints: {},
      apiKeys: { deepseek: { apiKey: null } },
      quotaLimits: {
        deepseek: { enabled: true, limit: '<img>', unit: 'chars', resetType: 'monthly' },
        glm: { enabled: true, limit: 50000, unit: 'chars', resetType: 'monthly' }
      }
    }
  });
  const imported = settingsManager.settings;
  if (imported.general.logLevel !== 2) {
    throw new Error('P2-2: malicious logLevel should be normalized to 2, got ' + JSON.stringify(imported.general.logLevel));
  }
  if (imported.advanced.batchSize !== 10) {
    throw new Error('P2-2: malicious batchSize should be normalized to 10, got ' + JSON.stringify(imported.advanced.batchSize));
  }
  if (imported.advanced.requestTimeout !== 5) {
    throw new Error('P2-2: valid requestTimeout should be preserved');
  }
  if (imported.api.quotaLimits.deepseek !== undefined) {
    throw new Error('P2-2: quotaLimits entry with non-numeric limit should be dropped');
  }
  if (imported.api.quotaLimits.glm?.limit !== 50000) {
    throw new Error('P2-2: valid quotaLimits entry should be preserved');
  }
  if (imported.display.defaultMode === null || imported.display.defaultMode === undefined) {
    throw new Error('F-9: null display.defaultMode should be stripped, not persisted');
  }
  if (imported.trigger.autoTranslate !== true) {
    throw new Error('F-9: null trigger.autoTranslate should be stripped (base value retained)');
  }
  const persistedImport = syncWrites.find(w => w.dual_translate_settings);
  if (persistedImport && persistedImport.dual_translate_settings.trigger?.autoTranslate === null) {
    throw new Error('F-9: null value must not be persisted to sync');
  }
  // api.apiKeys 的 null 显式删除契约保持不变
  if (localData.dual_translate_api_keys_local.deepseek?.apiKey !== undefined) {
    throw new Error('F-9/P2-1: null in api.apiKeys must keep explicit-delete semantics');
  }

  console.log('settings-manager tests passed');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
