class BaiduLlmTranslator {
  constructor(config) {
    this.appId = config.appId || '';
    this.apiKey = config.apiKey || '';
    this.endpoint = config.endpoint || 'https://fanyi-api.baidu.com/ait/api/aiTextTranslate';
    this.glossaryHint = config.glossaryHint || '';
    this.name = 'baidu_llm';
    this.displayName = '百度大模型翻译';
  }

  isConfigured() {
    return !!(this.appId && this.apiKey);
  }

  async translate(texts, sourceLang, targetLang) {
    const query = Array.isArray(texts) ? texts.join('\n===\n') : texts;
    const from = sourceLang === 'ja' ? 'jp' : (sourceLang === 'en' ? 'en' : 'auto');
    const to = targetLang === 'zh' ? 'zh' : targetLang;

    const params = new URLSearchParams({
      appid: this.appId,
      q: query,
      from: from,
      to: to,
      model_type: 'llm',
      reference: '采用游戏和MOD社区的专业术语翻译，保留语气和情感色彩，忠实翻译不省略任何内容' + (this.glossaryHint || '')
    });

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: params.toString()
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('QUOTA_EXCEEDED');
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error('AUTH_ERROR');
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    if (data.error_code && String(data.error_code) !== '52000') {
      const code = String(data.error_code);
      if (code === '54003' || code === '54004' || code === '54005') {
        throw new Error('QUOTA_EXCEEDED');
      }
      if (code === '54001') {
        throw new Error('AUTH_ERROR');
      }
      throw new Error(data.error_msg || `Error ${code}`);
    }

    if (data.trans_result) {
      const textArray = Array.isArray(texts) ? texts : [texts];
      const tr = data.trans_result.filter(item => item && item.src !== '===' && item.dst !== '===');
      if (tr.length === textArray.length) {
        return textArray.map((original, i) => ({
          index: i,
          original: original,
          translation: tr[i] ? tr[i].dst : ''
        }));
      }
      const srcMap = new Map();
      for (const item of tr) {
        if (item.src) srcMap.set(item.src.replace(/\s+/g, ' ').trim(), item.dst);
      }
      return textArray.map((original, i) => {
        const key = String(original == null ? '' : original).replace(/\s+/g, ' ').trim();
        const dst = srcMap.get(key) || (tr[i] ? tr[i].dst : '');
        return { index: i, original: original, translation: dst || '' };
      });
    }
    throw new Error('NO_TRANSLATION_RESULT');
  }
}

export { BaiduLlmTranslator };
