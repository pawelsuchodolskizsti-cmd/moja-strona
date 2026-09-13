const { neon } = require('@neondatabase/serverless');
const { json } = require('./api-guard');
const { actor, passwordHash } = require('./volunteer-auth');
const { ensureVolunteerSchema } = require('./volunteer-schema');
const { getQuestionCatalog } = require('./question-catalog');
const { getBonusCatalog } = require('./bonus-catalog');
function invalid(message) { const error = new Error(message); error.statusCode = 400; throw error; }
function text(value, label, max, optional = false) {
  if (typeof value !== 'string' || value.trim().length > max || (!optional && !value.trim())) invalid(`Nieprawidłowe pole: ${label}.`);
  return value.trim();
}
function id(value) {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > 2147483647) invalid('Nieprawidłowy numer zgłoszenia lub strony.');
  return Number(value);
}
function requestId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(value)) invalid('Brak identyfikatora operacji. Odśwież stronę.');
  return value;
}
function ticket(row) {
  return {id:row.id,bonusId:row.bonus_id,authorName:row.author_name,kind:row.kind,targetType:row.target_type,
    targetId:row.target_id,targetLabel:row.target_label,title:row.title,body:row.body,status:row.status,
    createdAt:row.created_at,updatedAt:row.updated_at,replyCount:Number(row.reply_count || 0)};
}
async function catalog(sql, admin) {
  const [questions, bonuses] = await Promise.all([getQuestionCatalog(sql,{includeInactive:true}),getBonusCatalog(sql,{includeInactive:true})]);
  const result = {
    questions:questions.map(q => ({id:String(q.id),label:`Pytanie ${q.id}: ${q.text}`,active:q.active,technicalBlocked:q.technicalBlocked})),
    bonuses:bonuses.map(b => ({id:b.id,label:`${b.id} · ${b.label}`,active:b.active,technicalBlocked:b.technicalBlocked}))
  };
  if (admin) result.accounts = await sql`SELECT bonus_id AS "bonusId",name,enabled,revision FROM volunteer_accounts ORDER BY bonus_id`;
  return result;
}
async function handle(event, admin = false) {
  const sql = neon(process.env.DATABASE_URL);
  const user = admin ? {role:'admin',name:'Organizator',bonusId:''} : await actor(sql,event);
  if (!user) return json(401,{error:'Sesja wolontariusza wygasła. Zaloguj się ponownie.'});
  await ensureVolunteerSchema(sql);
  const query = event.queryStringParameters || {};
  if (event.httpMethod === 'GET') {
    if (query.view === 'catalog') return json(200,await catalog(sql,admin));
    if (query.id) {
      const ticketId = id(query.id);
      const rows = await sql`SELECT * FROM volunteer_tickets WHERE id=${ticketId} AND (${admin} OR bonus_id=${user.bonusId})`;
      if (!rows.length) return json(404,{error:'Nie znaleziono zgłoszenia.'});
      const before = query.before ? id(query.before) : null;
      const messages = await sql`SELECT id,author_role AS "authorRole",author_name AS "authorName",body,created_at AS "createdAt"
        FROM volunteer_messages WHERE ticket_id=${ticketId} AND (${before}::int IS NULL OR id<${before}) ORDER BY id DESC LIMIT 51`;
      const more = messages.length > 50;
      const page = messages.slice(0,50);
      return json(200,{ticket:ticket(rows[0]),messages:page.reverse(),before:more ? page[0].id : null});
    }
    const before = query.before ? id(query.before) : null;
    const status = text(query.status || '', 'status', 20, true);
    if (status && !['open','progress','resolved'].includes(status)) invalid('Nieprawidłowy status.');
    const search = text(query.search || '', 'wyszukiwanie', 100, true);
    const bonusId = admin ? text(query.bonusId || '', 'bonus', 30, true) : user.bonusId;
    const rows = await sql`SELECT t.*, (SELECT COUNT(*)::int FROM volunteer_messages m WHERE m.ticket_id=t.id) AS reply_count
      FROM volunteer_tickets t WHERE (${admin} OR t.bonus_id=${user.bonusId})
      AND (${bonusId}='' OR t.bonus_id=${bonusId}) AND (${status}='' OR t.status=${status})
      AND (${search}='' OR POSITION(LOWER(${search}) IN LOWER(t.title || ' ' || t.body || ' ' || t.target_label))>0)
      AND (${before}::int IS NULL OR t.id<${before}) ORDER BY t.id DESC LIMIT 21`;
    const page = rows.slice(0,20);
    return json(200,{tickets:page.map(ticket),before:rows.length>20 ? page[page.length-1].id : null});
  }
  const body = event.payload;
  if (body.action === 'account') {
    if (!admin) return json(403,{error:'Tylko administrator przypisuje wolontariuszy.'});
    const bonusId = text(body.bonusId,'bonus',30).toUpperCase();
    const name = text(body.name,'imię',80).replace(/\s+/g,' ');
    if (typeof body.enabled !== 'boolean' || !Number.isSafeInteger(body.revision) || body.revision < 0) invalid('Nieprawidłowe ustawienia konta.');
    if (!(await getBonusCatalog(sql,{includeInactive:true})).some(b => b.id===bonusId)) invalid('Nie znaleziono bonusu.');
    const password = await passwordHash(name);
    const rows = await sql`INSERT INTO volunteer_accounts(bonus_id,name,password_hash,enabled)
      SELECT ${bonusId},${name},${password},${body.enabled}
      WHERE ${body.revision}=0 OR EXISTS(SELECT 1 FROM volunteer_accounts WHERE bonus_id=${bonusId})
      ON CONFLICT(bonus_id) DO UPDATE SET name=EXCLUDED.name,password_hash=EXCLUDED.password_hash,
        enabled=EXCLUDED.enabled,revision=volunteer_accounts.revision+1,updated_at=NOW()
      WHERE volunteer_accounts.revision=${body.revision}
      RETURNING bonus_id AS "bonusId",name,enabled,revision`;
    if (!rows.length) return json(409,{error:'Przypisanie zmieniło się w innym oknie. Odśwież listę i spróbuj ponownie.'});
    return json(200,{account:rows[0]});
  }
  if (body.action === 'create') {
    if (admin) return json(403,{error:'Nowe zgłoszenia tworzy wolontariusz.'});
    const title = text(body.title,'tytuł',120), content = text(body.body,'opis',4000), key = requestId(body.requestId);
    if (!['issue','question'].includes(body.kind) || !['general','question','bonus'].includes(body.targetType)) invalid('Wybierz rodzaj i temat zgłoszenia.');
    let targetId = null, targetLabel = 'Sprawa ogólna';
    if (body.targetType !== 'general') {
      targetId = text(body.targetId,'pytanie lub bonus',30);
      const options = await catalog(sql,false);
      const target = options[body.targetType==='question' ? 'questions' : 'bonuses'].find(t => t.id===targetId);
      if (!target) invalid('Wybierz istniejące pytanie lub bonus.');
      targetLabel = target.label;
    }
    const rows = await sql`INSERT INTO volunteer_tickets(bonus_id,author_name,kind,target_type,target_id,target_label,title,body,request_id)
      VALUES(${user.bonusId},${user.name},${body.kind},${body.targetType},${targetId},${targetLabel},${title},${content},${key})
      ON CONFLICT(bonus_id,request_id) DO UPDATE SET request_id=EXCLUDED.request_id
      WHERE volunteer_tickets.title=EXCLUDED.title AND volunteer_tickets.body=EXCLUDED.body
        AND volunteer_tickets.kind=EXCLUDED.kind AND volunteer_tickets.target_type=EXCLUDED.target_type
        AND volunteer_tickets.target_id IS NOT DISTINCT FROM EXCLUDED.target_id RETURNING *`;
    if (!rows.length) return json(409,{error:'Identyfikator należy już do innego zgłoszenia. Odśwież stronę.'});
    return json(200,{ticket:ticket(rows[0])});
  }
  if (body.action === 'reply') {
    const ticketId = id(body.ticketId), content = text(body.body,'odpowiedź',4000), key = requestId(body.requestId);
    const results = await sql.transaction([
      sql`INSERT INTO volunteer_messages(ticket_id,author_role,author_name,body,request_id)
        SELECT id,${user.role},${user.name},${content},${key} FROM volunteer_tickets
        WHERE id=${ticketId} AND (${admin} OR bonus_id=${user.bonusId})
        ON CONFLICT(ticket_id,author_role,request_id) DO UPDATE SET request_id=EXCLUDED.request_id
        WHERE volunteer_messages.body=EXCLUDED.body RETURNING id`,
      sql`UPDATE volunteer_tickets SET updated_at=NOW() WHERE id=${ticketId} AND (${admin} OR bonus_id=${user.bonusId})`
    ]);
    if (!results[0].length) return json(404,{error:'Nie znaleziono zgłoszenia lub ta odpowiedź została już zmieniona.'});
    return json(200,{ok:true,id:results[0][0].id});
  }
  if (body.action === 'status') {
    if (!admin) return json(403,{error:'Status zgłoszenia zmienia organizator.'});
    if (!['open','progress','resolved'].includes(body.status)) invalid('Nieprawidłowy status.');
    const rows = await sql`UPDATE volunteer_tickets SET status=${body.status},updated_at=NOW() WHERE id=${id(body.ticketId)} RETURNING id`;
    return rows.length ? json(200,{ok:true}) : json(404,{error:'Nie znaleziono zgłoszenia.'});
  }
  return json(400,{error:'Nieznana operacja.'});
}
module.exports = { handle };
