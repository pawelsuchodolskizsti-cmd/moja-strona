// Versions are persisted in PostgreSQL, not just in the memory of one serverless instance.
// Bump a component version whenever its schema, indexes or seed migrations change.
let versionsPromise;
async function versions(sql) {
  if (!versionsPromise) versionsPromise = (async () => {
    let rows;
    try { rows = await sql`SELECT component, version FROM qr_schema_migrations`; }
    catch (error) {
      if (error.code !== '42P01') throw error;
      await sql.transaction([
        sql`SELECT pg_advisory_xact_lock(739162)`,
        sql`CREATE TABLE IF NOT EXISTS qr_schema_migrations (
          component TEXT PRIMARY KEY, version INTEGER NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`
      ]);
      rows = await sql`SELECT component, version FROM qr_schema_migrations`;
    }
    return new Map(rows.map(row => [row.component, Number(row.version)]));
  })().catch(error => { versionsPromise = null; throw error; });
  return versionsPromise;
}

async function migrate(sql, component, version, build) {
  const applied = await versions(sql);
  if ((applied.get(component) || 0) >= version) return;
  // Another instance may have finished this component since our initial read.
  const latest = await sql`SELECT version FROM qr_schema_migrations WHERE component=${component}`;
  if (Number(latest[0]?.version || 0) >= version) {
    applied.set(component, Number(latest[0].version)); return;
  }
  const queries = [];
  await build((...args) => { queries.push(sql(...args)); });
  // All DDL, data fixes and the version stamp succeed or roll back together.
  // First deployments are serialized with each other and with gameplay writes.
  await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(739162)`,
    ...queries,
    sql`INSERT INTO qr_schema_migrations(component,version) VALUES(${component},${version})
        ON CONFLICT(component) DO UPDATE SET version=GREATEST(qr_schema_migrations.version,EXCLUDED.version),applied_at=NOW()`
  ]);
  applied.set(component, version);
}

module.exports = { migrate };
