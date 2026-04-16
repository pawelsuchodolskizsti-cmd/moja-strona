const { runHandler } = require('../lib/run-handler');
const { handler } = require('../lib/handlers/bonus');

module.exports = async (req, res) => runHandler(handler, req, res);
