const { ensureScoringSchema } = require('../db-schema');
const {getInstitutions,decorate}=require('../institutions');
const { withApi } = require('../api-guard');
﻿const { neon } = require('@neondatabase/serverless');
const { ensureCoreSchema, ensureBonusSchema, ensureBonusCatalogSchema, ensureQuestionTrackingSchema, ensureQuestionCatalogSchema, ensureAppRuntimeSchema } = require('../db-schema');
const { resolveScope, ACTIVE_SCOPE, TEST_SCOPE } = require('../data-scope');
const { getQuestionCatalog } = require('../question-catalog');
const { getBonusCatalog } = require('../bonus-catalog');
const { materializeTestProgress } = require('../test-simulation');

exports.handler = async (event) => {
  const sql = neon(process.env.DATABASE_URL);
  await ensureScoringSchema(sql);
  const institutions=await getInstitutions(sql,true);

  await ensureCoreSchema(sql);
  await ensureBonusSchema(sql);
  await ensureBonusCatalogSchema(sql);
  await ensureQuestionTrackingSchema(sql);
  await ensureQuestionCatalogSchema(sql);
  await ensureAppRuntimeSchema(sql);

  const { scope, runtime } = await resolveScope(sql, event?.queryStringParameters?.scope || ACTIVE_SCOPE);
  if (scope === TEST_SCOPE) {
    await materializeTestProgress(sql);
  }

  const questionCatalog = await getQuestionCatalog(sql);
  const questionCatalogAll = await getQuestionCatalog(sql, { includeInactive: true });
  const questionMap = new Map(questionCatalog.map((item) => [item.id, item]));
  const bonusCatalog = await getBonusCatalog(sql);
  const bonusCatalogAll = await getBonusCatalog(sql, { includeInactive: true });
  const bonusMap = new Map(bonusCatalogAll.map((item) => [item.id, item]));

  const [roundState]=await sql`SELECT round_started_at FROM game_state WHERE scope=${scope}`;
  const round=roundState?.round_started_at||null;
  const participants = await sql`
    SELECT
      id,
      first_name AS "firstName",
      last_name AS "lastName",
      city AS "city",institution_id AS "institutionId",
      email AS "email",
      (device_token IS NOT NULL) AS "hasDevice",
      score_at AS "scoreAt",
      last_ip AS "lastIp",
      last_user_agent AS "lastUserAgent",
      current_question_id AS "currentQuestionId",
      current_question_opened_at AS "currentQuestionOpenedAt",
      score,
      answered_count AS "answeredCount",
      last_activity AS "lastActivity",
      created_at AS "createdAt"
    FROM participants
    WHERE scope = ${scope} AND game_started_at IS NOT DISTINCT FROM (SELECT round_started_at FROM game_state WHERE scope=${scope})
    ORDER BY score DESC, last_activity ASC
  `;

  decorate(participants,institutions);
  participants.sort(require('../../public/game-ranking').compareParticipants);
  const questionStats=await sql`SELECT a.question_id AS "questionId",MAX(c.text) AS "questionText",COUNT(*)::int AS visits,
    COUNT(*) FILTER(WHERE a.correct)::int AS "correctCount",COUNT(*) FILTER(WHERE NOT a.correct)::int AS "wrongCount"
    FROM answers a JOIN participants p ON p.id=a.participant_id LEFT JOIN questions_catalog c ON c.id=a.question_id
    WHERE p.scope=${scope} AND p.game_started_at IS NOT DISTINCT FROM ${round}::timestamptz GROUP BY a.question_id`;
  const [bonusCount]=await sql`SELECT COUNT(*)::int AS count FROM bonus_redemptions b JOIN participants p ON p.id=b.participant_id
    WHERE p.scope=${scope} AND p.game_started_at IS NOT DISTINCT FROM ${round}::timestamptz`;
  const totals={answers:questionStats.reduce((n,q)=>n+q.visits,0),correct:questionStats.reduce((n,q)=>n+q.correctCount,0),wrong:questionStats.reduce((n,q)=>n+q.wrongCount,0),bonuses:bonusCount.count};
  questionStats.forEach(q=>{q.successPct=q.visits?Math.round(q.correctCount/q.visits*100):0;q.wrongPct=q.visits?Math.round(q.wrongCount/q.visits*100):0;});

  const recentQuestionOpens = await sql`
    SELECT
      qo.id,
      qo.participant_id AS "participantId",
      qo.question_id AS "questionId",
      qo.created_at AS "createdAt",
      p.first_name AS "firstName",
      p.last_name AS "lastName",
      p.city AS "city",p.institution_id AS "institutionId"
    FROM question_opens qo
    JOIN participants p ON p.id = qo.participant_id
    WHERE qo.scope = ${scope}
      AND p.scope = ${scope}
      AND qo.created_at >= NOW() - INTERVAL '20 minutes'
    ORDER BY qo.created_at DESC
  `;

  decorate(recentQuestionOpens,institutions);
  const liveParticipants = participants
    .filter((participant) => participant.currentQuestionId && participant.currentQuestionOpenedAt)
    .map((participant) => {
      const openedAt = new Date(participant.currentQuestionOpenedAt).getTime();
      const secondsOpen = Number.isFinite(openedAt)
        ? Math.max(0, Math.floor((Date.now() - openedAt) / 1000))
        : 0;

      return {
        participantId: participant.id,
        firstName: participant.firstName,
        lastName: participant.lastName,
        city: participant.city,
        currentQuestionId: participant.currentQuestionId,
        currentQuestionText: questionMap.get(participant.currentQuestionId)?.text || null,
        currentQuestionOpenedAt: participant.currentQuestionOpenedAt,
        secondsOpen,
        answeredCount: participant.answeredCount || 0,
        score: participant.score || 0
      };
    })
    .filter((participant) => participant.secondsOpen <= 15 * 60)
    .sort((a, b) => b.secondsOpen - a.secondsOpen);

  const liveQuestionMap = new Map();
  recentQuestionOpens.forEach((open) => {
    if (!liveQuestionMap.has(open.questionId)) {
      liveQuestionMap.set(open.questionId, {
        questionId: open.questionId,
        questionText: questionMap.get(open.questionId)?.text || null,
        opensLast20m: 0,
        activeCount: 0,
        longestOpenSeconds: 0
      });
    }

    liveQuestionMap.get(open.questionId).opensLast20m += 1;
  });

  liveParticipants.forEach((participant) => {
    if (!liveQuestionMap.has(participant.currentQuestionId)) {
      liveQuestionMap.set(participant.currentQuestionId, {
        questionId: participant.currentQuestionId,
        questionText: questionMap.get(participant.currentQuestionId)?.text || null,
        opensLast20m: 0,
        activeCount: 0,
        longestOpenSeconds: 0
      });
    }

    const item = liveQuestionMap.get(participant.currentQuestionId);
    item.activeCount += 1;
    item.longestOpenSeconds = Math.max(item.longestOpenSeconds, participant.secondsOpen);
  });

  const hottestQuestions = [...liveQuestionMap.values()]
    .sort((a, b) =>
      b.activeCount - a.activeCount ||
      b.opensLast20m - a.opensLast20m ||
      b.longestOpenSeconds - a.longestOpenSeconds ||
      a.questionId - b.questionId
    )
    .slice(0, 8);

  const recentActivity = recentQuestionOpens
    .slice(0, 12)
    .map((item) => ({
      participantId: item.participantId,
      participantName: `${item.firstName || ''} ${item.lastName || ''}`.trim() || 'Uczestnik',
      city: item.city || '',
      questionId: item.questionId,
      questionText: questionMap.get(item.questionId)?.text || null,
      createdAt: item.createdAt
    }));

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify({
      participants,
      totals, questionStats, roundStartedAt:round,
      answers: [], bonuses: [],
      dataScope: scope,
      testModeEnabled: Boolean(runtime.testModeEnabled),
      testParticipantCount: Number(runtime.testParticipantCount || 0),
      testSeededAt: runtime.testSeededAt || null,
      questionCatalog,
      questionCatalogAll,
      questionCount: questionCatalog.length,
      bonusCatalog,
      bonusCatalogAll,
      liveActivity: {
        liveParticipants,
        hottestQuestions,
        recentActivity
      }
    })
  };
};

exports.handler = withApi('admin-results', exports.handler);
