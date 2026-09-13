const { ensureScoringSchema } = require('../db-schema');
const { withApi } = require('../api-guard');
const { neon } = require('@neondatabase/serverless');
const { ensureBonusSchema, ensureAppRuntimeSchema } = require('../db-schema');
const { resolveScope, ACTIVE_SCOPE, TEST_SCOPE } = require('../data-scope');
const { materializeTestProgress } = require('../test-simulation');

function getPhase(gameState) {
  const start=gameState?.started_at?new Date(gameState.started_at).getTime():null;
  if(start && Date.now()<start+Number(gameState.duration_minutes||180)*60000) return gameState.technical_pause_active?'paused':'active';
  const summary=gameState?.summary_at?new Date(gameState.summary_at).getTime():start?start+Number(gameState.duration_minutes||180)*60000+300000:null;
  if(summary && Date.now()>=summary)return 'thanks';
  return gameState?.ended_at||start?'ended':'idle';
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
  await ensureScoringSchema(sql);

  try {
    await ensureBonusSchema(sql);
    await ensureAppRuntimeSchema(sql);

    const { scope, runtime } = await resolveScope(sql, event?.queryStringParameters?.scope || ACTIVE_SCOPE);
    if (scope === TEST_SCOPE) {
      await materializeTestProgress(sql);
    }

    const [roundState]=await sql`SELECT round_started_at FROM game_state WHERE scope=${scope}`;
    const round=roundState?.round_started_at||null;
    const [gameRows, participantRows, answerCountRows, bonusCountRows] = await Promise.all([
      sql`
        SELECT
          started_at,
          ended_at,
          summary_at,
          duration_minutes,
          technical_pause_active,
          technical_pause_text,
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
          score_at AS "scoreAt",created_at AS "createdAt",
          last_activity AS "lastActivity"
        FROM participants
        WHERE scope = ${scope}
          AND game_started_at IS NOT DISTINCT FROM (SELECT round_started_at FROM game_state WHERE scope=${scope})
        ORDER BY score DESC, answered_count DESC, last_activity ASC NULLS LAST, id ASC
      `,
      sql`SELECT COUNT(*)::int AS "count" FROM answers WHERE scope=${scope} AND participant_id IN (SELECT id FROM participants WHERE scope=${scope} AND game_started_at IS NOT DISTINCT FROM (SELECT round_started_at FROM game_state WHERE scope=${scope}))`,
      sql`SELECT COUNT(*)::int AS "count" FROM bonus_redemptions WHERE scope=${scope} AND participant_id IN (SELECT id FROM participants WHERE scope=${scope} AND game_started_at IS NOT DISTINCT FROM (SELECT round_started_at FROM game_state WHERE scope=${scope}))`
    ]);

    const gameState = gameRows[0] || {
      started_at: null,
      ended_at: null,
      summary_at: null,
      duration_minutes: 180,
      announcement_text: null,
      announcement_updated_at: null,
      results_participants_revealed_at: null,
      results_cities_revealed_at: null
    };

    participantRows.sort(require('../../public/game-ranking').compareParticipants);
    const leaderboard = participantRows.map((participant, index) => ({
      id: participant.id,
      rank: index + 1,
      name: `${participant.firstName || ''} ${participant.lastName || ''}`.trim() || 'Uczestnik',
      city: participant.city || '',
      score: Number(participant.score || 0),
      answeredCount: Number(participant.answeredCount || 0),
      scoreAt:participant.scoreAt||participant.createdAt,
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

    const phase=getPhase(gameState);
    const final=['ended','thanks'].includes(phase);
    const remaining=gameState.started_at?new Date(gameState.started_at).getTime()+Number(gameState.duration_minutes||180)*60000-Date.now():null;
    const suspense=remaining!==null&&remaining>0&&remaining<=180000;
    const personsVisible=(!final&&!suspense)||Boolean(gameState.results_participants_revealed_at);
    const citiesVisible=(!final&&!suspense)||Boolean(gameState.results_cities_revealed_at);
    const naturalEnd=gameState.started_at?new Date(new Date(gameState.started_at).getTime()+Number(gameState.duration_minutes||180)*60000):null;
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      },
      body: JSON.stringify({
        phase,
        technicalPauseActive:Boolean(gameState.technical_pause_active),technicalPauseText:gameState.technical_pause_text||'',
        startedAt: gameState.started_at || null,
        endedAt: gameState.ended_at || (final && naturalEnd ? naturalEnd.toISOString() : null),
        summaryAt: gameState.summary_at || (naturalEnd ? new Date(naturalEnd.getTime()+300000).toISOString() : null),
        durationMinutes: Number(gameState.duration_minutes || 180),
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
        cityStats: citiesVisible?cityStats:[],
        leaderboard: personsVisible?leaderboard.map(p=>citiesVisible?p:{...p,city:''}):[]
      })
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Błąd publicznego ekranu wyników: ' + error.message })
    };
  }
};

exports.handler = withApi('public-scoreboard', exports.handler);
