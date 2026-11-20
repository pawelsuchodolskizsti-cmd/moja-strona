const {migrate}=require('./schema-migrations');
const {ensureCoreSchema}=require('./db-schema');
let ready;
function normalize(value){return String(value||'').trim().toUpperCase();}
async function ensureInstitutionSchema(sql){
 if(!ready)ready=(async()=>{
  await ensureCoreSchema(sql);
  await migrate(sql,'group-codes',1,async q=>{
   q`CREATE TABLE IF NOT EXISTS group_codes(id SERIAL PRIMARY KEY,code TEXT NOT NULL UNIQUE,active BOOLEAN NOT NULL DEFAULT TRUE,revision INTEGER NOT NULL DEFAULT 1)`;
   q`ALTER TABLE participants ADD COLUMN IF NOT EXISTS institution_id INTEGER`;
   q`INSERT INTO group_codes(id,code) SELECT DISTINCT institution_id,'K'||LPAD(institution_id::text,GREATEST(3,length(institution_id::text)),'0') FROM participants WHERE institution_id IS NOT NULL ON CONFLICT DO NOTHING`;
   q`ALTER TABLE participants DROP CONSTRAINT IF EXISTS participants_institution_id_fkey`;
   q`SELECT setval(pg_get_serial_sequence('group_codes','id'),GREATEST(COALESCE((SELECT MAX(id) FROM group_codes),0),1),EXISTS(SELECT 1 FROM group_codes))`;
   q`ALTER TABLE participants DROP CONSTRAINT IF EXISTS participants_group_code_fkey`;
   q`ALTER TABLE participants ADD CONSTRAINT participants_group_code_fkey FOREIGN KEY(institution_id) REFERENCES group_codes(id)`;
   q`CREATE INDEX IF NOT EXISTS idx_participants_institution ON participants(institution_id)`;
  });
 })().catch(e=>{ready=null;throw e;});return ready;
}
async function getInstitutions(sql,all=false){await ensureInstitutionSchema(sql);return sql`SELECT id,code AS name,''::text AS city,active,revision FROM group_codes WHERE ${all} OR active ORDER BY code,id`;}
function decorate(rows,groups,field='city'){
 const byId=new Map(groups.map(g=>[Number(g.id),g]));
 rows.forEach(p=>{p[field]=byId.get(Number(p.institutionId))?.name||(String(p[field]||'').match(/^TEST-[1-3]$/)?p[field]:'Bez kodu');});return rows;
}
module.exports={ensureInstitutionSchema,getInstitutions,normalize,decorate};
