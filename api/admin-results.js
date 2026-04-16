const { runHandler } = require('../lib/run-handler');
const { handler } = require('../lib/handlers/admin-results');

module.exports = async (req, res) => runHandler(handler, req, res);
