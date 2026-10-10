// GET /api/photo?name=places/<id>/photos/<ref>&w=800
// 向 Google 取得照片的暫時網址後轉址過去；金鑰不會出現在瀏覽器，照片也不存進我們的主機。
const { call, apiKey } = require('./_lib/google');

const NAME_RE = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

module.exports = async (req, res) => {
  const name = String(req.query.name || '');
  const w = Math.min(Math.max(parseInt(req.query.w, 10) || 800, 100), 1600);
  if (!apiKey()) {
    res.statusCode = 503;
    return res.end();
  }
  if (!NAME_RE.test(name)) {
    res.statusCode = 400;
    return res.end();
  }
  try {
    const data = await call(`/${name}/media`, {
      query: { maxWidthPx: String(w), skipHttpRedirect: 'true' },
    });
    if (!data.photoUri) throw new Error('沒有 photoUri');
    res.statusCode = 302;
    res.setHeader('Location', data.photoUri);
    res.setHeader('Cache-Control', 'private, max-age=600');
    res.end();
  } catch (err) {
    console.error('photo failed', err.status, err.message);
    res.statusCode = 502;
    res.end();
  }
};
