// 用假的 Google 回應測試伺服端函式（不需要真的金鑰，也不會連網）。
const assert = require('node:assert/strict');
const place = require('../api/place');
const photo = require('../api/photo');
const check = require('../api/check');

function mockRes() {
  return {
    statusCode: 200, headers: {}, body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(b = '') { this.body = b; },
    json() { return JSON.parse(this.body); },
  };
}
async function run(fn, query) {
  const res = mockRes();
  await fn({ query }, res);
  return res;
}

let calls = [];
function mockFetch(handler) {
  global.fetch = async (url, opts) => {
    calls.push({ url: String(url), opts });
    const [status, body] = handler(String(url), opts);
    return { ok: status < 400, status, json: async () => body };
  };
}

(async () => {
  // 沒設定金鑰 → 503，且不呼叫 Google
  delete process.env.GOOGLE_PLACES_API_KEY;
  mockFetch(() => { throw new Error('不應呼叫'); });
  assert.equal((await run(place, { id: 'mizue' })).statusCode, 503);
  assert.equal((await run(photo, { name: 'places/a/photos/b' })).statusCode, 503);
  assert.equal((await run(check, {})).statusCode, 503);

  process.env.GOOGLE_PLACES_API_KEY = 'test-key';

  // 不在資料檔裡的 id → 404，不呼叫 Google
  assert.equal((await run(place, { id: 'evil query' })).statusCode, 404);
  assert.equal(calls.length, 0);

  // 以店名＋地址搜尋，回傳照片與拍攝者
  mockFetch((url, opts) => [200, {
    places: [{
      id: 'PID1', displayName: { text: 'Mizue' }, formattedAddress: '台北市松山區',
      googleMapsUri: 'https://maps.google.com/?cid=1',
      photos: [{ name: 'places/PID1/photos/PH1', widthPx: 800, heightPx: 600, authorAttributions: [{ displayName: '王小明', uri: 'https://maps.google.com/u/1' }] }],
    }],
  }]);
  let res = await run(place, { id: 'mizue' });
  assert.equal(res.statusCode, 200);
  const d = res.json();
  assert.equal(d.placeId, 'PID1');
  assert.equal(d.photos[0].authors[0].name, '王小明');
  const c = calls.at(-1);
  assert.match(c.url, /places:searchText/);
  assert.equal(c.opts.headers['X-Goog-Api-Key'], 'test-key');
  assert.match(JSON.parse(c.opts.body).textQuery, /Mizue .*敦化北路139號/);
  assert.ok(!res.body.includes('test-key'), '金鑰不可出現在回應中');

  // Google 錯誤 → 502 並附中文提示
  mockFetch(() => [403, { error: { status: 'PERMISSION_DENIED', message: 'Places API (New) has not been used in project 123 before or it is disabled.' } }]);
  res = await run(place, { id: 'mizue' });
  assert.equal(res.statusCode, 502);
  assert.match(res.json().hint, /啟用/);
  res = await run(check, {});
  assert.equal(res.json().ok, false);
  assert.match(res.json().message, /Places API \(New\)/);

  // 照片：格式不對 → 400；正確 → 302 轉址到 Google 的暫時網址
  assert.equal((await run(photo, { name: '../../etc' })).statusCode, 400);
  mockFetch((url) => [200, { photoUri: 'https://lh3.googleusercontent.com/x' }]);
  res = await run(photo, { name: 'places/PID1/photos/PH1', w: '99999' });
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.location, 'https://lh3.googleusercontent.com/x');
  assert.match(calls.at(-1).url, /maxWidthPx=1600/);
  assert.match(calls.at(-1).url, /skipHttpRedirect=true/);

  // 金鑰檢查成功
  mockFetch(() => [200, { places: [{ id: 'X' }] }]);
  res = await run(check, {});
  assert.equal(res.json().ok, true);
  assert.equal(calls.at(-1).opts.headers['X-Goog-FieldMask'], 'places.id');

  console.log('全部測試通過');
})().catch((e) => { console.error(e); process.exit(1); });
