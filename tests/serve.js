'use strict';
/* Minimal static file server for local play and UI tests (Node built-ins only).
   Usage: node tests/serve.js [port]   → http://127.0.0.1:8080/ */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.md': 'text/markdown; charset=utf-8'
};

function createServer() {
  return http.createServer((req, res) => {
    let rel;
    try {
      rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch (_) {
      res.writeHead(400); res.end(); return;
    }
    if (rel === '/') rel = '/index.html';
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT + path.sep) || rel.includes('..') || /[\\/](node_modules|\.git)[\\/]/.test(file)) {
      res.writeHead(403); res.end(); return;
    }
    fs.readFile(file, (error, body) => {
      if (error) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    });
  });
}

function start(port = 0) {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(port, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/` }));
  });
}

module.exports = { start };

if (require.main === module) {
  const port = Number(process.argv[2]) || 8080;
  start(port).then(({ url }) => console.log(`PAYLOAD ZERO is served at ${url} (Ctrl+C to stop)`));
}
