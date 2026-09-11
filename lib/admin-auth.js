const crypto = require('node:crypto');
const COOKIE = 'qr_admin_session';
const SESSION_SECONDS = 8 * 60 * 60;
function readHeader(headers, name) {
  const key = Object.keys(headers || {}).find(key => key.toLowerCase() === name.toLowerCase());
  return key ? String(headers[key]) : '';
}
function same(a, b) {
  const left = crypto.createHash('sha256').update(String(a)).digest();
  const right = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(left, right);
}
function configured() { return Boolean(process.env.ADMIN_PASSWORD); }
function signature(payload) {
  return crypto.createHmac('sha256', process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || '')
    .update(payload + ':' + (process.env.ADMIN_LOGIN || 'admin') + ':' + process.env.ADMIN_PASSWORD).digest('base64url');
}
function validCredentials(login, password) {
  return configured() && same(login, process.env.ADMIN_LOGIN || 'admin') && same(password, process.env.ADMIN_PASSWORD);
}
function isAdminAuthorized(event) {
  if (!configured()) return false;
  const token = readHeader(event.headers, 'cookie').split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1) || '';
  const [payload, sig, extra] = token.split('.');
  if (!payload || !sig || extra || !same(sig, signature(payload))) return false;
  try { const data = JSON.parse(Buffer.from(payload, 'base64url')); return Number.isFinite(data.expires) && data.expires > Date.now(); } catch { return false; }
}
function sessionCookie(event, clear = false) {
  const payload = Buffer.from(JSON.stringify({expires: Date.now() + SESSION_SECONDS * 1000, nonce: crypto.randomBytes(24).toString('hex')})).toString('base64url');
  const secure = readHeader(event.headers, 'x-forwarded-proto').split(',')[0].trim() === 'https' || process.env.VERCEL === '1';
  return `${COOKIE}=${clear ? '' : payload + '.' + signature(payload)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : SESSION_SECONDS}${secure ? '; Secure' : ''}`;
}
function unauthorizedResponse() { return {statusCode:401,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify({error:'Sesja administratora wygasła. Zaloguj się ponownie.'})}; }
module.exports = {readHeader, configured, validCredentials, isAdminAuthorized, sessionCookie, unauthorizedResponse};
