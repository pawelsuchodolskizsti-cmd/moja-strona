const { neon } = require('@neondatabase/serverless');
const { isAdminAuthorized, unauthorizedResponse } = require('../admin-auth');
const { getQuestionCatalog, saveQuestionCatalog } = require('../question-catalog');

exports.handler = async (event) => {
  const sql = neon(process.env.DATABASE_URL);

  try {
    if (event.httpMethod === 'GET') {
      const questionCatalog = await getQuestionCatalog(sql);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionCatalog })
      };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      if (!isAdminAuthorized(event, body)) {
        return unauthorizedResponse();
      }

      const questionCatalog = await saveQuestionCatalog(sql, body.questions || body.question || body);

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: true,
          message: 'Pytania i odpowiedzi zostały zapisane.',
          questionCatalog
        })
      };
    }

    return { statusCode: 405, body: 'Method Not Allowed' };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message || 'Nie udało się zapisać pytań.' })
    };
  }
};
