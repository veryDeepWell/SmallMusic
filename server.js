const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const pages = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/music/', 'music/index.html'],
  ['/sounds/', 'sounds/index.html']
]);
const redirects = new Map([
  ['/music', '/music/'],
  ['/sounds', '/sounds/'],
  ['/sound', '/sounds/'],
  ['/sound/', '/sounds/']
]);
const assets = new Set([
  '/music/style.css', '/music/model.js', '/music/app.js', '/music/sound-panel.js',
  '/sounds/style.css', '/sounds/catalog.js', '/sounds/engine.js', '/sounds/app.js',
  '/shared/launcher.css', '/shared/sound-panel.css', '/shared/sound-settings.js', '/shared/audio.js'
]);
const contentTypes = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };

http.createServer((request, response) => {
  const route = request.url.split('?')[0];
  const redirect = redirects.get(route);
  if (redirect) {
    response.writeHead(308, { Location: redirect + request.url.slice(route.length) }).end();
    return;
  }
  const file = pages.get(route) || (assets.has(route) ? route.slice(1) : null);
  if (!file) {
    response.writeHead(404).end();
    return;
  }
  fs.readFile(path.join(__dirname, file), (error, data) => {
    if (error) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'Content-Type': contentTypes[path.extname(file)] + '; charset=utf-8',
      'Cache-Control': 'no-cache'
    });
    response.end(data);
  });
}).listen(5173, '127.0.0.1', () => console.log('SmallNoise: http://127.0.0.1:5173'));
