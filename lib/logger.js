// v1.0.2: 轻量日志模块（§3.6 需求，修复 §10.2 未实现）
// 仅供 ESM 加载使用（background.js, api-manager.js 等 service_worker 模块）
// content.js 是 content_script 走非模块路径,自己用 dtLog() 内联 helper
// 通过 settings.general.logLevel 过滤: 0=silent 1=error 2=warn 3=info 4=debug

const LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };

function normalize(level) {
  if (typeof level === 'number') return Math.max(0, Math.min(4, level | 0));
  if (typeof level === 'string') return LEVELS[level.toLowerCase()] != null ? LEVELS[level.toLowerCase()] : 2;
  return 2; // 默认 warn
}

export function createLogger(getLevel) {
  let cached = -1;
  function currentLevel() {
    if (cached < 0) {
      const v = typeof getLevel === 'function' ? getLevel() : 2;
      cached = normalize(v);
    }
    return cached;
  }
  function should(level) { return currentLevel() >= LEVELS[level]; }
  function fmt(tag, args) {
    const ts = new Date().toISOString().slice(11, 23);
    return ['[dual-translate ' + tag + ' ' + ts + ']', ...args];
  }
  return {
    reset() { cached = -1; },
    error(...args) { if (should('error')) console.error(...fmt('ERROR', args)); },
    warn(...args)  { if (should('warn'))  console.warn(...fmt('WARN',  args)); },
    info(...args)  { if (should('info'))  console.info(...fmt('INFO',  args)); },
    debug(...args) { if (should('debug')) console.debug(...fmt('DEBUG', args)); },
  };
}
