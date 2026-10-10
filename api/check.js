// GET /api/check          → 檢查金鑰是否可用（只查 Place ID，屬最便宜的查詢）
// GET /api/check?list=1   → 列出每家店在 Google 地圖上比對到的地點，用來人工確認後把 Place ID 寫回資料檔
const { restaurants } = require('../public/data/restaurants.json');
const { call, apiKey, hint } = require('./_lib/google');

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data, null, 2));
}

module.exports = async (req, res) => {
  if (!apiKey()) {
    return send(res, 503, {
      ok: false,
      message: '主機上找不到環境變數 GOOGLE_PLACES_API_KEY。請在 Vercel 的 Settings → Environment Variables 新增後，重新部署。',
    });
  }

  if (!req.query.list) {
    try {
      const data = await call('/places:searchText', {
        method: 'POST',
        fieldMask: 'places.id',
        body: { textQuery: '台北101', regionCode: 'TW', pageSize: 1 },
      });
      const ok = Boolean(data.places && data.places.length);
      return send(res, 200, { ok, message: ok ? '金鑰可以正常使用 Places API (New)。' : 'Google 有回應但沒有結果，請把這個畫面截圖給我。' });
    } catch (err) {
      return send(res, 200, { ok: false, message: hint(err) || '呼叫失敗，請把這個畫面截圖給我。', google: `${err.status} ${err.googleStatus} ${err.message}` });
    }
  }

  const results = [];
  for (const r of restaurants) {
    if (r.placeId) {
      results.push({ id: r.id, name: r.name, placeId: r.placeId, status: '已確認' });
      continue;
    }
    try {
      const data = await call('/places:searchText', {
        method: 'POST',
        fieldMask: 'places.id,places.displayName,places.formattedAddress',
        body: { textQuery: [r.name, r.addr || `${r.city}${r.area}`].filter(Boolean).join(' '), languageCode: 'zh-TW', regionCode: 'TW', pageSize: 1 },
      });
      const p = (data.places || [])[0];
      results.push(
        p
          ? { id: r.id, name: r.name, matchedName: p.displayName && p.displayName.text, matchedAddress: p.formattedAddress, placeId: p.id, status: '待確認' }
          : { id: r.id, name: r.name, status: '找不到' }
      );
    } catch (err) {
      results.push({ id: r.id, name: r.name, status: '錯誤', message: hint(err) || err.message });
    }
  }
  send(res, 200, { ok: true, results });
};
