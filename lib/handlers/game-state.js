const {ensurePresentationSchema,presentation,finaleTitleActive}=require('../award-presentation');
const {ensureOperationsSchema}=require('../operations-schema');
const {archiveQuery}=require('../round-archives');
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
    if(Date.now()>=end) {state.ended_at=new Date(end).toISOString();state.technical_pause_active=false;}
  }
  return {...state, finale_title_active:finaleTitleActive(state), presentation:presentation(state), serverNow: new Date().toISOString()};
}
exports.handler=withApi('game-state',async event=>{
  const sql=neon(process.env.DATABASE_URL);
  await ensurePresentationSchema(sql);await ensureScoringSchema(sql);await ensureQuestionTrackingSchema(sql);await ensureAppRuntimeSchema(sql);await ensureOperationsSchema(sql);
  const payload=event.payload||{};
  const requestedScope=payload.scope||event.queryStringParameters?.scope||'live';
  const {scope,runtime,activeScope}=await resolveScope(sql,requestedScope);
  const stateId=getScopeGameStateId(scope);
  const load=async()=>publicState((await sql`SELECT * FROM game_state WHERE scope=${scope} LIMIT 1`)[0],scope);
  if(event.httpMethod==='GET') {
    const state=await load();
    if(state.ended_at && require('../admin-auth').isAdminAuthorized(event)) await transaction(sql,[archiveQuery(sql,scope,'ended',{once:true,endedOnly:true})],{exclusive:true});
    return json(200,{...state,requestedScope,activeScope,testModeEnabled:!!runtime.testModeEnabled});
  }
  const {action}=payload;let queries=[];
  const init=sql`INSERT INTO game_state(id,scope) VALUES(${stateId},${scope}) ON CONFLICT(scope) DO NOTHING`;
  if(action==='start') {
    queries=[init,sql`UPDATE game_state SET started_at=NOW(),round_started_at=NOW(),ended_at=NULL,summary_at=NULL,duration_minutes=180,
      announcement_text=NULL,announcement_updated_at=NULL,results_participants_revealed_at=NULL,results_cities_revealed_at=NULL,presentation_participants_step=0,presentation_cities_step=0,finale_title_active=FALSE,finale_title_auto_dismissed=FALSE,
      technical_pause_active=FALSE,technical_pause_text=NULL,technical_pause_updated_at=NULL
      WHERE scope=${scope} AND (started_at IS NULL OR NOW()>=started_at+duration_minutes*INTERVAL '1 minute') RETURNING id`];
  } else if(action==='stop') {
    queries=[init,sql`UPDATE game_state SET started_at=NULL,ended_at=NOW(),summary_at=NULL,
      results_participants_revealed_at=NULL,results_cities_revealed_at=NULL,presentation_participants_step=0,presentation_cities_step=0,finale_title_active=FALSE,finale_title_auto_dismissed=FALSE,technical_pause_active=FALSE,technical_pause_text=NULL,technical_pause_updated_at=NULL
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
      finale_title_active=FALSE,finale_title_auto_dismissed=TRUE,
      presentation_participants_step=CASE WHEN results_participants_revealed_at IS NULL OR ${action}='lock-results' THEN 0 ELSE presentation_participants_step END,
      presentation_cities_step=CASE WHEN results_cities_revealed_at IS NULL OR ${action}='lock-results' THEN 0 ELSE presentation_cities_step END,
      results_participants_revealed_at=CASE WHEN ${action}='lock-results' THEN NULL ELSE COALESCE(results_participants_revealed_at,NOW()+INTERVAL '15 seconds') END,
      results_cities_revealed_at=CASE WHEN ${action}='lock-results' THEN NULL WHEN ${action}='reveal-cities' THEN COALESCE(results_cities_revealed_at,NOW()+INTERVAL '15 seconds') ELSE results_cities_revealed_at END
      WHERE scope=${scope} AND (${action}='lock-results' OR ended_at IS NOT NULL OR started_at IS NOT NULL AND NOW()>=started_at+duration_minutes*INTERVAL '1 minute') RETURNING id`];
  } else if(action==='show-finale-title'||action==='hide-finale-title') {
    queries=[sql`UPDATE game_state SET finale_title_auto_dismissed=TRUE,finale_title_active=${action==='show-finale-title'} WHERE scope=${scope}
      AND (ended_at IS NOT NULL OR started_at IS NOT NULL AND NOW()>=started_at+duration_minutes*INTERVAL '1 minute') RETURNING id`];
  } else if(action==='presentation-next') {
    const kind=payload.kind,step=Number(payload.step),time=Date.parse(payload.eventAt);
    if(!['participants','cities'].includes(kind)||!Number.isInteger(step)||step<0||step>3||!Number.isFinite(time))return json(400,{error:'Nieprawidłowy etap prezentacji.'});
    const eventAt=new Date(time).toISOString();
    queries=[sql`UPDATE game_state SET presentation_participants_step=presentation_participants_step+CASE WHEN ${kind}='participants' THEN 1 ELSE 0 END,
      presentation_cities_step=presentation_cities_step+CASE WHEN ${kind}='cities' THEN 1 ELSE 0 END
      WHERE scope=${scope} AND NOT finale_title_active AND (ended_at IS NOT NULL OR started_at IS NOT NULL AND NOW()>=started_at+duration_minutes*INTERVAL '1 minute')
      AND CASE WHEN ${kind}='cities' THEN results_cities_revealed_at ELSE results_participants_revealed_at END<=NOW()
      AND date_trunc('milliseconds',CASE WHEN ${kind}='cities' THEN results_cities_revealed_at ELSE results_participants_revealed_at END)=${eventAt}::timestamptz
      AND (${kind}='cities' OR results_cities_revealed_at IS NULL)
      AND CASE WHEN ${kind}='cities' THEN presentation_cities_step ELSE presentation_participants_step END=${step} RETURNING id`];
  } else if(action==='technical-pause') {
    const active=payload.active!==false;const message=(payload.message||'').trim()||'Za chwilę wracamy. Trwa krótka przerwa techniczna.';
    queries=[sql`UPDATE game_state SET technical_pause_active=${active},technical_pause_text=${active?message:null},technical_pause_updated_at=NOW()
      WHERE scope=${scope} AND started_at IS NOT NULL AND NOW()<started_at+duration_minutes*INTERVAL '1 minute' RETURNING id`];
  } else if(action==='show-thanks'||action==='hide-thanks') {
    queries=[sql`UPDATE game_state SET finale_title_auto_dismissed=TRUE,finale_title_active=FALSE,summary_at=CASE WHEN ${action}='show-thanks' THEN NOW() ELSE NULL END
      WHERE scope=${scope} AND round_started_at IS NOT NULL AND (ended_at IS NOT NULL OR started_at IS NOT NULL AND NOW()>=started_at+duration_minutes*INTERVAL '1 minute') RETURNING id`];
  } else if(action==='reset') {
    queries=[sql`DELETE FROM answers WHERE scope=${scope}`,sql`DELETE FROM bonus_redemptions WHERE scope=${scope}`,sql`DELETE FROM question_opens WHERE scope=${scope}`,sql`DELETE FROM participants WHERE scope=${scope}`,init,
      sql`UPDATE game_state SET started_at=NULL,round_started_at=NULL,ended_at=NULL,summary_at=NULL,duration_minutes=180,
        announcement_text=NULL,announcement_updated_at=NULL,results_participants_revealed_at=NULL,results_cities_revealed_at=NULL,presentation_participants_step=0,presentation_cities_step=0,finale_title_active=FALSE,finale_title_auto_dismissed=FALSE,
        technical_pause_active=FALSE,technical_pause_text=NULL,technical_pause_updated_at=NULL WHERE scope=${scope}`];
    if(scope==='test')queries.push(sql`UPDATE app_runtime SET admin_view_scope='live',test_mode_enabled=FALSE,test_seeded_at=NULL,test_participant_count=0 WHERE id=1`);
  } else return json(400,{error:'Nieznana akcja panelu administratora.'});
  const protect=['start','stop','reset'].includes(action);
  if(protect)queries.unshift(archiveQuery(sql,scope,action));
  let results=await transaction(sql,queries,{exclusive:true});
  if(protect)results=results.slice(1);
  if(['reveal-participants','reveal-cities'].includes(action)&&!results[1].length)return json(409,{error:'Wyniki odsłaniamy ręcznie po zakończeniu gry.'});
  if(['show-finale-title','hide-finale-title'].includes(action)&&!results[0].length)return json(409,{error:'Planszę finału można pokazać po zakończeniu gry.'});
  if(action==='presentation-next'&&!results[0].length)return json(409,{error:'Etap już się zmienił lub odliczanie jeszcze trwa. Odświeżam widok.'});
  if(['show-thanks','hide-thanks'].includes(action)&&!results[0].length)return json(409,{error:'Zakończ grę przed sterowaniem podziękowaniem.'});
  if(action==='start'&&!results[1].length)return json(409,{error:'Gra już trwa. Zatrzymaj ją przed rozpoczęciem nowej tury.'});
  if(['extend-time','technical-pause'].includes(action)&&!results[0].length)return json(409,{error:'Ta operacja wymaga aktywnej gry.'});
  return json(200,{ok:true,action,reset:action==='reset',stopped:action==='stop',...await load()});
});
module.exports.publicState=publicState;
