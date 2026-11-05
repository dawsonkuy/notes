import http from 'node:http';
import { readFile } from 'node:fs/promises';

const files = { '/auth.js': ['auth.js', 'text/javascript'], '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
const port = Number(process.env.PORT || 3000);
http.createServer(async (req, res) => {
  const file = files[new URL(req.url, 'http://localhost').pathname];
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const body = await readFile(new URL(file[0], import.meta.url));
    res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8` });
    res.end(body);
  } catch { res.writeHead(500); res.end('Unable to load app'); }
}).listen(port, '0.0.0.0', () => console.log(`Notepad listening on port ${port}`));
