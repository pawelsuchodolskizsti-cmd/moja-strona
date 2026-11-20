const {neon}=require('@neondatabase/serverless');
const {withApi,json}=require('../api-guard');
const {ensureFeedbackSchema}=require('../player-feedback');
exports.handler=withApi('player-feedback',async event=>{
  const body=event.payload;
  if(!['status','save'].includes(body.action))return json(400,{error:'Nieznana operacja.'});
  if(!body.deviceToken)return json(401,{error:'Otwórz stronę na urządzeniu, na którym bierzesz udział w grze.'});
  const sql=neon(process.env.DATABASE_URL);
  const [participant]=await sql`SELECT id,game_started_at FROM participants WHERE (${body.participantId||0}=0 OR id=${body.participantId||0}) AND device_token=${body.deviceToken} AND scope='live' ORDER BY id DESC LIMIT 1`;
  if(!participant)return json(403,{error:'Nie znaleziono Twojej sesji. Wróć do gry na swoim urządzeniu.'});
  await ensureFeedbackSchema(sql);
  if(body.action==='save'){
    if(!Number.isInteger(body.rating)||body.rating<1||body.rating>5)return json(400,{error:'Wybierz ocenę od 1 do 5 gwiazdek.'});
    if(typeof body.liked!=='string'||typeof body.improvements!=='string'||body.liked.length>2000||body.improvements.length>2000)return json(400,{error:'Każdy opis może mieć do 2000 znaków.'});
    await sql`INSERT INTO player_feedback(participant_id,round_started_at,rating,liked,improvements)
      VALUES(${participant.id},${participant.game_started_at},${body.rating},${body.liked.trim()},${body.improvements.trim()})
      ON CONFLICT(participant_id) DO UPDATE SET rating=EXCLUDED.rating,liked=EXCLUDED.liked,improvements=EXCLUDED.improvements,updated_at=NOW()`;
  }
  const [feedback]=await sql`SELECT rating,liked,improvements FROM player_feedback WHERE participant_id=${participant.id}`;
  return json(200,{ok:true,feedback:feedback||null});
});
