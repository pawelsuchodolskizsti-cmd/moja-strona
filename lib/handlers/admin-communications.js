const {neon}=require('@neondatabase/serverless');
const {withApi,json}=require('../api-guard');
const {ensureCommunicationSchema,policy}=require('../communication-consent');
exports.handler=withApi('admin-communications',async event=>{
  const sql=neon(process.env.DATABASE_URL);await ensureCommunicationSchema(sql);const body=event.payload||{},q=event.queryStringParameters||{};
  if(event.httpMethod==='POST'){
    if(body.action!=='withdraw'||!Number.isSafeInteger(body.contactId)||body.contactId<=0)return json(400,{error:'Wybierz zapis do wycofania.'});
    const rows=await sql`UPDATE communication_consents SET status='withdrawn',withdrawn_at=COALESCE(withdrawn_at,NOW()) WHERE id=${body.contactId} RETURNING id`;
    return rows.length?json(200,{ok:true}):json(404,{error:'Nie znaleziono zapisu.'});
  }
  const before=Number(q.before||0),search=String(q.search||'').slice(0,200),status=String(q.status||'');
  if(!Number.isSafeInteger(before)||before<0||!['','draft','pending_guardian','active','withdrawn'].includes(status))return json(400,{error:'Nieprawidłowy filtr.'});
  const items=await sql`SELECT id,first_name AS "firstName",last_name AS "lastName",institution_label AS institution,email,consent_version AS version,consent_text AS "consentText",consented_at AS "consentedAt",age_declaration AS "ageDeclaration",status,withdrawn_at AS "withdrawnAt",source
    FROM communication_consents WHERE (${before}=0 OR id<${before}) AND (${status}='' OR status=${status})
    AND (${search}='' OR strpos(lower(first_name||' '||last_name||' '||email||' '||institution_label),lower(${search}))>0) ORDER BY id DESC LIMIT 51`;
  const counts=await sql`SELECT status,COUNT(*)::int AS count FROM communication_consents GROUP BY status`;
  return json(200,{items:items.slice(0,50),before:items.length>50?items[49].id:null,counts,draft:policy.draft});
});
