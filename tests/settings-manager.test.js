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
  runtime: { id: 'test-extension' },
  storage: {
    sync: {
      get: async key => ({ [key]: syncData[key] }),
      set: async value => {
        syncWrites.push(value);
        Object.assign(syncData, value);
      }
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

  console.log('settings-manager tests passed');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
