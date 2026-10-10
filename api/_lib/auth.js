// 網站密碼：存在 Vercel 環境變數 SITE_PASSWORD。整站密碼鎖（middleware.js）與上傳／刪除都用它。
const crypto = require('node:crypto');

function sitePassword() {
  return (process.env.SITE_PASSWORD || '').trim();
}

// 瀏覽器通過密碼鎖後，會在每個請求自動帶上 Authorization: Basic <帳號:密碼>。帳號不限，只比對密碼。
function passwordFrom(req) {
  const h = String(req.headers.authorization || '');
  if (!h.startsWith('Basic ')) return '';
  const decoded = Buffer.from(h.slice(6), 'base64').toString('utf8');
  return decoded.slice(decoded.indexOf(':') + 1);
}

function isOwner(req) {
  const expected = sitePassword();
  if (!expected) return false; // 沒設定密碼時一律不允許修改
  const a = Buffer.from(passwordFrom(req));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { sitePassword, isOwner };
