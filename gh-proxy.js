// GitHub 反向代理 — 用于设备授权流程
const https = require('https');
const http = require('http');
const url = require('url');

const server = http.createServer((req, res) => {
  let targetPath = req.url;
  if (targetPath.startsWith('/gh')) {
    targetPath = targetPath.replace('/gh', '');
  }
  if (!targetPath) targetPath = '/';

  console.log(new Date().toISOString(), req.method, targetPath);

  const options = {
    hostname: 'github.com',
    port: 443,
    path: targetPath,
    method: req.method,
    headers: { ...req.headers, host: 'github.com' },
    rejectUnauthorized: false,
  };

  delete options.headers['accept-encoding'];

  const proxyReq = https.request(options, (proxyRes) => {
    let body = [];
    proxyRes.on('data', (chunk) => body.push(chunk));
    proxyRes.on('end', () => {
      let fullBody = Buffer.concat(body);
      let resHeaders = { ...proxyRes.headers };

      // Rewrite Location headers
      if (resHeaders['location']) {
        let loc = resHeaders['location'];
        loc = loc.replace(/^https:\/\/github\.com/g, '/gh');
        loc = loc.replace(/^http:\/\/github\.com/g, '/gh');
        // Handle relative paths - prepend /gh
        if (loc.startsWith('/') && !loc.startsWith('/gh/') && loc !== '/gh') {
          loc = '/gh' + loc;
        }
        resHeaders['location'] = loc;
      }

      // Rewrite Set-Cookie domain
      if (resHeaders['set-cookie']) {
        let cookies = Array.isArray(resHeaders['set-cookie']) ? resHeaders['set-cookie'] : [resHeaders['set-cookie']];
        resHeaders['set-cookie'] = cookies.map((c) =>
          c.replace(/domain=\.?github\.com/gi, 'domain=.ai.foodrs.top')
        );
      }

      // Rewrite HTML content
      let contentType = resHeaders['content-type'] || '';
      if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
        let html = fullBody.toString('utf-8');
        html = html.replace(/https:\/\/github\.com/g, '/gh');
        html = html.replace(/http:\/\/github\.com/g, '/gh');
        html = html.replace(/action="\//g, 'action="/gh/');
        html = html.replace(/href="\//g, 'href="/gh/');
        html = html.replace(/src="\//g, 'src="/gh/');
        fullBody = Buffer.from(html, 'utf-8');
        resHeaders['content-length'] = Buffer.byteLength(html);
      }

      if (contentType.includes('text/css')) {
        let css = fullBody.toString('utf-8');
        css = css.replace(/url\("\/\//g, 'url("/gh/');
        css = css.replace(/url\(\/\//g, 'url(/gh/');
        fullBody = Buffer.from(css, 'utf-8');
        resHeaders['content-length'] = Buffer.byteLength(css);
      }

      delete resHeaders['transfer-encoding'];
      res.writeHead(proxyRes.statusCode, resHeaders);
      res.end(fullBody);
    });
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('GitHub proxy error: ' + err.message);
    }
  });

  req.pipe(proxyReq);
});

const PORT = process.env.PORT || 9998;
server.listen(PORT, '127.0.0.1', () => {
  console.log('GitHub proxy running on http://127.0.0.1:' + PORT);
});
