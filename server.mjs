import http from 'node:http';
import { readFile } from 'node:fs/promises';

const files = { '/appearance.js': ['appearance.js', 'text/javascript'], '/appearance.css': ['appearance.css', 'text/css'], '/app-preview': ['app-preview.html', 'text/html'], '/app-preview.html': ['app-preview.html', 'text/html'], '/logo.png': ['logo.png', 'image/png'], '/favicon.png': ['favicon.png', 'image/png'], '/settings.js': ['settings.js', 'text/javascript'], '/auth.js': ['auth.js', 'text/javascript'], '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'], '/legal.css': ['legal.css', 'text/css'], '/privacy.html': ['privacy.html', 'text/html'], '/terms.html': ['terms.html', 'text/html'], '/delete-account.html': ['delete-account.html', 'text/html'], '/privacy': ['privacy.html', 'text/html'], '/terms': ['terms.html', 'text/html'], '/delete-account': ['delete-account.html', 'text/html'] };
const port = Number(process.env.PORT || 3000);
http.createServer(async (req, res) => {
  const file = files[new URL(req.url, 'http://localhost').pathname];
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const body = await readFile(new URL(file[0], import.meta.url));
    res.writeHead(200, { 'Content-Type': file[1].startsWith('image/') ? file[1] : `${file[1]}; charset=utf-8` });
    res.end(body);
  } catch { res.writeHead(500); res.end('Unable to load app'); }
}).listen(port, '0.0.0.0', () => console.log(`Notepad listening on port ${port}`));
