const BILINGUAL = 'bilingual';
const TRANSLATION_ONLY = 'translation-only';
const HOVER = 'hover';
const PANEL = 'panel';

let currentMode = BILINGUAL;
let settings = null;
let isTranslating = false;
let currentAbortController = null;
let translationCache = new Map();
let segments = [];
// v1.0.6 perf: segId → seg 的查找表，替代 fillTranslations 中的 O(n) find
let segmentMap = new Map();
// v1.0.6 perf: hover/panel 增量渲染追踪，避免每批 O(n²) 重建
let hoverRegisteredSegIds = new Set();
let panelRenderedSegIds = new Set();
let hoverCleanupHandlers = [];
let globalCleanupHandlers = [];
// v1.0.7 perf: HOVER 模式事件委托，替代每段独立 mouseenter/mouseleave
let hoverDelegationRegistered = false;
let hoverTranslations = new Map();
// v1.1.0 perf: 跟踪当前 hover 元素数量，供全局 click 处理器短路判断，避免每次点击都 querySelectorAll
let _activeHoverCount = 0;
let loadingElement = null;
let panelInstance = null;
let originalPanelStyles = null;

function restorePanelStyles() {
  if (!originalPanelStyles) return;
  Object.assign(document.body.style, originalPanelStyles);
  originalPanelStyles = null;
}

// v1.0.2: dtLog —— content script 内联日志 helper（§3.6 / §10.2 修复）
// logger.js 是 ESM，content script 走非模块路径无法 import；自己写 4 个 level 函数
const DT_LOG_LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };
function dtNormLevel(v) {
  if (typeof v === 'number') return Math.max(0, Math.min(4, v | 0));
  if (typeof v === 'string' && DT_LOG_LEVELS[v.toLowerCase()] != null) return DT_LOG_LEVELS[v.toLowerCase()];
  return 2;
}
function dtLogLevel() { return dtNormLevel(settings?.general?.logLevel ?? 2); }
function dtError() { if (dtLogLevel() >= 1) console.error('[dual-translate]', ...arguments); }
function dtWarn()  { if (dtLogLevel() >= 2) console.warn('[dual-translate]',  ...arguments); }
function dtInfo()  { if (dtLogLevel() >= 3) console.info('[dual-translate]',  ...arguments); }
function dtDebug() { if (dtLogLevel() >= 4) console.debug('[dual-translate]', ...arguments); }

// v1.0.2: 术语表匹配缓存（§3.3 / §10.2 修复）
// v1.0.6 perf: 预编译正则，避免每段文本重复 new RegExp（140 条 × 200 段 = 28000 次 → 140 次）
let glossaryCompiled = [];
// v1.0.4: 域名专属术语表（§3.3）— content script 用 hostname 查合并后的 entries
function loadGlossary() {
  const domain = location.hostname || '';
  return sendMessage('getGlossaryForDomain', { domain })
    .then(r => {
      // 预编译：escape 特殊字符后构建 RegExp，运行时直接 replace
      glossaryCompiled = ((r && r.glossary) || [])
        .map(e => {
          if (!e || !e.source || (!e.target && !e.preserve)) return null;
          const escaped = e.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const matchType = e.matchType || 'exact';
          const pattern = matchType === 'fuzzy'
            ? escaped
            : '\\b' + escaped + '\\b';
          return { source: e.source.toLowerCase(), re: new RegExp(pattern, 'gi'), target: e.preserve ? e.source : e.target };
        })
        .filter(Boolean);
    })
    .catch(() => { glossaryCompiled = []; });
}
function applyGlossary(text) {
  if (!glossaryCompiled.length || !text) return text;
  let out = text;
  for (const { re, target } of glossaryCompiled) {
    out = out.replace(re, () => target);
  }
  return out;
}
let errorBannerElement = null;
let hoverClickRegistered = false;
let mutationObserver = null;
let rescanPending = false;
let automaticSession = false;
let nextSegmentId = 0;
let autoStartTimer = null;
let pageRestored = false;
const originalWrappers = new WeakSet();
let translatedTitle = null;
const translatedImages = new Map();
// v1.0.7 fix: 将 setupMutationObserver 的 quietTimer 提升为模块级变量，
// 供 resetAll 清除，避免页面重翻译后残留定时器触发意外重翻译
let mutationQuietTimer = null;
const textCache = new Map();
const TEXT_CACHE_MAX_SIZE = 5000;


// v1.0.6 perf: detectPageLanguage 结果缓存，避免同一次翻译流程内 3 次重复遍历 DOM
// 在 resetAll 中清除，确保 SPA 路由变化后重新检测
let cachedPageLang = null;

// v1.0.7 perf: skipTags/blockTags 提升为模块常量，避免 extractSegments 每次创建 Set
// tagName 在 HTML 中始终大写（SVG 中也是大写），用大写比对省去 toLowerCase
const INJECTED = '.dual-translate-translation,.dual-translate-placeholder,.dual-translate-hover,.dual-translate-panel,.dual-translate-loading-overlay,.dual-translate-error-banner';
const EXCLUDED = 'script,style,noscript,svg,math,template,iframe,canvas,form,input,textarea,select,option,[contenteditable]:not([contenteditable="false" i]),[role="textbox" i],[role="searchbox" i],[translate="no" i],.notranslate,[hidden],[inert],[aria-hidden="true" i]';
const BLOCKS = 'p,li,h1,h2,h3,h4,h5,h6,td,th,blockquote,figcaption,dt,dd,pre,summary,label,legend,caption,div,section,article,button,[role="tab"],body';

function excludedElement(el) {
  return el.matches(EXCLUDED) || el.matches(INJECTED) ||
    (!settings?.rules?.translateCodeBlocks && el.matches('code,pre')) ||
    (settings?.rules?.translateUI === false && el.matches('button,[role="button"]')) ||
    (isNexusModsDomain() && el.matches('.mod-tile [class*="stat"],.mod-tile [class*="metric"],[data-testid="mod-tile-stats"]'));
}

function readableElement(el) {
  if (!el || !el.isConnected || document.designMode === 'on') return false;
  for (let ancestor = el; ancestor; ancestor = ancestor.parentElement) {
    if (originalWrappers.has(ancestor)) continue;
    if (excludedElement(ancestor)) return false;
    const style = getComputedStyle(ancestor);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' ||
        style.contentVisibility === 'hidden') return false;
  }
  return true;
}

// v1.0.7 perf: containsUrl 正则合并，4 个正则 -> 1 个
const URL_RE = /^(?:https?:\/\/\S+|www\.[a-zA-Z0-9-]+\.[a-zA-Z]{2,}\S*|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}\/\S+)$/i;

const METRIC_LABELS = new Set([
  'downloads','download','dls','dl',
  'endorsements','endorsement','endorse',
  'likes','like','votes','vote','views','view',
  'uniques','unique','unique downloads','unique dls',
  'total downloads','total endorsements','total dls','total mods','total collections',
  'files','file','images','image','posts','post','comments','comment','replies','reply',
  'media','articles','article','tracking','trackers','tracker',
  'mods','mod','collections','collection',
  'version','versions',
  'file size','filesize','size',
  'uploaded','published','posted','created','updated','modified',
  'last updated','last modified','date uploaded','date published',
  'tags','tag','categories','category','author','authors',
  'premium','adult','nsfw','sfw',
  'permissions','credits','requirements','requirement',
  'original upload','mirrors','mirror',
  'report','reports','share','shares','donate','donations',
  'compare','comparing','stats','statistics',
  'social','follow','followers','subscribers',
  'page','pages',
]);

const DEFAULT_MODEL_NAMES = [
  'gpt', 'chatgpt', 'o1', 'o3', 'o4', 'dall-e', 'whisper', 'sora', 'gpt-4o',
  'claude',
  'gemini', 'gemma', 'palm', 'bard',
  'llama', 'codellama',
  'mistral', 'mixtral', 'falcon',
  'deepseek',
  'glm', 'chatglm',
  'qwen', 'qwen2', 'qwen2.5', 'qwen3', 'qwq', 'tongyi qianwen',
  'ernie',
  'yi',
  'doubao', 'seed',
  'kimi', 'moonshot',
  'hunyuan',
  'spark',
  'sensechat',
  'baichuan',
  'step',
  'minimax', 'abab',
  'cohere', 'command', 'stable-diffusion', 'midjourney',
  'copilot', 'cursor', 'windsurf', 'devin', 'perplexity', 'pi', 'groq', 'cerebras',
  '豆包', '通义千问', '文心一言', '混元', '讯飞星火',
  '商汤日日新', '百川', '盘古', '天工', '悟道', '孟子', '智谱', '山海', '小冰'
];

