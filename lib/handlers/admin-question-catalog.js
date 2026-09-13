const { ensureScoringSchema } = require('../db-schema');
const { withApi } = require('../api-guard');
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
  await ensureScoringSchema(sql);

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

      if (body.action === 'technical-block') {
        const failure = await require('../content-availability').setContentBlocked(sql, body);
        if (failure) return failure;
      } else {
        await require('../catalog-write').saveCatalog(sql, body);
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
      statusCode: error.statusCode || 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message || 'Nie udało się zapisać katalogu.' })
    };
  }
};

exports.handler = withApi('admin-question-catalog', exports.handler);
