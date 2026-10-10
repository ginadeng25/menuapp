// Google Places API (New) 的共用呼叫邏輯。金鑰只從主機環境變數讀取，不會傳到瀏覽器。
const BASE = 'https://places.googleapis.com/v1';

function apiKey() {
  return (process.env.GOOGLE_PLACES_API_KEY || '').trim();
}

class GoogleError extends Error {
  constructor(status, body) {
    const g = (body && body.error) || {};
    super(g.message || `Google 回應 ${status}`);
    this.status = status;
    this.googleStatus = g.status || '';
  }
}

async function call(path, { method = 'GET', fieldMask, body, query } = {}) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);
  const headers = { 'X-Goog-Api-Key': apiKey() };
  if (fieldMask) headers['X-Goog-FieldMask'] = fieldMask;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new GoogleError(res.status, data);
  return data;
}

// 把 Google 的英文錯誤轉成看得懂的中文提示。
function hint(err) {
  const m = `${err.googleStatus} ${err.message}`;
  if (/API key not valid|API_KEY_INVALID/i.test(m)) return '金鑰無效：請確認環境變數貼上的是完整金鑰，前後沒有空白。';
  if (/has not been used|is disabled|SERVICE_DISABLED/i.test(m)) return '這個 Google Cloud 專案還沒啟用「Places API (New)」。請到 API 程式庫搜尋並啟用（注意不是舊版 Places API）。';
  if (/billing/i.test(m)) return '這個 Google Cloud 專案還沒綁定帳單帳戶，Places API 必須啟用計費才能使用。';
  if (/referer|referrer/i.test(m)) return '金鑰設了「HTTP 參照網址」限制。伺服端呼叫不會帶網址，請改成「不限制應用程式」並只限制可用的 API 為 Places API (New)。';
  if (/blocked|API_KEY_SERVICE_BLOCKED/i.test(m)) return '金鑰的「API 限制」沒有勾選 Places API (New)。';
  if (/quota|RESOURCE_EXHAUSTED/i.test(m)) return '已達配額上限，請稍後再試或到 Google Cloud 調整配額。';
  return '';
}

module.exports = { call, apiKey, hint, GoogleError };
