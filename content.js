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
          if (!e || !e.source || !e.target) return null;
          const escaped = e.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const matchType = e.matchType || 'exact';
          const pattern = matchType === 'fuzzy'
            ? escaped
            : '\\b' + escaped + '\\b';
          return { re: new RegExp(pattern, 'gi'), target: e.target };
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
let observerPaused = false;
let translationCompletedOnce = false;
// v1.0.7 fix: 将 setupMutationObserver 的 quietTimer 提升为模块级变量，
// 供 resetAll 清除，避免页面重翻译后残留定时器触发意外重翻译
let mutationQuietTimer = null;
const textCache = new Map();
const TEXT_CACHE_MAX_SIZE = 5000;
let lastRetranslateTime = 0;

// v1.0.6 perf: detectPageLanguage 结果缓存，避免同一次翻译流程内 3 次重复遍历 DOM
// 在 resetAll 中清除，确保 SPA 路由变化后重新检测
let cachedPageLang = null;

// v1.0.7 perf: skipTags/blockTags 提升为模块常量，避免 extractSegments 每次创建 Set
// tagName 在 HTML 中始终大写（SVG 中也是大写），用大写比对省去 toLowerCase
const SKIP_TAGS = new Set(['SCRIPT','STYLE','NOSCRIPT','SVG','TEXTAREA','INPUT','SELECT','OPTION']);
const BLOCK_TAGS = new Set(['P','LI','H1','H2','H3','H4','H5','H6','TD','TH','BLOCKQUOTE','FIGCAPTION','DT','DD','PRE','CODE','SUMMARY','A','LABEL','LEGEND','CAPTION']);
const LANG_SKIP_TAGS = new Set(['SCRIPT','STYLE','NOSCRIPT','SVG','CODE','PRE']);

// v1.0.7 perf: containsUrl 正则合并，4 个正则 -> 1 个
const URL_RE = /https?:\/\/[^\s]{4,}|(?:^|\s)www\.[a-zA-Z0-9-]+\.[a-zA-Z]{2,}|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}\/[^\s]{2,}/i;

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

const AI_MODEL_NAMES = new Set([
  // OpenAI 系列
  'chatgpt', 'gpt-4', 'gpt-4o', 'gpt-4-turbo', 'gpt-4.5', 'gpt-3.5', 'gpt-3', 'gpt-5', 'o1', 'o3', 'o4-mini', 'dall-e', 'dall-e 2', 'dall-e 3', 'whisper', 'sora',
  // Anthropic 系列
  'claude', 'claude 2', 'claude 3', 'claude 3.5', 'claude 4', 'claude opus', 'claude sonnet', 'claude haiku',
  // Google 系列
  'gemini', 'gemini 1.5', 'gemini 2.0', 'gemini 2.5', 'gemini 3', 'gemini flash', 'gemini pro', 'gemini ultra', 'gemma', 'palm', 'palm 2', 'bard',
  // Meta 系列
  'llama', 'llama 2', 'llama 3', 'llama 4', 'codellama',
  // 国产大模型
  'deepseek', 'deepseek-v2', 'deepseek-v3', 'deepseek-r1', 'deepseek-coder', 'glm', 'glm-4', 'glm-4-flash', 'glm-4v', 'chatglm', 'qwen', 'qwen2', 'qwen2.5', 'tongyi qianwen', '通义千问', 'ernie', '文心一言', 'ernie 4.0', 'yi', 'yi-lightning', 'yi-large', 'doubao', '豆包', 'kimi', 'moonshot', 'minimax', 'abab', 'step', 'step-2', 'hunyuan', '混元', 'spark', '讯飞星火', 'sensechat', '商汤日日新', 'baichuan', '百川',
  // 其他
  'mistral', 'mixtral', 'falcon', 'command r', 'cohere', 'stable diffusion', 'midjourney', 'copilot', 'github copilot', 'cursor', 'windsurf', 'devin', 'perplexity'
]);

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

  if (METRIC_LABELS.has(low)) return true;

  if (/^[a-zA-Z\s]+$/.test(t) && t.length <= 25) {
    const words = low.replace(/[^a-z\s]/g, '').trim().split(/\s+/);
    if (words.length >= 1 && words.length <= 3) {
      const combined1 = words.join(' ');
      if (METRIC_LABELS.has(combined1)) return true;
      if (words.length === 2) {
        if (METRIC_LABELS.has(words[0])) return true;
        if (METRIC_LABELS.has(words[1])) return true;
      }
    }
  }

  for (const p of METRIC_PATTERNS) { if (p.test(t)) return true; }

  return false;
}
function isNexusModsDomain() {
  try { return location.hostname.includes('nexusmods.com'); } catch { return false; }
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

// v1.2.7 fix: 宽松版中文检测 —— 仅用于页面级"中文占比"统计（不参与单段跳过判定）
// 阈值：CJK 占可分类字符 60% 且绝对数量 ≥ 3
//   介于 isAlreadyChinese（严格）和纯字符占比（过宽）之间，专门用于判断"这一段中文含量较高"
//   单独存在时不会跳过翻译（仍由 isAlreadyChinese 决定单段是否翻译）
//   仅当全页多数段落满足此条件时，才在 startTranslation 阶段提前终止整个翻译流程
function isAlreadyChineseLenient(text) {
  const t = text.trim();
  if (t.length === 0) return false;
  let cjkCount = 0;
  let kanaCount = 0;
  let latinCount = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t.codePointAt(i);
    if (c > 0xFFFF) i++;
    if ((c >= 0x4E00 && c <= 0x9FFF) ||
        (c >= 0x3400 && c <= 0x4DBF) ||
        (c >= 0x20000 && c <= 0x2A6DF) ||
        (c >= 0x2A700 && c <= 0x2B73F) ||
        (c >= 0x2B740 && c <= 0x2B81F) ||
        (c >= 0xF900 && c <= 0xFAFF) ||
        (c >= 0x2F800 && c <= 0x2FA1F)) {
      cjkCount++;
    } else if ((c >= 0x3040 && c <= 0x309F) ||
               (c >= 0x30A0 && c <= 0x30FF)) {
      kanaCount++;
    } else if (c >= 0xAC00 && c <= 0xD7AF) {
      return false;
    } else if ((c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A)) {
      latinCount++;
    }
  }
  if (kanaCount > 0) return false;
  if (cjkCount < 3) return false;
  const total = cjkCount + latinCount;
  if (total === 0) return false;
  const cjkRatio = cjkCount / total;
  return cjkRatio >= 0.6;
}
function containsUrl(text) {
  return URL_RE.test(text);
}
function isGarbledText(text) {
  const t=text.trim(); if(t.length<3) return false;
  let an=0,nl=0;
  for(let i=0;i<t.length;i++){
    const c=t.charCodeAt(i);
    if((c>=48&&c<=57)||(c>=65&&c<=90)||(c>=97&&c<=122)||(c>=0x4E00&&c<=0x9FFF)||(c>=0x3040&&c<=0x30FF))an++;
    else if(!((c>=0&&c<=0x7F)||(c>=0x4E00&&c<=0x9FFF)||(c>=0x3040&&c<=0x30FF)))nl++;
  }
  if(an/t.length<0.35&&t.length>6) return true;
  if(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/.test(t)) return true;
  if(/(.)\1{4,}/.test(t)) return true;
  if(nl/t.length>0.3&&t.length>8) return true;
  return false;
}
function isAiModelName(text) {
  const t = text.trim();
  if (!t) return false;
  if (t.length > 50) return false; // 模型名不可能这么长
  
  const normalized = t.toLowerCase().replace(/\s+/g, ' ');
  
  // 检查是否在已知AI模型名称集合中
  if (AI_MODEL_NAMES.has(normalized)) return true;
  
  // 检查基础名称（去除版本号后缀）
  const baseName = normalized.replace(/(?:-turbo|-flash|-pro|-mini|-plus|-ultra|-opus|-sonnet|-haiku|-lightning|-large|r1|v2|v3|2\.0|3\.0|4\.0|1\.5|2\.5|3\.5|4\.5|\s3\.7|\s3\.8|\s4\.5|\s5\.0|\s5\.5|\s3\.6|\s3\.9|\s4\.1|\s4\.2|\s4\.3|\s4\.4|\s4\.6|\s4\.7)\s*$/i, '');
  if (AI_MODEL_NAMES.has(baseName)) return true;
  
  return false;
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
  if (settings && settings.rules && settings.rules.skipChineseSegments !== false && cachedPageLang !== 'ja' && hasAnyCJK(text)) return true;
  return isMetricOrRepetitiveText(text)||containsUrl(text)||isGarbledText(text)||isAiModelName(text)||isAlreadyChinese(text);
}

