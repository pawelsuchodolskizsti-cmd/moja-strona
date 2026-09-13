const { withApi } = require('../api-guard');
exports.handler = withApi('admin-volunteers', event => require('../volunteer-desk').handle(event,true));
