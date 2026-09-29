const {migrate}=require('./schema-migrations');
let ready;
async function ensurePresentationSchema(sql){if(!ready)ready=(async()=>{await require('./db-schema').ensureScoringSchema(sql);await migrate(sql,'award-presentation',1,async q=>{q`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS presentation_participants_step INTEGER NOT NULL DEFAULT 0`;q`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS presentation_cities_step INTEGER NOT NULL DEFAULT 0`;});})().catch(e=>{ready=null;throw e;});return ready;}
function presentation(state){const kind=state?.results_cities_revealed_at?'cities':state?.results_participants_revealed_at?'participants':null;if(!kind)return null;return {kind,eventAt:state['results_'+kind+'_revealed_at'],step:Number(state['presentation_'+kind+'_step']||0)};}
module.exports={ensurePresentationSchema,presentation};