function hideOriginalText(seg) {
  if (seg._originalHidden) return;
  
  try {
    if (seg.blockParent) {
      // Block parent mode: hide all direct text children in the block
      const walker = document.createTreeWalker(
        seg.blockParent, 
        NodeFilter.SHOW_TEXT, 
        {
          acceptNode: function(node) {
            // Skip our own injected elements
            if (node.parentElement && (
              node.parentElement.classList.contains('dual-translate-translation') ||
              node.parentElement.classList.contains('dual-translate-placeholder') ||
              node.parentElement.classList.contains('dual-translate-original-hidden')
            )) {
              return NodeFilter.FILTER_SKIP;
            }
            // Skip script, style, etc.
            const parentTag = node.parentElement.tagName.toLowerCase();
            if (['script', 'style', 'noscript', 'textarea', 'input', 'select', 'option'].includes(parentTag)) {
              return NodeFilter.FILTER_SKIP;
            }
            return NodeFilter.FILTER_ACCEPT;
          }
        }
      );
      
      const hiddenSpans = [];
      let node;
      while ((node = walker.nextNode())) {
        if (node === seg.node) continue; // Skip the main segment node
        
        const span = document.createElement('span');
        span.className = 'dual-translate-original-hidden';
        span.dataset.original = node.textContent;
        span.style.display = 'none';
        node.parentNode.replaceChild(span, node);
        hiddenSpans.push(span);
      }
      
    } else {
      // Single node mode: hide the original text node
      const parent = seg.node.parentElement;
      if (!parent) return;
      
      const span = document.createElement('span');
      span.className = 'dual-translate-original-hidden';
      span.dataset.original = seg.node.textContent;
      span.style.display = 'none';
      seg.node.parentNode.replaceChild(span, seg.node);
    }
    
    seg._originalHidden = true;
  } catch (e) {
    dtError('hideOriginalText error:', e);
  }
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

function showErrorBanner(text) {
  hideErrorBanner();
  const el = document.createElement('div');
  el.className = 'dual-translate-error-banner';
  el.innerHTML = `<span class="dual-translate-error-text">${escapeContent(text)}</span><button class="dual-translate-error-close">✕</button>`;
  el.style.cssText = 'position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:2147483646;background:var(--dt-bg-error);color:var(--dt-text-error);border:1px solid var(--dt-border-error);border-radius:8px;padding:10px 16px;font-size:13px;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI Variable","Segoe UI","Microsoft YaHei","PingFang SC","Hiragino Sans GB","Ubuntu","Cantarell","Noto Sans",sans-serif;box-shadow:0 4px 16px var(--dt-shadow);display:flex;align-items:center;gap:12px;max-width:520px;';
  el.querySelector('.dual-translate-error-close').style.cssText = 'background:none;border:none;cursor:pointer;font-size:16px;color:var(--dt-text-error);padding:0 4px;line-height:1;';
  el.querySelector('.dual-translate-error-close').addEventListener('click', hideErrorBanner);
  document.body.appendChild(el);
  errorBannerElement = el;
}
function hideErrorBanner() {
  if (!errorBannerElement) return;
  const el = errorBannerElement; errorBannerElement = null;
  if (el.parentNode) el.remove();
}

function sendMessage(action, data={}, timeoutMs=8000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('SEND_MESSAGE_TIMEOUT')), timeoutMs);
    chrome.runtime.sendMessage({action,...data}, (resp) => {
      clearTimeout(t);
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(resp || {});
    });
  });
}
async function loadSettings() {
  if (settings) return settings;
  const resp = await sendMessage('getSettings');
  settings = resp.settings;
  if (settings) currentMode = settings.general.lastMode||settings.display.defaultMode||BILINGUAL;
  // v1.0.5 hotfix: 改成 await, 保证首屏翻译能用到术语表
  await loadGlossary();
  applyTranslationStyles();
  return settings;
}

// 将译文样式设置到 :root CSS 变量，所有 .dual-translate-translation 自动跟随
// 修改样式时只需调一次此函数，无需遍历 DOM 逐个更新
function applyTranslationStyles() {
  if (!settings || !settings.display) return;
  const root = document.documentElement;
  root.style.setProperty('--dt-trans-color', settings.display.translationColor || '#888888');
  root.style.setProperty('--dt-trans-size', settings.display.translationSize || '85%');
  root.style.setProperty('--dt-trans-spacing', settings.display.translationSpacing || '4px');
  root.style.setProperty('--dt-trans-font', settings.display.translationFont || 'inherit');
}
async function checkAndTranslate(url) {
  await loadSettings();
  if (!settings||!settings.general.translationEnabled) return;
  if (!settings.trigger.autoTranslate) return;
  const domain = new URL(url).hostname;
  dtDebug('checkAndTranslate:', domain, 'shouldAutoTranslate:', shouldAutoTranslate(domain));
  if (!shouldAutoTranslate(domain)) return;
  
  // 读取源语言设置
  const sourceLanguage = settings.api.sourceLanguage || 'auto';
  const lang = detectPageLanguage(sourceLanguage);
  
  // 处理 'all' 源语言的情况
  if (sourceLanguage === 'all' && lang === 'zh') {
    return; // 中文页面不翻译
  }
  
  if (!shouldTranslateWithSource(lang)) return;
  // v1.2.3 fix: 添加 .catch 防止 startTranslation rejection 未捕获（setTimeout 回调中的 promise 不会被外层 try/catch 捕获）
  setTimeout(() => startTranslation().catch(e => dtError('checkAndTranslate startTranslation error:', e)), settings.trigger.translateDelay||500);
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
    if(LANG_SKIP_TAGS.has(p.tagName))return NodeFilter.FILTER_SKIP;
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
    if(nonJaCjk/total>0.4)result='zh';
    else if(ja/total>0.12)result='ja';
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
    // Restore hidden original text
    document.querySelectorAll('.dual-translate-original-hidden').forEach(el => {
      const originalText = el.dataset.original || '';
      const textNode = document.createTextNode(originalText);
      if (el.parentNode) {
        el.parentNode.replaceChild(textNode, el);
      } else {
        el.remove();
      }
    });

    // Reset segment hidden flags
    segments.forEach(seg => {
      seg._originalHidden = false;
    });

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
    document.body.style.marginRight='';
    document.body.style.marginBottom='';
    document.body.style.userSelect='';
  } catch (e) {
    dtError('cleanupAllInjections error:', e);
  }
}

