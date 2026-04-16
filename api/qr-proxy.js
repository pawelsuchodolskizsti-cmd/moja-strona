const { runHandler } = require('../lib/run-handler');
const { handler } = require('../lib/handlers/qr-proxy');

module.exports = async (req, res) => runHandler(handler, req, res);
