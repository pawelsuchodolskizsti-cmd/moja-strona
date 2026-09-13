const {migrate}=require('./schema-migrations');
let ready;
async function ensureOperationsSchema(sql){
 if(!ready)ready=(async()=>{
  await require('./db-schema').ensureScoringSchema(sql);
  await require('./db-schema').ensureQuestionTrackingSchema(sql);
  await require('./db-schema').ensureAppRuntimeSchema(sql);
  await require('./institutions').ensureInstitutionSchema(sql);
  await migrate(sql,'event-operations',1,async q=>{
   q`CREATE TABLE IF NOT EXISTS admin_audit_log(id BIGSERIAL PRIMARY KEY,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),finished_at TIMESTAMPTZ,actor TEXT NOT NULL,endpoint TEXT NOT NULL,action TEXT NOT NULL,scope TEXT,details JSONB NOT NULL DEFAULT '{}',status TEXT NOT NULL DEFAULT 'pending',http_status INTEGER)`;
   q`CREATE INDEX IF NOT EXISTS admin_audit_latest ON admin_audit_log(id DESC)`;
   q`CREATE TABLE IF NOT EXISTS round_archives(id BIGSERIAL PRIMARY KEY,archive_key TEXT NOT NULL UNIQUE,scope TEXT NOT NULL,round_started_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),reason TEXT NOT NULL,game_state JSONB NOT NULL,counts JSONB NOT NULL)`;
   q`CREATE INDEX IF NOT EXISTS round_archives_latest ON round_archives(id DESC)`;
   q`CREATE TABLE IF NOT EXISTS round_archive_items(id BIGSERIAL PRIMARY KEY,archive_id BIGINT NOT NULL REFERENCES round_archives(id),kind TEXT NOT NULL,item_id TEXT NOT NULL,data JSONB NOT NULL)`;
   q`CREATE INDEX IF NOT EXISTS round_archive_items_page ON round_archive_items(archive_id,id)`;
   /* summary_at now denotes a manual thanks action, never a scheduled automatic finale. */
   q`UPDATE game_state SET summary_at=NULL WHERE summary_at=ended_at+INTERVAL '5 minutes'`;
  });
 })().catch(e=>{ready=null;throw e});
 return ready;
}
module.exports={ensureOperationsSchema};
