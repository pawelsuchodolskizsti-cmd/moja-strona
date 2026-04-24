const { runHandler } = require('../lib/run-handler');
const { handler } = require('../lib/handlers/test-mode');

module.exports = async (req, res) => runHandler(handler, req, res);
