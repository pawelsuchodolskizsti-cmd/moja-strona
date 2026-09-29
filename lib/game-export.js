const {migrate}=require('./schema-migrations');
let ready;
async function ensureExportSchema(sql){
 if(!ready)ready=(async()=>{
  await require('./operations-schema').ensureOperationsSchema(sql);
  await require('./player-feedback').ensureFeedbackSchema(sql);
  await require('./communication-consent').ensureCommunicationSchema(sql);
  await require('./volunteer-schema').ensureVolunteerSchema(sql);
  await require('./db-schema').ensureQuestionCatalogSchema(sql);
  await require('./db-schema').ensureBonusCatalogSchema(sql);
  await migrate(sql,'full-game-export',1,async q=>{
   q`CREATE TABLE IF NOT EXISTS game_exports(id BIGSERIAL PRIMARY KEY,request_id TEXT NOT NULL UNIQUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),status TEXT NOT NULL DEFAULT 'snapshot',filename TEXT,byte_length INTEGER,sha256 TEXT,chunk_count INTEGER)`;
   q`CREATE TABLE IF NOT EXISTS game_export_items(export_id BIGINT NOT NULL REFERENCES game_exports(id),kind TEXT NOT NULL,item_id TEXT NOT NULL,data JSONB NOT NULL)`;
   q`CREATE INDEX IF NOT EXISTS game_export_items_owner ON game_export_items(export_id)`;
   q`CREATE TABLE IF NOT EXISTS game_export_chunks(export_id BIGINT NOT NULL REFERENCES game_exports(id),chunk_index INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(export_id,chunk_index))`;
   q`CREATE TABLE IF NOT EXISTS admin_cleanup_previews(token TEXT PRIMARY KEY,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),feedback_max BIGINT NOT NULL,contacts_max BIGINT NOT NULL,used_at TIMESTAMPTZ)`;
  });
 })().catch(e=>{ready=null;throw e;});return ready;
}
function snapshotQuery(sql,requestId){
 return sql`WITH saved AS (
  INSERT INTO game_exports(request_id) VALUES(${requestId}) ON CONFLICT(request_id) DO NOTHING RETURNING id
 ), records AS (
  SELECT 'participants' AS kind,p.id::text AS item_id,to_jsonb(p)-'device_token' AS data FROM participants p
  UNION ALL SELECT 'answers',a.id::text,to_jsonb(a) FROM answers a
  UNION ALL SELECT 'bonuses',b.id::text,to_jsonb(b) FROM bonus_redemptions b
  UNION ALL SELECT 'questionOpens',o.id::text,to_jsonb(o) FROM question_opens o
  UNION ALL SELECT 'questions',q.id::text,to_jsonb(q) FROM questions_catalog q
  UNION ALL SELECT 'bonusCatalog',b.id,to_jsonb(b)-'secret' FROM bonus_catalog b
  UNION ALL SELECT 'institutions',i.id::text,to_jsonb(i) FROM institutions i
  UNION ALL SELECT 'contacts',c.id::text,to_jsonb(c)-'manage_token_hash' FROM communication_consents c
  UNION ALL SELECT 'feedback',f.id::text,to_jsonb(f) FROM player_feedback f
  UNION ALL SELECT 'gameState',g.scope,to_jsonb(g) FROM game_state g
  UNION ALL SELECT 'runtime',r.id::text,to_jsonb(r) FROM app_runtime r
  UNION ALL SELECT 'volunteers',v.bonus_id,to_jsonb(v)-'password_hash' FROM volunteer_accounts v
  UNION ALL SELECT 'tickets',t.id::text,to_jsonb(t)-'request_id' FROM volunteer_tickets t
  UNION ALL SELECT 'messages',m.id::text,to_jsonb(m)-'request_id' FROM volunteer_messages m
  UNION ALL SELECT 'audit',a.id::text,to_jsonb(a) FROM admin_audit_log a
  UNION ALL SELECT 'archives',a.id::text,to_jsonb(a) FROM round_archives a
  UNION ALL SELECT 'archived_'||i.kind,i.item_id,i.data-'device_token'-'secret'-'manage_token_hash'-'password_hash' FROM (
    SELECT DISTINCT ON(kind,item_id) kind,item_id,data FROM round_archive_items ORDER BY kind,item_id,archive_id DESC,id DESC
  ) i
 ) INSERT INTO game_export_items(export_id,kind,item_id,data) SELECT s.id,r.kind,r.item_id,r.data FROM saved s CROSS JOIN records r`;
}
module.exports={ensureExportSchema,snapshotQuery};