const DEFAULT_MODEL_VARIANTS = [
  'turbo', 'flash', 'pro', 'mini', 'plus', 'ultra', 'opus', 'sonnet',
  'haiku', 'lightning', 'large', 'vision', 'chat', 'instruct', 'base',
  'codex', 'nano', 'xl', 'max', 'medium', 'small', 'distill', 'preview',
  'alpha', 'beta', 'exp', 'experimental', 'moe', 'thinking', 'reasoning',
  'coder', 'fast', 'search', 'sync', 'high', 'low', 'hd', 'long', 'sol',
  '标准版', '专业版', '增强版', '旗舰版', '极速版', '轻量版', '基础版'
];

const METRIC_PATTERNS = [
  /\d[\d,.]*\s*(?:downloads?|DLs?)\s*$/i,
  /^\s*\d[\d,.]*\s*(?:downloads?|DLs?)\s*$/i,
  /\d[\d,.]*\s*(?:endorsements?|likes?|votes?|views?)\s*$/i,
  /^\s*\d[\d,.]*\s*(?:endorsements?|likes?|votes?|views?)\s*$/i,
  /^\d[\d,.]*\s*[KkMm]?(?:B|bytes|[KkMmGg][Bb]|MB|GB|KB)\s*$/,
  /^\d[\d,.]*\s*(?:files?|images?|posts?|comments?|replies?)\s*$/i,
  /^\d[\d,.]*\s*(?:unique\s*)?(?:DLs?|downloads?)\s*$/i,
  /^\d[\d,.]*\s*(?:total\s*)?(?:endorsements?)\s*$/i,
  /^\d[\d,.]*\s*(?:minutes?|hours?|days?|weeks?|months?)\s*ago\s*$/i,
  /^\d[\d,.]*\s*[Kk]\s*$/,
  /^\d[\d,.]*\s*\+\s*\d+\s*$/,
  /^(?:uploaded|published|posted|created|updated|modified)\s+\d[\d,.]*\s*(?:minutes?|hours?|days?|weeks?|months?|years?)\s*ago\s*$/i,
  /^(?:version|v\.?|ver\.?)\s*\d[\d.]*\s*$/i,
  /^\d[\d,.]*\s*of\s*\d[\d,.]*\s*$/,
  /^(?:page\s*\d+\s*(?:of\s*\d+)?)\s*$/i,
  /^(?:last\s*updated|last\s*modified|date\s*uploaded|date\s*published)\s*$/i,
  /^\d[\d,.]*\s*(?:mods?|collections?|media|articles?|tracking|trackers?)\s*$/i,
  /^\d[\d,.]*\s*(?:total\s*)?(?:mods?|collections?)\s*$/i,
  /^\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:AM|PM))?\s*$/i,
  /^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\s*$/,
  /\d[\d,.]*\s*(?:K|M|B)\s*$/,
  /^(?:free|premium|abandoned|wip)\s*$/i,
];

function isMetricOrRepetitiveText(text) {
  const t = text.trim();
  if (!t) return true;

  const low = t.toLowerCase().replace(/\s+/g, ' ');

  if (isNexusModsDomain() && METRIC_LABELS.has(low)) return true;

  for (const p of METRIC_PATTERNS) { if (p.test(t)) return true; }

  return false;
}
function isNexusModsDomain() {
  try { return /(^|\.)nexusmods\.com$/i.test(location.hostname); } catch { return false; }
}

// 检测段落是否已经是中文（无需翻译）
// 策略：CJK 汉字占可分类字符的 80% 及以上，且 CJK 字符绝对数量 ≥ 5
//       段落同时含日文假名（平假名/片假名）则视为日文，需翻译
//       段落同时含较多拉丁字母则视为混合，需翻译
// v1.2.7 fix: 旧阈值 (CJK≥60% + 拉丁≤CJK×30%) 过宽：
//   1) 中文段落内嵌较多英文/URL/数字标点时，CJK 占比可能 < 60% → 误判为非中文 → 被 API "翻译"（LLM 可能润色或加额外内容）
//   2) 日文汉字假名混合段（含英文术语）CJK 占比可超 60% → 误判为中文 → 跳过翻译
//   新阈值：CJK 占可分类字符 80% 且绝对数量 ≥ 5，误判概率显著降低
function isAlreadyChinese(text) {
  const t = text.trim();
  if (t.length === 0) return false;
  let cjkCount = 0;     // CJK 统一汉字
  let kanaCount = 0;    // 日文假名（平假名 + 片假名）
  let latinCount = 0;   // 拉丁字母
  for (let i = 0; i < t.length; i++) {
    const c = t.codePointAt(i);
    if (c > 0xFFFF) i++;
    if ((c >= 0x4E00 && c <= 0x9FFF) ||  // CJK 统一汉字
        (c >= 0x3400 && c <= 0x4DBF) ||  // CJK 扩展 A
        (c >= 0x20000 && c <= 0x2A6DF) || // CJK 扩展 B
        (c >= 0x2A700 && c <= 0x2B73F) || // CJK 扩展 C
        (c >= 0x2B740 && c <= 0x2B81F) || // CJK 扩展 D
        (c >= 0xF900 && c <= 0xFAFF) ||  // CJK 兼容汉字
        (c >= 0x2F800 && c <= 0x2FA1F)) { // CJK 兼容补充
      cjkCount++;
    } else if ((c >= 0x3040 && c <= 0x309F) ||  // 平假名
               (c >= 0x30A0 && c <= 0x30FF)) {  // 片假名
      kanaCount++;
    } else if (c >= 0xAC00 && c <= 0xD7AF) { // 韩文谚文
      // 含韩文 → 需翻译，直接返回 false
      return false;
    } else if ((c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A)) {
      latinCount++;
    }
  }
  // 含假名 → 视为日文段落，需翻译
  if (kanaCount > 0) return false;
  // CJK 绝对数量不足 → 短样本不可靠，不视为中文（可能是中文页面里的英文短句）
  if (cjkCount < 5) return false;
  const total = cjkCount + latinCount;
  if (total === 0) return false;
  const cjkRatio = cjkCount / total;
  // CJK 占比 >= 80% → 视为中文，跳过翻译
  // 旧阈值 60% 已被移除：避免 "这 里 有 100+ 个 items" 类含较多英文/数字的段落被误判为非中文
  if (cjkRatio >= 0.8) return true;
  return false;
}

function containsUrl(text) {
  return URL_RE.test(text);
}
function isGarbledText(text) {
  return !/\p{L}/u.test(text) || /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/.test(text);
}
const MODEL_CN_VARIANTS = new Set([
  'pro', 'plus', 'ultra', 'max', 'turbo', 'lite', 'mini', 'air', 'nano',
  '标准版', '专业版', '增强版', '旗舰版', '极速版', '轻量版', '基础版'
]);

function isAiModelName(text, settings) {
  const t = text.trim();
  if (!t || t.length > 80) return false;

  const modelNames = (settings && settings.rules && Array.isArray(settings.rules.customModelNames))
    ? settings.rules.customModelNames
    : (typeof DEFAULT_MODEL_NAMES !== 'undefined' ? DEFAULT_MODEL_NAMES : []);

  if (modelNames.some(n => n.toLowerCase() === t.toLowerCase())) {
    return true;
  }

  if (t.length < 3) return false;

  if (isAiModelNameCN(t, modelNames)) return true;

  const lower = t.toLowerCase();
  const hasSpace = /\s/.test(lower);
  const normalized = lower.replace(/[\s_]+/g, '-').replace(/\.+/g, '-');
  const normalizedNames = [...new Set(modelNames.map(n =>
    n.toLowerCase().replace(/[\s_]+/g, '-').replace(/\.+/g, '-')
  ))].sort((a, b) => b.length - a.length);

  for (const base of normalizedNames) {
    if (normalized === base) return true;
    if (normalized.startsWith(base)) {
      const rest = normalized.slice(base.length);
      if (rest.length > 25) continue;
      if (parseVariantChain(rest, hasSpace, modelNames)) return true;
    }
  }

  return false;
}

function isAiModelNameCN(text, modelNames) {
  for (const base of modelNames) {
    if (!/[\u4e00-\u9fff]/.test(base)) continue;
    if (text === base) return true;
    if (text.startsWith(base)) {
      const rest = text.slice(base.length);
      if (MODEL_CN_VARIANTS.has(rest.toLowerCase())) return true;
      if (MODEL_CN_VARIANTS.has(rest)) return true;
    }
  }
  return false;
}

