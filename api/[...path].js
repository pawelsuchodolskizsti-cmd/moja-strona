const { runHandler } = require('../lib/run-handler');

const handlers = {
  'admin-adjust-participant': require('../lib/handlers/admin-adjust-participant').handler,
  'admin-question-catalog': require('../lib/handlers/admin-question-catalog').handler,
  'admin-results': require('../lib/handlers/admin-results').handler,
  answer: require('../lib/handlers/answer').handler,
  bonus: require('../lib/handlers/bonus').handler,
  'game-state': require('../lib/handlers/game-state').handler,
  login: require('../lib/handlers/login').handler,
  'participant-session': require('../lib/handlers/participant-session').handler,
  'participant-stats': require('../lib/handlers/participant-stats').handler,
  'public-scoreboard': require('../lib/handlers/public-scoreboard').handler,
  'qr-proxy': require('../lib/handlers/qr-proxy').handler,
  question: require('../lib/handlers/question').handler,
  'test-mode': require('../lib/handlers/test-mode').handler
};

function getEndpoint(req) {
  const queryPath = req.query?.path || req.query?.slug;
  if (Array.isArray(queryPath) && queryPath.length) {
    return queryPath.join('/').replace(/^\/+|\/+$/g, '');
  }

  if (typeof queryPath === 'string' && queryPath.trim()) {
    return queryPath.replace(/^\/+|\/+$/g, '');
  }

  const rawPath = String(req.url || '').split('?')[0] || '';
  return rawPath
    .replace(/^\/api\/?/i, '')
    .replace(/^\/+|\/+$/g, '');
}

module.exports = async (req, res) => {
  const endpoint = getEndpoint(req);
  const handler = handlers[endpoint];

  if (!handler) {
    res.status(404).json({
      error: `Nie znaleziono endpointu API: ${endpoint || '/api'}`
    });
    return;
  }

  return runHandler(handler, req, res);
};
