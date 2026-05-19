const { neon } = require('@neondatabase/serverless');
const { isAdminAuthorized, unauthorizedResponse } = require('../admin-auth');
const { getQuestionCatalog, saveQuestionCatalog } = require('../question-catalog');
const { getBonusCatalog, saveBonusCatalog } = require('../bonus-catalog');

async function getCatalogPayload(sql) {
  const [questionCatalog, questionCatalogAll, bonusCatalog, bonusCatalogAll] = await Promise.all([
    getQuestionCatalog(sql),
    getQuestionCatalog(sql, { includeInactive: true }),
    getBonusCatalog(sql),
    getBonusCatalog(sql, { includeInactive: true })
  ]);

  return {
    questionCatalog,
    questionCatalogAll,
    questionCount: questionCatalog.length,
    bonusCatalog,
    bonusCatalogAll
  };
}

exports.handler = async (event) => {
  const sql = neon(process.env.DATABASE_URL);

  try {
    if (event.httpMethod === 'GET') {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(await getCatalogPayload(sql))
      };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      if (!isAdminAuthorized(event, body)) {
        return unauthorizedResponse();
      }

      if (body.questions || body.question || body.questionCount) {
        await saveQuestionCatalog(sql, {
          questionCount: body.questionCount,
          questions: body.questions || body.question || []
        });
      }

      if (body.bonuses || body.bonus) {
        await saveBonusCatalog(sql, body.bonuses || body.bonus);
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: true,
          message: 'Katalog pytań i bonusów został zapisany.',
          ...(await getCatalogPayload(sql))
        })
      };
    }

    return { statusCode: 405, body: 'Method Not Allowed' };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message || 'Nie udało się zapisać katalogu.' })
    };
  }
};
