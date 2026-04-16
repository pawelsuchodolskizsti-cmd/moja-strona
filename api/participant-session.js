const { runHandler } = require('../lib/run-handler');
const { handler } = require('../lib/handlers/participant-session');

module.exports = async (req, res) => runHandler(handler, req, res);