function parseVariantChain(s, hasSpace, modelNames) {
  const variants = (typeof settings !== 'undefined' && settings && settings.rules && Array.isArray(settings.rules.customModelVariants))
    ? settings.rules.customModelVariants
    : (typeof DEFAULT_MODEL_VARIANTS !== 'undefined' ? DEFAULT_MODEL_VARIANTS : []);

  if (!hasSpace) {
    const segments = s.split(/[-_.]/).filter(Boolean);
    if (segments.length === 0) return false;
    if (segments.some(seg => isNumberSegment(seg) || /\d/.test(seg))) return true;
    return segments.every(seg => isVariantSegment(seg, variants));
  }

  const parts = s.split(/\s+/).filter(Boolean);
  for (const part of parts) {
    const subSegments = part.split(/[-_.]+/).filter(Boolean);
    if (subSegments.length === 0) continue;
    const allValid = subSegments.every(seg => isNumberSegment(seg) || /\d/.test(seg) || isVariantSegment(seg, variants));
    if (!allValid) return false;
  }
  return true;
}

function isNumberSegment(s) {
  return /^v?\d+(?:\.\d+)?[a-z]?$/.test(s) || /^\d+[bm]$/i.test(s) || /^a\d+b$/i.test(s);
}

function isVariantSegment(s, variants) {
  return variants.some(v => v.toLowerCase() === s.toLowerCase());
}
function hasAnyCJK(text) {
  for (let i = 0; i < text.length; i++) {
    const c = text.codePointAt(i);
    if (c > 0xFFFF) i++;
    if ((c >= 0x4E00 && c <= 0x9FFF) || (c >= 0x3400 && c <= 0x4DBF) ||
        (c >= 0xF900 && c <= 0xFAFF) || (c >= 0x2F800 && c <= 0x2FA1F) ||
        (c >= 0x20000 && c <= 0x2A6DF) ||
        (c >= 0x2A700 && c <= 0x2B73F) || (c >= 0x2B740 && c <= 0x2B81F))
      return true;
  }
  return false;
}
function shouldSkipText(text) {
  if (settings && settings.rules && settings.rules.skipChineseSegments !== false && cachedPageLang !== 'ja' && hasAnyCJK(text) && !/[\u3040-\u30ff]/.test(text)) return true;
  return isMetricOrRepetitiveText(text)||containsUrl(text)||isGarbledText(text)||isAiModelName(text, settings)||isAlreadyChinese(text);
}

function hideOriginalText(seg) {
  if (seg.wrappers) return;
  seg.wrappers = [];
  for (const node of seg.nodes) {
    if (!node.isConnected) continue;
    const wrapper = document.createElement('span');
    originalWrappers.add(wrapper);
    wrapper.className = 'dual-translate-original-hidden';
    node.before(wrapper);
    wrapper.append(node);
    seg.wrappers.push(wrapper);
  }
}

function restoreOriginal(seg) {
  for (const wrapper of seg.wrappers || []) {
    if (wrapper.parentNode) wrapper.replaceWith(...wrapper.childNodes);
  }
  seg.wrappers = null;
}

function showLoading(title, subtitle) {
  hideLoading();
  const el = document.createElement('div');
  el.className = 'dual-translate-loading-overlay';
  el.innerHTML = `<div class="dual-translate-loading-spinner"></div><div class="dual-translate-loading-info"><div class="dual-translate-loading-title">${escapeContent(title||'正在翻译...')}</div>${subtitle?`<div class="dual-translate-loading-subtitle">${escapeContent(subtitle)}</div>`:''}<div class="dual-translate-loading-progress"><div class="dual-translate-loading-progress-bar" style="width:0%"></div></div></div>`;
  document.body.appendChild(el);
  loadingElement = el;
}
function updateLoadingProgress(current, total, label) {
  if (!loadingElement) return;
  const bar = loadingElement.querySelector('.dual-translate-loading-progress-bar');
  if (bar) bar.style.width = Math.round((current/Math.max(total,1))*100)+'%';
  const sub = loadingElement.querySelector('.dual-translate-loading-subtitle');
  if (sub) sub.textContent = label||`翻译中 ${current}/${total} 段`;
}
function hideLoading() {
  if (!loadingElement) return;
  loadingElement.classList.add('hiding');
  const el = loadingElement; loadingElement = null;
  setTimeout(()=>{if(el.parentNode)el.remove()},350);
}

// v1.2.17 UX: 将技术性错误消息映射为普通用户可理解的文案（页面翻译横幅用）
function humanizeTranslateError(m){
  const s=String(m||'');
  if(s.includes('NO_API'))return '尚未配置翻译 API，请先在扩展设置中添加密钥';
  if(s.includes('额度')||/quota/i.test(s))return '翻译服务额度不足，请检查额度或更换翻译源';
  if(s.includes('频率')||/rate.?limit/i.test(s))return '翻译请求过于频繁，请稍后再试';
  if(s.includes('超时')||/timeout|abort/i.test(s))return '网络超时，请稍后重试';
  if(/auth|401|403|密钥/i.test(s))return '密钥校验失败，请检查 API 密钥是否正确';
  if(/network|fetch/i.test(s))return '网络异常，请检查网络后重试';
  return s||'翻译失败，请稍后重试';
}

function showErrorBanner(text, opts = {}) {
  hideErrorBanner();
  const el = document.createElement('div');
  el.className = 'dual-translate-error-banner';
  // v1.2.17 UX: NO_API 时提供「打开设置」入口，其余可重试错误提供「重试」按钮，修复反馈回路断裂
  let actionsHtml = '';
  if (opts.showSettings) {
    actionsHtml += '<button class="dual-translate-error-action" data-action="settings">打开设置</button>';
  } else if (opts.canRetry) {
    actionsHtml += '<button class="dual-translate-error-action" data-action="retry">重试</button>';
  }
  el.innerHTML = `<span class="dual-translate-error-text">${escapeContent(text)}</span>${actionsHtml}<button class="dual-translate-error-close">✕</button>`;
  el.style.cssText = 'position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:2147483647;background:var(--dt-bg-error);color:var(--dt-text-error);border:1px solid var(--dt-border-error);border-radius:8px;padding:10px 16px;font-size:13px;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI Variable","Segoe UI","Microsoft YaHei","PingFang SC","Hiragino Sans GB","Ubuntu","Cantarell","Noto Sans",sans-serif;box-shadow:0 4px 16px var(--dt-shadow);display:flex;align-items:center;gap:12px;max-width:520px;';
  el.querySelector('.dual-translate-error-close').style.cssText = 'background:none;border:none;cursor:pointer;font-size:16px;color:var(--dt-text-error);padding:0 4px;line-height:1;';
  const actionBtn = el.querySelector('.dual-translate-error-action');
  if (actionBtn) {
    actionBtn.style.cssText = 'background:var(--dt-bg-error);color:var(--dt-text-error);border:1px solid var(--dt-text-error);border-radius:4px;padding:4px 12px;cursor:pointer;font-size:12px;line-height:1.4;flex-shrink:0;';
    actionBtn.addEventListener('click', () => {
      hideErrorBanner();
      if (actionBtn.dataset.action === 'settings') {
        sendMessage('openOptions').catch(() => {});
      } else {
        const wasAutomatic = automaticSession;
        resetAll();
        startTranslation({ automatic: wasAutomatic }).catch(() => {});
      }
    });
  }
  el.querySelector('.dual-translate-error-close').addEventListener('click', hideErrorBanner);
  document.body.appendChild(el);
  errorBannerElement = el;
}
function hideErrorBanner() {
  if (!errorBannerElement) return;
  const el = errorBannerElement; errorBannerElement = null;
  if (el.parentNode) el.remove();
}

function sendMessage(action, data={}, timeoutMs=action === 'translateTexts' ? 0 : 8000) {
  return new Promise((resolve, reject) => {
    // Translation fetches have provider-level timeouts and may include fallback requests.
    const t = timeoutMs > 0 ? setTimeout(() => reject(new Error('SEND_MESSAGE_TIMEOUT')), timeoutMs) : null;
    chrome.runtime.sendMessage({action,...data}, (resp) => {
      clearTimeout(t);
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(resp || {});
    });
  });
}
async function loadSettings(refresh = false) {
  if (settings && !refresh) return settings;
  const firstLoad = !settings;
  const resp = await sendMessage('getSettings');
  settings = resp.settings;
  if (firstLoad && settings) currentMode = settings.general.lastMode||settings.display.defaultMode||BILINGUAL;
  // v1.0.5 hotfix: 改成 await, 保证首屏翻译能用到术语表
  if (firstLoad) await loadGlossary();
  applyTranslationStyles();
  return settings;
}

