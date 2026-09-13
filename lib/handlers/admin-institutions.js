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
    if(!body.participantId||!body.institutionId) return json(400,{error:'Wybierz uczestnika i placówkę.'});
    const [rows]=await transaction(sql,[sql`UPDATE participants p SET institution_id=i.id,city=i.name || ' — ' || i.city
      FROM institutions i WHERE p.id=${Number(body.participantId)} AND p.scope='live' AND p.game_started_at IS NOT DISTINCT FROM (SELECT round_started_at FROM game_state WHERE scope='live') AND i.id=${Number(body.institutionId)} AND i.active RETURNING p.id`],{exclusive:true});
    return rows.length ? json(200,{ok:true}) : json(400,{error:'Uczestnik lub aktywna placówka nie istnieje.'});
  }
  if(body.action!=='save') return json(400,{error:'Nieznana operacja.'});
  if(typeof body.name!=='string'||typeof body.city!=='string'||typeof body.active!=='boolean') return json(400,{error:'Podaj nazwę, miasto i dostępność placówki.'});
  const name=body.name.trim().replace(/\s+/g,' '),city=body.city.trim().replace(/\s+/g,' ');
  if(!normalize(name)||!normalize(city)||name.length>160||city.length>100) return json(400,{error:'Nazwa może mieć do 160 znaków, a miasto do 100. Oba pola są wymagane.'});
  const id=body.institutionId ? Number(body.institutionId) : null;
  if(id&&(!Number.isInteger(body.revision)||body.revision<1))return json(400,{error:'Odśwież listę placówek i spróbuj ponownie.'});
  try {
    const query=id ? sql`UPDATE institutions SET name=${name},city=${city},name_key=${normalize(name)},city_key=${normalize(city)},active=${body.active},revision=revision+1
      WHERE id=${id} AND revision=${body.revision} RETURNING id,name,city,active,revision`
      : sql`INSERT INTO institutions(name,city,name_key,city_key,active) VALUES(${name},${city},${normalize(name)},${normalize(city)},${body.active}) RETURNING id,name,city,active,revision`;
    const [rows]=await transaction(sql,[query],{exclusive:true});
    if(!rows.length)return json(409,{error:'Ta placówka została zmieniona w innym oknie. Odśwież listę przed kolejną edycją.'});
    return json(200,{ok:true,...rows[0]});
  }catch(error){if(error.code==='23505')return json(409,{error:'Placówka o tej nazwie i mieście już istnieje.'});throw error;}
});
