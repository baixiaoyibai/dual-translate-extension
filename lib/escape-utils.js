// lib/escape-utils.js
// 共用 HTML 转义工具，供 options.html / popup.html 加载
// IIFE 模式挂 window.escapeAttr 全局
// 内容脚本 (content.js) 不能用此文件 (MV3 content script 不支持 import ESM,
//   也不通过 <script> 加载页面 script); content.js 用内联版本
//
// 防御深度: options.js / popup.js 调用前应先检查 typeof window.escapeAttr === 'function',
//   加载失败时回退到内联实现

(function(global) {
  'use strict';

  function escapeAttr(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  global.escapeAttr = escapeAttr;
})(typeof window !== 'undefined' ? window : self);
