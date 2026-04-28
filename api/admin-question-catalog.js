const { runHandler } = require('../lib/run-handler');
const { handler } = require('../lib/handlers/admin-question-catalog');

module.exports = async (req, res) => runHandler(handler, req, res);
