// 上傳密碼：存在 Vercel 環境變數 UPLOAD_PASSWORD。只有上傳、刪除菜單照片時需要，瀏覽網站不用。
// （整站密碼鎖是另一個獨立的 SITE_PASSWORD，見 middleware.js，目前未啟用。）
const crypto = require('node:crypto');

function uploadPassword() {
  return (process.env.UPLOAD_PASSWORD || '').trim();
}

function isOwner(req) {
  const expected = uploadPassword();
  if (!expected) return false; // 沒設定密碼時一律不允許修改
  let given = '';
  try {
    given = decodeURIComponent(String(req.headers['x-upload-password'] || '')); // 前端會編碼，讓中文密碼也能用
  } catch {
    return false;
  }
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { uploadPassword, isOwner };
