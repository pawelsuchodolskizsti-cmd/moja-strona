const {neon}=require('@neondatabase/serverless');
const {withApi,json}=require('../api-guard');
const {ensureScoringSchema}=require('../db-schema');
const {getInstitutions,decorate}=require('../institutions');
const {resolveScope}=require('../data-scope');
exports.handler=withApi('admin-records',async event=>{
 const q=event.queryStringParameters||{},kind=q.kind||'answers';
 if(!['answers','bonuses'].includes(kind))return json(400,{error:'Nieprawidłowy rodzaj danych.'});
 const before=Number(q.before||0),pid=Number(q.participantId||0),question=Number(q.question||0),limit=50;
 if([before,pid,question].some(n=>!Number.isSafeInteger(n)||n<0))return json(400,{error:'Nieprawidłowy filtr.'});
 const sql=neon(process.env.DATABASE_URL);await ensureScoringSchema(sql);const institutions=await getInstitutions(sql,true);
 const {scope}=await resolveScope(sql,q.scope||'active');const [game]=await sql`SELECT round_started_at FROM game_state WHERE scope=${scope}`;
 const round=q.round||game?.round_started_at||null;
 if(q.round&&!Number.isFinite(Date.parse(q.round)))return json(400,{error:'Nieprawidłowa runda.'});
 const search=String(q.search||'').slice(0,256),city=String(q.city||''),correct=String(q.correct||''),bonus=String(q.bonus||'');
 let rows;
 if(kind==='answers')rows=await sql`SELECT a.id,a.participant_id AS "participantId",p.first_name||' '||p.last_name AS "participantName",p.city AS "participantCity",p.institution_id AS "institutionId",a.question_id AS "questionId",c.text AS "questionText",a.answer,a.correct,a.created_at AS "createdAt"
 FROM answers a JOIN participants p ON p.id=a.participant_id LEFT JOIN questions_catalog c ON c.id=a.question_id LEFT JOIN institutions i ON i.id=p.institution_id
 WHERE p.scope=${scope} AND p.game_started_at IS NOT DISTINCT FROM ${round}::timestamptz
 AND (${before}=0 OR a.id<${before}) AND (${pid}=0 OR p.id=${pid}) AND (${question}=0 OR a.question_id=${question})
 AND (${correct}='' OR ${correct}='all' OR a.correct=(${correct}='correct'))
 AND (${city}='' OR COALESCE(i.name||' - '||i.city,'Nieprzypisana placówka'||CASE WHEN COALESCE(p.city,'')<>'' THEN ' - '||p.city ELSE '' END)=${city})
 AND (${search}='' OR strpos(lower(p.first_name||' '||p.last_name||' '||COALESCE(c.text,'')||' '||a.answer||' '||COALESCE(i.name||' - '||i.city,'Nieprzypisana placówka'||CASE WHEN COALESCE(p.city,'')<>'' THEN ' - '||p.city ELSE '' END)),lower(${search}))>0)
 ORDER BY a.id DESC LIMIT ${limit+1}`;
 else rows=await sql`SELECT b.id,b.participant_id AS "participantId",p.first_name||' '||p.last_name AS "participantName",p.city AS "participantCity",p.institution_id AS "institutionId",b.bonus_id AS "bonusId",c.label AS "bonusLabel",b.created_at AS "createdAt"
 FROM bonus_redemptions b JOIN participants p ON p.id=b.participant_id LEFT JOIN bonus_catalog c ON c.id=b.bonus_id LEFT JOIN institutions i ON i.id=p.institution_id
 WHERE p.scope=${scope} AND p.game_started_at IS NOT DISTINCT FROM ${round}::timestamptz
 AND (${before}=0 OR b.id<${before}) AND (${pid}=0 OR p.id=${pid}) AND (${bonus}='' OR b.bonus_id=${bonus})
 AND (${city}='' OR COALESCE(i.name||' - '||i.city,'Nieprzypisana placówka'||CASE WHEN COALESCE(p.city,'')<>'' THEN ' - '||p.city ELSE '' END)=${city})
 AND (${search}='' OR strpos(lower(p.first_name||' '||p.last_name||' '||COALESCE(c.label,b.bonus_id)||' '||COALESCE(i.name||' - '||i.city,'Nieprzypisana placówka'||CASE WHEN COALESCE(p.city,'')<>'' THEN ' - '||p.city ELSE '' END)),lower(${search}))>0)
 ORDER BY b.id DESC LIMIT ${limit+1}`;
 decorate(rows,institutions,'participantCity');return json(200,{items:rows.slice(0,limit),before:rows.length>limit?rows[limit-1].id:null,dataScope:scope,roundStartedAt:round});
});
