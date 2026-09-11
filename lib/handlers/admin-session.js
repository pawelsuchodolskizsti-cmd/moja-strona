const {withApi, json} = require('../api-guard');
const {configured, validCredentials, isAdminAuthorized, sessionCookie} = require('../admin-auth');
exports.handler = withApi('admin-session', async event => {
  if (event.httpMethod === 'DELETE') return json(200,{ok:true},{'Set-Cookie':sessionCookie(event,true)});
  if (event.httpMethod === 'GET') return json(200,{authenticated:isAdminAuthorized(event)});
  if (!configured()) return json(503,{error:'Administrator musi ustawić ADMIN_PASSWORD w konfiguracji serwera.'});
  if (!validCredentials(event.payload.login || '', event.payload.password || '')) return json(401,{error:'Nieprawidłowy login lub hasło.'});
  return json(200,{authenticated:true},{'Set-Cookie':sessionCookie(event)});
});
