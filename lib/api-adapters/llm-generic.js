class LLMGenericTranslator {
  constructor(config) {
    this.apiKey = config.apiKey || '';
    this.baseUrl = config.baseUrl || '';
    this.model = config.model || '';
    this.name = config.name || 'llm';
    this.displayName = config.displayName || '大模型';
    this.systemPrompt = config.systemPrompt || '';
  }

  isConfigured() {
    return !!(this.apiKey && this.baseUrl && this.model);
  }

  async translate(texts, sourceLang, targetLang) {
    const sourceName = sourceLang === 'ja' ? '日文' : (sourceLang === 'en' ? '英文' : '原文');
    const targetName = targetLang === 'zh' ? '简体中文' : targetLang;

    let userPrompt;
    if (Array.isArray(texts) && texts.length > 1) {
      userPrompt = `请将以下${sourceName}文本逐段翻译为${targetName}。每段原文之间用分隔符 \u0000 隔开，请同样用 \u0000 分隔每段译文，保持顺序一致。\n\n${texts.join('\n\u0000\n')}`;
    } else {
      const singleText = Array.isArray(texts) ? texts[0] : texts;
      userPrompt = `请将以下${sourceName}文本翻译为${targetName}：\n\n${singleText}`;
    }

    const messages = [
      { role: 'system', content: this.systemPrompt || this._getDefaultPrompt() },
      { role: 'user', content: userPrompt }
    ];

    const endpoint = this._buildEndpoint();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages,
        temperature: 0.3,
        max_tokens: 4096
      })
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
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      if (data.error && data.error.message) {
        throw new Error(data.error.message);
      }
      throw new Error('NO_TRANSLATION_RESULT');
    }

    const content = (data.choices[0].message.content || '').trim();

    if (Array.isArray(texts) && texts.length > 1) {
      const translations = this._splitTranslations(content, texts.length);
      return texts.map((original, i) => ({
        index: i,
        original: original,
        translation: translations[i] !== undefined ? translations[i] : ''
      }));
    } else {
      return [{
        index: 0,
        original: Array.isArray(texts) ? texts[0] : texts,
        translation: content
      }];
    }
  }

  _splitTranslations(content, expectedCount) {
    if (expectedCount <= 1) return [content];
    let parts = content.split('\u0000').map(s => s.trim());
    if (parts.length === expectedCount) return parts;

    if (parts.length === 1) {
      const nlParts = content.split(/\n+/).map(s => s.trim()).filter(s => s.length > 0);
      if (nlParts.length === expectedCount) return nlParts;
      if (nlParts.length > expectedCount) return nlParts.slice(0, expectedCount);
      if (nlParts.length > 1) {
        while (nlParts.length < expectedCount) nlParts.push('');
        return nlParts;
      }
    }

    if (parts.length > expectedCount) {
      const head = parts.slice(0, expectedCount - 1);
      const tail = parts.slice(expectedCount - 1).join('\n');
      return [...head, tail];
    }
    while (parts.length < expectedCount) parts.push('');
    return parts;
  }

  _buildEndpoint() {
    const base = this.baseUrl.replace(/\/+$/, '');
    return `${base}/chat/completions`;
  }

  _getDefaultPrompt() {
    return `你是一个专业的游戏和技术领域翻译专家。请将文本翻译为简体中文。
术语规则：HP/MP/EXP/FPS/CD/NPC/DPS/GG/OP/buff/debuff/nerf/AoE等短词保留原文。
其他游戏术语翻译为中文，如tank→坦克、healer→治疗、aggro→仇恨等。
MOD名称保持原名。忠实翻译，不要省略或审查任何内容。仅输出翻译结果。`;
  }
}

export { LLMGenericTranslator };
