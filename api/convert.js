const https = require('node:https');

const RENDER_API_URL = process.env.RENDER_API_URL || 'https://mz-converter-api.onrender.com';

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'missing_bearer_token' });
  }

  try {
    const body = await readRequestBody(req);
    const target = new URL('/api/convert', RENDER_API_URL);

    const proxyReq = https.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || 443,
        path: target.pathname,
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': req.headers['content-type'] || 'application/octet-stream',
          'Content-Length': String(body.length),
        },
      },
      (proxyRes) => {
        res.statusCode = proxyRes.statusCode || 502;
        for (const [key, value] of Object.entries(proxyRes.headers)) {
          if (value === undefined || key.toLowerCase() === 'transfer-encoding') continue;
          res.setHeader(key, value);
        }
        proxyRes.pipe(res);
      }
    );

    proxyReq.on('error', (error) => {
      if (res.headersSent) return;
      res.status(502).json({ error: 'backend_unreachable', detail: String(error) });
    });

    proxyReq.write(body);
    proxyReq.end();
  } catch (error) {
    res.status(502).json({ error: 'backend_unreachable', detail: String(error) });
  }
};
