const {neon}=require('@neondatabase/serverless');
const {ensureScoringSchema}=require('../db-schema');
const {withApi,json}=require('../api-guard');
const {ensureInstitutionSchema}=require('../institutions');
const {transaction}=require('../transactions');
exports.handler=withApi('login',async event=>{
  const body=event.payload;const upper=value=>String(value||'').trim().toUpperCase();
  const firstName=upper(body.firstName),lastName=upper(body.lastName),institutionId=Number(body.institutionId),email=String(body.email||'').trim().toLowerCase(),token=body.deviceToken.trim();
  if(!firstName||!lastName||!Number.isSafeInteger(institutionId)||institutionId<=0||!email)return json(400,{error:'Podaj imię, nazwisko, wybierz placówkę z listy i podaj adres e-mail.'});
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json(400,{error:'Podaj poprawny adres e-mail.'});
  if(body.acceptedRules!==true)return json(400,{error:'Aby dołączyć do gry, zaakceptuj regulamin.'});
  const sql=neon(process.env.DATABASE_URL);await ensureScoringSchema(sql);await ensureInstitutionSchema(sql);
  const [institution]=await sql`SELECT id FROM institutions WHERE id=${institutionId} AND active`;
  if(!institution)return json(400,{error:'Wybierz dostępną placówkę z listy. Odśwież wyszukiwarkę, jeśli lista się zmieniła.'});
  const ip=String(event.headers?.['x-forwarded-for']||event.headers?.['x-real-ip']||'').split(',')[0].trim()||null;
  const agent=event.headers?.['user-agent']||null;
  const results=await transaction(sql,[
    // Only a released account with the same identity, including email, can be reassigned.
    sql`UPDATE participants p SET device_token=${token},last_activity=NOW(),last_ip=${ip},last_user_agent=${agent}
      WHERE p.id=(SELECT r.id FROM participants r JOIN game_state g ON g.scope=r.scope AND r.game_started_at=g.started_at
        WHERE r.scope='live' AND g.started_at IS NOT NULL AND NOW()<g.started_at+g.duration_minutes*INTERVAL '1 minute' AND NOT g.technical_pause_active
          AND r.device_token IS NULL AND r.first_name=${firstName} AND r.last_name=${lastName} AND r.institution_id=${institutionId} AND r.email=${email}
          AND NOT EXISTS(SELECT 1 FROM participants d WHERE d.scope='live' AND d.game_started_at=g.started_at AND d.device_token=${token})
        ORDER BY r.id DESC LIMIT 1 FOR UPDATE OF r)`,
    sql`INSERT INTO participants(scope,first_name,last_name,city,institution_id,email,device_token,game_started_at,last_ip,last_user_agent,last_activity,score_at)
      SELECT 'live',${firstName},${lastName},i.name || ' - ' || i.city,i.id,${email},${token},g.started_at,${ip},${agent},NOW(),NOW()
      FROM game_state g JOIN institutions i ON i.id=${institutionId} AND i.active WHERE g.scope='live' AND g.started_at IS NOT NULL AND NOW()<g.started_at+g.duration_minutes*INTERVAL '1 minute' AND NOT g.technical_pause_active
      ON CONFLICT(scope,game_started_at,device_token) WHERE device_token IS NOT NULL DO NOTHING RETURNING id`,
    sql`UPDATE participants p SET last_activity=NOW(),last_ip=${ip},last_user_agent=${agent},current_question_id=NULL,current_question_opened_at=NULL
      FROM game_state g WHERE g.scope='live' AND p.scope=g.scope AND p.game_started_at=g.started_at AND p.device_token=${token}
        AND p.first_name=${firstName} AND p.last_name=${lastName} AND p.institution_id=${institutionId} AND p.email=${email}`,
    sql`SELECT p.id,p.first_name AS "firstName",p.last_name AS "lastName",p.institution_id AS "institutionId",p.email,p.game_started_at AS "gameStartedAt"
      FROM participants p JOIN game_state g ON g.scope=p.scope AND g.started_at=p.game_started_at
      WHERE p.scope='live' AND p.device_token=${token} AND NOW()<g.started_at+g.duration_minutes*INTERVAL '1 minute' AND NOT g.technical_pause_active LIMIT 1`
  ],{deviceToken:token});
  const p=results[3][0];
  if(!p){const [g]=await sql`SELECT technical_pause_active,technical_pause_text FROM game_state WHERE scope='live'`;return json(g?.technical_pause_active?423:403,{error:g?.technical_pause_active?(g.technical_pause_text||'Trwa przerwa techniczna.'):'Gra jest już zakończona lub jeszcze nie wystartowała.'});}
  if(p.firstName!==firstName||p.lastName!==lastName||Number(p.institutionId)!==institutionId||p.email!==email)return json(409,{error:'To urządzenie jest już przypisane do innego uczestnika. Skontaktuj się z administratorem.'});
  return json(200,{id:p.id,firstName:p.firstName,lastName:p.lastName,gameStartedAt:p.gameStartedAt,institutionId:p.institutionId,reused:!results[1].length});
});
