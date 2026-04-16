const { runHandler } = require('../lib/run-handler');
const { handler } = require('../lib/handlers/question');

module.exports = async (req, res) => runHandler(handler, req, res);
