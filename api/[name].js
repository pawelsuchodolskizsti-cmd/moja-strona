const { runNetlifyHandler } = require('./_utils');

const handlerMap = {
  'admin-adjust-participant': require('../netlify/functions/admin-adjust-participant').handler,
  'admin-results': require('../netlify/functions/admin-results').handler,
  answer: require('../netlify/functions/answer').handler,
  bonus: require('../netlify/functions/bonus').handler,
  'game-state': require('../netlify/functions/game-state').handler,
  login: require('../netlify/functions/login').handler,
  'participant-session': require('../netlify/functions/participant-session').handler,
  'participant-stats': require('../netlify/functions/participant-stats').handler,
  question: require('../netlify/functions/question').handler
};

module.exports = async (req, res) => {
  const routeName = Array.isArray(req.query?.name) ? req.query.name[0] : req.query?.name;
  const handler = handlerMap[routeName];

  if (!handler) {
    res.status(404).json({ error: 'Nie znaleziono endpointu API.' });
    return;
  }

  await runNetlifyHandler(handler, req, res);
};
