const { neon } = require('@neondatabase/serverless');
const { QUESTIONS } = require('../questions-data');
const { BONUS_CODES } = require('../bonus-codes-data');
const { ensureCoreSchema } = require('../db-schema');

async function ensureBonusSchema(sql) {
  await ensureCoreSchema(sql);
  await sql`
    CREATE TABLE IF NOT EXISTS bonus_redemptions (
      id SERIAL PRIMARY KEY,
      participant_id INTEGER REFERENCES participants(id),
      bonus_id TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(participant_id, bonus_id)
    )
  `;
}

async function ensureQuestionTrackingSchema(sql) {
  await ensureCoreSchema(sql);
  await sql`
    CREATE TABLE IF NOT EXISTS question_opens (
      id SERIAL PRIMARY KEY,
      participant_id INTEGER REFERENCES participants(id),
      question_id INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

exports.handler = async () => {
  const sql = neon(process.env.DATABASE_URL);

  await ensureCoreSchema(sql);
  await ensureBonusSchema(sql);
  await ensureQuestionTrackingSchema(sql);

  const participants = await sql`
    SELECT
      id,
      first_name AS "firstName",
      last_name AS "lastName",
      city AS "city",
      device_token AS "deviceToken",
      last_ip AS "lastIp",
      last_user_agent AS "lastUserAgent",
      current_question_id AS "currentQuestionId",
      current_question_opened_at AS "currentQuestionOpenedAt",
      score,
      answered_count AS "answeredCount",
      last_activity AS "lastActivity",
      created_at AS "createdAt"
    FROM participants
    ORDER BY score DESC, last_activity ASC
  `;

  const answers = await sql`
    SELECT
      a.id,
      a.participant_id AS "participantId",
      (p.first_name || ' ' || p.last_name) AS "participantName",
      p.city AS "participantCity",
      a.question_id AS "questionId",
      a.answer,
      a.correct,
      a.created_at AS "createdAt"
    FROM answers a
    JOIN participants p ON p.id = a.participant_id
    ORDER BY a.created_at DESC
  `;

  const answersWithText = answers.map(a => ({
    ...a,
    questionText: QUESTIONS.find(q => q.id === a.questionId)?.text || null
  }));

  const bonusRedemptions = await sql`
    SELECT
      id,
      participant_id AS "participantId",
      bonus_id AS "bonusId",
      created_at AS "createdAt"
    FROM bonus_redemptions
    ORDER BY created_at DESC
  `;

  const bonusesWithLabels = bonusRedemptions.map((bonus) => ({
    ...bonus,
    bonusLabel: BONUS_CODES.find(item => item.id === bonus.bonusId)?.label || bonus.bonusId
  }));

  const recentQuestionOpens = await sql`
    SELECT
      qo.id,
      qo.participant_id AS "participantId",
      qo.question_id AS "questionId",
      qo.created_at AS "createdAt",
      p.first_name AS "firstName",
      p.last_name AS "lastName",
      p.city AS "city"
    FROM question_opens qo
    JOIN participants p ON p.id = qo.participant_id
    WHERE qo.created_at >= NOW() - INTERVAL '20 minutes'
    ORDER BY qo.created_at DESC
  `;

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
        currentQuestionText: QUESTIONS.find((item) => item.id === participant.currentQuestionId)?.text || null,
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
        questionText: QUESTIONS.find((item) => item.id === open.questionId)?.text || null,
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
        questionText: QUESTIONS.find((item) => item.id === participant.currentQuestionId)?.text || null,
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
      questionText: QUESTIONS.find((question) => question.id === item.questionId)?.text || null,
      createdAt: item.createdAt
    }));

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      participants,
      answers: answersWithText,
      bonuses: bonusesWithLabels,
      bonusCatalog: BONUS_CODES.map(({ id, label }) => ({ id, label })),
      liveActivity: {
        liveParticipants,
        hottestQuestions,
        recentActivity
      }
    })
  };
};
