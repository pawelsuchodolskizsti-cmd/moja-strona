const { runHandler } = require('../lib/run-handler');
const { handler } = require('../lib/handlers/public-scoreboard');

module.exports = async (req, res) => runHandler(handler, req, res);
