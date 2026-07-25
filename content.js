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
let hoverCleanupHandlers = [];
let globalCleanupHandlers = [];
let loadingElement = null;
let panelInstance = null;
let errorBannerElement = null;
let hoverClickRegistered = false;
let mutationObserver = null;
let retranslateTimer = null;
let observerPaused = false;
let translationCompletedOnce = false;
const textCache = new Map();
const TEXT_CACHE_MAX_SIZE = 5000;
let lastRetranslateTime = 0;
let retranslateCount = 0;

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
function containsUrl(text) {
  return /https?:\/\/[^\s]{4,}/.test(text) || /(?:^|\s)www\.[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/i.test(text) || /[a-zA-Z0-9-]+\.[a-zA-Z]{2,}\/[^\s]{2,}/.test(text) || /[a-zA-Z0-9-]+\.(?:com|org|net|io|co|dev|gov|edu|cc|me|info|biz|xyz|uk|cn|jp|kr|de|fr|ru|it|es|br|ca|au|in|nl|se|no|fi|tw|hk|sg)\/[^\s]{2,}/i.test(text);
}
function isGarbledText(text) {
  const t=text.trim(); if(t.length<3) return false;
  const an=(t.match(/[a-zA-Z0-9\u4E00-\u9FFF\u30A0-\u30FF\u3040-\u309F]/g)||[]).length;
  if(an/t.length<0.35&&t.length>6) return true;
  if(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/.test(t)) return true;
  if((t.match(/(.)\1{4,}/g)||[]).length>0) return true;
  const nl=(t.match(/[^\x00-\x7F\u4E00-\u9FFF\u30A0-\u30FF\u3040-\u309F]/g)||[]).length;
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
  const baseName = normalized.replace(/(?:-turbo|-flash|-pro|-mini|-plus|-ultra|-opus|-sonnet|-haiku|-lightning|-large|r1|v2|v3|2\.0|3\.0|4\.0|1\.5|2\.5|3\.5|4\.5)\s*$/i, '');
  if (AI_MODEL_NAMES.has(baseName)) return true;
  
  return false;
}
function shouldSkipText(text) { return isMetricOrRepetitiveText(text)||containsUrl(text)||isGarbledText(text)||isAiModelName(text); }

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
      
      seg._hiddenSpans = hiddenSpans;
      seg.blockParent.setAttribute('data-dt-original-hidden', 'true');
    } else {
      // Single node mode: hide the original text node
      const parent = seg.node.parentElement;
      if (!parent) return;
      
      const span = document.createElement('span');
      span.className = 'dual-translate-original-hidden';
      span.dataset.original = seg.node.textContent;
      span.style.display = 'none';
      seg.node.parentNode.replaceChild(span, seg.node);
      seg._hiddenSpan = span;
    }
    
    seg._originalHidden = true;
  } catch (e) {
    console.error('[dual-translate] hideOriginalText error:', e);
  }
}

