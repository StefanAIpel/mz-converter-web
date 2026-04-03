const RENDER_API_URL = process.env.RENDER_API_URL || 'https://mz-converter-api.onrender.com';

module.exports = async (req, res) => {
  try {
    const response = await fetch(`${RENDER_API_URL}/api/health`);
    const data = await response.text();
    res.status(response.status);
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
    res.send(data);
  } catch (error) {
    res.status(502).json({ error: 'backend_unreachable', detail: String(error) });
  }
};
