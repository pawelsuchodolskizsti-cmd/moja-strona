const { neon } = require('@neondatabase/serverless');
const { ensureBonusSchema } = require('../db-schema');

function getPhase(gameState) {
  const startedAt = gameState?.started_at ? new Date(gameState.started_at).getTime() : null;
  const endedAt = gameState?.ended_at ? new Date(gameState.ended_at).getTime() : null;
  const summaryAt = gameState?.summary_at ? new Date(gameState.summary_at).getTime() : null;
  const durationMs = Number(gameState?.duration_minutes || 60) * 60 * 1000;

  if (startedAt) {
    return (Date.now() - startedAt) < durationMs ? 'active' : 'ended';
  }

  if (endedAt || summaryAt) {
    return 'ended';
  }

  return 'idle';
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    await ensureBonusSchema(sql);

    const [gameRows, participantRows, answerCountRows, bonusCountRows] = await Promise.all([
      sql`
        SELECT
          started_at,
          ended_at,
          summary_at,
          duration_minutes,
          announcement_text,
          announcement_updated_at
        FROM game_state
        WHERE id = 1
        LIMIT 1
      `,
      sql`
        SELECT
          id,
          first_name AS "firstName",
          last_name AS "lastName",
          city,
          score,
          answered_count AS "answeredCount",
          last_activity AS "lastActivity"
        FROM participants
        ORDER BY score DESC, answered_count DESC, last_activity ASC NULLS LAST, id ASC
      `,
      sql`SELECT COUNT(*)::int AS "count" FROM answers`,
      sql`SELECT COUNT(*)::int AS "count" FROM bonus_redemptions`
    ]);

    const gameState = gameRows[0] || {
      started_at: null,
      ended_at: null,
      summary_at: null,
      duration_minutes: 60,
      announcement_text: null,
      announcement_updated_at: null
    };

    const leaderboard = participantRows.map((participant, index) => ({
      rank: index + 1,
      name: `${participant.firstName || ''} ${participant.lastName || ''}`.trim() || 'Uczestnik',
      city: participant.city || '',
      score: Number(participant.score || 0),
      answeredCount: Number(participant.answeredCount || 0),
      lastActivity: participant.lastActivity || null
    }));

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=0, s-maxage=3, stale-while-revalidate=10'
      },
      body: JSON.stringify({
        phase: getPhase(gameState),
        startedAt: gameState.started_at || null,
        endedAt: gameState.ended_at || null,
        summaryAt: gameState.summary_at || null,
        durationMinutes: Number(gameState.duration_minutes || 60),
        announcementText: gameState.announcement_text || '',
        announcementUpdatedAt: gameState.announcement_updated_at || null,
        updatedAt: new Date().toISOString(),
        stats: {
          participants: leaderboard.length,
          answers: Number(answerCountRows[0]?.count || 0),
          bonuses: Number(bonusCountRows[0]?.count || 0)
        },
        leaderboard
      })
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Blad publicznego ekranu wynikow: ' + error.message })
    };
  }
};
