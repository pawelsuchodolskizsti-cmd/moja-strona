const QR_SERVICE_URL = 'https://api.qrserver.com/v1/create-qr-code/';

function sanitizeSize(input) {
  const match = String(input || '').match(/^(\d{2,4})x(\d{2,4})$/);
  if (!match) return '640x640';

  const width = Math.min(1200, Math.max(120, Number(match[1])));
  const height = Math.min(1200, Math.max(120, Number(match[2])));
  return `${width}x${height}`;
}

function sanitizeFormat(input) {
  const format = String(input || 'png').toLowerCase();
  if (format === 'jpg' || format === 'jpeg') return 'jpg';
  if (format === 'svg') return 'svg';
  return 'png';
}

function sanitizeFilename(input, format) {
  const cleaned = String(input || '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

  if (!cleaned) {
    return `kod-qr.${format}`;
  }

  return cleaned.endsWith(`.${format}`) ? cleaned : `${cleaned}.${format}`;
}

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const data = String(params.data || '').trim();

  if (!data) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ error: 'Brak danych do wygenerowania kodu QR.' })
    };
  }

  const format = sanitizeFormat(params.format);
  const size = sanitizeSize(params.size);
  const download = String(params.download || '').trim();

  const url = new URL(QR_SERVICE_URL);
  url.searchParams.set('data', data);
  url.searchParams.set('size', size);
  url.searchParams.set('format', format);
  url.searchParams.set('margin', '10');

  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: 'image/*' }
    });

    if (!response.ok) {
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ error: 'Nie udało się pobrać obrazu QR z usługi zewnętrznej.' })
      };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || (format === 'svg' ? 'image/svg+xml' : `image/${format}`);
    const headers = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800'
    };

    if (download) {
      headers['Content-Disposition'] = `attachment; filename="${sanitizeFilename(download, format)}"`;
    }

    return {
      statusCode: 200,
      headers,
      body: buffer
    };
  } catch (error) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ error: 'Generator QR jest chwilowo niedostępny.' })
    };
  }
};
