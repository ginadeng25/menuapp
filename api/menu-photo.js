// GET /api/menu-photo?path=menus/<店家id>/<檔名>
// 從私人 Blob 讀出照片給網站顯示；照片沒有公開網址，只能經由這裡（在網站密碼鎖之後）看到。
const { Readable } = require('node:stream');
const { get } = require('@vercel/blob');

const PATH_RE = /^menus\/[a-z0-9-]+\/[A-Za-z0-9._-]+$/;

module.exports = async (req, res) => {
  const path = String(req.query.path || '');
  if (!PATH_RE.test(path)) {
    res.statusCode = 400;
    return res.end();
  }
  try {
    const result = await get(path, { access: 'private' });
    if (!result || !result.stream) {
      res.statusCode = 404;
      return res.end();
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', result.blob.contentType || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    Readable.fromWeb(result.stream).pipe(res);
  } catch (err) {
    console.error('menu-photo failed', path, err.message);
    res.statusCode = 502;
    res.end();
  }
};
