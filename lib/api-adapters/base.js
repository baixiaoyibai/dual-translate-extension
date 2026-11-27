// lib/api-adapters/base.js
// 翻译适配器基类 —— 提取公共逻辑（HTTP 错误处理、语言映射、配置校验）
// 所有适配器继承此类，消除 4 处重复的错误处理和语言映射代码

class BaseTranslator {
  constructor(config = {}) {
    this.name = config.name || 'base';
    this.displayName = config.displayName || '翻译';
  }

  /**
   * 子类必须实现：返回 true 表示配置完整可用
   */
  isConfigured() {
    return false;
  }

  /**
   * 子类必须实现：翻译文本数组
   * @returns {Promise<Array<{index, original, translation}>>}
   */
  async translate(texts, sourceLang, targetLang, signal) {
    throw new Error(`${this.name}: translate() 未实现`);
  }

  async _post(url, options) {
    // Never forward text, signed forms or credentials to a redirect target.
    return fetch(url, {
      ...options, method: 'POST', redirect: 'error', credentials: 'omit',
      referrerPolicy: 'no-referrer', cache: 'no-store'
    });
  }

  async _handleHttpError(response) {
    if (response.status === 429) throw new Error('RATE_LIMITED');
    if (response.status === 401 || response.status === 403) throw new Error('AUTH_ERROR');
    throw new Error(`HTTP ${response.status}`);
  }

  // ============ 共享语言映射 ============

  /**
   * 将内部语言代码映射为 API 所需的语言代码
   * 子类可覆盖以实现自定义映射
   */
  _mapLanguage(lang) {
    return lang;
  }

  /**
   * 映射源语言（auto 时返回 null 表示不传）
   */
  _mapSourceLanguage(lang) {
    if (!lang || lang === 'auto') return null;
    return this._mapLanguage(lang);
  }

  /**
   * 百度系 API 专用：ja → jp，en → en，其他 → auto
   */
  _mapBaiduLanguage(lang) {
    if (lang === 'ja') return 'jp';
    if (lang === 'en') return 'en';
    return 'auto';
  }

  /**
   * LLM 系 API 专用：将语言代码转为中文名称用于 prompt
   */
  _mapLanguageToChinese(lang) {
    if (lang === 'ja') return '日文';
    if (lang === 'en') return '英文';
    return '原文';
  }

  // ============ 共享工具方法 ============

  /**
   * 安全字符串化：null/undefined → ''
   */
  _safeStr(val) {
    return String(val == null ? '' : val);
  }

  /**
   * 清理文本：合并空白并 trim
   */
  _sanitize(text) {
    return this._safeStr(text).replace(/\s+/g, ' ').trim();
  }

  _mapTranslations(texts, rows) {
    if (!Array.isArray(rows)) throw new Error('INCOMPLETE_BATCH');
    const usable = rows.filter(row => typeof row?.src === 'string' && typeof row?.dst === 'string' && row.dst.trim());
    // A single input can be returned as multiple lines by the provider.
    if (texts.length === 1 && usable.length === rows.length &&
        this._sanitize(usable.map(row => row.src).join(' ')) === this._sanitize(texts[0])) {
      return [{ index: 0, original: texts[0], translation: usable.map(row => row.dst).join('\n') }];
    }
    const bySource = new Map(usable.map(row => [this._sanitize(row.src), row.dst]));
    return texts.map((original, index) => ({ index, original, translation: bySource.get(this._sanitize(original)) || '' }));
  }
}

export { BaseTranslator };
