const COOKIE_NAME = 'coolpath_access';
const ACCESS_PARAM = 'access';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const encoder = new TextEncoder();

function base64Url(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return base64Url(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
}

function readCookie(request, name) {
  const cookieHeader = request.headers.get('cookie') || '';
  const cookie = cookieHeader
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : '';
}

function securityHeaders(extraHeaders = {}) {
  return {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/html; charset=utf-8',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    ...extraHeaders,
  };
}

function blockedResponse(message, status = 401) {
  return new Response(
    `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CoolPath AI 접근 제한</title>
    <style>
      :root { color-scheme: dark; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { min-height: 100vh; margin: 0; display: grid; place-items: center; background: #0f1220; color: #f8fafc; }
      main { width: min(88vw, 420px); padding: 28px; border: 1px solid rgba(255,255,255,.14); border-radius: 24px; background: rgba(255,255,255,.06); box-shadow: 0 22px 80px rgba(0,0,0,.32); }
      h1 { margin: 0 0 10px; font-size: 24px; }
      p { margin: 0; color: #cbd5e1; line-height: 1.65; }
    </style>
  </head>
  <body>
    <main>
      <h1>접근이 제한된 CoolPath AI입니다</h1>
      <p>${message}</p>
    </main>
  </body>
</html>`,
    { status, headers: securityHeaders() },
  );
}

async function createSessionCookie(secret) {
  const issuedAt = String(Date.now());
  const signature = await sign(issuedAt, secret);
  return `${issuedAt}.${signature}`;
}

async function hasValidSession(request, secret) {
  const cookieValue = readCookie(request, COOKIE_NAME);
  const [issuedAt, signature] = cookieValue.split('.');

  if (!issuedAt || !signature) return false;

  const issuedAtNumber = Number(issuedAt);
  if (!Number.isFinite(issuedAtNumber)) return false;

  const ageSeconds = Math.floor((Date.now() - issuedAtNumber) / 1000);
  if (ageSeconds < 0 || ageSeconds > SESSION_TTL_SECONDS) return false;

  const expectedSignature = await sign(issuedAt, secret);
  return timingSafeEqual(signature, expectedSignature);
}

export default async function middleware(request) {
  const url = new URL(request.url);

  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    return undefined;
  }

  const accessToken = process.env.COOLPATH_ACCESS_TOKEN || process.env.COOLPATH_ACCESS_CODE || '';

  if (!accessToken || accessToken.length < 24) {
    return blockedResponse('서버 접근 토큰이 아직 설정되지 않았습니다. Vercel 환경변수 COOLPATH_ACCESS_TOKEN을 24자 이상 랜덤 값으로 설정해 주세요.', 503);
  }

  const suppliedToken = url.searchParams.get(ACCESS_PARAM);
  if (suppliedToken) {
    if (!timingSafeEqual(suppliedToken, accessToken)) {
      return blockedResponse('접근 링크가 올바르지 않습니다. 팀에서 공유한 최신 링크를 사용해 주세요.');
    }

    url.searchParams.delete(ACCESS_PARAM);
    return new Response(null, {
      status: 302,
      headers: {
        Location: url.toString(),
        'Set-Cookie': `${COOKIE_NAME}=${encodeURIComponent(await createSessionCookie(accessToken))}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`,
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
      },
    });
  }

  if (await hasValidSession(request, accessToken)) {
    return undefined;
  }

  return blockedResponse('팀에서 공유받은 전용 접근 링크로 접속해야 합니다.');
}