// 将译文样式设置到 :root CSS 变量，所有 .dual-translate-translation 自动跟随
// 修改样式时只需调一次此函数，无需遍历 DOM 逐个更新
function applyTranslationStyles() {
  if (!settings || !settings.display) return;
  const root = document.documentElement;
  // v1.3.0 fix C3: 写入 CSS 变量前做白名单校验，异常设置值回退到安全默认值（纵深防御）
  const color = /^#[0-9a-fA-F]{3,8}$/.test(settings.display.translationColor || '')
    ? settings.display.translationColor : '#888888';
  const size = /^\d+(\.\d+)?(px|em|rem|%|vh|vw)?$/.test(settings.display.translationSize || '')
    ? settings.display.translationSize : '85%';
  const spacing = /^\d+(\.\d+)?(px|em|rem|%|vh|vw)?$/.test(settings.display.translationSpacing || '')
    ? settings.display.translationSpacing : '4px';
  const fontInput = settings.display.translationFont || '';
  const font = fontInput === '' ? 'inherit'
    : (/^[\w\s,.'-]{1,100}$/.test(fontInput) ? fontInput : 'inherit');
  root.style.setProperty('--dt-trans-color', color);
  root.style.setProperty('--dt-trans-size', size);
  root.style.setProperty('--dt-trans-spacing', spacing);
  root.style.setProperty('--dt-trans-font', font);
}
async function checkAndTranslate() {
  await loadSettings();
  if (pageRestored || currentAbortController || !settings?.general.translationEnabled ||
      !settings.trigger.autoTranslate || !shouldAutoTranslate(location.hostname)) return;
  clearTimeout(autoStartTimer);
  autoStartTimer = setTimeout(() => {
    autoStartTimer = null;
    if (!pageRestored && !currentAbortController && settings.general.translationEnabled && settings.trigger.autoTranslate &&
        shouldAutoTranslate(location.hostname)) {
      startTranslation({ automatic: true }).catch(e => dtError('auto translate error:', e));
    }
  }, settings.trigger.translateDelay ?? 500);
}
// NOTE: 此函数与 settings-manager.js._hostMatches 逻辑相同，
// 因 content script 无法 import ESM，只能内联保留副本。修改时需同步两处。
function hostMatchesPattern(hostname, pattern) {
  try {
    let p = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    p = p.replace(/\\\*/g, '.*');
    p = p.replace(/^\.\*\\\./, '(?:.*\.)?');
    const matched = new RegExp('^' + p + '$', 'i').test(hostname);

    // 兜底：若 pattern 形如 *.xxx.yyy，且正则未匹配成功，则检查 hostname 是否等于去除 "*." 后的根域名
    if (!matched && pattern.startsWith('*.') && hostname === pattern.substring(2)) {
      return true;
    }

    return matched;
  } catch {
    return hostname === pattern;
  }
}
function shouldAutoTranslate(hostname) {
  const list = settings.trigger.excludeList||[];
  const mode = settings.trigger.excludeMode||'blacklist';
  const matched = list.some(p => hostMatchesPattern(hostname, p));
  return mode==='blacklist'?!matched:matched;
}
function detectPageLanguage(forceLanguage) {
  // 如果传入了 forceLanguage 且不为 'auto'/'all'，直接返回该语言
  if (forceLanguage && forceLanguage !== 'auto' && forceLanguage !== 'all') {
    cachedPageLang = forceLanguage;
    return forceLanguage;
  }

  // v1.0.6 perf: 复用缓存，避免同一次翻译流程内重复遍历 DOM
  if (cachedPageLang !== null) return cachedPageLang;

  const hl = document.documentElement.lang||'';
  if (hl.startsWith('zh')) { cachedPageLang='zh'; return 'zh'; }
  if (hl.startsWith('ja')) { cachedPageLang='ja'; return 'ja'; }
  if (hl.startsWith('en')) { cachedPageLang='en'; return 'en'; }

  const title = (document.title||'').toLowerCase();
  if (/[\u4E00-\u9FFF]{3,}/.test(title)) { cachedPageLang='zh'; return 'zh'; }

  const body = document.body; if(!body){cachedPageLang='unknown';return'unknown';}
  const walker = document.createTreeWalker(body,NodeFilter.SHOW_TEXT,{acceptNode:n=>{
    const p=n.parentElement;if(!p)return NodeFilter.FILTER_SKIP;
    if(!readableElement(p))return NodeFilter.FILTER_SKIP;
    if(n.textContent.trim().length<5)return NodeFilter.FILTER_SKIP;
    return NodeFilter.FILTER_ACCEPT;
  }});
  let sample='',node;
  while((node=walker.nextNode())&&sample.length<4000)sample+=node.textContent.trim()+' ';
  let cjk=0,ja=0,en=0,total=0;
  for(let i=0;i<sample.length;i++){
    const c=sample.charCodeAt(i);
    if((c>=65&&c<=90)||(c>=97&&c<=122)){en++;total++;}
    else if(c>=0x4E00&&c<=0x9FFF){cjk++;total++;}
    else if((c>=0x3040&&c<=0x309F)||(c>=0x30A0&&c<=0x30FF)){ja++;cjk++;total++;}
  }
  let result;
  if(total===0)result='unknown';
  else {
    const nonJaCjk = cjk - ja;
    // v1.2.7 fix: 旧阈值 nonJaCjk/total > 0.15 → zh 过低（15% 汉字即判为中文页面），
    //   会在含少量中文专有名词/引用的英文页面上被误判为 zh，从而走 "中文页面不翻译" 分支，
    //   但具体段落未做中文检查，API 仍可能收到中文文本并"翻译"。
    //   新阈值 0.4：要求 40% 以上是"非日文"汉字（基本无假名）才视为中文页面，显著降低误判。
    if(ja/total>0.12)result='ja';
    else if(nonJaCjk/total>0.4)result='zh';
    else if(en/total>0.5)result='en';
    else if(ja>0)result='ja';
    else result='en';
  }
  cachedPageLang=result;
  return result;
}
function isValidLangForTranslation(lang) {
  if(!settings.rules.onlyEnJa)return true;
  return lang==='en'||lang==='ja';
}

function shouldTranslateWithSource(detectedLang) {
  if (!settings || !settings.api || !settings.api.sourceLanguage) {
    return isValidLangForTranslation(detectedLang);
  }

  const sourceLanguage = settings.api.sourceLanguage;
  switch(sourceLanguage) {
    case 'auto':
      return isValidLangForTranslation(detectedLang);
    case 'en':
    case 'ja':
      return true; // 手动指定了源语言，总是翻译
    case 'all':
      return detectedLang !== 'zh'; // 只要不是中文就翻译
    default:
      // 回退到 'auto' 行为
      dtWarn('Unknown sourceLanguage: ' + sourceLanguage + ', falling back to auto');
      return isValidLangForTranslation(detectedLang);
  }
}

function cleanupAllInjections() {
  // 外层 try-catch 兜底，防止任意一步抛错中断整个清理流程
  try {
    segments.forEach(restoreOriginal);

    hideLoading();
    hideErrorBanner();
    hoverCleanupHandlers.forEach(fn=>{try{fn()}catch{}});
    hoverCleanupHandlers=[];
    globalCleanupHandlers.forEach(fn=>{try{fn()}catch{}});
    globalCleanupHandlers=[];
    hoverClickRegistered=false;
    // v1.0.7 fix: 同步清除增量渲染追踪状态，避免重翻译时 HOVER/PANEL 模式失效
    hoverDelegationRegistered=false;
    hoverRegisteredSegIds.clear();
    hoverTranslations.clear();
    panelRenderedSegIds.clear();
    document.querySelectorAll('[data-dt-hover-id]').forEach(el=>{el.removeAttribute('data-dt-hover-id');});
    document.querySelectorAll('.dual-translate-hover,.dual-translate-panel,.dual-translate-translation,.dual-translate-placeholder,.dual-translate-spinner').forEach(el=>el.remove());
    // v1.1.0 perf: 上述已移除所有 hover 元素，同步清零计数
    _activeHoverCount=0;
    restorePanelStyles();
  } catch (e) {
    dtError('cleanupAllInjections error:', e);
  }
}

function scheduleRescan() {
  if (!currentAbortController) return;
  rescanPending = true;
  if (isTranslating || mutationQuietTimer || document.hidden) return;
  mutationQuietTimer = setTimeout(() => {
    mutationQuietTimer = null;
    if (rescanPending && !document.hidden) startTranslation({ incremental: true });
  }, 200);
}

function setupMutationObserver() {
  if (mutationObserver) return;
  mutationObserver = new MutationObserver(records => {
    for (const record of records) {
      const target = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
      if (!target || target.closest(INJECTED)) continue;
      if (record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].every(node =>
        node.nodeType === Node.ELEMENT_NODE && node.matches(INJECTED))) continue;
      scheduleRescan();
      break;
    }
  });
  mutationObserver.observe(document.documentElement, {
    subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ['class','style','hidden','inert','aria-hidden','aria-selected','open','contenteditable','role','translate','alt','lang']
  });
}

let _rescanTimer = null;
function setupPeriodicRescan() {
  teardownPeriodicRescan();
  const config = settings?.rules?.autoRescan;
  if (currentAbortController && config?.enabled) {
    _rescanTimer = setInterval(() => {
      if (config.idleOnly === false && document.hidden && !isTranslating) {
        startTranslation({ incremental: true });
      } else scheduleRescan();
    }, Math.max(2, Number(config.interval) || 5) * 1000);
  }
}
function teardownPeriodicRescan() {
  clearInterval(_rescanTimer);
  _rescanTimer = null;
}

function extractSegments() {
  const groups = [];
  if (!document.body || !readableElement(document.body)) return groups;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
      if (originalWrappers.has(node)) return NodeFilter.FILTER_SKIP;
      if (excludedElement(node)) return NodeFilter.FILTER_REJECT;
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' ||
          style.contentVisibility === 'hidden') return NodeFilter.FILTER_REJECT;
      // Treat line breaks as boundaries so adjacent lines keep their reading order.
      return node.tagName === 'BR' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    }
  });
  let group, node;
  while ((node = walker.nextNode())) {
    if (node.nodeType !== Node.TEXT_NODE) { group = null; continue; }
    let parent = node.parentElement;
    if (originalWrappers.has(parent)) parent = parent.parentElement;
    let owner = parent.closest(BLOCKS);
    if (!owner || owner === document.body) owner = parent;
    if (!group || group.blockParent !== owner) {
      group = { blockParent: owner, nodes: [] };
      groups.push(group);
    }
    group.nodes.push(node);
  }
  const result = [];
  for (const item of groups) {
    // Drop boundary whitespace nodes so a later insertion cannot move the anchor.
    while (item.nodes.length && !item.nodes.at(-1).data.trim()) item.nodes.pop();
    const first = item.nodes.findIndex(n => n.data.trim());
    if (first < 0) continue;
    item.nodes = item.nodes.slice(first);
    item.text = normText(item.nodes.map(n => n.data).join(''));
    if (item.text.length < (settings.rules.minTextLength || 3) || shouldSkipText(item.text)) continue;
    item.node = item.nodes[0];
    result.push(item);
  }
  return result;
}

