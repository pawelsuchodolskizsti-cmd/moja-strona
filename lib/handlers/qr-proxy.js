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

function buildQrUrl(data, size, format) {
  const url = new URL(QR_SERVICE_URL);
  url.searchParams.set('data', data);
  url.searchParams.set('size', size);
  url.searchParams.set('format', format);
  url.searchParams.set('margin', '10');
  return url.toString();
}

async function fetchQrBuffer(data, size, format) {
  const response = await fetch(buildQrUrl(data, size, format), {
    headers: { Accept: 'image/*' }
  });

  if (!response.ok) {
    throw new Error('Nie udało się pobrać obrazu QR z usługi zewnętrznej.');
  }

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type') || (format === 'svg' ? 'image/svg+xml' : `image/${format}`)
  };
}

let crcTable = null;

function getCrcTable() {
  if (crcTable) return crcTable;

  crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[i] = c >>> 0;
  }

  return crcTable;
}

function crc32(buffer) {
  const table = getCrcTable();
  let crc = 0xffffffff;

  for (let i = 0; i < buffer.length; i += 1) {
    crc = table[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function getDosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  return { dosDate, dosTime };
}

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  entries.forEach((entry) => {
    const nameBuffer = Buffer.from(entry.name, 'utf8');
    const dataBuffer = entry.buffer;
    const crc = crc32(dataBuffer);
    const { dosDate, dosTime } = getDosDateTime();

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(dataBuffer.length, 18);
    localHeader.writeUInt32LE(dataBuffer.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(dataBuffer.length, 20);
    centralHeader.writeUInt32LE(dataBuffer.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    localParts.push(localHeader, nameBuffer, dataBuffer);
    centralParts.push(centralHeader, nameBuffer);
    offset += localHeader.length + nameBuffer.length + dataBuffer.length;
  });

  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, endRecord]);
}

async function handleSingleQr(event) {
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

  try {
    const { buffer, contentType } = await fetchQrBuffer(data, size, format);
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
}

async function handleZipBundle(event) {
  let payload = {};

  try {
    payload = JSON.parse(event.body || '{}');
  } catch (error) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ error: 'Nie udało się odczytać listy kodów do pobrania.' })
    };
  }

  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ error: 'Brak kodów QR do spakowania.' })
    };
  }

  const format = sanitizeFormat(payload.format || 'jpg');
  const size = sanitizeSize(payload.size || '900x900');
  const bundleName = sanitizeFilename(payload.name || 'kody-qr', 'zip');

  try {
    const entries = [];
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const data = String(item?.url || item?.data || '').trim();
      if (!data) continue;

      const fileName = sanitizeFilename(item?.filename || item?.id || `kod-${index + 1}`, format);
      const { buffer } = await fetchQrBuffer(data, size, format);
      entries.push({ name: fileName, buffer });
    }

    if (!entries.length) {
      throw new Error('Nie udało się przygotować żadnego pliku do archiwum.');
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${bundleName}"`,
        'Cache-Control': 'no-store'
      },
      body: createZip(entries)
    };
  } catch (error) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ error: error.message || 'Nie udało się przygotować archiwum kodów QR.' })
    };
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'POST') {
    return handleZipBundle(event);
  }

  if (event.httpMethod === 'GET') {
    return handleSingleQr(event);
  }

  return {
    statusCode: 405,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ error: 'Method Not Allowed' })
  };
};
