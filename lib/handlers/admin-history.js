const {neon}=require('@neondatabase/serverless');
const {withApi,json}=require('../api-guard');
const {ensureOperationsSchema}=require('../operations-schema');
const {archiveQuery}=require('../round-archives');
const {transaction}=require('../transactions');
function integer(v,fallback=0){if(v===undefined)return fallback;const n=Number(v);if(!Number.isSafeInteger(n)||n<0){const e=Error('Nieprawidłowy numer strony.');e.statusCode=400;throw e;}return n;}
exports.handler=withApi('admin-history',async event=>{
 const sql=neon(process.env.DATABASE_URL);await ensureOperationsSchema(sql);
 const p=event.payload||{},q=event.queryStringParameters||{};
 if(event.httpMethod==='POST'){
  if(p.action!=='archive'||!['live','test'].includes(p.scope))return json(400,{error:'Wybierz LIVE lub TEST.'});
  await transaction(sql,[archiveQuery(sql,p.scope,'manual')],{exclusive:true});return json(200,{ok:true});
 }
 const before=integer(q.before),scope=['live','test'].includes(q.scope)?q.scope:'';
 if(q.view==='items'){
  const id=integer(q.id);if(!id)return json(400,{error:'Wybierz archiwum.'});
  const [archive]=await sql`SELECT * FROM round_archives WHERE id=${id}`;
  if(!archive)return json(404,{error:'Nie znaleziono archiwum.'});
  const after=integer(q.after),kind=String(q.kind||'');
  const rows=await sql`SELECT id,kind,item_id AS "itemId",data FROM round_archive_items WHERE archive_id=${id} AND id>${after} AND (${kind}='' OR kind=${kind}) ORDER BY id LIMIT 51`;
  const more=rows.length>50,items=rows.slice(0,50);return json(200,{archive,items,after:more?items.at(-1).id:null});
 }
 if(q.view==='logs'){
  const rows=await sql`SELECT * FROM admin_audit_log WHERE (${before}=0 OR id<${before}) AND (${scope}='' OR scope=${scope}) ORDER BY id DESC LIMIT 51`;
  return json(200,{items:rows.slice(0,50),before:rows.length>50?rows[49].id:null});
 }
 const rows=await sql`SELECT * FROM round_archives WHERE (${before}=0 OR id<${before}) AND (${scope}='' OR scope=${scope}) ORDER BY id DESC LIMIT 21`;
 return json(200,{items:rows.slice(0,20),before:rows.length>20?rows[19].id:null});
});