function removeSegment(seg) {
  restoreOriginal(seg);
  if (seg.output) lazyTranslateObserver?.unobserve(seg.output);
  seg.output?.remove();
  seg.row?.remove();
  if (seg.blockParent.dataset.dtHoverId === seg.id) delete seg.blockParent.dataset.dtHoverId;
  translationCache.delete(seg.id);
  lazyPendingSegs.delete(seg.id);
  hoverRegisteredSegIds.delete(seg.id);
  hoverTranslations.delete(seg.id);
  panelRenderedSegIds.delete(seg.id);
}

function reconcileSegments(candidates) {
  const previous = new Map(segments.map(seg => [seg.node, seg]));
  const pending = [];
  segments = candidates.map(candidate => {
    const old = previous.get(candidate.node);
    if (old && old.blockParent === candidate.blockParent && old.text === candidate.text &&
        old.nodes.length === candidate.nodes.length && old.nodes.every((node, i) => node === candidate.nodes[i]) &&
        (!old.output || old.output.isConnected)) {
      previous.delete(candidate.node);
      return old;
    }
    candidate.id = 'seg_' + nextSegmentId++;
    pending.push(candidate);
    return candidate;
  });
  for (const old of previous.values()) removeSegment(old);
  segmentMap = new Map(segments.map(seg => [seg.id, seg]));
  return pending;
}

function currentSegment(seg) {
  return segmentMap.get(seg.id) === seg &&
    seg.nodes.every(n => n.isConnected && readableElement(n.parentElement)) &&
    normText(seg.nodes.map(n => n.data).join('')) === seg.text;
}

async function startTranslation(opts = {}) {
  await loadSettings();
  if (isTranslating) { if (opts.incremental) rescanPending = true; return; }
  if (!settings?.general.translationEnabled || !shouldAutoTranslate(location.hostname)) return;
  if (!currentAbortController) {
    if (opts.incremental) return;
    pageRestored = false;
    clearTimeout(autoStartTimer);
    autoStartTimer = null;
    automaticSession = !!opts.automatic;
    currentAbortController = new AbortController();
    setupMutationObserver();
    setupPeriodicRescan();
  }
  const { signal } = currentAbortController;
  rescanPending = false;
  isTranslating = true;
  try {
    if (!opts.incremental && !opts.silent) showLoading('正在分析页面...', '提取需要翻译的文本段落');
    cachedPageLang = null;
    const lang = detectPageLanguage(settings.api.sourceLanguage || 'auto');
    // Source detection is repeated after hydration and SPA navigation. On mixed Chinese
    // pages, segment filters still admit English and Japanese sections.
    const allowed = !automaticSession || lang === 'unknown' || lang === 'zh' || shouldTranslateWithSource(lang);
    const pending = reconcileSegments(allowed ? extractSegments() : []);
    if (pending.length) {
      sendMessage('setIconState', { state: 'translating' }).catch(() => {});
      placePendingSpans(pending);
      const lazy = settings.advanced?.lazyTranslate !== false && currentMode !== HOVER && currentMode !== PANEL &&
        typeof IntersectionObserver !== 'undefined';
      if (lazy) await translateSegmentsLazy(pending, signal);
      else await translateSegments(pending, signal);
    }
    if (signal.aborted) return;
    if (allowed) await translatePageMeta(signal);
    if (!signal.aborted && (!opts.incremental || pending.length)) {
      sendMessage('setIconState', { state: segments.length ? 'translated' : 'idle' }).catch(() => {});
    }
  } catch (err) {
    if (!signal.aborted) showErrorBanner(humanizeTranslateError(err.message), { canRetry: true });
  } finally {
    if (!signal.aborted) {
      hideLoading();
      isTranslating = false;
      if (rescanPending) scheduleRescan();
    }
  }
}

async function translatePageMeta(signal) {
  const items = [];
  if (translatedTitle && document.title !== translatedTitle.applied) translatedTitle = null;
  const title = document.title.trim();
  if (settings.display.translatePageTitle !== false && !translatedTitle && title.length >= 2 && !shouldSkipText(title)) {
    items.push({ text: title });
  }
  for (const img of translatedImages.keys()) {
    if (!img.isConnected || img.alt !== translatedImages.get(img).applied) translatedImages.delete(img);
  }
  if (settings.display.translateImgAlt !== false) {
    for (const img of document.querySelectorAll('img[alt]')) {
      const alt = img.alt.trim();
      if (alt.length >= 2 && alt.length <= 200 && !translatedImages.has(img) &&
          readableElement(img) && !shouldSkipText(alt)) items.push({ text: alt, img });
    }
  }
  for (let i = 0; i < items.length && !signal.aborted; i += 50) {
    const batch = items.slice(i, i + 50).filter(item => !item.img || readableElement(item.img));
    const originals = [...new Set(batch.map(item => item.text))];
    if (!originals.length) continue;
    const resp = await sendMessage('translateTexts', { texts: originals, sourceLang: requestLanguage() });
    if (signal.aborted) return;
    const translated = new Map(resp.translations?.map(r => [r.original, r.translation]) || []);
    for (const { text, img } of batch) {
      const output = translated.get(text);
      if (!output) continue;
      const value = applyGlossary(output);
      if (img && readableElement(img) && img.alt.trim() === text) {
        translatedImages.set(img, { original: img.alt, applied: value });
        img.alt = value;
      } else if (!img && document.title.trim() === text) {
        const applied = value + ' / ' + text;
        translatedTitle = { original: document.title, applied };
        document.title = applied;
      }
    }
  }
}

function placePendingSpans(pending) {
  if (currentMode !== BILINGUAL && currentMode !== TRANSLATION_ONLY) return;
  for (const seg of pending) {
    const output = document.createElement('span');
    output.className = 'dual-translate-placeholder';
    output.dataset.dtSeg = seg.id;
    output.innerHTML = '<span class="dual-translate-spinner"></span><span class="dual-translate-loader-text">正在翻译...</span>';
    seg.output = output;
    // Prefer the end of the containing paragraph, outside inline links/emphasis,
    // when the anchor is already its last child.
    let anchor = seg.nodes.at(-1);
    while (anchor.parentElement !== seg.blockParent && anchor.parentElement && !anchor.nextSibling) {
      anchor = anchor.parentElement;
    }
    anchor.after(output);
  }
}

function fillTranslations(batchSegs) {
  for (const seg of batchSegs) {
    const ph = seg.output;
    if (!ph?.isConnected || !ph.classList.contains('dual-translate-placeholder') || !translationCache.has(seg.id)) continue;
    const translation = translationCache.get(seg.id);
    ph.className = 'dual-translate-translation';
    if (translation) {
      ph.textContent = translation;
      if (currentMode === TRANSLATION_ONLY) {
        ph.title = seg.text;
        hideOriginalText(seg);
      }
    } else {
      ph.textContent = '【该段翻译失败，点击重试】';
      ph.classList.add('dual-translate-failed');
      ph.title = '点击重试该段翻译';
      ensureFailedRetryRegistered();
    }
  }
}

function normText(s){return String(s==null?'':s).trim().replace(/\s+/g,' ');}

