function transaction(sql, queries, {participantId = null, deviceToken = null, exclusive = false} = {}) {
  const locks = [exclusive ? sql`SELECT pg_advisory_xact_lock(739162)` : sql`SELECT pg_advisory_xact_lock_shared(739162)`];
  if (deviceToken) locks.push(sql`SELECT pg_advisory_xact_lock(hashtext(${deviceToken}))`);
  if (participantId) locks.push(sql`SELECT id FROM participants WHERE id = ${participantId} FOR UPDATE`);
  const audit=require('./admin-audit').current();
  const before=[],after=[];
  if(audit&&participantId&&audit.participantId===Number(participantId)){
    before.push(sql`UPDATE admin_audit_log SET details=details||jsonb_build_object('before',(SELECT jsonb_build_object('score',p.score,'answered_count',p.answered_count,'score_at',p.score_at) FROM participants p WHERE p.id=${participantId})) WHERE id=${audit.id}`);
    after.push(sql`UPDATE admin_audit_log SET details=details||jsonb_build_object('after',(SELECT jsonb_build_object('score',p.score,'answered_count',p.answered_count,'score_at',p.score_at) FROM participants p WHERE p.id=${participantId})) WHERE id=${audit.id}`);
  }
  return sql.transaction([...locks,...before,...queries,...after]).then(results => results.slice(locks.length+before.length,locks.length+before.length+queries.length));
}
module.exports = {transaction};
