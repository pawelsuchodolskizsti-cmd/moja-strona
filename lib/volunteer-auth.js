const crypto = require('node:crypto');
const { readHeader } = require('./admin-auth');
const { ensureVolunteerSchema } = require('./volunteer-schema');
const COOKIE = 'qr_volunteer_session';
const HOURS = 12;
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
function derive(name, salt) {
  const normalized = String(name).trim().replace(/\s+/g, ' ').toLocaleLowerCase('pl');
  return new Promise((resolve,reject) => crypto.scrypt(normalized,salt,64,(error,key) => error ? reject(error) : resolve(key)));
}
async function passwordHash(name) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + (await derive(name,salt)).toString('hex');
}
async function validPassword(name, encoded) {
  if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(encoded || '')) return false;
  const [salt,digest] = encoded.split(':');
  return crypto.timingSafeEqual(await derive(name,salt),Buffer.from(digest,'hex'));
}
function tokenFrom(event) {
  return readHeader(event.headers, 'cookie').split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1) || '';
}
function cookie(event, token = '') {
  const secure = readHeader(event.headers, 'x-forwarded-proto').split(',')[0].trim() === 'https' || process.env.VERCEL === '1';
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token ? HOURS * 3600 : 0}${secure ? '; Secure' : ''}`;
}
async function actor(sql, event) {
  const token = tokenFrom(event);
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  await ensureVolunteerSchema(sql);
  const rows = await sql`SELECT a.bonus_id AS "bonusId", a.name FROM volunteer_sessions s
    JOIN volunteer_accounts a ON a.bonus_id=s.bonus_id AND a.revision=s.account_revision AND a.enabled
    WHERE s.token_hash=${hash(token)} AND s.expires_at>NOW()`;
  return rows[0] ? {role:'volunteer', ...rows[0]} : null;
}
async function login(sql, event, bonusId, password) {
  await ensureVolunteerSchema(sql);
  // This database-backed limit also applies across separate Vercel instances.
  const bucket = hash('volunteer-login:' + (readHeader(event.headers, 'x-forwarded-for').split(',')[0].trim() || 'unknown'));
  const [rate] = await sql`INSERT INTO volunteer_login_attempts(bucket,attempts,expires_at)
    VALUES(${bucket},1,NOW()+INTERVAL '10 minutes') ON CONFLICT(bucket) DO UPDATE SET
    attempts=CASE WHEN volunteer_login_attempts.expires_at<=NOW() THEN 1 ELSE volunteer_login_attempts.attempts+1 END,
    expires_at=CASE WHEN volunteer_login_attempts.expires_at<=NOW() THEN NOW()+INTERVAL '10 minutes' ELSE volunteer_login_attempts.expires_at END
    RETURNING attempts, GREATEST(1,CEIL(EXTRACT(EPOCH FROM expires_at-NOW())))::int AS retry`;
  if (rate.attempts > 30) return {limited:true, retry:rate.retry};
  const [account] = await sql`SELECT bonus_id, name, revision, password_hash FROM volunteer_accounts
    WHERE bonus_id=${bonusId} AND enabled`;
  if (!account || !await validPassword(password,account.password_hash)) return null;
  const token = crypto.randomBytes(32).toString('hex');
  const result = await sql`INSERT INTO volunteer_sessions(token_hash,bonus_id,account_revision,expires_at)
    SELECT ${hash(token)},bonus_id,revision,NOW()+INTERVAL '12 hours' FROM volunteer_accounts
    WHERE bonus_id=${account.bonus_id} AND enabled AND revision=${account.revision} RETURNING bonus_id`;
  if (!result.length) return null;
  await sql`DELETE FROM volunteer_sessions WHERE expires_at<NOW()`;
  await sql`DELETE FROM volunteer_login_attempts WHERE expires_at<NOW()`;
  return {token, bonusId:account.bonus_id, name:account.name};
}
async function logout(sql, event) {
  await ensureVolunteerSchema(sql);
  await sql`DELETE FROM volunteer_sessions WHERE token_hash=${hash(tokenFrom(event))}`;
}
module.exports = { actor, login, logout, cookie, passwordHash };
