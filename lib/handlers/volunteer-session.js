const { neon } = require('@neondatabase/serverless');
const { withApi, json } = require('../api-guard');
const auth = require('../volunteer-auth');
exports.handler = withApi('volunteer-session', async event => {
  const sql = neon(process.env.DATABASE_URL);
  if (event.httpMethod === 'DELETE') {
    await auth.logout(sql, event);
    return json(200, {ok:true}, {'Set-Cookie':auth.cookie(event)});
  }
  if (event.httpMethod === 'GET') {
    const user = await auth.actor(sql, event);
    return json(200, {authenticated:!!user, user});
  }
  const bonusId = (event.payload.bonusId || '').trim().toUpperCase();
  const password = event.payload.password || '';
  if (!bonusId || !password.trim()) return json(400, {error:'Wpisz identyfikator bonusu i swoje imię jako hasło.'});
  const user = await auth.login(sql, event, bonusId, password);
  if (user?.limited) return json(429, {error:'Zbyt wiele prób logowania. Spróbuj ponownie za kilka minut.'}, {'Retry-After':String(user.retry)});
  if (!user) return json(401, {error:'Nieprawidłowy identyfikator lub imię. Sprawdź przypisanie u organizatora.'});
  return json(200, {authenticated:true,user:{role:'volunteer',bonusId:user.bonusId,name:user.name}}, {'Set-Cookie':auth.cookie(event,user.token)});
});
