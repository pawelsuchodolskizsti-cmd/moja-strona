function getQueryParams(req) {
  const url = req.url || '';
  const queryIndex = url.indexOf('?');
  const search = queryIndex >= 0 ? url.slice(queryIndex + 1) : '';
  const params = new URLSearchParams(search);
  const result = {};

  for (const [key, value] of params.entries()) {
    result[key] = value;
  }

  if (req.query && typeof req.query === 'object') {
    Object.keys(req.query).forEach((key) => {
      const value = req.query[key];
      result[key] = Array.isArray(value) ? value[0] : value;
    });
  }

  return result;
}

async function runHandler(handler, req, res) {
  const event = {
    httpMethod: req.method,
    headers: req.headers || {},
    queryStringParameters: getQueryParams(req),
    body: req.body
      ? typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body)
      : ''
  };

  const response = await handler(event, {});

  if (!response) {
    res.status(204).end();
    return;
  }

  if (response.headers) {
    Object.entries(response.headers).forEach(([key, value]) => {
      if (value !== undefined) {
        res.setHeader(key, value);
      }
    });
  }

  res.status(response.statusCode || 200);

  if (response.body === undefined || response.body === null) {
    res.end();
    return;
  }

  res.send(response.body);
}

module.exports = { runHandler };
