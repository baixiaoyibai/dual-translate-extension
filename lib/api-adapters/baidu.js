import { BaseTranslator } from './base.js';

class BaiduTranslator extends BaseTranslator {
  constructor(config) {
    super({ name: 'baidu', displayName: '百度机器翻译' });
    this.appId = config.appId || '';
    this.secretKey = config.secretKey || '';
    this.endpoint = config.endpoint || 'https://fanyi-api.baidu.com/api/trans/vip/translate';
  }

  isConfigured() {
    return !!(this.appId && this.secretKey);
  }

  async translate(texts, sourceLang, targetLang, signal) {
    const textArray = Array.isArray(texts) ? texts : [texts];
    const sanitized = textArray.map(t => this._sanitize(t));
    const query = sanitized.join('\n');
    const salt = String(Date.now());
    const from = this._mapBaiduLanguage(sourceLang);
    const signStr = this.appId + query + salt + this.secretKey;
    const sign = this._md5(signStr);

    const params = new URLSearchParams({
      q: query,
      from: from,
      to: targetLang,
      appid: this.appId,
      salt: salt,
      sign: sign
    });

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
      signal
    });

    if (!response.ok) {
      await this._handleHttpError(response);
    }

    let data;
    try {
      data = await response.json();
    } catch (e) {
      throw new Error(`响应解析失败: ${e.message}`);
    }
    if (data.error_code && String(data.error_code) !== '52000') {
      const code = String(data.error_code);
      // v1.0.7 fix: 54001 是签名错误（AUTH_ERROR），54002/58002 才是额度相关
      if (code === '54001') throw new Error('AUTH_ERROR: 签名错误');
      if (code === '54002' || code === '58002') throw new Error('QUOTA_EXCEEDED');
      throw new Error(data.error_msg || `Error ${code}`);
    }

    if (data.trans_result) {
      const tr = data.trans_result;
      if (tr.length === textArray.length) {
        return textArray.map((original, i) => ({
          index: i,
          original: original,
          translation: tr[i] ? tr[i].dst : ''
        }));
      }
      const srcMap = new Map();
      for (const item of tr) {
        if (item && item.src) srcMap.set(item.src.replace(/\s+/g, ' ').trim(), item.dst);
      }
      return textArray.map((original, i) => {
        const key = sanitized[i];
        const dst = srcMap.get(key) || (tr[i] ? tr[i].dst : '');
        return { index: i, original: original, translation: dst || '' };
      });
    }
    throw new Error('NO_TRANSLATION_RESULT');
  }

  _md5(string) {
    function md5cycle(x, k) {
      let a = x[0], b = x[1], c = x[2], d = x[3];
      a = ff(a, b, c, d, k[0], 7, -680876936);
      d = ff(d, a, b, c, k[1], 12, -389564586);
      c = ff(c, d, a, b, k[2], 17, 606105819);
      b = ff(b, c, d, a, k[3], 22, -1044525330);
      a = ff(a, b, c, d, k[4], 7, -176418897);
      d = ff(d, a, b, c, k[5], 12, 1200080426);
      c = ff(c, d, a, b, k[6], 17, -1473231341);
      b = ff(b, c, d, a, k[7], 22, -45705983);
      a = ff(a, b, c, d, k[8], 7, 1770035416);
      d = ff(d, a, b, c, k[9], 12, -1958414417);
      c = ff(c, d, a, b, k[10], 17, -42063);
      b = ff(b, c, d, a, k[11], 22, -1990404162);
      a = ff(a, b, c, d, k[12], 7, 1804603682);
      d = ff(d, a, b, c, k[13], 12, -40341101);
      c = ff(c, d, a, b, k[14], 17, -1502002290);
      b = ff(b, c, d, a, k[15], 22, 1236535329);
      a = gg(a, b, c, d, k[1], 5, -165796510);
      d = gg(d, a, b, c, k[6], 9, -1069501632);
      c = gg(c, d, a, b, k[11], 14, 643717713);
      b = gg(b, c, d, a, k[0], 20, -373897302);
      a = gg(a, b, c, d, k[5], 5, -701558691);
      d = gg(d, a, b, c, k[10], 9, 38016083);
      c = gg(c, d, a, b, k[15], 14, -660478335);
      b = gg(b, c, d, a, k[4], 20, -405537848);
      a = gg(a, b, c, d, k[9], 5, 568446438);
      d = gg(d, a, b, c, k[14], 9, -1019803690);
      c = gg(c, d, a, b, k[3], 14, -187363961);
      b = gg(b, c, d, a, k[8], 20, 1163531501);
      a = gg(a, b, c, d, k[13], 5, -1444681467);
      d = gg(d, a, b, c, k[2], 9, -51403784);
      c = gg(c, d, a, b, k[7], 14, 1735328473);
      b = gg(b, c, d, a, k[12], 20, -1926607734);
      a = hh(a, b, c, d, k[5], 4, -378558);
      d = hh(d, a, b, c, k[8], 11, -2022574463);
      c = hh(c, d, a, b, k[11], 16, 1839030562);
      b = hh(b, c, d, a, k[14], 23, -35309556);
      a = hh(a, b, c, d, k[1], 4, -1530992060);
      d = hh(d, a, b, c, k[4], 11, 1272893353);
      c = hh(c, d, a, b, k[7], 16, -155497632);
      b = hh(b, c, d, a, k[10], 23, -1094730640);
      a = hh(a, b, c, d, k[13], 4, 681279174);
      d = hh(d, a, b, c, k[0], 11, -358537222);
      c = hh(c, d, a, b, k[3], 16, -722521979);
      b = hh(b, c, d, a, k[6], 23, 76029189);
      a = hh(a, b, c, d, k[9], 4, -640364487);
      d = hh(d, a, b, c, k[12], 11, -421815835);
      c = hh(c, d, a, b, k[15], 16, 530742520);
      b = hh(b, c, d, a, k[2], 23, -995338651);
      a = ii(a, b, c, d, k[0], 6, -198630844);
      d = ii(d, a, b, c, k[7], 10, 1126891415);
      c = ii(c, d, a, b, k[14], 15, -1416354905);
      b = ii(b, c, d, a, k[5], 21, -57434055);
      a = ii(a, b, c, d, k[12], 6, 1700485571);
      d = ii(d, a, b, c, k[3], 10, -1894986606);
      c = ii(c, d, a, b, k[10], 15, -1051523);
      b = ii(b, c, d, a, k[1], 21, -2054922799);
      a = ii(a, b, c, d, k[8], 6, 1873313359);
      d = ii(d, a, b, c, k[15], 10, -30611744);
      c = ii(c, d, a, b, k[6], 15, -1560198380);
      b = ii(b, c, d, a, k[13], 21, 1309151649);
      a = ii(a, b, c, d, k[4], 6, -145523070);
      d = ii(d, a, b, c, k[11], 10, -1120210379);
      c = ii(c, d, a, b, k[2], 15, 718787259);
      b = ii(b, c, d, a, k[9], 21, -343485551);
      x[0] = add32(a, x[0]);
      x[1] = add32(b, x[1]);
      x[2] = add32(c, x[2]);
      x[3] = add32(d, x[3]);
    }
    function cmn(q, a, b, x, s, t) {
      a = add32(add32(a, q), add32(x, t));
      return add32((a << s) | (a >>> (32 - s)), b);
    }
    function ff(a, b, c, d, x, s, t) { return cmn((b & c) | ((~b) & d), a, b, x, s, t); }
    function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & (~d)), a, b, x, s, t); }
    function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
    function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | (~d)), a, b, x, s, t); }
    function md5blk(s) {
      const md5blks = [];
      for (let i = 0; i < 64; i += 4) {
        md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
      }
      return md5blks;
    }
    function md5blk_array(a) {
      return [...a];
    }
    function md51(s) {
      s = Array.from(new TextEncoder().encode(s), b => String.fromCharCode(b)).join('');
      const n = s.length;
      const state = [1732584193, -271733879, -1732584194, 271733878];
      let i;
      for (i = 64; i <= n; i += 64) {
        md5cycle(state, md5blk(s.substring(i - 64, i)));
      }
      s = s.substring(i - 64);
      const tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      for (i = 0; i < s.length; i++) tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
      tail[i >> 2] |= 0x80 << ((i % 4) << 3);
      if (i > 55) {
        md5cycle(state, md5blk_array(tail));
        for (i = 0; i < 16; i++) tail[i] = 0;
      }
      tail[14] = n * 8;
      md5cycle(state, tail);
      return state;
    }
    function add32(a, b) { return (a + b) & 0xFFFFFFFF; }
    function hex_chr(c) {
      const hex = '0123456789abcdef';
      return hex.charAt((c >> 4) & 0x0F) + hex.charAt(c & 0x0F);
    }
    function rhex(n) {
      let s = '';
      for (let j = 0; j <= 3; j++) s += hex_chr((n >> (j * 8)) & 0xFF);
      return s;
    }
    function hex(x) {
      let s = '';
      for (let i = 0; i < x.length; i++) s += rhex(x[i]);
      return s;
    }
    return hex(md51(string));
  }
}

export { BaiduTranslator };