// v1.2.17 UX: 段级失败重试——点击失败占位符仅重译该段，不重建整页
let failedRetryRegistered = false;
function ensureFailedRetryRegistered() {
  if (failedRetryRegistered) return;
  failedRetryRegistered = true;
  document.addEventListener('click', (e) => {
    const ph = e.target.closest && e.target.closest('.dual-translate-failed[data-dt-seg]');
    if (!ph) return;
    retrySegment(ph.dataset.dtSeg).catch(e => dtError('retry failed:', e));
  });
}

async function retrySegment(segId) {
  const seg = segmentMap.get(segId);
  if (!seg || !currentSegment(seg) || !seg.output?.classList.contains('dual-translate-failed')) return;
  seg.output.className = 'dual-translate-placeholder';
  seg.output.textContent = '正在翻译...';
  translationCache.delete(segId);
  await translateSegments([seg], currentAbortController.signal);
}

// v1.0.3: 懒加载翻译（§3.4 性能优化）—— 复用 translateSegments 子流程
let lazyTranslateObserver = null;
const lazyPendingSegs = new Map();

function teardownLazyObserver() {
  if (lazyTranslateObserver) {
    try { lazyTranslateObserver.disconnect(); } catch (e) { dtWarn('lazy observer disconnect:', e); }
    lazyTranslateObserver = null;
  }
  lazyPendingSegs.clear();
}

// v1.1.0 perf: 视口尺寸由调用方传入，避免在 filter 回调内对每段重复读取 window.innerHeight/innerWidth
function isSegInViewport(seg) {
  const r = seg.output.getBoundingClientRect();
  return r.bottom > -200 && r.top < innerHeight + 200 && r.right > -200 && r.left < innerWidth + 200;
}

async function translateSegmentsLazy(segs, signal) {
  if (!lazyTranslateObserver) {
    lazyTranslateObserver = new IntersectionObserver(entries => {
      if (signal.aborted) return;
      const visible = [];
      for (const { target, isIntersecting } of entries) {
        const seg = lazyPendingSegs.get(target.dataset.dtSeg);
        if (!isIntersecting || !seg) continue;
        lazyTranslateObserver.unobserve(target);
        lazyPendingSegs.delete(seg.id);
        visible.push(seg);
      }
      translateSegments(visible, signal).catch(e => dtError('lazy translate error:', e));
    }, { rootMargin: '200px' });
  }
  const visible = [];
  for (const seg of segs) {
    if (isSegInViewport(seg)) visible.push(seg);
    else {
      lazyPendingSegs.set(seg.id, seg);
      lazyTranslateObserver.observe(seg.output);
    }
  }
  await translateSegments(visible, signal);
}

function requestLanguage() {
  const source = settings.api.sourceLanguage || 'auto';
  if (source !== 'auto' && source !== 'all') return source;
  return cachedPageLang === 'en' || cachedPageLang === 'ja' ? cachedPageLang : 'auto';
}

function splitForService(text) {
  const chunks = [];
  const encoder = new TextEncoder();
  while (text) {
    let end = 0;
    let bytes = 0;
    for (const character of text) {
      const width = encoder.encode(character).length;
      if (bytes + width > 4000) break;
      bytes += width;
      end += character.length;
    }
    if (end < text.length) {
      const head = text.slice(0, end);
      const boundary = Math.max(head.lastIndexOf(' '), head.lastIndexOf('。'), head.lastIndexOf('！'), head.lastIndexOf('？'));
      if (boundary > head.length / 2) end = boundary + 1;
    }
    chunks.push(text.slice(0, end));
    text = text.slice(end);
  }
  return chunks;
}

async function translateSegments(segs, signal) {
  const encoder = new TextEncoder();
  const size = Math.max(1, Math.min(50, Number(settings.advanced?.batchSize) || 10));
  const sourceLang = requestLanguage();
  let fatal = false;
  for (let offset = 0; offset < segs.length && !signal.aborted; offset += size) {
    const batch = segs.slice(offset, offset + size).filter(currentSegment);
    const missing = new Map();
    for (const seg of batch) {
      const key = sourceLang + '::' + seg.text;
      const term = glossaryCompiled.find(entry => entry.source === seg.text.toLowerCase());
      const value = term?.target ?? (settings.trigger.translationCache !== false ? textCache.get(key) : undefined);
      if (value !== undefined) translationCache.set(seg.id, value);
      else missing.set(seg.text, splitForService(seg.text));
    }
    const pieces = [...new Set(Array.from(missing.values()).flat())];
    const results = new Map();
    for (let i = 0; i < pieces.length && !fatal;) {
      if (signal.aborted) return;
      // Recheck every source before sending another batch: a virtual list can reuse
      // a paragraph for an editable or hidden item while a previous request runs.
      const eligible = new Set(batch.filter(currentSegment).flatMap(seg => missing.get(seg.text) || []));
      const texts = [];
      let bytes = 0;
      while (i < pieces.length && texts.length < size) {
        const text = pieces[i];
        const width = encoder.encode(text).length;
        if (texts.length && bytes + width > 4500) break;
        i++;
        if (!eligible.has(text)) continue;
        texts.push(text);
        bytes += width;
      }
      if (!texts.length) continue;
      try {
        const resp = await sendMessage('translateTexts', { texts, sourceLang });
        if (signal.aborted) return;
        if (resp.error) throw new Error(resp.error);
        for (const row of resp.translations || []) {
          if (typeof row.translation === 'string' && row.translation.trim()) results.set(normText(row.original), row.translation.trim());
        }
      } catch (err) {
        if (signal.aborted) return;
        const msg = String(err.message);
        fatal = /NO_API|AUTH_ERROR|QUOTA_EXCEEDED|RATE_LIMITED|所有翻译服务|暂时不可用/.test(msg);
        showErrorBanner(humanizeTranslateError(msg), { canRetry: !msg.includes('NO_API'), showSettings: msg.includes('NO_API') });
      }
    }
    for (const seg of batch.filter(currentSegment)) {
      const chunks = missing.get(seg.text);
      if (!chunks) continue;
      const values = chunks.map(chunk => results.get(normText(chunk)));
      const translated = values.every(Boolean) ? applyGlossary(values.join(' ')) : '';
      translationCache.set(seg.id, translated);
      if (translated && settings.trigger.translationCache !== false) {
        textCache.set(sourceLang + '::' + seg.text, translated);
        if (textCache.size > TEXT_CACHE_MAX_SIZE) textCache.delete(textCache.keys().next().value);
      }
    }
    const current = batch.filter(currentSegment);
    updateLoadingProgress(Math.min(offset + size, segs.length), segs.length, '正在翻译');
    if (currentMode === HOVER) updateHover(current);
    else if (currentMode === PANEL) updatePanel(current);
    else fillTranslations(current);
  }
}

