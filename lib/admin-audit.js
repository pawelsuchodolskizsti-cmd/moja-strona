const context=new (require('node:async_hooks').AsyncLocalStorage)();
const {neon}=require('@neondatabase/serverless');
const {ensureOperationsSchema}=require('./operations-schema');
/* Only explicitly selected metadata reaches the log; credentials and session tokens never do. */
function details(body){
 const out={};for(const k of ['participantId','questionId','institutionId','bonusId','ticketId','targetId','targetType','minutes','active','revision','enabled','status','scope'])if(body[k]!==undefined)out[k]=body[k];
 for(const k of ['name','city','message'])if(typeof body[k]==='string'&&body.action!=='account')out[k]=body[k];
 if(body.questions||body.question){const qs=body.questions||[body.question];out.questionIds=(Array.isArray(qs)?qs:[qs]).map(x=>x.id);}
 if(body.bonuses||body.bonus){const bs=body.bonuses||[body.bonus];out.bonusIds=(Array.isArray(bs)?bs:[bs]).map(x=>x.id);}
 if(body.questionCount!==undefined)out.questionCount=body.questionCount;
 if(body.title)out.title=body.title;
 if(body.body)out.messageLength=String(body.body).length;
 return out;
}
async function begin(name,event){
 const sql=neon(process.env.DATABASE_URL);await ensureOperationsSchema(sql);
 const d=details(event.payload||{});
 if(['game-state','admin-history'].includes(name))d.scope=(await require('./data-scope').resolveScope(sql,event.payload?.scope||'live')).scope;
 if(name==='test-mode')d.scope='test';
 if(name==='admin-adjust-participant'){
  const [p]=await sql`SELECT scope,score,answered_count,score_at FROM participants WHERE id=${Number(event.payload.participantId)||0}`;
  if(p){d.scope=p.scope;}
 }
 const [row]=await sql`INSERT INTO admin_audit_log(actor,endpoint,action,scope,details)
 VALUES(${process.env.ADMIN_LOGIN||'admin'},${name},${event.payload?.action||'save'},${d.scope||null},${JSON.stringify(d)}::jsonb) RETURNING id`;
 return {sql,id:row.id,participantId:name==='admin-adjust-participant'?Number(event.payload.participantId):null};
}
async function finish(log,response){

 const code=response?.statusCode||500;let failed=code>=400;
 try{const data=JSON.parse(response.body);failed=failed||data.ok===false;}catch{}
 await log.sql`UPDATE admin_audit_log SET finished_at=NOW(),http_status=${code},status=${failed?'failed':'success'} WHERE id=${log.id}`;
}
module.exports={begin,finish,run:(log,fn)=>context.run(log,fn),current:()=>context.getStore()};
