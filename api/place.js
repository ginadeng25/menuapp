// GET /api/place?id=<店家 id>
// 只接受資料檔裡的店家 id，不接受任意查詢字串，避免金鑰被拿去查別的地方。
const { restaurants } = require('../public/data/restaurants.json');
const { call, apiKey, hint } = require('./_lib/google');

const FIELDS = ['id', 'displayName', 'formattedAddress', 'googleMapsUri', 'photos'];
const MAX_PHOTOS = 6;

function send(res, status, data, cache = 'no-store') {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache);
  res.end(JSON.stringify(data));
}

async function findPlace(r) {
  // 已確認的 Place ID 可以長期保存（Google 允許），直接用它查詢；否則以店名＋地址搜尋。
  if (r.placeId) {
    return call(`/places/${encodeURIComponent(r.placeId)}`, {
      fieldMask: FIELDS.join(','),
      query: { languageCode: 'zh-TW', regionCode: 'TW' },
    });
  }
  const textQuery = [r.name, r.addr || `${r.city}${r.area}`].filter(Boolean).join(' ');
  const data = await call('/places:searchText', {
    method: 'POST',
    fieldMask: FIELDS.map((f) => `places.${f}`).join(','),
    body: { textQuery, languageCode: 'zh-TW', regionCode: 'TW', pageSize: 1 },
  });
  return (data.places || [])[0] || null;
}

module.exports = async (req, res) => {
  if (!apiKey()) return send(res, 503, { error: 'not_configured' });
  const r = restaurants.find((x) => x.id === req.query.id);
  if (!r) return send(res, 404, { error: 'unknown_restaurant' });

  try {
    const place = await findPlace(r);
    if (!place) return send(res, 200, { found: false });
    send(
      res,
      200,
      {
        found: true,
        pinned: Boolean(r.placeId),
        placeId: place.id,
        matchedName: (place.displayName && place.displayName.text) || '',
        matchedAddress: place.formattedAddress || '',
        mapsUrl: place.googleMapsUri || '',
        // 照片名稱會過期，不可長期保存，所以每次即時查詢；只在瀏覽器短暫快取。
        photos: (place.photos || []).slice(0, MAX_PHOTOS).map((p) => ({
          name: p.name,
          width: p.widthPx,
          height: p.heightPx,
          authors: (p.authorAttributions || []).map((a) => ({ name: a.displayName, uri: a.uri })),
        })),
      },
      'private, max-age=600'
    );
  } catch (err) {
    console.error('place lookup failed', r.id, err.status, err.message);
    send(res, 502, { error: 'google_error', hint: hint(err) });
  }
};
