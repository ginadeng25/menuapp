// 你上傳的菜單照片，存在 Vercel Blob（私人儲存空間，不公開）。
// GET    /api/menus?id=店家id              → 列出這家店的菜單照片
// POST   /api/menus?id=店家id   (圖片內容) → 上傳一張
// DELETE /api/menus?id=店家id&path=...      → 刪除一張
// 有設定 UPLOAD_PASSWORD 時，上傳與刪除需要密碼；沒設定時任何人都能上傳（目前的個人使用模式）。
const { list, put, del } = require('@vercel/blob');
const { restaurants } = require('../public/data/restaurants.json');
const { isOwner, uploadPassword } = require('./_lib/auth');

const MAX_PER_SHOP = 30; // 每家店最多幾張，避免被亂傳塞爆空間
const MAX_BYTES = 4 * 1024 * 1024; // Vercel 函式單次上限約 4.5MB；瀏覽器會先壓縮到這以下
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// 連接 Blob 後，Vercel 會加上 BLOB_READ_WRITE_TOKEN（舊式）或 BLOB_STORE_ID（新式，搭配自動提供的 OIDC 憑證）。
const hasStorage = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('too_large'), { code: 'too_large' });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function storageHint(err) {
  const m = String(err && err.message);
  if (/credentials|token|BLOB_READ_WRITE_TOKEN|BLOB_STORE_ID/i.test(m)) return '還沒連接 Vercel Blob 儲存空間：到 Vercel 專案的 Storage 建立 Blob（選 Private）並連接到這個專案，再重新部署。';
  if (/access|public|private/i.test(m)) return 'Blob 儲存空間的存取類型不符：請建立「Private」類型的 Blob 儲存空間。';
  return '';
}

module.exports = async (req, res) => {
  const id = String(req.query.id || '');
  if (!restaurants.some((r) => r.id === id)) return send(res, 404, { error: 'unknown_restaurant' });
  const prefix = `menus/${id}/`;
  const needsPassword = Boolean(uploadPassword());

  try {
    if (req.method === 'GET') {
      if (!hasStorage()) return send(res, 200, { photos: [], storage: false, needsPassword });
      const { blobs } = await list({ prefix, limit: 100 });
      const photos = blobs
        .sort((a, b) => new Date(a.uploadedAt) - new Date(b.uploadedAt))
        .map((b) => ({ path: b.pathname, uploadedAt: b.uploadedAt }));
      return send(res, 200, { photos, storage: true, needsPassword, max: MAX_PER_SHOP });
    }

    if (req.method === 'POST' || req.method === 'DELETE') {
      if (needsPassword && !isOwner(req)) return send(res, 401, { error: 'unauthorized', hint: '上傳密碼不正確。' });
    }

    if (req.method === 'POST') {
      const type = String(req.headers['content-type'] || '').split(';')[0].trim();
      if (!TYPES[type]) return send(res, 415, { error: 'bad_type', hint: '只接受 JPG、PNG、WebP 圖片。' });
      const { blobs } = await list({ prefix, limit: 100 });
      if (blobs.length >= MAX_PER_SHOP) return send(res, 409, { error: 'full', hint: `每家店最多 ${MAX_PER_SHOP} 張，請先刪除不需要的照片。` });
      const body = await readBody(req, MAX_BYTES);
      if (!body.length) return send(res, 400, { error: 'empty' });
      const blob = await put(`${prefix}${Date.now()}.${TYPES[type]}`, body, {
        access: 'private',
        contentType: type,
        addRandomSuffix: true,
      });
      return send(res, 201, { path: blob.pathname });
    }

    if (req.method === 'DELETE') {
      const path = String(req.query.path || '');
      if (!path.startsWith(prefix) || path.includes('..')) return send(res, 400, { error: 'bad_path' });
      await del(path);
      return send(res, 200, { ok: true });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    send(res, 405, { error: 'method_not_allowed' });
  } catch (err) {
    if (err.code === 'too_large') return send(res, 413, { error: 'too_large', hint: '照片太大（上限 4MB）。' });
    console.error('menus failed', req.method, id, err.message);
    send(res, 500, { error: 'storage_error', hint: storageHint(err) || '儲存空間發生錯誤，請稍後再試。' });
  }
};
