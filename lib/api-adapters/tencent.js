// lib/api-adapters/tencent.js
// 腾讯云机器翻译 TMT TextTranslate 适配器
// 接口文档: https://cloud.tencent.com/document/api/551/15619
// 签名方法: TC3-HMAC-SHA256 (v3)
// 签名文档: https://cloud.tencent.com/document/api/213/30654

class TencentTranslator {
  constructor(config) {
    this.secretId = config.secretId || '';
    this.secretKey = config.secretKey || '';
    this.region = config.region || 'ap-guangzhou';
    this.endpoint = 'https://tmt.tencentcloudapi.com';
    this.name = 'tencent';
  }

  isConfigured() {
    return !!(this.secretId && this.secretKey);
  }

  async translate(texts, sourceLang, targetLang, signal) {
    const textArray = Array.isArray(texts) ? texts : [texts];
    const source = sourceLang === 'ja' ? 'ja' : (sourceLang === 'en' ? 'en' : 'zh');
    const target = targetLang === 'zh' ? 'zh' : targetLang;

    // TMT 单次请求限制 6000 字符，批量翻译时用分隔符拼接
    const SEPARATOR = '\n';
    const joined = textArray.map(t => String(t == null ? '' : t)).join(SEPARATOR);

    const payload = JSON.stringify({
      SourceText: joined,
      Source: source,
      Target: target,
      ProjectId: 0
    });

    const authorization = await this._buildAuth(payload);
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Host': 'tmt.tencentcloudapi.com',
        'X-TC-Action': 'TextTranslate',
        'X-TC-Version': '2018-03-21',
        'X-TC-Region': this.region,
        'X-TC-Timestamp': String(Math.floor(Date.now() / 1000)),
        'Authorization': authorization
      },
      body: payload,
      signal
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

    // 腾讯云错误响应: { Response: { Error: { Code, Message } } }
    if (data.Response && data.Response.Error) {
      const code = data.Response.Error.Code || '';
      const message = data.Response.Error.Message || code;
      if (code === 'FailedOperation.NoFreeAmount' || code === 'LimitExceeded' ||
          code === 'RequestLimitExceeded.UinLimitExceeded' || code === 'FailedOperation.ServiceIsolate') {
        throw new Error('QUOTA_EXCEEDED');
      }
      if (code === 'FailedOperation.UserNotRegistered' || code === 'UnauthorizedOperation.ActionNotFound') {
        throw new Error('AUTH_ERROR');
      }
      throw new Error(message);
    }

    if (data.Response && data.Response.TargetText != null) {
      const targetText = data.Response.TargetText;
      const parts = targetText.split(SEPARATOR);

      if (parts.length === textArray.length) {
        return textArray.map((original, i) => ({
          index: i,
          original: original,
          translation: parts[i] !== undefined ? parts[i].trim() : ''
        }));
      }

      // 份数不匹配时尽力对齐
      if (parts.length === 1) {
        return textArray.map((original, i) => ({
          index: i,
          original: original,
          translation: i === 0 ? targetText.trim() : ''
        }));
      }

      return textArray.map((original, i) => ({
        index: i,
        original: original,
        translation: parts[i] !== undefined ? parts[i].trim() : ''
      }));
    }

    throw new Error('NO_TRANSLATION_RESULT');
  }

  // ===== TC3-HMAC-SHA256 签名 =====

  async _buildAuth(payload) {
    const service = 'tmt';
    const host = 'tmt.tencentcloudapi.com';
    const action = 'TextTranslate';
    const timestamp = Math.floor(Date.now() / 1000);
    const date = this._utcDate(timestamp);

    // 步骤 1: 拼接规范请求串
    const httpRequestMethod = 'POST';
    const canonicalUri = '/';
    const canonicalQueryString = '';
    const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`;
    const signedHeaders = 'content-type;host;x-tc-action';
    const hashedRequestPayload = await this._sha256Hex(payload);
    const canonicalRequest = `${httpRequestMethod}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${hashedRequestPayload}`;

    // 步骤 2: 拼接待签名字符串
    const algorithm = 'TC3-HMAC-SHA256';
    const credentialScope = `${date}/${service}/tc3_request`;
    const hashedCanonicalRequest = await this._sha256Hex(canonicalRequest);
    const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`;

    // 步骤 3: 计算签名
    const secretDate = await this._hmacSha256(this._strToUint8('TC3' + this.secretKey), date);
    const secretService = await this._hmacSha256(secretDate, service);
    const secretSigning = await this._hmacSha256(secretService, 'tc3_request');
    const signature = await this._hmacSha256Hex(secretSigning, stringToSign);

    // 步骤 4: 拼接 Authorization
    return `${algorithm} Credential=${this.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  }

  _utcDate(timestamp) {
    const d = new Date(timestamp * 1000);
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  _strToUint8(str) {
    return new TextEncoder().encode(str);
  }

  _bufToHex(buf) {
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async _sha256Hex(str) {
    const buf = await crypto.subtle.digest('SHA-256', this._strToUint8(str));
    return this._bufToHex(buf);
  }

  async _hmacSha256(key, msg) {
    // key 可以是 Uint8Array 或 ArrayBuffer
    const keyBuf = key instanceof Uint8Array ? key : new Uint8Array(key);
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyBuf, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    return await crypto.subtle.sign('HMAC', cryptoKey, this._strToUint8(msg));
  }

  async _hmacSha256Hex(key, msg) {
    const buf = await this._hmacSha256(key, msg);
    return this._bufToHex(buf);
  }
}

export { TencentTranslator };
