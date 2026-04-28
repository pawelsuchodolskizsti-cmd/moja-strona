const ADMIN_LOGIN = process.env.ADMIN_LOGIN || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'final2026';

function readHeader(headers, name) {
  const wanted = name.toLowerCase();
  const match = Object.keys(headers || {}).find(key => key.toLowerCase() === wanted);
  return match ? headers[match] : '';
}

function isAdminAuthorized(event, body = {}) {
  const login = String(
    readHeader(event.headers, 'x-admin-login') ||
    body.adminLogin ||
    ''
  ).trim();

  const password = String(
    readHeader(event.headers, 'x-admin-password') ||
    readHeader(event.headers, 'x-admin-secret') ||
    body.adminPassword ||
    body.adminSecret ||
    ''
  );

  return login === ADMIN_LOGIN && password === ADMIN_PASSWORD;
}

function unauthorizedResponse() {
  return {
    statusCode: 401,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'Brak uprawnień administratora.' })
  };
}

module.exports = {
  isAdminAuthorized,
  unauthorizedResponse
};
