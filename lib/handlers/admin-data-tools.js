const {neon}=require('@neondatabase/serverless');
const crypto=require('node:crypto');
const {withApi,json}=require('../api-guard');
const {ensureExportSchema,snapshotQuery}=require('../game-export');
const {transaction}=require('../transactions');
function id(value){const n=Number(value);if(!Number.isSafeInteger(n)||n<=0){const e=Error('Nieprawidłowy identyfikator.');e.statusCode=400;throw e;}return n;}
exports.handler=withApi('admin-data-tools',async event=>{
 const sql=neon(process.env.DATABASE_URL);await ensureExportSchema(sql);const q=event.queryStringParameters||{},p=event.payload||{};
 if(event.httpMethod==='GET'){
  if(q.view==='exports'){const before=q.before?id(q.before):0;const rows=await sql`SELECT * FROM game_exports WHERE (${before}=0 OR id<${before}) ORDER BY id DESC LIMIT 21`;return json(200,{items:rows.slice(0,20),before:rows.length>20?rows[19].id:null});}
  const exportId=id(q.id);const [meta]=await sql`SELECT * FROM game_exports WHERE id=${exportId}`;if(!meta)return json(404,{error:'Nie znaleziono eksportu.'});
  if(q.view==='chunk'){const index=Number(q.index);if(meta.status!=='ready')return json(409,{error:'Plik nie jest jeszcze gotowy.'});if(!Number.isInteger(index)||index<0||index>=meta.chunk_count)return json(400,{error:'Nieprawidłowa część pliku.'});const [chunk]=await sql`SELECT data FROM game_export_chunks WHERE export_id=${exportId} AND chunk_index=${index}`;if(!chunk)return json(409,{error:'Brakuje części pliku.'});return json(200,chunk);}
  return json(200,meta);
 }
 if(p.action==='export'){
  if(typeof p.requestId!=='string'||!/^[-a-zA-Z0-9]{16,80}$/.test(p.requestId))return json(400,{error:'Brak identyfikatora eksportu.'});
  await transaction(sql,[snapshotQuery(sql,p.requestId)],{exclusive:true});const [meta]=await sql`SELECT * FROM game_exports WHERE request_id=${p.requestId}`;return json(200,meta);
 }
 if(p.action==='prepare'){
  const exportId=id(p.id);const [meta]=await sql`SELECT * FROM game_exports WHERE id=${exportId}`;if(!meta)return json(404,{error:'Nie znaleziono eksportu.'});if(meta.status==='ready')return json(200,meta);
  const items=await sql`SELECT kind,item_id,data FROM game_export_items WHERE export_id=${exportId} ORDER BY kind,item_id`;
  const file=require('../game-workbook').buildWorkbook(meta,items),hash=crypto.createHash('sha256').update(file).digest('hex'),filename=`one-day-pelne-archiwum-${exportId}.xlsx`,chunkSize=96*1024,queries=[sql`DELETE FROM game_export_chunks WHERE export_id=${exportId}`];
  let count=0;for(let start=0;start<file.length;start+=chunkSize){const index=count++;queries.push(sql`INSERT INTO game_export_chunks(export_id,chunk_index,data) VALUES(${exportId},${index},${file.subarray(start,start+chunkSize).toString('base64')})`);}
  queries.push(sql`UPDATE game_exports SET status='ready',filename=${filename},byte_length=${file.length},sha256=${hash},chunk_count=${count} WHERE id=${exportId}`);
  await transaction(sql,queries,{exclusive:true});const [ready]=await sql`SELECT * FROM game_exports WHERE id=${exportId}`;return json(200,ready);
 }
 if(p.action==='cleanup-preview'){
  const token=crypto.randomBytes(24).toString('hex');
  const rows=await sql`INSERT INTO admin_cleanup_previews(token,feedback_max,contacts_max) VALUES(${token},COALESCE((SELECT MAX(id) FROM player_feedback),0),COALESCE((SELECT MAX(id) FROM communication_consents),0)) RETURNING token`;
  const [counts]=await sql`SELECT (SELECT COUNT(*)::int FROM player_feedback f,admin_cleanup_previews p WHERE p.token=${token} AND f.id<=p.feedback_max AND f.updated_at<=p.created_at) AS feedback,(SELECT COUNT(*)::int FROM communication_consents c,admin_cleanup_previews p WHERE p.token=${token} AND c.id<=p.contacts_max AND c.consented_at<=p.created_at AND COALESCE(c.withdrawn_at,c.consented_at)<=p.created_at) AS contacts`;
  return json(200,{...rows[0],...counts});
 }
 if(p.action==='cleanup'){
  if(typeof p.token!=='string'||!/^([a-f0-9]{48})$/.test(p.token)||p.confirm!=='USUN WPISY Z PROB')return json(400,{error:'Potwierdź zakres czyszczenia.'});
  const results=await transaction(sql,[
   sql`SELECT token FROM admin_cleanup_previews WHERE token=${p.token} AND used_at IS NULL AND created_at>NOW()-INTERVAL '10 minutes' FOR UPDATE`,
   sql`DELETE FROM player_feedback f USING admin_cleanup_previews p WHERE p.token=${p.token} AND p.used_at IS NULL AND p.created_at>NOW()-INTERVAL '10 minutes' AND f.id<=p.feedback_max AND f.updated_at<=p.created_at RETURNING f.id`,
   sql`DELETE FROM communication_consents c USING admin_cleanup_previews p WHERE p.token=${p.token} AND p.used_at IS NULL AND p.created_at>NOW()-INTERVAL '10 minutes' AND c.id<=p.contacts_max AND c.consented_at<=p.created_at AND COALESCE(c.withdrawn_at,c.consented_at)<=p.created_at RETURNING c.id`,
   sql`UPDATE admin_cleanup_previews SET used_at=NOW() WHERE token=${p.token} AND used_at IS NULL AND created_at>NOW()-INTERVAL '10 minutes' RETURNING token`
  ],{exclusive:true});
  if(!results[3].length)return json(409,{error:'Potwierdzenie wygasło lub zostało już użyte. Otwórz czyszczenie ponownie.'});return json(200,{ok:true,feedback:results[1].length,contacts:results[2].length});
 }
 return json(400,{error:'Nieznana operacja.'});
});
