// 測試菜單照片上傳／刪除與整站密碼鎖（用假的儲存空間，不會連網）。
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');

const store = new Map();
const fakeBlob = {
  async list({ prefix }) {
    return { blobs: [...store.values()].filter((b) => b.pathname.startsWith(prefix)) };
  },
  async put(pathname, body, opts) {
    assert.equal(opts.access, 'private');
    const p = pathname.replace(/(\.\w+)$/, `-rand$1`);
    store.set(p, { pathname: p, uploadedAt: new Date(), body, contentType: opts.contentType });
    return { pathname: p };
  },
  async del(path) { store.delete(path); },
  async get(path) {
    const b = store.get(path);
    return b ? { stream: Readable.toWeb(Readable.from([b.body])), blob: { contentType: b.contentType } } : null;
  },
};
require.cache[require.resolve('@vercel/blob')] = { id: '@vercel/blob', loaded: true, exports: fakeBlob };
const menus = require('../api/menus');
const menuPhoto = require('../api/menu-photo');

const basic = (pw) => `Basic ${Buffer.from(`me:${pw}`).toString('base64')}`;
const up = (pw) => ({ 'x-upload-password': encodeURIComponent(pw) });
function req({ method = 'GET', query = {}, headers = {}, body }) {
  const r = Readable.from(body ? [body] : []);
  return Object.assign(r, { method, query, headers });
}
function res() {
  const chunks = [];
  const { Writable } = require('node:stream');
  const w = new Writable({ write(c, _e, cb) { chunks.push(c); cb(); } });
  return Object.assign(w, {
    statusCode: 200, headers: {},
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(b) { if (b) chunks.push(Buffer.from(b)); Writable.prototype.end.call(this); },
    text() { return Buffer.concat(chunks).toString(); },
    json() { return JSON.parse(this.text()); },
    buf() { return Buffer.concat(chunks); },
  });
}
async function run(fn, opts) {
  const r = res();
  const done = new Promise((ok) => r.on('finish', ok));
  await fn(req(opts), r);
  await done;
  return r;
}

(async () => {
  // 新式連接只有 BLOB_STORE_ID 也要認得儲存空間
  delete process.env.BLOB_READ_WRITE_TOKEN;
  process.env.BLOB_STORE_ID = 'store_fake';
  assert.equal((await run(menus, { query: { id: 'mizue' } })).json().storage, true);
  delete process.env.BLOB_STORE_ID;
  assert.equal((await run(menus, { query: { id: 'mizue' } })).json().storage, false);
  process.env.BLOB_READ_WRITE_TOKEN = 'fake';
  delete process.env.SITE_PASSWORD;
  delete process.env.UPLOAD_PASSWORD;
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

  // 沒設上傳密碼：可以看，但不能上傳
  let r = await run(menus, { query: { id: 'mizue' } });
  assert.deepEqual(r.json(), { photos: [], storage: true, uploadEnabled: false });
  r = await run(menus, { method: 'POST', query: { id: 'mizue' }, headers: { 'content-type': 'image/jpeg' }, body: jpg });
  assert.equal(r.statusCode, 403);

  process.env.UPLOAD_PASSWORD = 'sushi123';
  // 網站密碼鎖未啟用，也不影響上傳密碼
  // 密碼錯誤或沒帶密碼 → 401
  r = await run(menus, { method: 'POST', query: { id: 'mizue' }, headers: { 'content-type': 'image/jpeg', ...up('wrong') }, body: jpg });
  assert.equal(r.statusCode, 401);
  // 不存在的店 → 404
  r = await run(menus, { method: 'POST', query: { id: 'nope' }, headers: { ...up('sushi123') }, body: jpg });
  assert.equal(r.statusCode, 404);
  // 非圖片 → 415
  r = await run(menus, { method: 'POST', query: { id: 'mizue' }, headers: { 'content-type': 'text/html', ...up('sushi123') }, body: jpg });
  assert.equal(r.statusCode, 415);
  // 太大 → 413
  r = await run(menus, { method: 'POST', query: { id: 'mizue' }, headers: { 'content-type': 'image/jpeg', ...up('sushi123') }, body: Buffer.alloc(4 * 1024 * 1024 + 1) });
  assert.equal(r.statusCode, 413);

  // 中文密碼也可以
  process.env.UPLOAD_PASSWORD = '壽司';
  r = await run(menus, { method: 'POST', query: { id: 'mizue' }, headers: { 'content-type': 'image/jpeg', ...up('壽司') }, body: jpg });
  assert.equal(r.statusCode, 201);
  store.clear();
  process.env.UPLOAD_PASSWORD = 'sushi123';

  // 正確密碼 → 上傳成功、列得出來、讀得到內容
  r = await run(menus, { method: 'POST', query: { id: 'mizue' }, headers: { 'content-type': 'image/jpeg', ...up('sushi123') }, body: jpg });
  assert.equal(r.statusCode, 201);
  const path = r.json().path;
  assert.match(path, /^menus\/mizue\/\d+-rand\.jpg$/);
  r = await run(menus, { query: { id: 'mizue' }, headers: { ...up('sushi123') } });
  assert.equal(r.json().uploadEnabled, true);
  assert.equal(r.json().photos[0].path, path);
  r = await run(menus, { query: { id: 'blu-koi' } });
  assert.equal(r.json().photos.length, 0, '其他店不應看到這張');
  r = await run(menuPhoto, { query: { path } });
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers['content-type'], 'image/jpeg');
  assert.deepEqual(r.buf(), jpg);
  assert.equal((await run(menuPhoto, { query: { path: '../secret' } })).statusCode, 400);

  // 刪除：不能刪別家店的路徑；正確的可以刪
  r = await run(menus, { method: 'DELETE', query: { id: 'blu-koi', path }, headers: { ...up('sushi123') } });
  assert.equal(r.statusCode, 400);
  r = await run(menus, { method: 'DELETE', query: { id: 'mizue', path }, headers: { ...up('sushi123') } });
  assert.equal(r.statusCode, 200);
  assert.equal(store.size, 0);

  // 整站密碼鎖（設定 SITE_PASSWORD 才啟用）
  process.env.SITE_PASSWORD = 'sushi123';
  const { default: middleware } = await import('../middleware.js');
  const mw = (auth) => middleware(new Request('https://x/', { headers: auth ? { authorization: auth } : {} }));
  assert.equal(mw().status, 401);
  assert.match(mw().headers.get('www-authenticate'), /^Basic/);
  assert.equal(mw(basic('wrong')).status, 401);
  assert.notEqual(mw(basic('sushi123')).status, 401);
  assert.equal(mw(basic('sushi123')).headers.get('x-middleware-next'), '1');
  delete process.env.SITE_PASSWORD;
  assert.notEqual(mw().status, 401, '沒設密碼時網站維持公開');

  console.log('菜單照片與密碼鎖測試通過');
})().catch((e) => { console.error(e); process.exit(1); });