function showLoading(title, subtitle) {
  hideLoading();
  const el = document.createElement('div');
  el.className = 'dual-translate-loading-overlay';
  el.innerHTML = `<div class="dual-translate-loading-spinner"></div><div class="dual-translate-loading-info"><div class="dual-translate-loading-title">${title||'正在翻译...'}</div>${subtitle?`<div class="dual-translate-loading-subtitle">${subtitle}</div>`:''}<div class="dual-translate-loading-progress"><div class="dual-translate-loading-progress-bar" style="width:0%"></div></div></div>`;
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
  el.innerHTML = `<span class="dual-translate-error-text">${escapeHtml(text)}</span><button class="dual-translate-error-close">✕</button>`;
  el.style.cssText = 'position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:2147483646;background:var(--dt-bg-error);color:var(--dt-text-error);border:1px solid var(--dt-border-error);border-radius:8px;padding:10px 16px;font-size:13px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;box-shadow:0 4px 16px var(--dt-shadow);display:flex;align-items:center;gap:12px;max-width:520px;';
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
  const resp = await sendMessage('getSettings');
  settings = resp.settings;
  if (settings) currentMode = settings.general.lastMode||settings.display.defaultMode||BILINGUAL;
}
async function checkAndTranslate(url) {
  await loadSettings();
  if (!settings||!settings.general.translationEnabled) return;
  if (!settings.trigger.autoTranslate) return;
  const domain = new URL(url).hostname;
  console.debug('[dual-translate] checkAndTranslate:', domain, 'shouldAutoTranslate:', shouldAutoTranslate(domain));
  if (!shouldAutoTranslate(domain)) return;
  
  // 读取源语言设置
  const sourceLanguage = settings.api.sourceLanguage || 'auto';
  const lang = detectPageLanguage(sourceLanguage);
  
  // 处理 'all' 源语言的情况
  if (sourceLanguage === 'all' && lang === 'zh') {
    return; // 中文页面不翻译
  }
  
  if (!shouldTranslateWithSource(lang)) return;
  setTimeout(() => startTranslation(), settings.trigger.translateDelay||500);
}
function hostMatchesPattern(hostname, pattern) {
  try {
    let p = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    p = p.replace(/\\\*/g, '.*');
    p = p.replace(/^\.\*\\\./, '(?:.*\\.)?');
    const matched = new RegExp('^' + p + '$').test(hostname);
    
    // 兜底：若 pattern 形如 *.xxx.yyy，且正则未匹配成功，则检查 hostname 是否等于去除 "*.\" 后的根域名
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
  // 如果传入了 forceLanguage 且不为 'auto'，直接返回该语言
  if (forceLanguage && forceLanguage !== 'auto') {
    return forceLanguage;
  }

  const hl = document.documentElement.lang||'';
  if (hl.startsWith('zh')) return 'zh';
  if (hl.startsWith('ja')) return 'ja';
  if (hl.startsWith('en')) return 'en';

  const title = (document.title||'').toLowerCase();
  if (/[\u4E00-\u9FFF]{3,}/.test(title)) return 'zh';

  const body = document.body; if(!body)return'unknown';
  const walker = document.createTreeWalker(body,NodeFilter.SHOW_TEXT,{acceptNode:n=>{
    const p=n.parentElement;if(!p)return NodeFilter.FILTER_SKIP;
    if(['script','style','noscript','svg','code','pre'].includes(p.tagName.toLowerCase()))return NodeFilter.FILTER_SKIP;
    if(n.textContent.trim().length<5)return NodeFilter.FILTER_SKIP;
    return NodeFilter.FILTER_ACCEPT;
  }});
  let sample='',node;
  while((node=walker.nextNode())&&sample.length<4000)sample+=node.textContent.trim()+' ';
  let cjk=0,ja=0,en=0,total=0;
  for(const ch of sample){
    if(/[a-zA-Z]/.test(ch)){en++;total++;}
    else if(/[\u4E00-\u9FFF]/.test(ch)){cjk++;total++;}
    else if(/[\u3040-\u309F\u30A0-\u30FF]/.test(ch)){ja++;cjk++;total++;}
  }
  if(total===0)return'unknown';
  const nonJaCjk = cjk - ja;
  if(nonJaCjk/total>0.15)return'zh';
  if(ja/total>0.12)return'ja';
  if(en/total>0.5)return'en';
  if(ja>0)return'ja';
  return'en';
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
      console.warn(`Unknown sourceLanguage: ${sourceLanguage}, falling back to auto`);
      return isValidLangForTranslation(detectedLang);
  }
}

function cleanupAllInjections() {
  // Restore hidden original text
  document.querySelectorAll('.dual-translate-original-hidden').forEach(el => {
    const originalText = el.dataset.original || '';
    const textNode = document.createTextNode(originalText);
    el.parentNode.replaceChild(textNode, el);
  });
  
  // Clean up block parent attributes
  document.querySelectorAll('[data-dt-original-hidden]').forEach(el => {
    el.removeAttribute('data-dt-original-hidden');
  });
  
  // Reset segment hidden flags
  segments.forEach(seg => {
    seg._originalHidden = false;
    seg._hiddenSpan = null;
    seg._hiddenSpans = null;
  });
  
  hideLoading();
  hideErrorBanner();
  hoverCleanupHandlers.forEach(fn=>{try{fn()}catch{}});
  hoverCleanupHandlers=[];
  globalCleanupHandlers.forEach(fn=>{try{fn()}catch{}});
  globalCleanupHandlers=[];
  hoverClickRegistered=false;
  document.querySelectorAll('.dual-translate-tooltip,.dual-translate-hover,.dual-translate-panel,.dual-translate-translation,.dual-translate-placeholder,.dual-translate-spinner').forEach(el=>el.remove());
  document.querySelectorAll('.dual-translate-replaced').forEach(el=>{
    const orig=el.dataset.original;
    if(orig&&el.parentNode)el.parentNode.replaceChild(document.createTextNode(orig),el);
  });
  document.body.style.marginRight='';
  document.body.style.marginBottom='';
  document.body.style.userSelect='';
}

