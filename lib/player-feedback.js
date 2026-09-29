const {migrate}=require('./schema-migrations');
let ready;
async function ensureFeedbackSchema(sql){
  if(!ready)ready=migrate(sql,'player-feedback',1,async q=>{
    q`CREATE TABLE IF NOT EXISTS player_feedback (
      id BIGSERIAL PRIMARY KEY, participant_id INTEGER NOT NULL UNIQUE,
      round_started_at TIMESTAMPTZ, rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      liked TEXT NOT NULL DEFAULT '', improvements TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  }).catch(e=>{ready=null;throw e;});
  await ready;
}
module.exports={ensureFeedbackSchema};
