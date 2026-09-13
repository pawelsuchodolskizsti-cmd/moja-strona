const {neon}=require('@neondatabase/serverless');
const {withApi,json}=require('../api-guard');
const {getInstitutions}=require('../institutions');
exports.handler=withApi('institutions',async()=>{
  const rows=await getInstitutions(neon(process.env.DATABASE_URL));
  return json(200,{institutions:rows.map(({id,name,city})=>({id,name,city}))});
});
