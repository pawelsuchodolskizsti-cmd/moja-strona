function transaction(sql, queries, {participantId = null, deviceToken = null, exclusive = false} = {}) {
  const locks = [exclusive ? sql`SELECT pg_advisory_xact_lock(739162)` : sql`SELECT pg_advisory_xact_lock_shared(739162)`];
  if (deviceToken) locks.push(sql`SELECT pg_advisory_xact_lock(hashtext(${deviceToken}))`);
  if (participantId) locks.push(sql`SELECT id FROM participants WHERE id = ${participantId} FOR UPDATE`);
  return sql.transaction([...locks,...queries]).then(results => results.slice(locks.length));
}
module.exports = {transaction};
