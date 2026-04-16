const { runHandler } = require('../lib/run-handler');
const { handler } = require('../lib/handlers/participant-stats');

module.exports = async (req, res) => runHandler(handler, req, res);
