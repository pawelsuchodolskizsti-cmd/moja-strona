const { runHandler } = require('../lib/run-handler');
const { handler } = require('../lib/handlers/admin-adjust-participant');

module.exports = async (req, res) => runHandler(handler, req, res);
