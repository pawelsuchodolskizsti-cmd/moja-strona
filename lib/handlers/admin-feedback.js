const {neon}=require('@neondatabase/serverless');
const {withApi,json}=require('../api-guard');
const {ensureFeedbackSchema}=require('../player-feedback');
exports.handler=withApi('admin-feedback',async event=>{
  const before=Number(event.queryStringParameters?.before||0);
  if(!Number.isSafeInteger(before)||before<0)return json(400,{error:'Nieprawidłowa strona.'});
  const sql=neon(process.env.DATABASE_URL);await ensureFeedbackSchema(sql);
  const rows=await sql`SELECT id,rating,liked,improvements,round_started_at,updated_at FROM player_feedback WHERE (${before}=0 OR id<${before}) ORDER BY id DESC LIMIT 31`;
  const [summary]=await sql`SELECT COUNT(*)::int AS count,ROUND(AVG(rating),1) AS average FROM player_feedback`;
  return json(200,{items:rows.slice(0,30),before:rows.length>30?rows[29].id:null,summary});
});
