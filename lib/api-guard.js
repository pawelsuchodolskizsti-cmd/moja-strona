const {isAdminAuthorized, unauthorizedResponse, readHeader} = require('./admin-auth');
function json(statusCode, data, headers = {}) { return {statusCode,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers},body:JSON.stringify(data)}; }
function withApi(name, handler) {
  const adminEndpoints = ['admin-communications','admin-history','admin-records','admin-volunteers','admin-institutions','admin-results','admin-question-catalog','admin-adjust-participant','test-mode','qr-proxy'];
  const methods = {
    'communication-consent':['POST'],'admin-communications':['GET','POST'],
    'admin-history':['GET','POST'], 'admin-records':['GET'],
    'volunteer-session':['GET','POST','DELETE'], 'volunteer-tickets':['GET','POST'], 'admin-volunteers':['GET','POST'],
    'institutions':['GET'], 'admin-institutions':['GET','POST'], 'admin-session':['GET','POST','DELETE'], 'game-state':['GET','POST'], 'login':['POST'],
    answer:['POST'], question:['GET'], bonus:['GET','POST'], 'participant-session':['GET'],
    'participant-stats':['GET'], 'public-scoreboard':['GET'], 'admin-results':['GET'],
    'admin-adjust-participant':['POST'], 'admin-question-catalog':['GET','POST'], 'test-mode':['GET','POST'], 'qr-proxy':['GET','POST']
  };
  return async event => {
    try {
      const method = event.httpMethod;
      if (!methods[name]?.includes(method)) return json(405,{error:'Niedozwolona metoda.'},{Allow:methods[name]?.join(', ')});
      if ((adminEndpoints.includes(name) || (name === 'game-state' && method !== 'GET')) && !isAdminAuthorized(event)) return unauthorizedResponse();
      if (method !== 'GET') {
        const origin = readHeader(event.headers,'origin');
        const host = readHeader(event.headers,'host');
        if (origin && host) {
          let validOrigin=false;
          try {validOrigin=new URL(origin).host===host;} catch {}
          if(!validOrigin) return json(403,{error:'Niedozwolone źródło żądania.'});
        }
      }
      for(const key of ['q','pid']) {
        const value=event.queryStringParameters?.[key];
        if(value !== undefined && (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value)<=0)) return json(400,{error:`Nieprawidłowe pole: ${key}.`});
      }
      if (method === 'POST') {
        if (Buffer.byteLength(event.body || '') > 250000) return json(413,{error:'Przesłano zbyt dużo danych.'});
        let body;
        try { body = JSON.parse(event.body || '{}'); } catch { return json(400,{error:'Nieprawidłowy format danych.'}); }
        if (!body || Array.isArray(body) || typeof body !== 'object') return json(400,{error:'Nieprawidłowy format danych.'});
        for (const key of ['firstName','lastName','city','email','deviceToken','answer','secret','bonusId','action','message','login','password']) {
          if (body[key] !== undefined && (typeof body[key] !== 'string' || body[key].length > (key === 'message' || key === 'answer' ? 4000 : 256))) return json(400,{error:`Nieprawidłowe pole: ${key}.`});
        }
        for (const key of ['participantId','questionId','institutionId']) if (body[key] !== undefined && (!/^\d+$/.test(String(body[key])) || !Number.isSafeInteger(Number(body[key])) || Number(body[key]) <= 0)) return json(400,{error:`Nieprawidłowe pole: ${key}.`});
        if (name === 'login' && !body.deviceToken?.trim()) return json(400,{error:'Brak identyfikatora urządzenia.'});
        event.payload = body;
      }
      const audited = method==='POST' && isAdminAuthorized(event) && ['admin-communications','game-state','admin-adjust-participant','admin-question-catalog','admin-institutions','admin-volunteers','test-mode','admin-history'].includes(name);
      const audit = audited ? await require('./admin-audit').begin(name,event) : null;
      let response;
      try { response = await (audit ? require('./admin-audit').run(audit,()=>handler(event)) : handler(event)); }
      catch (error) { if(audit) await require('./admin-audit').finish(audit,{statusCode:error.statusCode||500}).catch(e=>console.error('audit',e)); throw error; }
      if(audit) await require('./admin-audit').finish(audit,response).catch(e=>console.error('audit',e));
      if(name==='admin-session' && response?.statusCode===503) return response;
      if (response?.statusCode >= 500) return json(response.statusCode,{error:'Nie udało się wykonać operacji. Spróbuj ponownie.'});
      return response;
    } catch (error) {
      console.error(name, error);
      return json(error.statusCode || 500,{error:error.statusCode === 400 ? error.message : 'Nie udało się wykonać operacji. Spróbuj ponownie.'});
    }
  };
}
module.exports = {json, withApi};
