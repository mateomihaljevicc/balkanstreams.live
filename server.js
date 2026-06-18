import express from 'express';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.static(__dirname));

app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Range, Content-Type');
  res.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function rewriteM3u8(text, baseUrl) {
  return text.replace(/^([^#].+)$/gm, (match) => {
    const url = match.trim();
    if (!url) return match;
    try {
      const absolute = new URL(url, baseUrl).href;
      return `/proxy/${encodeURIComponent(absolute)}`;
    } catch {
      return match;
    }
  });
}

app.get('/proxy/*', async (req, res) => {
  try {
    const encodedUrl = req.params[0];
    let targetUrl;
    try {
      targetUrl = decodeURIComponent(encodedUrl);
    } catch {
      return res.status(400).send('Invalid URL');
    }

    const headers = {
      'User-Agent': req.get('User-Agent') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://kolis.phantemlis.top/',
      'Origin': 'https://kolis.phantemlis.top',
    };
    if (req.get('Range')) headers['Range'] = req.get('Range');

    const response = await fetch(targetUrl, { headers });
    const contentType = response.headers.get('content-type') || '';

    response.headers.forEach((v, k) => {
      const lk = k.toLowerCase();
      if (['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control', 'content-disposition'].includes(lk)) {
        res.set(k, v);
      }
    });

    if (targetUrl.includes('.m3u8') || contentType.includes('mpegurl') || contentType.includes('vnd.apple.mpegurl')) {
      let text = await response.text();
      const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
      text = rewriteM3u8(text, baseUrl);
      res.set('Content-Type', 'application/vnd.apple.mpegurl');
      return res.send(text);
    }

    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (e) {
    console.error('Proxy error:', e.message);
    res.status(502).send('Proxy error');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy running on http://localhost:${PORT}`));