function setupMutationObserver() {
  if (mutationObserver) mutationObserver.disconnect();
  let addedSinceLastCheck = 0;
  const QUIET_PERIOD = 300;

  mutationObserver = new MutationObserver((mutations) => {
    if (observerPaused || !translationCompletedOnce) return;

    let batchAdded = 0;
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        // 忽略我们自己注入的翻译元素
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // 跳过我们自己注入的元素
            if (node.classList && (
              node.classList.contains('dual-translate-translation') ||
              node.classList.contains('dual-translate-placeholder') ||
              node.classList.contains('dual-translate-original-hidden') ||
              node.classList.contains('dual-translate-hover') ||
              node.classList.contains('dual-translate-panel') ||
              node.classList.contains('dual-translate-loading-overlay') ||
              node.classList.contains('dual-translate-error-banner')
            )) {
              continue;
            }

          } else if (node.nodeType === Node.TEXT_NODE) {
            // v1.1.0 perf: 跳过我们自己注入元素内部的文本节点，避免 observer 自计数触发重翻译
            const p = node.parentElement;
            if (p && typeof p.className === 'string' && p.className.includes('dual-translate-')) {
              continue;
            }
          }
          batchAdded++;
        }
      }
    }

    if (batchAdded > 2) {
      addedSinceLastCheck += batchAdded;

      clearTimeout(mutationQuietTimer);
      mutationQuietTimer = setTimeout(() => {
        if (addedSinceLastCheck > 0 && !isTranslating) {
          const now = Date.now();
          // 防止频繁重新翻译
          if (now - lastRetranslateTime > 2000) {
            lastRetranslateTime = now;
            // v1.2.3 fix: 添加 .catch 防止 startTranslation rejection 未捕获（setTimeout 回调中的 promise）
            startTranslation({ silent: true }).catch(e => dtError('mutation observer startTranslation error:', e));
          }
        }
        addedSinceLastCheck = 0;
        mutationQuietTimer = null;
      }, QUIET_PERIOD);
    }
  });

  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function pauseObserver() {
  observerPaused = true;
}

function resumeObserver() {
  observerPaused = false;
}

async function startTranslation(opts = {}) {
  if (isTranslating) return;
  isTranslating = true;
  const myAbortController = new AbortController();
  currentAbortController = myAbortController;
  pauseObserver();
  try {
    await sendMessage('setIconState', { state: 'translating' });
    cleanupAllInjections();
    translationCache.clear(); // 必须清空页面级缓存，避免跨页面污染
    if (!opts.silent) {
      showLoading('正在分析页面...', '提取需要翻译的文本段落');
    }
    await new Promise(r=>setTimeout(r,30));
    if(!cachedPageLang) { detectPageLanguage(settings.api.sourceLanguage||'auto'); }
    segments = extractSegments();
    if (segments.length===0) {
      updateLoadingProgress(0,0,'未检测到需要翻译的内容');
      setTimeout(hideLoading,800);
      await sendMessage('setIconState',{state:'idle'});
      translationCompletedOnce = false;
      return;
    }
    // v1.0.6 perf: 构建 segId → seg 查找表，供 fillTranslations O(1) 查找
    segmentMap = new Map(segments.map(s => [s.id, s]));

    // v1.2.7 fix: 页面级中文段比例检查 —— 复用 isAlreadyChinese 与 isAlreadyChineseLenient 双重判定
    // 旧实现（v1.2.6）：单段 CJK 占比 > 30% 即视为中文段，> 25% 段数即跳过整页
    //   问题：CJK 占比 30% 太低，纯英文段落中夹杂的中文专有名词/引用/URL 参数可让该段被算作"中文段"
    //   例：英文技术博客里的中文用户名/中文示例代码段，CJK 占比约 30-40%，被误算为中文段
    //   阈值 25% 段数时，混合页面被错误跳过
    // 新实现：
    //   - 单段先用 isAlreadyChinese（CJK≥80% + 绝对值≥5）严格判定为"纯中文段"
    //   - 再用 isAlreadyChineseLenient（CJK≥60% + 绝对值≥3）识别"含较多中文的混合段"
    //   - 严格段 ≥ 50% 时直接跳过；严格段 ≥ 30% 且含中文段 ≥ 60% 时也跳过
    //   这样既避免误跳过英文为主页面，也能在中文为主页面尽早停止 API 调用
    let strictChineseCount = 0;
    let lenientChineseCount = 0;
    for (const seg of segments) {
      if (isAlreadyChinese(seg.text)) {
        strictChineseCount++;
        lenientChineseCount++;
      } else if (isAlreadyChineseLenient(seg.text)) {
        lenientChineseCount++;
      }
    }
    const total = segments.length;
    const strictRatio = strictChineseCount / total;
    const lenientRatio = lenientChineseCount / total;
    // 条件 1：严格中文段 ≥ 50% → 明显是中文页面，跳过
    // 条件 2：严格中文段 ≥ 30% 且含中文段（含混合）≥ 60% → 中文为主的页面，跳过
    if (total > 0 && (strictRatio >= 0.5 || (strictRatio >= 0.3 && lenientRatio >= 0.6))) {
      updateLoadingProgress(0, 0, '页面中文占比较高，已跳过翻译');
      setTimeout(hideLoading, 1200);
      await sendMessage('setIconState', { state: 'idle' });
      translationCompletedOnce = false;
      return;
    }

    updateLoadingProgress(0,segments.length,'已提取 '+segments.length+' 段文本');
    // v1.0.3: 懒加载（§3.4 性能优化）—— 仅翻译视口内段落，滚动时再补全
    const enableLazy = settings?.advanced?.lazyTranslate !== false
      && currentMode !== HOVER && currentMode !== PANEL
      && typeof IntersectionObserver !== 'undefined';
    if (enableLazy) {
      placePendingSpans();
      await translateSegmentsLazy(segments, myAbortController.signal);
    } else {
      placePendingSpans();
      await translateSegments(segments, myAbortController.signal);
    }
    hideLoading();
    // v1.0.2: 翻译页面 title 和 img alt（§3.2 / §10.2 修复，独立于正文翻译）
    // 失败不抛错（已在函数内 try/catch）
    translatePageMeta().catch(e => dtError('translatePageMeta error:', e));
    await sendMessage('setIconState',{state:'translated'});
    translationCompletedOnce = true;
    setupMutationObserver();
  } catch(e) {
    hideLoading();
    if (e.name === 'AbortError') {
      // v1.0.7 fix: 仅当当前仍是自己的 controller 时才 resetAll，
      // 避免 switchMode abort 旧翻译后，旧 catch 的 resetAll 破坏新翻译
      if (currentAbortController === myAbortController) {
        resetAll();
      }
    } else {
      dtError('startTranslation error:', e);
      showErrorBanner(e.message || '翻译过程中发生未知错误');
      try { await sendMessage('setIconState',{state:'idle'}); } catch {}
    }
    translationCompletedOnce = false;
  } finally {
    if (currentAbortController === myAbortController) {
      isTranslating = false;
      currentAbortController = null;
    }
    resumeObserver();
  }
}

