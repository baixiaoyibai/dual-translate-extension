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
      get: async key => ({ [key]: localData[key] }),
      set: async value => Object.assign(localData, value)
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

  console.log('settings-manager tests passed');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
