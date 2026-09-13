const {migrate} = require('./schema-migrations');
const {ensureCoreSchema} = require('./db-schema');
let schemaPromise;
const seeds = [
  ['elblag-2', 'Placówka Opiekuńczo-Wychowawcza nr 2', 'Elbląg'],
  ['elblag-1', 'Placówka Opiekuńczo-Wychowawcza nr 1', 'Elbląg'],
  ['jazowa-jas', 'Dom Wsparcia „Jaś”', 'Jazowa']
];
function normalize(value) { return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ł/g,'l').replace(/Ł/g,'L').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
async function ensureInstitutionSchema(sql) {
  if (!schemaPromise) schemaPromise = (async () => {
    await ensureCoreSchema(sql);
    await migrate(sql, 'institutions', 1, async (sql) => {
    await sql`CREATE TABLE IF NOT EXISTS institutions (
      id SERIAL PRIMARY KEY, seed_key TEXT UNIQUE, name TEXT NOT NULL, city TEXT NOT NULL,
      name_key TEXT NOT NULL, city_key TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
      revision INTEGER NOT NULL DEFAULT 1, UNIQUE(name_key,city_key))`;
    await sql`ALTER TABLE participants ADD COLUMN IF NOT EXISTS institution_id INTEGER REFERENCES institutions(id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_participants_institution ON participants(institution_id)`;
    for (const [key,name,city] of seeds) await sql`INSERT INTO institutions(seed_key,name,city,name_key,city_key)
      VALUES(${key},${name},${city},${normalize(name)},${normalize(city)}) ON CONFLICT DO NOTHING`;
    });
  })().catch(error => {schemaPromise=null;throw error;});
  await schemaPromise;
}
async function getInstitutions(sql, all=false) {
  await ensureInstitutionSchema(sql);
  return sql`SELECT id,name,city,active,revision FROM institutions WHERE ${all} OR active ORDER BY city,name,id`;
}
function decorate(rows, institutions, field='city') {
  const byId=new Map(institutions.map(i=>[Number(i.id),i]));
  rows.forEach(p=>{
    const institution=byId.get(Number(p.institutionId));
    p[field]=institution ? `${institution.name} - ${institution.city}` : `Nieprzypisana placówka${p[field] ? ' - '+p[field] : ''}`;
  });
  return rows;
}
module.exports={ensureInstitutionSchema,getInstitutions,normalize,decorate};
