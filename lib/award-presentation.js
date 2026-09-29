const {migrate}=require('./schema-migrations');
let ready;
async function ensurePresentationSchema(sql){if(!ready)ready=(async()=>{await require('./db-schema').ensureScoringSchema(sql);await migrate(sql,'award-presentation',3,async q=>{q`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS finale_title_auto_dismissed BOOLEAN NOT NULL DEFAULT FALSE`;q`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS finale_title_active BOOLEAN NOT NULL DEFAULT FALSE`;q`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS presentation_participants_step INTEGER NOT NULL DEFAULT 0`;q`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS presentation_cities_step INTEGER NOT NULL DEFAULT 0`;});})().catch(e=>{ready=null;throw e;});return ready;}
function presentation(state){const kind=state?.results_cities_revealed_at?'cities':state?.results_participants_revealed_at?'participants':null;if(!kind)return null;return {kind,eventAt:state['results_'+kind+'_revealed_at'],step:Number(state['presentation_'+kind+'_step']||0)};}
function finaleTitleAutoAt(state){
  if(!state||state.finale_title_auto_dismissed||state.summary_at||state.results_participants_revealed_at||state.results_cities_revealed_at)return null;
  const ends=[];
  if(state.started_at)ends.push(new Date(state.started_at).getTime()+Number(state.duration_minutes||180)*60000);
  if(state.ended_at)ends.push(new Date(state.ended_at).getTime());
  const end=Math.min(...ends.filter(Number.isFinite));
  return Number.isFinite(end)?new Date(end+15*60000).toISOString():null;
}
function finaleTitleActive(state){const at=finaleTitleAutoAt(state);return Boolean(state?.finale_title_active||(at&&Date.now()>=Date.parse(at)));}
module.exports={ensurePresentationSchema,presentation,finaleTitleAutoAt,finaleTitleActive};
