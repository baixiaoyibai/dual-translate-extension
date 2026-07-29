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

  // ============ 共享 HTTP 错误处理 ============

  /**
   * 统一处理 fetch 响应的错误状态码
   * 429 → QUOTA_EXCEEDED
   * 401/403 → 尝试读取响应体中的详细错误信息，抛 AUTH_ERROR
   * 其他非 ok → HTTP {status}
   */
  async _handleHttpError(response) {
    if (response.status === 429) {
      throw new Error('QUOTA_EXCEEDED');
    }
    if (response.status === 401 || response.status === 403) {
      let detail = '';
      // 先检查响应类型，避免对 HTML 错误页（如 Cloudflare/nginx 502）调用 json() 抛异常
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        // JSON 响应：按原有逻辑解析三种已知错误格式
        try {
          const errBody = await response.json();
          // 兼容不同 API 的错误格式
          if (errBody?.ResponseMetadata?.Error) {
            // 火山引擎格式
            detail = `${errBody.ResponseMetadata.Error.Code || ''}: ${errBody.ResponseMetadata.Error.Message || ''}`;
          } else if (errBody?.error?.message) {
            // OpenAI 兼容格式
            detail = errBody.error.message;
          } else if (errBody?.error_msg) {
            // 百度格式
            detail = errBody.error_msg;
          }
        } catch {}
      } else {
        // 非 JSON 响应（HTML 错误页、text/plain 等）：读取文本并截取前 200 字符作为错误详情
        // 编码安全：Fetch API 的 response.text() 默认按 UTF-8 解码，
        // 海外 Windows 系统即使区域编码非 UTF-8，浏览器扩展环境仍保证 UTF-8 解码
        try {
          const text = await response.text();
          const snippet = (text || '').slice(0, 200).replace(/\s+/g, ' ').trim();
          if (snippet) {
            detail = `HTTP ${response.status} - ${snippet}`;
          }
        } catch {}
      }
      throw new Error(detail ? `AUTH_ERROR: ${detail}` : 'AUTH_ERROR');
    }
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
}

export { BaseTranslator };