function updateHover(segSubset) {
  // v1.0.7 perf: 事件委托模式--在 document 上注册单组 mouseover/mouseout 监听器
  // 用 dataset 存储 seg.id -> translation 映射，不再每段绑独立 listener
  const hoverDelay=settings.display.hoverDelay||200;

  // 首次调用时注册 document 级委托监听器
  if(!hoverDelegationRegistered){
    hoverDelegationRegistered=true;
    let ht=null;
    // v1.1.0 perf: rAF 节流，避免每次 mouseover/mouseout 都调用 closest()
    let hoverRaf=0,lastHoverEv=null,lastHoverType=null;
    const processHover=()=>{
      hoverRaf=0;
      const ev=lastHoverEv;if(!ev)return;
      if(lastHoverType==='out'){
        const target=ev.target.closest&&ev.target.closest('[data-dt-hover-id]');
        if(!target)return;
        // 检查是否移出 target（mouseout 会在子元素间触发，需判断 relatedTarget）
        const rt=ev.relatedTarget;
        if(rt&&target.contains(rt))return;
        clearTimeout(ht);
        return;
      }
      const target=ev.target.closest&&ev.target.closest('[data-dt-hover-id]');
      if(!target)return;
      clearTimeout(ht);
      ht=setTimeout(()=>{
        const sid=target.dataset.dtHoverId;
        const tr=hoverTranslations.get(sid);
        if(!tr)return;
        const ex=document.querySelector('.dual-translate-hover:not(.pinned)');
        if(ex){ex.remove();_activeHoverCount--;if(_activeHoverCount<0)_activeHoverCount=0;}
        showHover(ev,tr,sid);
      },hoverDelay);
    };
    const onOver=(e)=>{lastHoverEv=e;lastHoverType='over';if(!hoverRaf)hoverRaf=requestAnimationFrame(processHover);};
    const onOut=(e)=>{lastHoverEv=e;lastHoverType='out';if(!hoverRaf)hoverRaf=requestAnimationFrame(processHover);};
    document.addEventListener('mouseover',onOver);
    document.addEventListener('mouseout',onOut);
    // v1.2.17 UX: Esc 键一键关闭所有未固定的 hover 气泡（键盘可达性）
    const onEsc=(e)=>{
      if(e.key!=='Escape')return;
      const un=document.querySelectorAll('.dual-translate-hover:not(.pinned)');
      if(un.length===0)return;
      un.forEach(h=>h.remove());
      _activeHoverCount-=un.length;if(_activeHoverCount<0)_activeHoverCount=0;
    };
    document.addEventListener('keydown',onEsc);
    hoverCleanupHandlers.push(()=>{
      if(hoverRaf){cancelAnimationFrame(hoverRaf);hoverRaf=0;}
      // v1.1.0 fix: 清理 hover 延迟定时器 ht，防止 cleanup 后仍触发 showHover
      if(ht){clearTimeout(ht);ht=null;}
      document.removeEventListener('mouseover',onOver);
      document.removeEventListener('mouseout',onOut);
      document.removeEventListener('keydown',onEsc);
    });
  }

  for(const seg of segSubset){
    if(hoverRegisteredSegIds.has(seg.id))continue;
    const tr=translationCache.get(seg.id);if(!tr)continue;
    const target=seg.blockParent||(seg.node&&seg.node.parentElement);if(!target)continue;
    hoverRegisteredSegIds.add(seg.id);
    // 存储 seg.id -> translation 映射，并标记 DOM 元素
    hoverTranslations.set(seg.id,tr);
    target.dataset.dtHoverId=seg.id;
  }
  if(!hoverClickRegistered){
    const ch=e=>{
      if(e.target.classList.contains('dual-translate-hover')){
        if(e.target.classList.contains('pinned')){e.target.classList.remove('pinned');e.target.remove();_activeHoverCount--;if(_activeHoverCount<0)_activeHoverCount=0;}
        else{e.target.classList.add('pinned');const pv=document.querySelector('.dual-translate-hover.pinned:not([data-segment-id="'+e.target.dataset.segmentId+'"])');if(pv){pv.remove();_activeHoverCount--;if(_activeHoverCount<0)_activeHoverCount=0;}}
      }else if(_activeHoverCount>0&&!e.target.closest('.dual-translate-hover')){
        // v1.1.0 perf: 仅当存在 hover 元素时才查询并清理未固定的 hover，避免每次点击都 querySelectorAll
        const unpinned=document.querySelectorAll('.dual-translate-hover:not(.pinned)');
        unpinned.forEach(h=>h.remove());
        _activeHoverCount-=unpinned.length;if(_activeHoverCount<0)_activeHoverCount=0;
      }
    };
    document.addEventListener('click',ch);
    globalCleanupHandlers.push(()=>document.removeEventListener('click',ch));
    hoverClickRegistered=true;
  }
}
function showHover(e,tr,sid){
  const h=document.createElement('div');h.className='dual-translate-hover';h.textContent=tr;h.dataset.segmentId=sid;
  // v1.2.17 UX: hover 气泡 z-index 降至横幅/遮罩之下，避免遮挡错误提示与加载遮罩
  h.style.cssText='position:fixed;background:var(--dt-bg-primary);color:var(--dt-text-primary);padding:10px 14px;border-radius:6px;font-size:14px;z-index:2147483646;max-width:450px;box-shadow:0 4px 16px var(--dt-shadow);border:1px solid var(--dt-border-primary);cursor:pointer;line-height:1.6;writing-mode:horizontal-tb;';
  document.body.appendChild(h);positionAt(h,e.clientX+14,e.clientY+14);
  // v1.1.0 perf: 新增一个 hover 元素，计数 +1
  _activeHoverCount++;
}

function updatePanel(segSubset) {
  // v1.0.6 perf: 增量追加——首次创建 panel 骨架，后续只追加新行，避免每批 O(n²) 重建
  const pos=settings.display.panelPosition||'right',w=settings.display.panelWidth||400;

  // 首次创建 panel 骨架
  if(!panelInstance||!panelInstance.parentNode){
    if(panelInstance&&panelInstance.parentNode)panelInstance.remove();
    panelInstance=null;
    originalPanelStyles ??= { marginRight: document.body.style.marginRight, marginBottom: document.body.style.marginBottom, userSelect: document.body.style.userSelect };
    document.body.style.marginRight=originalPanelStyles.marginRight;document.body.style.marginBottom=originalPanelStyles.marginBottom;
    const panel=document.createElement('div');panel.className='dual-translate-panel';
    panel.style.cssText=`position:fixed;${pos==='right'?`right:0;top:0;bottom:0;width:${w}px;`:'left:0;right:0;bottom:0;height:300px;'}background:var(--dt-bg-primary);border-left:1px solid var(--dt-border-primary);z-index:2147483646;display:flex;flex-direction:column;box-shadow:-2px 0 8px var(--dt-shadow);`;
    const hd=document.createElement('div');hd.style.cssText=`display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--dt-bg-secondary);border-bottom:1px solid var(--dt-border-light);color:var(--dt-text-primary);font-size:14px;flex-shrink:0;`;
    hd.innerHTML='<span><strong>原文 / 译文</strong> 对照</span><div><button class="panel-toggle-btn">◀</button><button class="panel-close-btn">✕</button></div>';
    const ct=document.createElement('div');ct.style.cssText='flex:1;overflow-y:auto;padding:14px;';
    ct.className='dual-translate-panel-content';
    let collapsed=settings?.display?.panelCollapsed===true;
    hd.querySelector('.panel-toggle-btn').addEventListener('click',()=>{collapsed=!collapsed;panel.style.transform=collapsed?(pos==='right'?'translateX(calc(100% - 30px))':'translateY(calc(100% - 30px))'):'translate(0)';hd.querySelector('.panel-toggle-btn').textContent=collapsed?'▶':'◀';
      // v1.2.17 UX: 折叠状态跨会话记忆，刷新后保持用户偏好
      sendMessage('updateSettings',{path:'display.panelCollapsed',value:collapsed}).catch(()=>{});});
    // v1.2.17 UX: 按持久化偏好应用初始折叠状态
    if(collapsed){panel.style.transform=pos==='right'?'translateX(calc(100% - 30px))':'translateY(calc(100% - 30px))';hd.querySelector('.panel-toggle-btn').textContent='▶';}
    hd.querySelector('.panel-close-btn').addEventListener('click',()=>{panel.remove();panelInstance=null;panelRenderedSegIds.clear();restorePanelStyles();if(panelCleanup){try{panelCleanup()}catch{}const idx=globalCleanupHandlers.indexOf(panelCleanup);if(idx>=0)globalCleanupHandlers.splice(idx,1);panelCleanup=null;}});
    let isDragging=false,sX,sY,sW,sH;
    // v1.1.0 perf: mousemove/mouseup 仅在拖拽期间注册，拖拽结束即移除，避免常驻 document 监听
    const mmh=e=>{if(!isDragging)return;if(pos==='right')panel.style.width=Math.max(200,Math.min(800,sW-(e.clientX-sX)))+'px';else panel.style.height=Math.max(150,Math.min(600,sH-(e.clientY-sY)))+'px';};
    const muh=()=>{isDragging=false;document.body.style.userSelect=originalPanelStyles?.userSelect || '';document.removeEventListener('mousemove',mmh);document.removeEventListener('mouseup',muh);};
    const mdh=e=>{if(e.target.tagName==='BUTTON')return;isDragging=true;sX=e.clientX;sY=e.clientY;const r=panel.getBoundingClientRect();sW=r.width;sH=r.height;document.body.style.userSelect='none';document.addEventListener('mousemove',mmh);document.addEventListener('mouseup',muh);};
    hd.addEventListener('mousedown',mdh);
    // v1.1.0 fix: 鼠标移出窗口时兜底清理拖拽状态
    window.addEventListener('blur',muh);
    let panelCleanup=()=>{hd.removeEventListener('mousedown',mdh);document.removeEventListener('mousemove',mmh);document.removeEventListener('mouseup',muh);window.removeEventListener('blur',muh);};
    globalCleanupHandlers.push(panelCleanup);
    panel.appendChild(hd);panel.appendChild(ct);document.body.appendChild(panel);panelInstance=panel;
    if(pos==='right')document.body.style.marginRight=w+'px';else document.body.style.marginBottom='300px';
  }

  // 追加新行（跳过已渲染的）
  const ct=panelInstance.querySelector('.dual-translate-panel-content');
  // v1.1.0 perf: 用 DocumentFragment 收集所有新行一次性插入，避免逐行 append 触发 reflow
  const frag=document.createDocumentFragment();
  for(const seg of segSubset){
    if(panelRenderedSegIds.has(seg.id))continue;
    const tr=translationCache.get(seg.id);if(!tr)continue;
    panelRenderedSegIds.add(seg.id);
    const row=document.createElement('div');row.style.cssText=`display:flex;gap:14px;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--dt-border-light);cursor:pointer;`;
    row.innerHTML=`<div style="flex:1;font-size:13px;color:var(--dt-text-primary);min-width:0;line-height:1.6">${escapeContent(seg.text)}</div><div style="flex:1;font-size:13px;color:var(--dt-trans-color);min-width:0;line-height:1.6">${escapeContent(tr)}</div>`;
    row.addEventListener('click',()=>{if(seg.node&&seg.node.parentElement){seg.node.parentElement.scrollIntoView({behavior:'smooth',block:'center'});seg.node.parentElement.style.transition='background 0.3s';seg.node.parentElement.style.background='var(--dt-bg-highlight)';const pe=seg.node.parentElement;setTimeout(()=>{if(pe)pe.style.background=''},2000);}});
    seg.row = row;
    frag.appendChild(row);
  }
  if(frag.hasChildNodes())ct.appendChild(frag);
}

