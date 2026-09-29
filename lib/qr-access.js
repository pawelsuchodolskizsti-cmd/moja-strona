const {randomBytes}=require('node:crypto');
const {migrate}=require('./schema-migrations');
let ready;
async function ensureQrAccess(sql){
  if(!ready)ready=migrate(sql,'qr-access',1,async q=>{
    q`CREATE TABLE IF NOT EXISTS qr_access (kind TEXT NOT NULL,content_id TEXT NOT NULL,token TEXT NOT NULL UNIQUE,PRIMARY KEY(kind,content_id))`;
  }).catch(e=>{ready=null;throw e;});
  await ready;
}
async function resolveQr(sql,kind,token){
  if(typeof token!=='string'||!/^[a-f0-9]{48}$/.test(token))return null;
  await ensureQrAccess(sql);
  const [row]=await sql`SELECT content_id FROM qr_access WHERE kind=${kind} AND token=${token}`;
  return row?.content_id||null;
}
async function attachQr(sql,questions,bonuses){
  await ensureQrAccess(sql);
  const existing=await sql`SELECT kind,content_id,token FROM qr_access`;
  const map=new Map(existing.map(row=>[row.kind+':'+row.content_id,row.token]));
  const missing=[];
  for(const [kind,items] of [['question',questions],['bonus',bonuses]])for(const item of items){
    const key=kind+':'+item.id;
    if(!map.has(key)){missing.push(sql`INSERT INTO qr_access(kind,content_id,token) VALUES(${kind},${String(item.id)},${randomBytes(24).toString('hex')}) ON CONFLICT(kind,content_id) DO NOTHING`);map.set(key,'');}
  }
  if(missing.length){await sql.transaction(missing);const rows=await sql`SELECT kind,content_id,token FROM qr_access`;rows.forEach(row=>map.set(row.kind+':'+row.content_id,row.token));}
  for(const [kind,items] of [['question',questions],['bonus',bonuses]])for(const item of items)item.qrToken=map.get(kind+':'+item.id);
}
module.exports={resolveQr,attachQr};
