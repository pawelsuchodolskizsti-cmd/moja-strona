const {neon}=require('@neondatabase/serverless');
const {withApi,json}=require('../api-guard');
const {ensureCommunicationSchema,hash,validToken}=require('../communication-consent');
exports.handler=withApi('communication-consent',async event=>{
  const {action,communicationToken}=event.payload;
  if(!['status','withdraw'].includes(action)||!validToken(communicationToken))return json(400,{error:'Brak klucza do zarządzania zgodą na tym urządzeniu.'});
  const sql=neon(process.env.DATABASE_URL);await ensureCommunicationSchema(sql);const tokenHash=hash(communicationToken);
  if(action==='withdraw')await sql`UPDATE communication_consents SET status='withdrawn',withdrawn_at=NOW() WHERE manage_token_hash=${tokenHash} AND status<>'withdrawn'`;
  const rows=await sql`SELECT status,COUNT(*)::int AS count FROM communication_consents WHERE manage_token_hash=${tokenHash} GROUP BY status`;
  return json(200,{ok:true,states:rows});
});
