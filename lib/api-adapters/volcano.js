// lib/api-adapters/volcano.js
// 火山引擎机器翻译适配器
// 使用 V4 签名（HMAC-SHA256）进行认证
// API 文档: https://www.volcengine.com/docs/4640/65067
// 签名文档: https://www.volcengine.com/docs/6369/67269

class VolcanoTranslator {
  constructor(config) {
    this.accessKey = config.accessKey || '';
    this.secretKey = config.secretKey || '';
    this.endpoint = config.endpoint || 'https://translate.volcengineapi.com';
    this.region = 'cn-north-1';
    this.service = 'translate';
    this.host = 'translate.volcengineapi.com';
    this.name = 'volcano';
  }

  isConfigured() {
    return !!(this.accessKey && this.secretKey);
  }

  async translate(texts, sourceLang, targetLang, signal) {
    const textArray = Array.isArray(texts) ? texts : [texts];
    // 火山引擎 API 限制：单次最多 16 条文本，总字符数不超过 5000
    const batches = this._splitBatches(textArray);
    const allTranslations = [];

    for (const batch of batches) {
      const translations = await this._translateBatch(batch, sourceLang, targetLang, signal);
      allTranslations.push(...translations);
    }

    return textArray.map((original, i) => ({
      index: i,
      original: original,
      translation: allTranslations[i] || ''
    }));
  }

  // 按API限制拆分批次：每批最多16条，总字符不超过5000
  _splitBatches(texts) {
    const batches = [];
    let currentBatch = [];
    let currentLength = 0;

    for (const text of texts) {
      const textLen = String(text == null ? '' : text).length;
      if (currentBatch.length >= 16 || (currentLength + textLen > 5000 && currentBatch.length > 0)) {
        batches.push(currentBatch);
        currentBatch = [];
        currentLength = 0;
      }
      currentBatch.push(text);
      currentLength += textLen;
    }
    if (currentBatch.length > 0) batches.push(currentBatch);
    return batches;
  }

  async _translateBatch(texts, sourceLang, targetLang, signal) {
    const body = {
      TargetLanguage: this._mapLanguage(targetLang),
      TextList: texts.map(t => String(t == null ? '' : t))
    };

    const mappedSource = this._mapSourceLanguage(sourceLang);
    if (mappedSource) body.SourceLanguage = mappedSource;

    const bodyStr = JSON.stringify(body);
    const url = `${this.endpoint}/?Action=TranslateText&Version=2020-06-01`;

    const headers = await this._buildAuthHeaders(bodyStr);

    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: bodyStr,
      signal
    });

    if (!response.ok) {
      if (response.status === 429) throw new Error('QUOTA_EXCEEDED');
      if (response.status === 401 || response.status === 403) {
        // 尝试读取响应体中的详细错误信息
        let detail = '';
        try {
          const errBody = await response.json();
          if (errBody?.ResponseMetadata?.Error) {
            detail = `${errBody.ResponseMetadata.Error.Code || ''}: ${errBody.ResponseMetadata.Error.Message || ''}`;
          }
        } catch {}
        throw new Error(detail ? `AUTH_ERROR (${detail})` : 'AUTH_ERROR');
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    // 火山引擎 API 的错误信息在 ResponseMetadata.Error 中
    if (data.ResponseMetadata && data.ResponseMetadata.Error) {
      const err = data.ResponseMetadata.Error;
      const code = err.Code || '';
      const msg = err.Message || '';
      // 限流相关错误
      if (code === 'FlowLimitExceeded' || String(code) === '-429') {
        throw new Error('QUOTA_EXCEEDED');
      }
      // 认证相关错误
      if (['InvalidAccessKey', 'SignatureDoesNotMatch', 'AccessDenied',
           'InvalidCredential', 'InvalidAuthorization'].includes(code)) {
        throw new Error(`AUTH_ERROR (${code}: ${msg})`);
      }
      throw new Error(msg || `Volcano Error ${code}`);
    }

    if (!data.TranslationList || !Array.isArray(data.TranslationList)) {
      throw new Error('NO_TRANSLATION_RESULT');
    }

    return data.TranslationList.map(item => item.Translation || '');
  }

  _mapLanguage(lang) {
    const map = { 'zh': 'zh', 'en': 'en', 'ja': 'ja' };
    return map[lang] || lang;
  }

  _mapSourceLanguage(lang) {
    if (!lang || lang === 'auto') return null;
    return this._mapLanguage(lang);
  }

  // ============ V4 签名实现 ============

  async _buildAuthHeaders(bodyStr) {
    const now = new Date();
    const xDate = this._formatDateTime(now);
    const dateStamp = xDate.substring(0, 8);

    const canonicalUri = '/';
    const canonicalQueryString = 'Action=TranslateText&Version=2020-06-01';
    const canonicalHeaders = `host:${this.host}\nx-date:${xDate}\n`;
    const signedHeaders = 'host;x-date';

    const payloadHash = await this._sha256Hex(bodyStr);

    const canonicalRequest = [
      'POST',
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      payloadHash
    ].join('\n');

    const credentialScope = `${dateStamp}/${this.region}/${this.service}/request`;
    const hashedCanonicalRequest = await this._sha256Hex(canonicalRequest);

    const stringToSign = [
      'HMAC-SHA256',
      xDate,
      credentialScope,
      hashedCanonicalRequest
    ].join('\n');

    // 派生签名密钥
    // 火山引擎 V4 签名：每一步 HMAC 使用上一步结果的原始二进制字节作为密钥
    // （文档中"十六进制"仅指展示形式，实际 HMAC 密钥为二进制）
    const kDate = await this._hmac(this.secretKey, dateStamp);
    const kRegion = await this._hmac(kDate, this.region);
    const kService = await this._hmac(kRegion, this.service);
    const kSigning = await this._hmac(kService, 'request');

    const signature = this._toHex(
      await this._hmac(kSigning, stringToSign)
    );

    const authorization = `HMAC-SHA256 Credential=${this.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return {
      'Content-Type': 'application/json',
      'Host': this.host,
      'X-Date': xDate,
      'Authorization': authorization
    };
  }

  _formatDateTime(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return date.getUTCFullYear() +
      pad(date.getUTCMonth() + 1) +
      pad(date.getUTCDate()) + 'T' +
      pad(date.getUTCHours()) +
      pad(date.getUTCMinutes()) +
      pad(date.getUTCSeconds()) + 'Z';
  }

  async _sha256Hex(data) {
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
    return this._toHex(new Uint8Array(hashBuffer));
  }

  async _hmac(key, data) {
    const encoder = new TextEncoder();
    // key 可以是字符串（UTF-8编码）或 Uint8Array
    const keyBytes = typeof key === 'string' ? encoder.encode(key) : key;
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
    return new Uint8Array(signature);
  }

  _toHex(bytes) {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}

export { VolcanoTranslator };
