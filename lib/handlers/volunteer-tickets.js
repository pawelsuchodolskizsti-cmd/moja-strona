const { withApi } = require('../api-guard');
exports.handler = withApi('volunteer-tickets', event => require('../volunteer-desk').handle(event));
