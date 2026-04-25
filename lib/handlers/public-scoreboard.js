const { neon } = require('@neondatabase/serverless');
const { ensureBonusSchema, ensureAppRuntimeSchema } = require('../db-schema');
const { resolveScope, ACTIVE_SCOPE } = require('../data-scope');

function getPhase(gameState) {
  const startedAt = gameState?.started_at ? new Date(gameState.started_at).getTime() : null;
  const endedAt = gameState?.ended_at ? new Date(gameState.ended_at).getTime() : null;
  const summaryAt = gameState?.summary_at ? new Date(gameState.summary_at).getTime() : null;
  const durationMs = Number(gameState?.duration_minutes || 10) * 60 * 1000;

  if (startedAt) {
    return (Date.now() - startedAt) < durationMs ? 'active' : 'ended';
  }

  if (summaryAt && Date.now() >= summaryAt) {
    return 'thanks';
  }

  if (endedAt || summaryAt) {
    return 'ended';
  }

  return 'idle';
}

function getUpdatedAt(gameState, participants) {
  const timestamps = [
    gameState?.announcement_updated_at,
    gameState?.results_participants_revealed_at,
    gameState?.results_cities_revealed_at,
    gameState?.started_at,
    gameState?.ended_at,
    gameState?.summary_at,
    ...participants.map((participant) => participant.lastActivity || null)
  ]
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));

  if (!timestamps.length) {
    return null;
  }

  return new Date(Math.max(...timestamps)).toISOString();
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    await ensureBonusSchema(sql);
    await ensureAppRuntimeSchema(sql);

    const { scope, runtime } = await resolveScope(sql, event?.queryStringParameters?.scope || ACTIVE_SCOPE);

    const [gameRows, participantRows, answerCountRows, bonusCountRows] = await Promise.all([
      sql`
        SELECT
          started_at,
          ended_at,
          summary_at,
          duration_minutes,
          announcement_text,
          announcement_updated_at,
          results_participants_revealed_at,
          results_cities_revealed_at
        FROM game_state
        WHERE scope = ${scope}
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
        WHERE scope = ${scope}
        ORDER BY score DESC, answered_count DESC, last_activity ASC NULLS LAST, id ASC
      `,
      sql`SELECT COUNT(*)::int AS "count" FROM answers WHERE scope = ${scope}`,
      sql`SELECT COUNT(*)::int AS "count" FROM bonus_redemptions WHERE scope = ${scope}`
    ]);

    const gameState = gameRows[0] || {
      started_at: null,
      ended_at: null,
      summary_at: null,
      duration_minutes: 10,
      announcement_text: null,
      announcement_updated_at: null,
      results_participants_revealed_at: null,
      results_cities_revealed_at: null
    };

    const leaderboard = participantRows.map((participant, index) => ({
      rank: index + 1,
      name: `${participant.firstName || ''} ${participant.lastName || ''}`.trim() || 'Uczestnik',
      city: participant.city || '',
      score: Number(participant.score || 0),
      answeredCount: Number(participant.answeredCount || 0),
      lastActivity: participant.lastActivity || null
    }));

    const cityStats = [...participantRows.reduce((map, participant) => {
      const cityName = String(participant.city || 'Bez miasta').trim() || 'Bez miasta';
      const current = map.get(cityName) || {
        city: cityName,
        score: 0,
        participants: 0,
        answers: 0
      };

      current.score += Number(participant.score || 0);
      current.participants += 1;
      current.answers += Number(participant.answeredCount || 0);
      map.set(cityName, current);
      return map;
    }, new Map()).values()]
      .sort((a, b) =>
        b.score - a.score ||
        b.participants - a.participants ||
        a.city.localeCompare(b.city, 'pl')
      );

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
        durationMinutes: Number(gameState.duration_minutes || 10),
        announcementText: gameState.announcement_text || '',
        announcementUpdatedAt: gameState.announcement_updated_at || null,
        resultsReveal: {
          participantsAt: gameState.results_participants_revealed_at || null,
          citiesAt: gameState.results_cities_revealed_at || null
        },
        updatedAt: getUpdatedAt(gameState, leaderboard),
        dataScope: scope,
        testModeEnabled: Boolean(runtime.testModeEnabled),
        stats: {
          participants: leaderboard.length,
          answers: Number(answerCountRows[0]?.count || 0),
          bonuses: Number(bonusCountRows[0]?.count || 0)
        },
        cityStats,
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


