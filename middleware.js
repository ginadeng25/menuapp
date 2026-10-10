// 整站密碼鎖：在 Vercel 設定環境變數 SITE_PASSWORD 後生效，打開網站會先要求輸入密碼（帳號隨意填）。
// 沒設定 SITE_PASSWORD 時網站維持公開，但上傳與刪除功能會停用。
import { next } from '@vercel/functions';

export const config = { matcher: '/:path*' };

function unauthorized() {
  return new Response('需要密碼才能瀏覽這個網站。', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="menuapp", charset="UTF-8"',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

export default function middleware(request) {
  const expected = (process.env.SITE_PASSWORD || '').trim();
  if (!expected) return next();

  const h = request.headers.get('authorization') || '';
  if (!h.startsWith('Basic ')) return unauthorized();
  let decoded = '';
  try {
    decoded = new TextDecoder().decode(Uint8Array.from(atob(h.slice(6)), (c) => c.charCodeAt(0)));
  } catch {
    return unauthorized();
  }
  const password = decoded.slice(decoded.indexOf(':') + 1);
  return password === expected ? next() : unauthorized();
}
