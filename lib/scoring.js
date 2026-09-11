function scoreQuery(sql, participantId = null, scope = null) {
  return sql`
    WITH totals AS (
      SELECT p.id,
        GREATEST(0, COALESCE(p.manual_score_adjustment, 0)
          + (SELECT COUNT(*)::int FROM answers a JOIN questions_catalog q ON q.id=a.question_id AND q.active=TRUE WHERE a.participant_id=p.id AND a.scope=p.scope AND a.correct=TRUE)
          + (SELECT COUNT(*)::int FROM bonus_redemptions b WHERE b.participant_id=p.id AND b.scope=p.scope)) AS score,
        (SELECT COUNT(*)::int FROM answers a JOIN questions_catalog q ON q.id=a.question_id AND q.active=TRUE WHERE a.participant_id=p.id AND a.scope=p.scope) AS answers
      FROM participants p WHERE (${scope}::text IS NULL OR p.scope=${scope}) AND (${participantId}::int IS NULL OR p.id=${participantId})
    )
    UPDATE participants p SET score=t.score, answered_count=t.answers,
      score_at=CASE WHEN p.score IS DISTINCT FROM t.score OR p.answered_count IS DISTINCT FROM t.answers THEN NOW() ELSE p.score_at END
    FROM totals t WHERE p.id=t.id RETURNING p.id,p.score,p.answered_count AS answers
  `;
}
module.exports = {scoreQuery};
