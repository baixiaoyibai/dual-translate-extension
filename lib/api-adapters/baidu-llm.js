import { BaseTranslator } from './base.js';

class BaiduLlmTranslator extends BaseTranslator {
  constructor(config) {
    super({ name: 'baidu_llm', displayName: '百度大模型翻译' });
    this.appId = config.appId || '';
    this.apiKey = config.apiKey || '';
    this.endpoint = config.endpoint || 'https://fanyi-api.baidu.com/ait/api/aiTextTranslate';
  }

  isConfigured() {
    return !!(this.appId && this.apiKey);
  }

  async translate(texts, sourceLang, targetLang, signal, glossaryHint = '') {
    const query = Array.isArray(texts) ? texts.join('\n===\n') : texts;
    const from = this._mapBaiduLanguage(sourceLang);

    const params = new URLSearchParams({
      appid: this.appId,
      q: query,
      from: from,
      to: targetLang,
      model_type: 'llm',
      reference: '采用游戏和MOD社区的专业术语翻译，保留语气和情感色彩，忠实翻译不省略任何内容' + glossaryHint
    });

    const response = await this._post(this.endpoint, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: params.toString(),
      signal
    });

    if (!response.ok) {
      await this._handleHttpError(response);
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error('响应格式无效');
    }
    if (data.error_code && String(data.error_code) !== '52000') {
      const code = String(data.error_code);
      // v1.0.7 fix: 54004 是余额不足（配额问题）；v1.3.0 fix P2-2: 54003/54005 频率受限映射为 RATE_LIMITED（与 base.js 429 语义一致）
      if (code === '54004') throw new Error('QUOTA_EXCEEDED');
      if (code === '54003' || code === '54005') throw new Error('RATE_LIMITED');
      if (code === '54001') {
        throw new Error('AUTH_ERROR');
      }
      throw new Error(/^\d{1,8}$/.test(code) ? `百度服务错误 ${code}` : '百度服务错误');
    }

    if (Array.isArray(data.trans_result)) {
      const textArray = Array.isArray(texts) ? texts : [texts];
      const rows = textArray.length > 1 ? data.trans_result.filter(row => row?.src !== '===' && row?.dst !== '===') : data.trans_result;
      return this._mapTranslations(textArray, rows);
    }
    throw new Error('NO_TRANSLATION_RESULT');
  }
}

export { BaiduLlmTranslator };
