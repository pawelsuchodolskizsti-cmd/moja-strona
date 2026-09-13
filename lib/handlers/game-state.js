const {neon}=require('@neondatabase/serverless');
const {ensureScoringSchema,ensureQuestionTrackingSchema,ensureAppRuntimeSchema}=require('../db-schema');
const {resolveScope,getScopeGameStateId}=require('../data-scope');
const {withApi,json}=require('../api-guard');
const {transaction}=require('../transactions');
function publicState(row,scope) {
  const state={scope,started_at:null,round_started_at:null,ended_at:null,summary_at:null,duration_minutes:180,
    announcement_text:null,announcement_updated_at:null,results_participants_revealed_at:null,results_cities_revealed_at:null,
    technical_pause_active:false,technical_pause_text:null,technical_pause_updated_at:null,...row};
  if(state.started_at) {
    const end=new Date(state.started_at).getTime()+Number(state.duration_minutes)*60000;
    if(Date.now()>=end) {state.ended_at=new Date(end).toISOString();state.summary_at=new Date(end+300000).toISOString();state.technical_pause_active=false;}
  }
  return {...state, serverNow: new Date().toISOString()};
}
exports.handler=withApi('game-state',async event=>{
  const sql=neon(process.env.DATABASE_URL);
  await ensureScoringSchema(sql);await ensureQuestionTrackingSchema(sql);await ensureAppRuntimeSchema(sql);
  const payload=event.payload||{};
  const requestedScope=payload.scope||event.queryStringParameters?.scope||'live';
  const {scope,runtime,activeScope}=await resolveScope(sql,requestedScope);
  const stateId=getScopeGameStateId(scope);
  const load=async()=>publicState((await sql`SELECT * FROM game_state WHERE scope=${scope} LIMIT 1`)[0],scope);
  if(event.httpMethod==='GET') return json(200,{...await load(),requestedScope,activeScope,testModeEnabled:!!runtime.testModeEnabled});
  const {action}=payload;let queries=[];
  const init=sql`INSERT INTO game_state(id,scope) VALUES(${stateId},${scope}) ON CONFLICT(scope) DO NOTHING`;
  if(action==='start') {
    queries=[init,sql`UPDATE game_state SET started_at=NOW(),round_started_at=NOW(),ended_at=NULL,summary_at=NULL,duration_minutes=180,
      announcement_text=NULL,announcement_updated_at=NULL,results_participants_revealed_at=NULL,results_cities_revealed_at=NULL,
      technical_pause_active=FALSE,technical_pause_text=NULL,technical_pause_updated_at=NULL
      WHERE scope=${scope} AND (started_at IS NULL OR NOW()>=started_at+duration_minutes*INTERVAL '1 minute') RETURNING id`];
  } else if(action==='stop') {
    queries=[init,sql`UPDATE game_state SET started_at=NULL,ended_at=NOW(),summary_at=NOW()+INTERVAL '5 minutes',
      results_participants_revealed_at=NULL,results_cities_revealed_at=NULL,technical_pause_active=FALSE,technical_pause_text=NULL,technical_pause_updated_at=NULL
      WHERE scope=${scope} AND started_at IS NOT NULL RETURNING id`,
      sql`UPDATE participants SET current_question_id=NULL,current_question_opened_at=NULL WHERE scope=${scope}`];
  } else if(action==='extend-time') {
    const minutes=Number(payload.minutes);
    if(!Number.isInteger(minutes)||minutes<=0||minutes>180)return json(400,{error:'Podaj od 1 do 180 minut do dodania.'});
    queries=[sql`UPDATE game_state SET duration_minutes=duration_minutes+${minutes} WHERE scope=${scope}
      AND started_at IS NOT NULL AND NOW()<started_at+duration_minutes*INTERVAL '1 minute' RETURNING id`];
  } else if(action==='set-announcement') {
    const message=(payload.message||'').trim();
    queries=[init,sql`UPDATE game_state SET announcement_text=${message||null},announcement_updated_at=NOW() WHERE scope=${scope}`];
  } else if(['reveal-participants','reveal-cities','lock-results'].includes(action)) {
    queries=[init,sql`UPDATE game_state SET
      results_participants_revealed_at=CASE WHEN ${action}='lock-results' THEN NULL ELSE COALESCE(results_participants_revealed_at,NOW()) END,
      results_cities_revealed_at=CASE WHEN ${action}='lock-results' THEN NULL WHEN ${action}='reveal-cities' THEN COALESCE(results_cities_revealed_at,NOW()) ELSE results_cities_revealed_at END
      WHERE scope=${scope}`];
  } else if(action==='technical-pause') {
    const active=payload.active!==false;const message=(payload.message||'').trim()||'Za chwilę wracamy. Trwa krótka przerwa techniczna.';
    queries=[sql`UPDATE game_state SET technical_pause_active=${active},technical_pause_text=${active?message:null},technical_pause_updated_at=NOW()
      WHERE scope=${scope} AND started_at IS NOT NULL AND NOW()<started_at+duration_minutes*INTERVAL '1 minute' RETURNING id`];
  } else if(action==='reset') {
    queries=[sql`DELETE FROM answers WHERE scope=${scope}`,sql`DELETE FROM bonus_redemptions WHERE scope=${scope}`,sql`DELETE FROM question_opens WHERE scope=${scope}`,sql`DELETE FROM participants WHERE scope=${scope}`,init,
      sql`UPDATE game_state SET started_at=NULL,round_started_at=NULL,ended_at=NULL,summary_at=NULL,duration_minutes=180,
        announcement_text=NULL,announcement_updated_at=NULL,results_participants_revealed_at=NULL,results_cities_revealed_at=NULL,
        technical_pause_active=FALSE,technical_pause_text=NULL,technical_pause_updated_at=NULL WHERE scope=${scope}`];
    if(scope==='test')queries.push(sql`UPDATE app_runtime SET admin_view_scope='live',test_mode_enabled=FALSE,test_seeded_at=NULL,test_participant_count=0 WHERE id=1`);
  } else return json(400,{error:'Nieznana akcja panelu administratora.'});
  const results=await transaction(sql,queries,{exclusive:true});
  if(action==='start'&&!results[1].length)return json(409,{error:'Gra już trwa. Zatrzymaj ją przed rozpoczęciem nowej tury.'});
  if(['extend-time','technical-pause'].includes(action)&&!results[0].length)return json(409,{error:'Ta operacja wymaga aktywnej gry.'});
  return json(200,{ok:true,action,reset:action==='reset',stopped:action==='stop',...await load()});
});
module.exports.publicState=publicState;
