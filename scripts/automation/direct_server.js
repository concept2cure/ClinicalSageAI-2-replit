// Super simple static server just to display the landing page
const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    const content = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(content);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

const PORT = 7000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Landing page server running at http://0.0.0.0:${PORT}/`);
});
