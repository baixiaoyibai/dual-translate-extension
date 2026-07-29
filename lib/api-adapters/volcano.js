// lib/api-adapters/volcano.js
// 火山引擎机器翻译适配器
// 使用 V4 签名（HMAC-SHA256）进行认证
// API 文档: https://www.volcengine.com/docs/4640/65067
// 签名文档: https://www.volcengine.com/docs/6369/67269

import { BaseTranslator } from './base.js';

class VolcanoTranslator extends BaseTranslator {
  constructor(config) {
    super({ name: 'volcano', displayName: '火山引擎机器翻译' });
    this.accessKey = config.accessKey || '';
    this.secretKey = config.secretKey || '';
    this.endpoint = config.endpoint || 'https://translate.volcengineapi.com';
    this.region = 'cn-north-1';
    this.service = 'translate';
    this.host = 'translate.volcengineapi.com';
  }

  isConfigured() {
    return !!(this.accessKey && this.secretKey);
  }

  async translate(texts, sourceLang, targetLang, signal) {
    const textArray = Array.isArray(texts) ? texts : [texts];

    // 预处理：拆分超过 5000 字符的单条文本（API 限制每批总字符不超过 5000）
    const splitTexts = [];
    const chunkMap = []; // chunkMap[i] = { originalIndex, totalChunks }
    for (let i = 0; i < textArray.length; i++) {
      const text = String(textArray[i] == null ? '' : textArray[i]);
      if (text.length <= 4800) {
        splitTexts.push(text);
        chunkMap.push({ originalIndex: i, totalChunks: 1 });
      } else {
        const chunks = this._splitLongText(text, 4800);
        for (const chunk of chunks) {
          splitTexts.push(chunk);
          chunkMap.push({ originalIndex: i, totalChunks: chunks.length });
        }
      }
    }

    // 火山引擎 API 限制：单次最多 16 条文本，总字符数不超过 5000
    const batches = this._splitBatches(splitTexts);
    const allTranslations = [];

    for (const batch of batches) {
      const translations = await this._translateBatch(batch, sourceLang, targetLang, signal);
      allTranslations.push(...translations);
    }

    // 合并拆分文本的翻译结果
    const merged = new Array(textArray.length).fill('');
    for (let i = 0; i < allTranslations.length; i++) {
      const meta = chunkMap[i];
      merged[meta.originalIndex] += allTranslations[i] || '';
    }

    return textArray.map((original, i) => ({
      index: i,
      original: original,
      translation: merged[i] || ''
    }));
  }

  // 拆分超长文本：优先在段落/句子边界切分
  _splitLongText(text, maxLen) {
    const chunks = [];
    const paragraphs = text.split(/\n+/);
    let current = '';

    for (const para of paragraphs) {
      if (current && (current + '\n' + para).length > maxLen) {
        chunks.push(current);
        current = para;
      } else {
        current = current ? current + '\n' + para : para;
      }
      // 单个段落仍然太长，按句子边界切分
      while (current.length > maxLen) {
        const cut = this._findSplitPoint(current, maxLen);
        chunks.push(current.substring(0, cut));
        current = current.substring(cut).trim();
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }

  // 在 maxLen 附近找最近的句子结束符位置
  _findSplitPoint(text, maxLen) {
    const re = /[。！？.!?\n;；]/g;
    let lastEnd = -1;
    let match;
    while ((match = re.exec(text)) !== null) {
      if (match.index >= maxLen) break;
      lastEnd = match.index + 1;
    }
    return lastEnd > 0 ? lastEnd : maxLen;
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
      // 基类 _handleHttpError 已处理 429/401/403，含火山引擎 ResponseMetadata.Error 格式
      await this._handleHttpError(response);
    }

    const data = await response.json();

    // 火山引擎 API 的错误信息在 ResponseMetadata.Error 中（HTTP 200 但业务错误）
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
        throw new Error(`AUTH_ERROR: ${code}: ${msg}`);
      }
      throw new Error(msg || `Volcano Error ${code}`);
    }

    if (!data.TranslationList || !Array.isArray(data.TranslationList)) {
      throw new Error('NO_TRANSLATION_RESULT');
    }

    return data.TranslationList.map(item => item.Translation || '');
  }

  // _mapLanguage 和 _mapSourceLanguage 继承自 BaseTranslator
  // 火山引擎语言代码与内部代码一致（zh/en/ja），基类的 identity 映射即可

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