function setupMutationObserver() {
  if (mutationObserver) mutationObserver.disconnect();
  let addedSinceLastCheck = 0;
  let quietTimer = null;
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
              node.classList.contains('dual-translate-tooltip') ||
              node.classList.contains('dual-translate-error-banner')
            )) {
              continue;
            }
            // 检查是否是替换后的元素
            if (node.classList && node.classList.contains('dual-translate-replaced')) {
              continue;
            }
          }
          batchAdded++;
        }
      }
    }

    if (batchAdded > 2) {
      addedSinceLastCheck += batchAdded;

      clearTimeout(quietTimer);
      quietTimer = setTimeout(() => {
        if (addedSinceLastCheck > 0 && !isTranslating) {
          const now = Date.now();
          // 防止频繁重新翻译
          if (now - lastRetranslateTime > 2000) {
            addedSinceLastCheck = 0;
            lastRetranslateTime = now;
            startTranslation();
          } else {
            addedSinceLastCheck = 0;
          }
        }
        addedSinceLastCheck = 0;
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

async function startTranslation() {
  if (isTranslating) return;
  isTranslating = true;
  currentAbortController = new AbortController();
  pauseObserver();
  try {
    await sendMessage('setIconState', { state: 'translating' });
    cleanupAllInjections();
    translationCache.clear(); // 必须清空页面级缓存，避免跨页面污染
    showLoading('正在分析页面...', '提取需要翻译的文本段落');
    await new Promise(r=>setTimeout(r,30));
    segments = extractSegments();
    if (segments.length===0) {
      updateLoadingProgress(0,0,'未检测到需要翻译的内容');
      setTimeout(hideLoading,800);
      await sendMessage('setIconState',{state:'idle'});
      translationCompletedOnce = false;
      return;
    }

    let chineseSegmentCount = 0;
    for (const seg of segments) {
      const chineseChars = (seg.text.match(/[\u4E00-\u9FFF]/g) || []).length;
      if (chineseChars / Math.max(seg.text.length, 1) > 0.3) chineseSegmentCount++;
    }
    if (chineseSegmentCount / segments.length > 0.25) {
      updateLoadingProgress(0, 0, '页面中文占比较高，已跳过翻译');
      setTimeout(hideLoading, 1200);
      await sendMessage('setIconState', { state: 'idle' });
      translationCompletedOnce = false;
      return;
    }

    updateLoadingProgress(0,segments.length,'已提取 '+segments.length+' 段文本');
    placePendingSpans();
    await translateSegments(segments, currentAbortController.signal);
    hideLoading();
    await sendMessage('setIconState',{state:'translated'});
    translationCompletedOnce = true;
    setupMutationObserver();
  } catch(e) {
    hideLoading();
    if (e.name === 'AbortError') {
      resetAll();
    } else {
      console.error('[dual-translate] startTranslation error:', e);
      try { await sendMessage('setIconState',{state:'idle'}); } catch {}
    }
    translationCompletedOnce = false;
  } finally {
    isTranslating = false;
    currentAbortController = null;
    resumeObserver();
  }
}

function looksLikeConcatenatedText(text) {
  const len=text.length;if(len<40)return false;
  let bc=0;
  for(let i=0;i<len-1;i++){
    const a=text[i],b=text[i+1];
    if(/[a-zA-Z0-9\u4E00-\u9FFF\u30A0-\u30FF\u3040-\u309F]/.test(a)&&/[a-zA-Z0-9\u4E00-\u9FFF\u30A0-\u30FF\u3040-\u309F]/.test(b))continue;
    if(a===' '||b===' '||a==='\n'||b==='\n'||a==='.'||a===','||a==='!'||a==='?'||a===';'||a===':'||a==='-'||a==='—')continue;
    bc++;
  }
  return bc/len>0.06&&len>60;
}

function extractSegments() {
  const result=[];
  const mTL=settings.rules.minTextLength||3;
  const tCB=settings.rules.translateCodeBlocks||false;
  const processedNodes=new Set();
  const skipTags=new Set(['script','style','noscript','svg','textarea','input','select','option']);
  const blockTags=new Set(['p','li','h1','h2','h3','h4','h5','h6','td','th','blockquote','figcaption','dt','dd','pre','code','summary','a','label','legend','caption']);

  if(isNexusModsDomain()){
    const tc=document.querySelectorAll('[class*="mod-tile"],[class*="modtile"],.mod-tile,[class*="tile"],.collection-item,[class*="collection-item"]');
    tc.forEach(c=>{
      c.querySelectorAll('[class*="stat"],[class*="stats"],[class*="download"],[class*="endorse"],[class*="file-size"],[class*="filesize"],[class*="meta"],[class*="metric"],[class*="count"],[class*="number"],[class*="badge"]').forEach(se=>{
        const w=document.createTreeWalker(se,NodeFilter.SHOW_TEXT,{acceptNode:n=>{
          const p2=n.parentElement;if(!p2)return NodeFilter.FILTER_SKIP;
          if(skipTags.has(p2.tagName.toLowerCase()))return NodeFilter.FILTER_SKIP;
          return NodeFilter.FILTER_ACCEPT;
        }});let sn;while((sn=w.nextNode()))processedNodes.add(sn);
      });
    });
    const titleSelectors=['.mod-tile-title a','.tile-name a','.mod-tile-name a','.mod-name a','[class*="tile-name"] a','[class*="tile-title"] a','[class*="mod-name"] a','a.tile-name','a[class*="tile-name"]','.mod-title-text','[data-testid="mod-tile-title"]','.tile-name','.mod-tile-title','.mod-title-text'];
    for(const sel of titleSelectors){
      try{document.querySelectorAll(sel).forEach(el=>{
        if(el.tagName==='A'||!el.querySelector('a')){
          const dtn=[];const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,{acceptNode:n=>{
            if(processedNodes.has(n))return NodeFilter.FILTER_SKIP;
            const p2=n.parentElement;if(!p2)return NodeFilter.FILTER_SKIP;
            const t2=p2.tagName.toLowerCase();if(skipTags.has(t2))return NodeFilter.FILTER_SKIP;
            if(p2.closest&&p2.closest('[class*="stat"],[class*="endorse"],[class*="download"],[class*="meta"],[class*="metric"],[class*="count"],[class*="number"],[class*="badge"]'))return NodeFilter.FILTER_SKIP;
            return NodeFilter.FILTER_ACCEPT;
          }});let cn;while((cn=w.nextNode()))dtn.push(cn);
          const tt=dtn.map(n=>n.textContent.trim()).filter(t=>t.length>=mTL&&!shouldSkipText(t)&&!/^\s*$/.test(t)&&!/^[\d\s.,!?;:'"()\[\]{}<>/\\|]+$/.test(t)).join(' ');
          if(tt.length>=mTL&&!shouldSkipText(tt)){
            dtn.forEach(n=>processedNodes.add(n));
            if(!result.find(r=>r.text===tt&&r.blockParent===el))result.push({id:'seg_'+result.length,text:tt,node:dtn[0]||el,blockParent:el});
          }
        }
      })}catch{}
    }
  }

  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,{acceptNode:n=>{
    const p=n.parentElement;if(!p)return NodeFilter.FILTER_SKIP;
    const t=p.tagName.toLowerCase();if(skipTags.has(t))return NodeFilter.FILTER_SKIP;
    if(!tCB&&(t==='code'||t==='pre'))return NodeFilter.FILTER_SKIP;
    if(p.closest&&p.closest('.dual-translate-translation,.dual-translate-panel,.dual-translate-hover,.dual-translate-replaced,.dual-translate-tooltip,.dual-translate-loading-overlay,.dual-translate-placeholder,.dual-translate-spinner'))return NodeFilter.FILTER_SKIP;
    return NodeFilter.FILTER_ACCEPT;
  }});

  let node;
  while((node=walker.nextNode())){
    if(processedNodes.has(node))continue;
    const text=node.textContent.trim();
    if(text.length<mTL)continue;
    if(/^\s*$/.test(text))continue;
    if(/^[\d\s.,!?;:'"()\-–—+×÷=%&@#$^*_~`\[\]{}<>/\\|]+$/.test(text))continue;
    if(shouldSkipText(text))continue;
    const parent=node.parentElement;
    if(parent){
      const isStat=parent.closest&&(parent.closest('[class*="stat"]')||parent.closest('[class*="stats"]')||parent.closest('[class*="download"]')||parent.closest('[class*="endorse"]')||parent.closest('[class*="file-size"]')||parent.closest('[class*="filesize"]')||parent.closest('[class*="metric"]')||parent.closest('[class*="count"]')||parent.closest('[class*="meta"]')||parent.closest('[class*="number"]')||parent.closest('[class*="badge"]'));
      if(isStat)continue;
    }
    let bp=parent;
    while(bp&&!blockTags.has(bp.tagName.toLowerCase())&&bp!==document.body)bp=bp.parentElement;
    if(bp&&blockTags.has(bp.tagName.toLowerCase())&&!looksLikeConcatenatedText(text)){
      const at=bp.textContent.trim();
      if(at.length>=mTL&&at!==text&&!shouldSkipText(at)&&!looksLikeConcatenatedText(at)){
        const lines=at.split(/[\n\r]+/).filter(l=>l.trim().length>0);
        if(lines.length>=2&&lines.length<=6){
          const metricLines=lines.filter(l=>shouldSkipText(l.trim()));
          if(metricLines.length/lines.length>0.5)continue;
        }
        const iw=document.createTreeWalker(bp,NodeFilter.SHOW_TEXT,{acceptNode:n=>{const p2=n.parentElement;if(!p2)return NodeFilter.FILTER_SKIP;if(skipTags.has(p2.tagName.toLowerCase()))return NodeFilter.FILTER_SKIP;return NodeFilter.FILTER_ACCEPT;}});
        const bn=[];let bn2;while((bn2=iw.nextNode()))bn.push(bn2);
        const ap=bn.every(n=>processedNodes.has(n)||n.textContent.trim().length<mTL);
        let hbc=false;for(const ch of bp.children){if(blockTags.has(ch.tagName.toLowerCase())){hbc=true;break;}}
        if(!ap&&!hbc){bn.forEach(n=>processedNodes.add(n));result.push({id:'seg_'+result.length,text:at,node:node,blockParent:bp});continue;}
      }
    }
    processedNodes.add(node);
    result.push({id:'seg_'+result.length,text:text,node:node,blockParent:bp&&blockTags.has(bp.tagName.toLowerCase())?bp:null});
  }
  return result;
}

function placePendingSpans() {
  for (const seg of segments) {
    if (currentMode !== BILINGUAL && currentMode !== TRANSLATION_ONLY) continue;
    const segId = seg.id;
    if (seg.blockParent) {
      if (seg.blockParent.querySelector('[data-dt-seg="'+segId+'"]')) continue;
      const span = document.createElement('span');
      span.className = 'dual-translate-placeholder';
      span.dataset.dtSeg = segId;
      span.innerHTML = '<span class="dual-translate-spinner"></span><span class="dual-translate-loader-text">正在翻译...</span>';
      seg.blockParent.appendChild(span);
    } else {
      const parent = seg.node.parentElement;
      if (!parent) continue;
      if (parent.querySelector('[data-dt-seg="'+segId+'"]')) continue;
      const span = document.createElement('span');
      span.className = 'dual-translate-placeholder';
      span.dataset.dtSeg = segId;
      span.innerHTML = '<span class="dual-translate-spinner"></span><span class="dual-translate-loader-text">正在翻译...</span>';
      const next = seg.node.nextSibling;
      if (next) { parent.insertBefore(span, next); } else { parent.appendChild(span); }
    }
  }
}

function fillTranslations() {
  const color = settings.display.translationColor;
  const size = settings.display.translationSize;
  const spacing = settings.display.translationSpacing;
  const font = settings.display.translationFont;

  const translationMode = currentMode;
  const placeholders = [];
  
  document.querySelectorAll('.dual-translate-placeholder').forEach(ph => {
    const segId = ph.dataset.dtSeg;
    if(!translationCache.has(segId))return;
    const translation = translationCache.get(segId);

    ph.classList.remove('dual-translate-placeholder');
    ph.classList.add('dual-translate-translation');
    if(translation&&translation.length>0){
      ph.textContent = translation;
      ph.style.cssText = `color:${color};font-size:${size};margin-top:${spacing};display:block;line-height:1.6;opacity:0.85;`;
    }else{
      ph.textContent = '【该段翻译失败】';
      ph.style.cssText = `color:var(--dt-text-fail);font-size:${size};margin-top:${spacing};display:block;line-height:1.6;opacity:0.6;font-style:italic;`;
    }
    if (font) ph.style.fontFamily = font;
    placeholders.push({ segId, ph });
  });
  
  if (translationMode === TRANSLATION_ONLY) {
    placeholders.forEach(({ segId }) => {
      const seg = segments.find(s => s.id === segId);
      if (seg) {
        hideOriginalText(seg);
      }
    });
  }
}

function normText(s){return String(s==null?'':s).trim().replace(/\s+/g,' ');}

async function translateSegments(segs, signal) {
  if (segs.length===0) return;
  const batchSize=settings.advanced.batchSize||10;
  
  // 读取源语言设置
  const sourceLanguage = settings.api.sourceLanguage || 'auto';
  const detectedLang = detectPageLanguage(sourceLanguage);
  
  // 处理 'all' 源语言的情况
  let sourceLang = detectedLang;
  if (sourceLanguage === 'all') {
    // 对于 'all' 模式，使用实际检测的语言作为源语言
    sourceLang = detectedLang;
  }
  
  const isJa=sourceLang==='ja';
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
        uncached.push(batch[j].text);
        uncachedIds.push(batch[j].id);
      }
    }

    if(uncached.length>0){
      const resp=await sendMessage('translateTexts',{texts:uncached,sourceLang:sourceLang});
      if(resp&&!resp.error&&resp.translations){
        const cMap=new Map();
        for(const r of resp.translations){
          if(r&&typeof r.translation==='string'){
            cMap.set((r.original||'').trim().replace(/\s+/g,' '),r.translation);
          }
        }
        for(let j=0;j<uncached.length;j++){
          const nt=uncached[j].trim().replace(/\s+/g,' ');
          const mt=cMap.get(nt);
          let translation = '';
          if(mt!==undefined&&mt!==null&&mt.length>0){
            translation = mt;
          }else if(j<resp.translations.length&&resp.translations[j]&&typeof resp.translations[j].translation==='string'&&resp.translations[j].translation.length>0){
            translation = resp.translations[j].translation;
          }
          translationCache.set(uncachedIds[j], translation);
          if(translation && translation.length > 0){
            textCache.set(sourceLang + '::' + normText(uncached[j]), translation);
            if (textCache.size > TEXT_CACHE_MAX_SIZE) {
              const firstKey = textCache.keys().next().value;
              textCache.delete(firstKey);
            }
          }
        }
      }else{
        const errMsg=(resp&&resp.error)?resp.error:'翻译失败';
        if(errMsg.includes('所有翻译服务')||errMsg.includes('NO_API')||errMsg.includes('暂时不可用')){
          showErrorBanner(errMsg);
          for(let k=0;k<segs.length;k++){if(!translationCache.has(segs[k].id))translationCache.set(segs[k].id,'');}
          break;
        }
        for(let j=0;j<uncachedIds.length;j++){
          if(!translationCache.has(uncachedIds[j]))translationCache.set(uncachedIds[j],'');
        }
      }
    }

    if(currentMode===BILINGUAL||currentMode===TRANSLATION_ONLY){fillTranslations();}
    if(currentMode===HOVER){updateHover(segs.slice(0,batchEnd));}
    if(currentMode===PANEL){updatePanel(segs.slice(0,batchEnd));}
  }

  // 仅在未取消时执行最终填充
  if (!aborted) {
    for(let i=0;i<segs.length;i++){
      if(!translationCache.has(segs[i].id))translationCache.set(segs[i].id,'');
    }
    if(currentMode===BILINGUAL||currentMode===TRANSLATION_ONLY){fillTranslations();}
    if(currentMode===HOVER){updateHover(segs);}
    if(currentMode===PANEL){updatePanel(segs);}
  } else {
    throw new DOMException('Translation cancelled', 'AbortError');
  }
}

function updateHover(segSubset) {
  hoverCleanupHandlers.forEach(fn=>{try{fn()}catch{}});
  hoverCleanupHandlers=[];
  const hoverDelay=settings.display.hoverDelay||200;
  for(const seg of segSubset){
    const tr=translationCache.get(seg.id);if(!tr)continue;
    const target=seg.blockParent||seg.node.parentElement;if(!target)continue;
    let ht;
    const eh=(e)=>{
      clearTimeout(ht);
      ht=setTimeout(()=>{
        const ex=document.querySelector('.dual-translate-hover:not(.pinned)');
        if(ex)ex.remove();
        showHover(e,tr,seg.id);
      },hoverDelay);
    };
    const lh=()=>clearTimeout(ht);
    target.addEventListener('mouseenter',eh);target.addEventListener('mouseleave',lh);
    hoverCleanupHandlers.push(()=>{target.removeEventListener('mouseenter',eh);target.removeEventListener('mouseleave',lh);});
  }
  if(!hoverClickRegistered){
    const ch=e=>{
      if(e.target.classList.contains('dual-translate-hover')){
        if(e.target.classList.contains('pinned')){e.target.classList.remove('pinned');e.target.remove();}
        else{e.target.classList.add('pinned');const pv=document.querySelector('.dual-translate-hover.pinned:not([data-segment-id="'+e.target.dataset.segmentId+'"])');if(pv)pv.remove();}
      }else if(!e.target.closest('.dual-translate-hover')){document.querySelectorAll('.dual-translate-hover:not(.pinned)').forEach(h=>h.remove());}
    };
    document.addEventListener('click',ch);
    globalCleanupHandlers.push(()=>document.removeEventListener('click',ch));
    hoverClickRegistered=true;
  }
}
function showHover(e,tr,sid){
  const h=document.createElement('div');h.className='dual-translate-hover';h.textContent=tr;h.dataset.segmentId=sid;
  h.style.cssText='position:fixed;background:var(--dt-bg-primary);color:var(--dt-text-primary);padding:10px 14px;border-radius:6px;font-size:14px;z-index:2147483647;max-width:450px;box-shadow:0 4px 16px var(--dt-shadow);border:1px solid var(--dt-border-primary);cursor:pointer;line-height:1.6;';
  document.body.appendChild(h);positionAt(h,e.clientX+14,e.clientY+14);
}

function updatePanel(segSubset) {
  if(panelInstance&&panelInstance.parentNode)panelInstance.remove();
  panelInstance=null;document.body.style.marginRight='';document.body.style.marginBottom='';
  const color=settings.display.translationColor,pos=settings.display.panelPosition||'right',w=settings.display.panelWidth||400;
  const panel=document.createElement('div');panel.className='dual-translate-panel';
  panel.style.cssText=`position:fixed;${pos==='right'?`right:0;top:0;bottom:0;width:${w}px;`:'left:0;right:0;bottom:0;height:300px;'}background:var(--dt-bg-primary);border-left:1px solid var(--dt-border-primary);z-index:2147483646;display:flex;flex-direction:column;box-shadow:-2px 0 8px var(--dt-shadow);`;
  const hd=document.createElement('div');hd.style.cssText=`display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--dt-bg-secondary);border-bottom:1px solid var(--dt-border-light);color:var(--dt-text-primary);font-size:14px;flex-shrink:0;`;
  hd.innerHTML='<span><strong>原文 / 译文</strong> 对照</span><div><button class="panel-toggle-btn" style="background:none;border:none;cursor:pointer;font-size:16px;padding:2px 6px;">◀</button><button class="panel-close-btn" style="background:none;border:none;cursor:pointer;font-size:18px;padding:2px 6px;">✕</button></div>';
  const ct=document.createElement('div');ct.style.cssText='flex:1;overflow-y:auto;padding:14px;';
  for(const seg of segSubset){
    const tr=translationCache.get(seg.id);if(!tr)continue;
    const row=document.createElement('div');row.style.cssText=`display:flex;gap:14px;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--dt-border-light);cursor:pointer;`;
    row.innerHTML=`<div style="flex:1;font-size:13px;color:var(--dt-text-primary);min-width:0;line-height:1.6">${escapeHtml(seg.text)}</div><div style="flex:1;font-size:13px;color:${color};min-width:0;line-height:1.6">${escapeHtml(tr)}</div>`;
    row.addEventListener('click',()=>{if(seg.node&&seg.node.parentElement){seg.node.parentElement.scrollIntoView({behavior:'smooth',block:'center'});seg.node.parentElement.style.transition='background 0.3s';seg.node.parentElement.style.background='var(--dt-bg-highlight)';setTimeout(()=>{seg.node.parentElement.style.background=''},2000);}});
    ct.appendChild(row);
  }
  let collapsed=false;
  hd.querySelector('.panel-toggle-btn').addEventListener('click',()=>{collapsed=!collapsed;panel.style.transform=collapsed?(pos==='right'?'translateX(calc(100% - 30px))':'translateY(calc(100% - 30px))'):'translate(0)';});
  hd.querySelector('.panel-close-btn').addEventListener('click',()=>{panel.remove();panelInstance=null;document.body.style.marginRight='';document.body.style.marginBottom='';});
  let isDragging=false,sX,sY,sW,sH;
  const mdh=e=>{if(e.target.tagName==='BUTTON')return;isDragging=true;sX=e.clientX;sY=e.clientY;const r=panel.getBoundingClientRect();sW=r.width;sH=r.height;document.body.style.userSelect='none';};
  const mmh=e=>{if(!isDragging)return;if(pos==='right')panel.style.width=Math.max(200,Math.min(800,sW-(e.clientX-sX)))+'px';else panel.style.height=Math.max(150,Math.min(600,sH-(e.clientY-sY)))+'px';};
  const muh=()=>{isDragging=false;document.body.style.userSelect='';};
  hd.addEventListener('mousedown',mdh);document.addEventListener('mousemove',mmh);document.addEventListener('mouseup',muh);
  globalCleanupHandlers.push(()=>{hd.removeEventListener('mousedown',mdh);document.removeEventListener('mousemove',mmh);document.removeEventListener('mouseup',muh);});
  panel.appendChild(hd);panel.appendChild(ct);document.body.appendChild(panel);panelInstance=panel;
  if(pos==='right')document.body.style.marginRight=w+'px';else document.body.style.marginBottom='300px';
}

function positionAt(el,x,y){const r=el.getBoundingClientRect();let px=x,py=y;if(px+r.width>window.innerWidth)px=x-r.width-12;if(py+r.height>window.innerHeight)py=y-r.height-12;el.style.left=Math.max(0,px)+'px';el.style.top=Math.max(0,py)+'px';}
function escapeHtml(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML;}
function toggleTranslation() {
  if (isTranslating) return;
  if (segments.length > 0 || translationCache.size > 0) {
    resetAll();
    sendMessage('updateSettings', {path:'general.translationEnabled', value:false});
    sendMessage('setIconState', {state:'idle'});
  } else {
    sendMessage('updateSettings', {path:'general.translationEnabled', value:true});
    startTranslation();
  }
}
function switchMode(nm) {
  if(nm===currentMode)return;
  currentMode=nm;if(settings){settings.general.lastMode=nm;settings.display.defaultMode=nm;}
  sendMessage('updateSettings',{path:'general.lastMode',value:nm});
  sendMessage('updateSettings',{path:'display.defaultMode',value:nm});
  if(segments.length>0&&translationCache.size>0){
    cleanupAllInjections();
    segments.forEach(seg => {
      seg._originalHidden = false;
      seg._hiddenSpan = null;
      seg._hiddenSpans = null;
    });
    placePendingSpans();
    fillTranslations();
    if(currentMode===HOVER)updateHover(segments);
    if(currentMode===PANEL)updatePanel(segments);
  }
  else if(settings&&settings.general.translationEnabled!==false){resetAll();startTranslation();}
  else{resetAll();}
}
function resetAll() {
  if (currentAbortController) { 
    currentAbortController.abort(); 
    currentAbortController = null; 
  }
  if (mutationObserver) { mutationObserver.disconnect(); mutationObserver = null; }
  if (retranslateTimer) { clearTimeout(retranslateTimer); retranslateTimer = null; }
  observerPaused = false;
  translationCompletedOnce = false;
  cleanupAllInjections();
  segments=[];
  translationCache.clear();
  hoverCleanupHandlers=[];
  globalCleanupHandlers=[];
  panelInstance=null;
}
function showSelectionTranslation(original,translation){
  document.querySelectorAll('.dual-translate-hover:not(.pinned)').forEach(h=>h.remove());
  const sel=window.getSelection();let x=100,y=100;
  if(sel&&sel.rangeCount>0){const r=sel.getRangeAt(0).getBoundingClientRect();x=r.left+r.width/2;y=r.bottom+10;}
  const hover=document.createElement('div');hover.className='dual-translate-hover pinned';
  hover.style.cssText=`position:fixed;background:var(--dt-bg-primary);color:var(--dt-text-primary);padding:10px 14px;border-radius:6px;font-size:14px;z-index:2147483647;max-width:450px;box-shadow:0 4px 16px var(--dt-shadow);border:1px solid var(--dt-border-primary);cursor:pointer;line-height:1.6;left:${x}px;top:${y}px;`;
  hover.innerHTML=`<div style="color:var(--dt-text-secondary);font-size:12px;margin-bottom:4px">${escapeHtml(original)}</div><div>${escapeHtml(translation)}</div>`;
  hover.addEventListener('click',()=>hover.remove());
  document.body.appendChild(hover);
}

chrome.runtime.onMessage.addListener((m,s,resp)=>{
  (async()=>{
    switch(m.action){
      case'checkAndTranslate':await checkAndTranslate(m.url);resp({success:true});break;
      case'toggleTranslate':toggleTranslation();resp({success:true});break;
      case'switchMode':switchMode(m.mode);resp({success:true});break;
      case'getStatus':resp({mode:currentMode,translating:isTranslating,segmentCount:segments.length});break;
      case'showSelectionTranslation':showSelectionTranslation(m.original,m.translation);resp({success:true});break;
      case'restoreAll':resetAll();resp({success:true});break;
      case'retranslateWithSource':resetAll();startTranslation();resp({success:true});break;
      case'cancelTranslation':
        if (currentAbortController) {
          currentAbortController.abort();
        }
        resp({ success: true });
        break;
      default:resp({error:'Unknown action'});
    }
  })();return true;
});

(function init(){loadSettings().then(()=>{if(settings&&settings.general.translationEnabled!==false&&settings.trigger.autoTranslate){const url=location.href;if(url.startsWith('http')&&shouldAutoTranslate(new URL(url).hostname)){/* 由 background 触发翻译，content 仅预加载 settings 避免双触发 */}}});})();

// 监听 display 颜色/字体变化，实时更新已渲染的译文样式
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync' || !settings) return;
  const sc = changes.dual_translate_settings;
  if (!sc) return;
  const oldD = sc.oldValue && sc.oldValue.display;
  const newD = sc.newValue && sc.newValue.display;
  if (!newD || JSON.stringify(oldD) === JSON.stringify(newD)) return;
  const newColor = newD.translationColor, newFont = newD.translationFont, newSize = newD.translationSize;
  document.querySelectorAll('.dual-translate-translation').forEach(el => {
    if (newColor) el.style.color = newColor;
    if (newFont) el.style.fontFamily = newFont;
    if (newSize) el.style.fontSize = newSize + 'px';
  });
});