function looksLikeConcatenatedText(text) {
  const len=text.length;if(len<40)return false;
  let bc=0;
  for(let i=0;i<len-1;i++){
    const ca=text.charCodeAt(i),cb=text.charCodeAt(i+1);
    const aWord=((ca>=48&&ca<=57)||(ca>=65&&ca<=90)||(ca>=97&&ca<=122)||(ca>=0x4E00&&ca<=0x9FFF)||(ca>=0x3040&&ca<=0x30FF));
    const bWord=((cb>=48&&cb<=57)||(cb>=65&&cb<=90)||(cb>=97&&cb<=122)||(cb>=0x4E00&&cb<=0x9FFF)||(cb>=0x3040&&cb<=0x30FF));
    if(aWord&&bWord)continue;
    const a=text[i],b=text[i+1];
    if(a===' '||b===' '||a==='\n'||b==='\n'||a==='.'||a===','||a==='!'||a==='?'||a===';'||a===':'||a==='-'||a==='-')continue;
    bc++;
  }
  return bc/len>0.06&&len>60;
}

function extractSegments() {
  const skipCache = new Map();
  const cachedSkip = (t) => { let r = skipCache.get(t); if (r === undefined) { r = shouldSkipText(t); skipCache.set(t, r); } return r; };
  const result=[];
  const mTL=settings.rules.minTextLength||3;
  const tCB=settings.rules.translateCodeBlocks||false;
  const processedNodes=new Set();

  if(isNexusModsDomain()){
    const tc=document.querySelectorAll('[class*="mod-tile"],[class*="modtile"],.mod-tile,[class*="tile"],.collection-item,[class*="collection-item"]');
    tc.forEach(c=>{
      c.querySelectorAll('[class*="stat"],[class*="stats"],[class*="download"],[class*="endorse"],[class*="file-size"],[class*="filesize"],[class*="meta"],[class*="metric"],[class*="count"],[class*="number"],[class*="badge"]').forEach(se=>{
        const w=document.createTreeWalker(se,NodeFilter.SHOW_TEXT,{acceptNode:n=>{
          const p2=n.parentElement;if(!p2)return NodeFilter.FILTER_SKIP;
          if(SKIP_TAGS.has(p2.tagName))return NodeFilter.FILTER_SKIP;
          return NodeFilter.FILTER_ACCEPT;
        }});let sn;while((sn=w.nextNode()))processedNodes.add(sn);
      });
    });
    // v1.1.0 perf: 用 Map<el, Set<text>> 做 O(1) 去重，替代 result.find 线性搜索
    const nexusTitleSeen = new Map();
    const titleSelectors=['.mod-tile-title a','.tile-name a','.mod-tile-name a','.mod-name a','[class*="tile-name"] a','[class*="tile-title"] a','[class*="mod-name"] a','a.tile-name','a[class*="tile-name"]','.mod-title-text','[data-testid="mod-tile-title"]','.tile-name','.mod-tile-title','.mod-title-text'];
    for(const sel of titleSelectors){
      try{document.querySelectorAll(sel).forEach(el=>{
        if(el.tagName==='A'||!el.querySelector('a')){
          const dtn=[];const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,{acceptNode:n=>{
            if(processedNodes.has(n))return NodeFilter.FILTER_SKIP;
            const p2=n.parentElement;if(!p2)return NodeFilter.FILTER_SKIP;
            if(SKIP_TAGS.has(p2.tagName))return NodeFilter.FILTER_SKIP;
            if(p2.closest&&p2.closest('[class*="stat"],[class*="endorse"],[class*="download"],[class*="meta"],[class*="metric"],[class*="count"],[class*="number"],[class*="badge"]'))return NodeFilter.FILTER_SKIP;
            return NodeFilter.FILTER_ACCEPT;
          }});let cn;while((cn=w.nextNode()))dtn.push(cn);
          const tt=dtn.map(n=>n.textContent.trim()).filter(t=>t.length>=mTL&&!cachedSkip(t)&&!/^\s*$/.test(t)&&!/^[\d\s.,!?;:'"()\[\]{}<>/\\|]+$/.test(t)).join(' ');
          if(tt.length>=mTL&&!cachedSkip(tt)){
            dtn.forEach(n=>processedNodes.add(n));
            // v1.1.0 perf: O(1) 去重替代 result.find 线性搜索
            let seenForEl=nexusTitleSeen.get(el);
            if(!seenForEl){seenForEl=new Set();nexusTitleSeen.set(el,seenForEl);}
            if(!seenForEl.has(tt)){
              seenForEl.add(tt);
              result.push({id:'seg_'+result.length,text:tt,node:dtn[0]||el,blockParent:el});
            }
          }
        }
      })}catch{}
    }
  }

  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,{acceptNode:n=>{
    const p=n.parentElement;if(!p)return NodeFilter.FILTER_SKIP;
    if(SKIP_TAGS.has(p.tagName))return NodeFilter.FILTER_SKIP;
    if(!tCB&&(p.tagName==='CODE'||p.tagName==='PRE'))return NodeFilter.FILTER_SKIP;
    if(p.className&&typeof p.className==='string'&&p.className.includes('dual-translate-'))return NodeFilter.FILTER_SKIP;
    return NodeFilter.FILTER_ACCEPT;
  }});

  let node;
  while((node=walker.nextNode())){
    if(processedNodes.has(node))continue;
    const text=node.textContent.trim();
    if(text.length<mTL)continue;
    if(/^[\d\s.,!?;:'"()\-–+×÷=%&@#$^*_~`\[\]{}<>/\\|]+$/.test(text))continue;
    if(cachedSkip(text))continue;
    const parent=node.parentElement;
    if(parent){
      // v1.0.7 perf: stat 检查仅对 NexusMods 有意义，包裹在域名条件内
      if(isNexusModsDomain()){
        const isStat=parent.closest&&parent.closest('[class*="stat"],[class*="stats"],[class*="download"],[class*="endorse"],[class*="file-size"],[class*="filesize"],[class*="metric"],[class*="count"],[class*="meta"],[class*="number"],[class*="badge"]');
        if(isStat)continue;
      }
    }
    let bp=parent;
    while(bp&&!BLOCK_TAGS.has(bp.tagName)&&bp!==document.body)bp=bp.parentElement;
    if(bp&&BLOCK_TAGS.has(bp.tagName)&&!looksLikeConcatenatedText(text)){
      const at=bp.textContent.trim();
      if(at.length>=mTL&&at!==text&&!cachedSkip(at)&&!looksLikeConcatenatedText(at)){
        const lines=at.split(/[\n\r]+/).filter(l=>l.trim().length>0);
        if(lines.length>=2&&lines.length<=6){
          const metricLines=lines.filter(l=>cachedSkip(l.trim()));
          if(metricLines.length/lines.length>0.5)continue;
        }
        const iw=document.createTreeWalker(bp,NodeFilter.SHOW_TEXT,{acceptNode:n=>{const p2=n.parentElement;if(!p2)return NodeFilter.FILTER_SKIP;if(SKIP_TAGS.has(p2.tagName))return NodeFilter.FILTER_SKIP;return NodeFilter.FILTER_ACCEPT;}});
        const bn=[];let bn2;while((bn2=iw.nextNode()))bn.push(bn2);
        const ap=bn.every(n=>processedNodes.has(n)||n.textContent.trim().length<mTL);
        let hbc=false;for(const ch of bp.children){if(BLOCK_TAGS.has(ch.tagName)){hbc=true;break;}}
        if(!ap&&!hbc){bn.forEach(n=>processedNodes.add(n));result.push({id:'seg_'+result.length,text:at,node:node,blockParent:bp});continue;}
      }
    }
    processedNodes.add(node);
    result.push({id:'seg_'+result.length,text:text,node:node,blockParent:bp&&BLOCK_TAGS.has(bp.tagName)?bp:null});
  }
  return result;
}

// v1.0.2: 翻译页面 <title> 和图片 alt（§3.2 / §10.2 修复）
// 不进 segments 数组，单独走 sendMessage('translateTexts') batch
// 失败/用户关闭开关时静默跳过
async function translatePageMeta() {
  if (!settings) return;
  if (currentAbortController && currentAbortController.signal.aborted) return;

  // v1.2.3 fix: 统一使用 detectPageLanguage(sourceLanguage) 获取源语言，与 translateSegments 保持一致。
  // 原三元表达式当 sourceLanguage 为 'all' 时直接将 'all' 传给 API，导致：
  // 1) API 收到无效语言代码 'all'；2) sourceLang==='zh' 判断永远不触发，中文页面标题/alt 被错误翻译。
  const sourceLang = detectPageLanguage(settings.api.sourceLanguage || 'auto');
  if (sourceLang === 'zh') return; // 中文页不翻

  // 收集要翻译的 (text, type, target) 三元组
  const items = [];

  // 1) <title>
  if (settings.display.translatePageTitle !== false) {
    const origTitle = (document.title || '').trim();
    // 跳过中文标题（避免无用 API 调用）
    if (origTitle.length >= 2 && !isAlreadyChinese(origTitle) && !(settings.rules && settings.rules.skipChineseSegments !== false && sourceLang !== 'ja' && hasAnyCJK(origTitle))) {
      // 跳过已翻译过的（data 属性标记）
      if (!document.documentElement.hasAttribute('data-dt-orig-title')) {
        document.documentElement.setAttribute('data-dt-orig-title', origTitle);
      }
      const storedTitle = document.documentElement.getAttribute('data-dt-orig-title');
      items.push({ text: storedTitle, type: 'title' });
    }
  }

  // 2) img[alt] —— 只翻当前视口附近 + 长度合理 + 非空
  if (settings.display.translateImgAlt !== false) {
    try {
      const imgs = Array.from(document.querySelectorAll('img[alt]'));
      const seen = new Set();
      for (const img of imgs) {
        const alt = (img.getAttribute('alt') || '').trim();
        if (alt.length < 2 || alt.length > 200) continue;
        if (isAlreadyChinese(alt)) continue; // 已是中文
        if (settings.rules && settings.rules.skipChineseSegments !== false && sourceLang !== 'ja' && hasAnyCJK(alt)) continue;
        if (seen.has(alt)) continue;
        // 跳过已翻译过的（data 属性标记 + ImgSet 跟踪）
        if (img.hasAttribute('data-dt-orig-alt')) continue;
        seen.add(alt);
        // 存原文到 data 属性
        img.setAttribute('data-dt-orig-alt', alt);
        items.push({ text: alt, type: 'alt', img });
      }
    } catch (e) {
      dtError('collect alt error:', e);
    }
  }

  if (items.length === 0) return;
  dtInfo('translatePageMeta items:', items.length, 'source:', sourceLang);

  // v1.1.0 fix: 分批发送，避免图片密集页面 items 超过 background 的 500 条上限
  const META_BATCH_SIZE = 200;
  try {
    for (let start = 0; start < items.length; start += META_BATCH_SIZE) {
      const batch = items.slice(start, start + META_BATCH_SIZE);
      const resp = await sendMessage('translateTexts', { texts: batch.map(i => i.text), sourceLang });
      if (!resp || !resp.translations || resp.error) continue; // 跳过失败批次，继续下一批
      if (currentAbortController && currentAbortController.signal.aborted) return;

      // 回写
      for (let i = 0; i < batch.length; i++) {
        const item = batch[i];
        const r = resp.translations[i];
        const tr = (r && r.translation) || '';
        if (!tr) continue;
        const preTr = applyGlossary(tr); // 术语再过一遍
        if (item.type === 'title') {
          document.title = preTr + ' / ' + (document.documentElement.getAttribute('data-dt-orig-title') || document.title);
        } else if (item.type === 'alt' && item.img && item.img.isConnected) {
          item.img.setAttribute('alt', preTr);
        }
      }
    }
  } catch (e) {
    dtError('translatePageMeta API error:', e);
  }
}

function placePendingSpans() {
  // v1.1.0 perf: 按父节点分组，用 DocumentFragment 批量插入，避免每段 append 触发一次 reflow
  if (currentMode !== BILINGUAL && currentMode !== TRANSLATION_ONLY) return;
  const buckets = new Map(); // parent -> [{ span, ref }]
  for (const seg of segments) {
    const segId = seg.id;
    let parent, ref;
    if (seg.blockParent) {
      parent = seg.blockParent;
      if (parent.querySelector('[data-dt-seg="'+segId+'"]')) continue;
      ref = null; // append to end
    } else {
      parent = seg.node.parentElement;
      if (!parent) continue;
      if (parent.querySelector('[data-dt-seg="'+segId+'"]')) continue;
      ref = seg.node.nextSibling; // null -> append
    }
    const span = document.createElement('span');
    span.className = 'dual-translate-placeholder';
    span.dataset.dtSeg = segId;
    span.innerHTML = '<span class="dual-translate-spinner"></span><span class="dual-translate-loader-text">正在翻译...</span>';
    let arr = buckets.get(parent);
    if (!arr) { arr = []; buckets.set(parent, arr); }
    arr.push({ span, ref });
  }
  for (const [parent, arr] of buckets) {
    if (!parent.isConnected) continue;
    const frag = document.createDocumentFragment();
    const insertList = [];
    for (const item of arr) {
      if (item.ref) insertList.push(item);
      else frag.appendChild(item.span);
    }
    if (frag.hasChildNodes()) parent.appendChild(frag);
    // 有明确参考节点的逐个 insertBefore（参考节点为文本节点，互不影响，安全）
    for (const item of insertList) parent.insertBefore(item.span, item.ref);
  }
}

function fillTranslations(batchSegs) {
  const translationMode = currentMode;
  const placeholders = [];
  
  // v1.0.7 perf: 接受当前批次 segments 数组，避免每批全文档 querySelectorAll
  // null/undefined 时回退到全文档扫描（兼容非批次场景）
  const segsToFill = batchSegs || segments;
  for (const seg of segsToFill) {
    const segId = seg.id;
    if(!translationCache.has(segId))continue;
    // 在 seg.blockParent 或 seg.node.parentElement 上查找 placeholder
    const root = seg.blockParent || (seg.node && seg.node.parentElement);
    if(!root)continue;
    const ph = root.querySelector('[data-dt-seg="'+segId+'"]');
    if(!ph || !ph.classList.contains('dual-translate-placeholder'))continue;
    const translation = translationCache.get(segId);

    ph.classList.remove('dual-translate-placeholder');
    ph.classList.add('dual-translate-translation');
    if(translation&&translation.length>0){
      ph.textContent = translation;
    }else{
      ph.textContent = '【该段翻译失败】';
      ph.classList.add('dual-translate-failed');
    }
    placeholders.push({ segId, ph });
  }
  
  if (translationMode === TRANSLATION_ONLY) {
    placeholders.forEach(({ segId }) => {
      // v1.0.6 perf: O(1) 查表替代 O(n) find
      const seg = segmentMap.get(segId);
      if (seg) {
        hideOriginalText(seg);
      }
    });
  }
}

function normText(s){return String(s==null?'':s).trim().replace(/\s+/g,' ');}

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
function isSegInViewport(seg, vh, vw) {
  try {
    const anchor = seg.blockParent || (seg.node && seg.node.parentElement);
    if (!anchor || !anchor.getBoundingClientRect) return false;
    const r = anchor.getBoundingClientRect();
    return r.bottom > -200 && r.top < vh + 200 && r.right > -200 && r.left < vw + 200;
  } catch (e) { return false; }
}

async function translateSegmentsLazy(segs, signal) {
  if (segs.length === 0) return;
  teardownLazyObserver();
  // v1.1.0 perf: 缓存视口尺寸一次，传入 filter 回调避免每段重复读取
  const _vh = window.innerHeight || document.documentElement.clientHeight;
  const _vw = window.innerWidth || document.documentElement.clientWidth;
  // v1.0.6 perf: 用 Set 替代 includes，O(1) 查找替代 O(n)
  const initialSegSet = new Set(segs.filter(s => isSegInViewport(s, _vh, _vw)));
  const initialSegs = [...initialSegSet];
  for (const seg of segs) {
    if (!initialSegSet.has(seg)) lazyPendingSegs.set(seg.id, seg);
  }
  dtInfo('lazy translate: in-viewport =', initialSegs.length, '/ total =', segs.length);
  if (!('IntersectionObserver' in window)) {
    await translateSegments(segs, signal);
    return;
  }
  lazyTranslateObserver = new IntersectionObserver((entries) => {
    if (signal && signal.aborted) return;
    const visibleSegs = [];
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const span = e.target;
      const segId = span && span.getAttribute && span.getAttribute('data-dt-seg');
      if (!segId) continue;
      const seg = lazyPendingSegs.get(segId);
      if (!seg) continue;
      lazyPendingSegs.delete(segId);
      try { lazyTranslateObserver.unobserve(span); } catch (_) {}
      visibleSegs.push(seg);
    }
    if (visibleSegs.length > 0) {
      translateSegments(visibleSegs, signal).catch(err => {
        if (err && err.name !== 'AbortError') dtError('lazy translate batch error:', err);
      });
    }
  }, { rootMargin: '200px', threshold: 0 });
  const spans = document.querySelectorAll('.dual-translate-placeholder[data-dt-seg]');
  spans.forEach(span => {
    const segId = span.getAttribute('data-dt-seg');
    if (!segId) return;
    if (lazyPendingSegs.has(segId)) {
      try { lazyTranslateObserver.observe(span); } catch (e) { dtWarn('lazy observe:', e); }
    }
  });
  if (initialSegs.length > 0) {
    await translateSegments(initialSegs, signal);
  }
}

async function translateSegments(segs, signal) {
  if (segs.length===0) return;
  const batchSize=settings.advanced.batchSize||10;
  
  // 读取源语言设置
  const sourceLanguage = settings.api.sourceLanguage || 'auto';
  const sourceLang = detectPageLanguage(sourceLanguage);
  const total=segs.length;

  // 先从 textCache 填充 translationCache（规范化键，键含 sourceLang 维度）
  for (const seg of segs) {
    const cachedTranslation = textCache.get(sourceLang + '::' + normText(seg.text));
    if (cachedTranslation !== undefined) {
      translationCache.set(seg.id, cachedTranslation);
    }
  }

  let aborted = false;

  for(let i=0;i<total;i+=batchSize){
    // 每批开始前检查取消信号
    if (signal?.aborted) {
      aborted = true;
      break;
    }

    const batch=segs.slice(i,i+batchSize);
    const batchEnd=Math.min(i+batchSize,total);
    updateLoadingProgress(i,total,`正在翻译 ${batchEnd}/${total} 段`);

    const uncached=[];const uncachedIds=[];
    for(let j=0;j<batch.length;j++){
      if(!translationCache.has(batch[j].id)){
        // v1.0.2: 术语表预处理（先查 glossary，命中则直接填 cache 不调 API）
        const preText = applyGlossary(batch[j].text);
        if (preText !== batch[j].text) {
          // 术语命中，标记为"已翻译"（直接使用预处理结果）
          translationCache.set(batch[j].id, preText);
        } else {
          uncached.push(batch[j].text);
          uncachedIds.push(batch[j].id);
        }
      }
    }

    if(uncached.length>0){
      const resp=await sendMessage('translateTexts',{texts:uncached,sourceLang:sourceLang});
      if(signal?.aborted){aborted=true;break;}
      if(resp&&!resp.error&&Array.isArray(resp.translations)){
        const cMap=new Map();
        for(const r of resp.translations){
          if(r&&typeof r.translation==='string'){
            cMap.set(normText(r.original||''),r.translation);
          }
        }
        for(let j=0;j<uncached.length;j++){
          const nt=normText(uncached[j]);
          const mt=cMap.get(nt);
          let translation = '';
          if(mt!==undefined&&mt!==null&&mt.length>0){
            translation = mt;
          }else if(j<resp.translations.length&&resp.translations[j]&&typeof resp.translations[j].translation==='string'&&resp.translations[j].translation.length>0){
            translation = resp.translations[j].translation;
          }
          translationCache.set(uncachedIds[j], translation);
          if(translation && translation.length > 0){
            textCache.set(sourceLang + '::' + nt, translation);
            if (textCache.size > TEXT_CACHE_MAX_SIZE) {
              const firstKey = textCache.keys().next().value;
              textCache.delete(firstKey);
            }
          }
        }
      }else{
        if(resp&&resp.translations&&!Array.isArray(resp.translations)){
          dtWarn('translateSegments: resp.translations is not an array', resp);
        }
        const errMsg=(resp&&resp.error)?resp.error:'翻译失败';
        if(errMsg.includes('所有翻译服务')||errMsg.includes('NO_API')||errMsg.includes('暂时不可用')||errMsg.includes('AUTH_ERROR')||errMsg.includes('QUOTA_EXCEEDED')){
          showErrorBanner(errMsg);
          // v1.1.0 fix: 仅标记当前批次失败，避免误清空其它批次未翻译段
          for(let k=0;k<batch.length;k++){if(!translationCache.has(batch[k].id))translationCache.set(batch[k].id,'');}
          break;
        }
        for(let j=0;j<uncachedIds.length;j++){
          if(!translationCache.has(uncachedIds[j]))translationCache.set(uncachedIds[j],'');
        }
      }
    }

    if(currentMode===BILINGUAL||currentMode===TRANSLATION_ONLY){fillTranslations(batch);}
    // v1.0.6 perf: 只传当前批次，updateHover/updatePanel 内部用 Set 去重做增量追加
    if(currentMode===HOVER){updateHover(batch);}
    if(currentMode===PANEL){updatePanel(batch);}
  }

  // 仅在未取消时执行最终填充
  if (!aborted) {
    for(let i=0;i<segs.length;i++){
      if(!translationCache.has(segs[i].id))translationCache.set(segs[i].id,'');
    }
    if(currentMode===BILINGUAL||currentMode===TRANSLATION_ONLY){fillTranslations(segs);}
    if(currentMode===HOVER){updateHover(segs);}
    if(currentMode===PANEL){updatePanel(segs);}
  } else {
    throw new DOMException('Translation cancelled', 'AbortError');
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
    hoverCleanupHandlers.push(()=>{
      if(hoverRaf){cancelAnimationFrame(hoverRaf);hoverRaf=0;}
      // v1.1.0 fix: 清理 hover 延迟定时器 ht，防止 cleanup 后仍触发 showHover
      if(ht){clearTimeout(ht);ht=null;}
      document.removeEventListener('mouseover',onOver);
      document.removeEventListener('mouseout',onOut);
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
  h.style.cssText='position:fixed;background:var(--dt-bg-primary);color:var(--dt-text-primary);padding:10px 14px;border-radius:6px;font-size:14px;z-index:2147483647;max-width:450px;box-shadow:0 4px 16px var(--dt-shadow);border:1px solid var(--dt-border-primary);cursor:pointer;line-height:1.6;writing-mode:horizontal-tb;';
  document.body.appendChild(h);positionAt(h,e.clientX+14,e.clientY+14);
  // v1.1.0 perf: 新增一个 hover 元素，计数 +1
  _activeHoverCount++;
}

function updatePanel(segSubset) {
  // v1.0.6 perf: 增量追加——首次创建 panel 骨架，后续只追加新行，避免每批 O(n²) 重建
  const color=settings.display.translationColor,pos=settings.display.panelPosition||'right',w=settings.display.panelWidth||400;

  // 首次创建 panel 骨架
  if(!panelInstance||!panelInstance.parentNode){
    if(panelInstance&&panelInstance.parentNode)panelInstance.remove();
    panelInstance=null;document.body.style.marginRight='';document.body.style.marginBottom='';
    const panel=document.createElement('div');panel.className='dual-translate-panel';
    panel.style.cssText=`position:fixed;${pos==='right'?`right:0;top:0;bottom:0;width:${w}px;`:'left:0;right:0;bottom:0;height:300px;'}background:var(--dt-bg-primary);border-left:1px solid var(--dt-border-primary);z-index:2147483646;display:flex;flex-direction:column;box-shadow:-2px 0 8px var(--dt-shadow);`;
    const hd=document.createElement('div');hd.style.cssText=`display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--dt-bg-secondary);border-bottom:1px solid var(--dt-border-light);color:var(--dt-text-primary);font-size:14px;flex-shrink:0;`;
    hd.innerHTML='<span><strong>原文 / 译文</strong> 对照</span><div><button class="panel-toggle-btn">◀</button><button class="panel-close-btn">✕</button></div>';
    const ct=document.createElement('div');ct.style.cssText='flex:1;overflow-y:auto;padding:14px;';
    ct.className='dual-translate-panel-content';
    let collapsed=false;
    hd.querySelector('.panel-toggle-btn').addEventListener('click',()=>{collapsed=!collapsed;panel.style.transform=collapsed?(pos==='right'?'translateX(calc(100% - 30px))':'translateY(calc(100% - 30px))'):'translate(0)';hd.querySelector('.panel-toggle-btn').textContent=collapsed?'▶':'◀';});
    hd.querySelector('.panel-close-btn').addEventListener('click',()=>{panel.remove();panelInstance=null;panelRenderedSegIds.clear();document.body.style.marginRight='';document.body.style.marginBottom='';if(panelCleanup){try{panelCleanup()}catch{}const idx=globalCleanupHandlers.indexOf(panelCleanup);if(idx>=0)globalCleanupHandlers.splice(idx,1);panelCleanup=null;}});
    let isDragging=false,sX,sY,sW,sH;
    // v1.1.0 perf: mousemove/mouseup 仅在拖拽期间注册，拖拽结束即移除，避免常驻 document 监听
    const mmh=e=>{if(!isDragging)return;if(pos==='right')panel.style.width=Math.max(200,Math.min(800,sW-(e.clientX-sX)))+'px';else panel.style.height=Math.max(150,Math.min(600,sH-(e.clientY-sY)))+'px';};
    const muh=()=>{isDragging=false;document.body.style.userSelect='';document.removeEventListener('mousemove',mmh);document.removeEventListener('mouseup',muh);};
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
    row.innerHTML=`<div style="flex:1;font-size:13px;color:var(--dt-text-primary);min-width:0;line-height:1.6">${escapeContent(seg.text)}</div><div style="flex:1;font-size:13px;color:${color};min-width:0;line-height:1.6">${escapeContent(tr)}</div>`;
    row.addEventListener('click',()=>{if(seg.node&&seg.node.parentElement){seg.node.parentElement.scrollIntoView({behavior:'smooth',block:'center'});seg.node.parentElement.style.transition='background 0.3s';seg.node.parentElement.style.background='var(--dt-bg-highlight)';const pe=seg.node.parentElement;setTimeout(()=>{if(pe)pe.style.background=''},2000);}});
    frag.appendChild(row);
  }
  if(frag.hasChildNodes())ct.appendChild(frag);
}

function positionAt(el,x,y){const r=el.getBoundingClientRect();let px=x,py=y;if(px+r.width>window.innerWidth)px=x-r.width-12;if(py+r.height>window.innerHeight)py=y-r.height-12;el.style.left=Math.max(0,px)+'px';el.style.top=Math.max(0,py)+'px';}
// v1.1.0 perf: 单次正则替换替代 5 次链式 replace
const _DT_ESCAPE_RE=/[&<>"']/g;
const _DT_ESCAPE_MAP={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
function escapeContent(s){return String(s==null?'':s).replace(_DT_ESCAPE_RE,ch=>_DT_ESCAPE_MAP[ch]);}
function toggleTranslation() {
  if (isTranslating) return;
  if (segments.length > 0 || translationCache.size > 0) {
    resetAll();
    sendMessage('updateSettings', {path:'general.translationEnabled', value:false}).catch(()=>{});
    sendMessage('setIconState', {state:'idle'}).catch(()=>{});
  } else {
    sendMessage('updateSettings', {path:'general.translationEnabled', value:true}).catch(()=>{});
    // v1.2.3 fix: 添加 .catch 防止 startTranslation rejection 未捕获
    startTranslation().catch(e => dtError('toggleTranslation startTranslation error:', e));
  }
}
function switchMode(nm) {
  if (!nm || !['bilingual', 'translation-only', 'hover', 'panel'].includes(nm)) return;
  if(nm===currentMode)return;
  currentMode=nm;
  if(settings){settings.general.lastMode=nm;settings.display.defaultMode=nm;}
  sendMessage('updateSettings',{path:'general.lastMode',value:nm}).catch(()=>{});
  sendMessage('updateSettings',{path:'display.defaultMode',value:nm}).catch(()=>{});
  // 切模式统一走 resetAll + startTranslation 全流程
  // 原因：in-place 重渲染（旧的 cleanupAllInjections+placePendingSpans+fillTranslations
  //   +hideOriginalText 路径）会留下 detached seg.node，导致 TRANSLATION_ONLY 模式下
  //   hideOriginalText 的 replaceChild 静默失败，原文不被隐藏，视觉上还是双语。
  // 由 startTranslation 重新提取 segments 后，fillTranslations 内的 hideOriginalText
  // (line 823-829) 才能在 fresh DOM 上正确工作。
  if(isTranslating){
    // 正在翻译中：先 abort 当前批次，新的 startTranslation 会自然走完
    if(currentAbortController){
      currentAbortController.abort();
      currentAbortController=null;
    }
  }
  resetAll();
  // v1.0.5 hotfix: resetAll 本身不清 isTranslating, 但这里必须清掉才能让
  // startTranslation 内部 line 533 的 guard 放行。仅在 switchMode 路径清,
  // 不动 resetAll 函数体, 避免影响 popstate / hashchange 等其他调用点
  isTranslating = false;
  if(settings&&settings.general.translationEnabled!==false){
    // v1.2.3 fix: 添加 .catch 防止 startTranslation rejection 未捕获
    startTranslation({ silent: true }).catch(e => dtError('switchMode startTranslation error:', e));
  }
}
function resetAll() {
  isTranslating = false;
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
  if (mutationObserver) { mutationObserver.disconnect(); mutationObserver = null; }
  // v1.0.7 fix: 清除 setupMutationObserver 残留的 quietTimer，避免重翻译后旧定时器意外触发
  if (mutationQuietTimer) { clearTimeout(mutationQuietTimer); mutationQuietTimer = null; }
  // v1.0.3: 清理懒加载 observer（§3.4）
  teardownLazyObserver();
  observerPaused = false;
  translationCompletedOnce = false;
  cleanupAllInjections();
  // v1.0.2: 还原页面 title 和图片 alt（§3.2 / §10.2 修复）
  if (document.documentElement.hasAttribute('data-dt-orig-title')) {
    document.title = document.documentElement.getAttribute('data-dt-orig-title');
    document.documentElement.removeAttribute('data-dt-orig-title');
  }
  try {
    document.querySelectorAll('img[data-dt-orig-alt]').forEach(img => {
      img.setAttribute('alt', img.getAttribute('data-dt-orig-alt'));
      img.removeAttribute('data-dt-orig-alt');
    });
  } catch (e) { dtError('resetAll alt restore error:', e); }
  segments=[];
  translationCache.clear();
  segmentMap.clear();
  // v1.0.6 perf: 清除增量渲染追踪和语言检测缓存
  hoverRegisteredSegIds.clear();
  panelRenderedSegIds.clear();
  cachedPageLang = null;
  hoverCleanupHandlers=[];
  globalCleanupHandlers=[];
  panelInstance=null;
  // v1.0.7 perf: 重置 hover 事件委托状态
  hoverDelegationRegistered=false;
  hoverTranslations.clear();
  // v1.1.0 perf: 移除冗余的 [data-dt-hover-id] 查询——cleanupAllInjections 已在上文清理过
}
function showSelectionTranslation(original,translation){
  const removed=document.querySelectorAll('.dual-translate-hover:not(.pinned)');
  removed.forEach(h=>h.remove());
  // v1.1.0 perf: 同步 hover 计数（移除未固定 + 新增固定）
  _activeHoverCount-=removed.length;if(_activeHoverCount<0)_activeHoverCount=0;
  const sel=window.getSelection();let x=100,y=100;
  if(sel&&sel.rangeCount>0){const r=sel.getRangeAt(0).getBoundingClientRect();x=r.left+r.width/2;y=r.bottom+10;}
  const hover=document.createElement('div');hover.className='dual-translate-hover pinned';
  hover.style.cssText=`position:fixed;background:var(--dt-bg-primary);color:var(--dt-text-primary);padding:10px 14px;border-radius:6px;font-size:14px;z-index:2147483647;max-width:450px;box-shadow:0 4px 16px var(--dt-shadow);border:1px solid var(--dt-border-primary);cursor:pointer;line-height:1.6;left:${x}px;top:${y}px;`;
  hover.innerHTML=`<div style="color:var(--dt-text-secondary);font-size:12px;margin-bottom:4px">${escapeContent(original)}</div><div>${escapeContent(translation)}</div>`;
  // v1.1.0 fix: 点击移除 hover 时同步递减计数，避免 _activeHoverCount 泄漏
  hover.addEventListener('click',()=>{hover.remove();_activeHoverCount--;if(_activeHoverCount<0)_activeHoverCount=0;});
  document.body.appendChild(hover);
  _activeHoverCount++;
}

chrome.runtime.onMessage.addListener((m,s,resp)=>{
  (async()=>{
    try {
    switch(m.action){
      case'checkAndTranslate':await checkAndTranslate(m.url);resp({success:true});break;
      case'toggleTranslate':toggleTranslation();resp({success:true});break;
      case'startTranslation':
        startTranslation().catch(e => console.warn('[content] startTranslation error:', e));
        resp({success:true});
        break;
      case'switchMode':switchMode(m.mode);resp({success:true});break;
      case'getStatus':resp({mode:currentMode,translating:isTranslating,segmentCount:segments.length});break;
      case'showSelectionTranslation':showSelectionTranslation(m.original,m.translation);resp({success:true});break;
      case'restoreAll':resetAll();resp({success:true});break;
      case'retranslateWithSource':
        resetAll();
        startTranslation({silent:true}).catch(e => console.warn('[content] retranslate error:', e));
        resp({success:true});
        break;
      case'cancelTranslation':
        // v1.2.2 fix: 只 abort，不置 currentAbortController=null。
        // 原先置 null 会导致 startTranslation 的 finally/catch 块中
        // `currentAbortController === myAbortController` 永远为 false，
        // isTranslating 无法归零而卡在 true，popup 取消按钮永不消失。
        // 现仅触发 abort，交由 startTranslation 的 catch(AbortError)→resetAll
        // 与 finally 块自行完成 isTranslating=false / currentAbortController=null 清理。
        if (currentAbortController) {
          currentAbortController.abort();
        }
        resp({ success: true });
        break;
      default:resp({error:'Unknown action'});
    }
    } catch(err) {
      dtError('onMessage error:', err);
      try { resp({error: err && err.message ? err.message : String(err)}); } catch {}
    }
  })();return true;
});

// v1.2.3 fix: 添加 .catch 防止模块级 loadSettings() 的 rejection 未捕获（无外层 try/catch 保护）
loadSettings().catch(e => dtError('init loadSettings error:', e));

// SPA 路由变化时清理模块级状态并重新翻译
// v1.1.0 perf: 300ms 防抖，避免 SPA 快速路由变化时多次 resetAll+startTranslation
let _spaRouteTimer = null;
function onSpaRouteChange() {
  if (_spaRouteTimer) clearTimeout(_spaRouteTimer);
  _spaRouteTimer = setTimeout(() => {
    _spaRouteTimer = null;
    try {
      resetAll();
      if (settings && settings.general.translationEnabled !== false && settings.trigger.autoTranslate) {
        isTranslating = false;
        const url = location.href;
        if (url.startsWith('http') && shouldAutoTranslate(new URL(url).hostname)) {
          // v1.2.3 fix: 添加 .catch 防止 startTranslation rejection 未捕获（setTimeout 回调中的 promise 不会被外层 try/catch 捕获）
          setTimeout(() => startTranslation().catch(e => dtError('SPA route startTranslation error:', e)), settings.trigger.translateDelay || 500);
        }
      }
    } catch (err) { dtError('spa route change error:', err); }
  }, 300);
}
window.addEventListener('popstate', onSpaRouteChange);
window.addEventListener('hashchange', onSpaRouteChange);

// 监听 display 颜色/字体变化，通过 CSS 变量实时更新所有译文样式
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync' || !settings) return;
  const sc = changes.dual_translate_settings;
  if (!sc) return;
  const newS = sc.newValue;
  if (!newS) return;
  const oldD = sc.oldValue && sc.oldValue.display;
  const newD = newS.display;
  settings = newS;
  if (newD && JSON.stringify(oldD) !== JSON.stringify(newD)) {
    applyTranslationStyles();
  }
});
