const {neon}=require('@neondatabase/serverless');
const {withApi,json}=require('../api-guard');
const {ensureFeedbackSchema}=require('../player-feedback');
const {ensureCommunicationSchema,validateChoice,policy,hash}=require('../communication-consent');
exports.handler=withApi('player-feedback',async event=>{
  const body=event.payload;
  if(!['status','save','join'].includes(body.action))return json(400,{error:'Nieznana operacja.'});
  if(!body.deviceToken)return json(401,{error:'Otwórz stronę na urządzeniu, na którym bierzesz udział w grze.'});
  const sql=neon(process.env.DATABASE_URL);
  const [participant]=await sql`SELECT id,game_started_at FROM participants WHERE (${body.participantId||0}=0 OR id=${body.participantId||0}) AND device_token=${body.deviceToken} AND scope='live' ORDER BY id DESC LIMIT 1`;
  if(!participant)return json(403,{error:'Nie znaleziono Twojej sesji. Wróć do gry na swoim urządzeniu.'});
  await ensureFeedbackSchema(sql);await ensureCommunicationSchema(sql);
  if(body.action==='save'){
    if(!Number.isInteger(body.rating)||body.rating<1||body.rating>5)return json(400,{error:'Wybierz ocenę od 1 do 5 gwiazdek.'});
    if(typeof body.liked!=='string'||typeof body.improvements!=='string'||body.liked.length>2000||body.improvements.length>2000)return json(400,{error:'Każdy opis może mieć do 2000 znaków.'});
    await sql`INSERT INTO player_feedback(participant_id,round_started_at,rating,liked,improvements)
      VALUES(${participant.id},${participant.game_started_at},${body.rating},${body.liked.trim()},${body.improvements.trim()})
      ON CONFLICT(participant_id) DO UPDATE SET rating=EXCLUDED.rating,liked=EXCLUDED.liked,improvements=EXCLUDED.improvements,updated_at=NOW()`;
  }
  if(body.action==='join'){
    const error=validateChoice(body);
    if(error||body.communicationConsent!==true)return json(400,{error:error||'Zaznacz dobrowolną zgodę, aby zapisać się na kontakt.'});
    const status=policy.draft?'draft':body.communicationAge==='adult'?'active':'pending_guardian';
    const rows=await sql`INSERT INTO communication_consents(participant_id,first_name,last_name,institution_id,institution_label,email,consent_version,consent_text,age_declaration,status,manage_token_hash,source)
      SELECT p.id,p.first_name,p.last_name,p.institution_id,i.name||' - '||i.city,p.email,${policy.version},${policy.text},${body.communicationAge},${status},${hash(body.communicationToken)},'after-game'
      FROM participants p JOIN institutions i ON i.id=p.institution_id WHERE p.id=${participant.id} AND p.device_token=${body.deviceToken} AND p.scope='live'
      ON CONFLICT(participant_id) DO UPDATE SET consent_version=EXCLUDED.consent_version,consent_text=EXCLUDED.consent_text,age_declaration=EXCLUDED.age_declaration,status=EXCLUDED.status,manage_token_hash=EXCLUDED.manage_token_hash,consented_at=NOW(),withdrawn_at=NULL,source=EXCLUDED.source
      WHERE communication_consents.status='withdrawn' RETURNING id`;
    if(!rows.length){const existing=await sql`SELECT id FROM communication_consents WHERE participant_id=${participant.id} AND status<>'withdrawn'`;if(!existing.length)return json(400,{error:'Brakuje danych placówki do zapisu. Skontaktuj się z organizatorem.'});}
  }
  const [feedback]=await sql`SELECT rating,liked,improvements FROM player_feedback WHERE participant_id=${participant.id}`;
  const [consent]=await sql`SELECT status FROM communication_consents WHERE participant_id=${participant.id}`;
  return json(200,{ok:true,feedback:feedback||null,contactJoined:!!consent&&consent.status!=='withdrawn',contactStatus:consent?.status||null,draft:policy.draft});
});
