const { runHandler } = require('../lib/run-handler');
const { handler } = require('../lib/handlers/login');

module.exports = async (req, res) => runHandler(handler, req, res);
