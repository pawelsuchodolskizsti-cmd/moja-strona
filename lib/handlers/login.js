const {neon}=require('@neondatabase/serverless');
const {ensureScoringSchema}=require('../db-schema');
const {withApi,json}=require('../api-guard');
const {ensureInstitutionSchema}=require('../institutions');
const {transaction}=require('../transactions');
exports.handler=withApi('login',async event=>{
  const body=event.payload;const upper=value=>String(value||'').trim().toUpperCase();
  const firstName=upper(body.nickname),lastName='',institutionId=Number(body.institutionId),email='',token=body.deviceToken.trim();
  if(typeof body.nickname!=='string'||!/^[-_\p{L}\p{N}]{2,24}$/u.test(firstName)||!Number.isSafeInteger(institutionId)||institutionId<=0)return json(400,{error:'Podaj nick (2-24 litery, cyfry, myślnik lub podkreślenie) i wybierz kod z listy.'});
  if(['firstName','lastName','email','communicationConsent','communicationToken','communicationAge'].some(key=>Object.hasOwn(body,key)))return json(400,{error:'Formularz został zmieniony. Odśwież stronę i podaj tylko nick oraz kod.'});
  if(body.acceptedRules!==true)return json(400,{error:'Aby dołączyć do gry, zaakceptuj regulamin.'});
  const sql=neon(process.env.DATABASE_URL);await ensureScoringSchema(sql);await ensureInstitutionSchema(sql);
  const [institution]=await sql`SELECT id FROM group_codes WHERE id=${institutionId} AND active`;
  if(!institution)return json(400,{error:'Wybierz dostępny kod z listy. Odśwież wyszukiwarkę, jeśli lista się zmieniła.'});
  const ip=String(event.headers?.['x-forwarded-for']||event.headers?.['x-real-ip']||'').split(',')[0].trim()||null;
  const agent=event.headers?.['user-agent']||null;
  const queries=[
    sql`INSERT INTO participants(scope,first_name,last_name,city,institution_id,email,device_token,game_started_at,last_ip,last_user_agent,last_activity,score_at)
      SELECT 'live',${firstName},${lastName},i.code,i.id,${email},${token},g.started_at,${ip},${agent},NOW(),NOW()
      FROM game_state g JOIN group_codes i ON i.id=${institutionId} AND i.active WHERE g.scope='live' AND g.started_at IS NOT NULL AND NOW()<g.started_at+g.duration_minutes*INTERVAL '1 minute' AND NOT g.technical_pause_active
      ON CONFLICT(scope,game_started_at,device_token) WHERE device_token IS NOT NULL DO NOTHING RETURNING id`,
    sql`UPDATE participants p SET last_activity=NOW(),last_ip=${ip},last_user_agent=${agent},current_question_id=NULL,current_question_opened_at=NULL
      FROM game_state g WHERE g.scope='live' AND p.scope=g.scope AND p.game_started_at=g.started_at AND p.device_token=${token}
        AND p.first_name=${firstName} AND p.last_name=${lastName} AND p.institution_id=${institutionId} AND p.email=${email}`,
    sql`SELECT p.id,p.first_name AS "firstName",p.last_name AS "lastName",p.institution_id AS "institutionId",p.email,p.game_started_at AS "gameStartedAt"
      FROM participants p JOIN game_state g ON g.scope=p.scope AND g.started_at=p.game_started_at
      WHERE p.scope='live' AND p.device_token=${token} AND NOW()<g.started_at+g.duration_minutes*INTERVAL '1 minute' AND NOT g.technical_pause_active LIMIT 1`
  ];
  const results=await transaction(sql,queries,{deviceToken:token});
  const p=results[2][0];
  if(!p){const [g]=await sql`SELECT technical_pause_active,technical_pause_text FROM game_state WHERE scope='live'`;return json(g?.technical_pause_active?423:403,{error:g?.technical_pause_active?(g.technical_pause_text||'Trwa przerwa techniczna.'):'Gra jest już zakończona lub jeszcze nie wystartowała.'});}
  if(p.firstName!==firstName||p.lastName!==lastName||Number(p.institutionId)!==institutionId||p.email!==email)return json(409,{error:'To urządzenie jest już przypisane do innego uczestnika. Skontaktuj się z administratorem.'});
  return json(200,{id:p.id,nickname:p.firstName,firstName:p.firstName,lastName:'',gameStartedAt:p.gameStartedAt,institutionId:p.institutionId,reused:!results[0].length});
});
