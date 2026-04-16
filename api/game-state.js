const { runHandler } = require('../lib/run-handler');
const { handler } = require('../lib/handlers/game-state');

module.exports = async (req, res) => runHandler(handler, req, res);
