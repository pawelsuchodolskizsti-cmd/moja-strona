const {neon}=require('@neondatabase/serverless');
const {withApi,json}=require('../api-guard');
const {getInstitutions,normalize}=require('../institutions');
const {ensureScoringSchema}=require('../db-schema');
const {transaction}=require('../transactions');
exports.handler=withApi('admin-institutions',async event=>{
  const sql=neon(process.env.DATABASE_URL);
  await ensureScoringSchema(sql);
  const institutions=await getInstitutions(sql,true);
  if(event.httpMethod==='GET') {
    const unassigned=await sql`SELECT p.id,p.first_name AS "firstName",p.last_name AS "lastName",p.city
      FROM participants p JOIN game_state g ON g.scope=p.scope AND p.game_started_at=g.round_started_at
      WHERE p.scope='live' AND p.institution_id IS NULL ORDER BY p.last_name,p.first_name,p.id`;
    return json(200,{institutions,unassigned});
  }
  const body=event.payload;
  if(body.action==='assign') {
    if(!body.participantId||!body.institutionId) return json(400,{error:'Wybierz uczestnika i grupę.'});
    const [rows]=await transaction(sql,[sql`UPDATE participants p SET institution_id=i.id,city=i.code
      FROM group_codes i WHERE p.id=${Number(body.participantId)} AND p.scope='live' AND p.game_started_at IS NOT DISTINCT FROM (SELECT round_started_at FROM game_state WHERE scope='live') AND i.id=${Number(body.institutionId)} AND i.active RETURNING p.id`],{exclusive:true});
    return rows.length ? json(200,{ok:true}) : json(400,{error:'Uczestnik lub aktywna grupa nie istnieje.'});
  }
  if(body.action!=='save') return json(400,{error:'Nieznana operacja.'});
  if(typeof body.name!=='string'||typeof body.active!=='boolean'||body.city)return json(400,{error:'Podaj tylko kod i jego dostępność.'});
  const name=normalize(body.name);
  if(!/^[A-Z0-9][A-Z0-9_-]{0,23}$/.test(name))return json(400,{error:'Kod: 1-24 znaki, litery A-Z, cyfry, myślnik lub podkreślenie.'});
  const id=body.institutionId ? Number(body.institutionId) : null;
  if(id&&(!Number.isInteger(body.revision)||body.revision<1))return json(400,{error:'Odśwież listę grup i spróbuj ponownie.'});
  try {
    const query=id ? sql`UPDATE group_codes SET code=${name},active=${body.active},revision=revision+1
      WHERE id=${id} AND revision=${body.revision} RETURNING id,code AS name,''::text AS city,active,revision`
      : sql`INSERT INTO group_codes(code,active) VALUES(${name},${body.active}) RETURNING id,code AS name,''::text AS city,active,revision`;
    const [rows]=await transaction(sql,[query],{exclusive:true});
    if(!rows.length)return json(409,{error:'Ta grupa została zmieniona w innym oknie. Odśwież listę przed kolejną edycją.'});
    return json(200,{ok:true,...rows[0]});
  }catch(error){if(error.code==='23505')return json(409,{error:'Taki kod już istnieje.'});throw error;}
});