function positionAt(el,x,y){const r=el.getBoundingClientRect();let px=x,py=y;if(px+r.width>window.innerWidth-8)px=Math.max(8,window.innerWidth-r.width-8);if(px<8)px=8;if(py+r.height>window.innerHeight-8)py=Math.max(8,window.innerHeight-r.height-8);if(py<8)py=8;el.style.left=px+'px';el.style.top=py+'px';}
// v1.1.0 perf: 单次正则替换替代 5 次链式 replace
const _DT_ESCAPE_RE=/[&<>"']/g;
const _DT_ESCAPE_MAP={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
function escapeContent(s){return String(s==null?'':s).replace(_DT_ESCAPE_RE,ch=>_DT_ESCAPE_MAP[ch]);}
async function toggleTranslation() {
  await loadSettings();
  if (currentAbortController) {
    resetAll();
    await sendMessage('setIconState', { state: 'idle' });
  } else {
    if (!settings.general.translationEnabled) {
      await sendMessage('updateSettings', { path: 'general.translationEnabled', value: true });
      await loadSettings(true);
    }
    startTranslation().catch(e => dtError('toggle translate error:', e));
  }
}

function switchMode(mode) {
  if (![BILINGUAL, TRANSLATION_ONLY, HOVER, PANEL].includes(mode) || mode === currentMode) return;
  const wasActive = !!currentAbortController;
  const wasAutomatic = automaticSession;
  currentMode = mode;
  if (settings) {
    settings.general.lastMode = mode;
    settings.display.defaultMode = mode;
  }
  resetAll();
  if (wasActive) startTranslation({ silent: true, automatic: wasAutomatic }).catch(e => dtError('mode change error:', e));
}

function resetAll() {
  pageRestored = true;
  currentAbortController?.abort();
  currentAbortController = null;
  isTranslating = false;
  rescanPending = false;
  automaticSession = false;
  clearTimeout(autoStartTimer);
  autoStartTimer = null;
  clearTimeout(mutationQuietTimer);
  mutationQuietTimer = null;
  mutationObserver?.disconnect();
  mutationObserver = null;
  teardownPeriodicRescan();
  teardownLazyObserver();
  cleanupAllInjections();
  if (translatedTitle && document.title === translatedTitle.applied) document.title = translatedTitle.original;
  translatedTitle = null;
  for (const [img, value] of translatedImages) {
    if (img.alt === value.applied) img.alt = value.original;
  }
  translatedImages.clear();
  segments = [];
  translationCache.clear();
  segmentMap.clear();
  cachedPageLang = null;
  panelInstance = null;
}

async function refreshPageSettings() {
  const previous = settings;
  await loadSettings(true);
  if (!settings.general.translationEnabled || !shouldAutoTranslate(location.hostname)) {
    resetAll();
    return;
  }
  const mode = settings.general.lastMode || settings.display.defaultMode || BILINGUAL;
  if (mode !== currentMode) switchMode(mode);
  if (currentAbortController) {
    const translationChanged = JSON.stringify(previous?.rules) !== JSON.stringify(settings.rules) ||
      previous?.api.sourceLanguage !== settings.api.sourceLanguage ||
      previous?.trigger.translationCache !== settings.trigger.translationCache;
    if (translationChanged) {
      textCache.clear();
      const wasAutomatic = automaticSession;
      resetAll();
      startTranslation({ silent: true, automatic: wasAutomatic }).catch(e => dtError('settings refresh error:', e));
    } else {
      setupPeriodicRescan();
      scheduleRescan();
    }
  } else if (previous?.trigger.autoTranslate === false && settings.trigger.autoTranslate) {
    pageRestored = false;
    await checkAndTranslate();
  }
}

function showSelectionTranslation(original,translation){
  const removed=document.querySelectorAll('.dual-translate-hover:not(.pinned)');
  removed.forEach(h=>h.remove());
  // v1.1.0 perf: 同步 hover 计数（移除未固定 + 新增固定）
  _activeHoverCount-=removed.length;if(_activeHoverCount<0)_activeHoverCount=0;
  const sel=window.getSelection();let x=100,y=100;
  if(sel&&sel.rangeCount>0){const r=sel.getRangeAt(0).getBoundingClientRect();x=r.left+r.width/2;y=r.bottom+10;}
  const hover=document.createElement('div');hover.className='dual-translate-hover pinned';
  hover.style.cssText=`position:fixed;background:var(--dt-bg-primary);color:var(--dt-text-primary);padding:10px 14px;border-radius:6px;font-size:14px;z-index:2147483647;max-width:450px;box-shadow:0 4px 16px var(--dt-shadow);border:1px solid var(--dt-border-primary);cursor:pointer;line-height:1.6;`;
  hover.innerHTML=`<div style="color:var(--dt-text-secondary);font-size:12px;margin-bottom:4px">${escapeContent(original)}</div><div>${escapeContent(translation)}</div>`;
  // v1.1.0 fix: 点击移除 hover 时同步递减计数，避免 _activeHoverCount 泄漏
  hover.addEventListener('click',()=>{hover.remove();_activeHoverCount--;if(_activeHoverCount<0)_activeHoverCount=0;});
  document.body.appendChild(hover);
  // v1.2.17 UX: 复用 positionAt 做四边避让，防止选区位于视口边缘时气泡被截断
  positionAt(hover,x,y);
  _activeHoverCount++;
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  (async () => {
    await loadSettings();
    switch (message.action) {
      case 'getStatus':
        return { mode: currentMode, translating: isTranslating, pageActive: !!currentAbortController,
          siteAllowed: shouldAutoTranslate(location.hostname), segmentCount: segments.length };
      case 'checkAndTranslate':
        await checkAndTranslate();
        break;
      case 'toggleTranslate':
        await toggleTranslation();
        break;
      case 'startTranslation':
        await loadSettings(true);
        if (!settings.general.translationEnabled) return { error: '请先开启翻译总开关' };
        if (!shouldAutoTranslate(location.hostname)) return { error: '此网站已被翻译规则排除，请在设置中调整网站列表' };
        startTranslation().catch(e => dtError('start translate error:', e));
        break;
      case 'switchMode':
        switchMode(message.mode);
        break;
      case 'showSelectionTranslation':
        showSelectionTranslation(message.original, message.translation);
        break;
      case 'restoreAll':
      case 'cancelTranslation':
        resetAll();
        await sendMessage('setIconState', { state: 'idle' }).catch(() => {});
        break;
      case 'settingsChanged':
        await refreshPageSettings();
        break;
      case 'cacheCleared':
        textCache.clear();
        break;
      case 'glossaryChanged': {
        await loadGlossary();
        textCache.clear();
        const wasActive = !!currentAbortController;
        const wasAutomatic = automaticSession;
        resetAll();
        if (wasActive) startTranslation({ silent: true, automatic: wasAutomatic }).catch(e => dtError('glossary refresh error:', e));
        break;
      }
      case 'retranslateWithSource':
        await refreshPageSettings();
        break;
      default:
        return { error: 'Unknown action' };
    }
    return { success: true };
  })().then(respond).catch(() => respond({ error: '页面翻译暂时不可用，请刷新页面后重试' }));
  return true;
});

function resumePage() {
  if (document.hidden) return;
  if (currentAbortController) scheduleRescan();
  else checkAndTranslate().catch(e => dtError('page check error:', e));
}

// DOM observation also covers pushState navigation when the site replaces its content.
// Returning from a browser tab or the back/forward cache requires a fresh visibility pass.
document.addEventListener('visibilitychange', resumePage);
window.addEventListener('pageshow', resumePage);
window.addEventListener('focus', resumePage);
window.addEventListener('resize', () => scheduleRescan());
window.addEventListener('popstate', resumePage);
window.addEventListener('hashchange', resumePage);
document.addEventListener('transitionend', () => scheduleRescan());
checkAndTranslate().catch(e => dtError('init load settings error:', e));
