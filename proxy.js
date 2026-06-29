/**
 * HTTP + HTTPS 反向代理
 * 根据 Host 头路由请求到 food-rs 或 ai-agent
 * HTTP 80 端口：直接路由
 * HTTPS 8443 端口：SSL 终止后路由（需配合 iptables 443→8443）
 */
const http = require('http');
const https = require('https');
const fs = require('fs');

const HTTP_PORT = process.env.HTTP_PORT || 80;
const HTTPS_PORT = process.env.HTTPS_PORT || 8443;
const UPSTREAMS = {
  food: { host: '127.0.0.1', port: 3000 },
  foodHttps: { host: '127.0.0.1', port: 3443 },
  ai: { host: '127.0.0.1', port: 3456 },
};

function getUpstream(host) {
  if (host && (host.startsWith('ai.') || host.startsWith('ai-'))) {
    return UPSTREAMS.ai;
  }
  return UPSTREAMS.food;
}

function handleRequest(req, res, isHttps) {
  const upstream = getUpstream(req.headers.host);

  // 对于 HTTPS 请求美食系统，转发到美食的 HTTPS 端口避免重定向循环
  // 对于 AI 代理，直接走 HTTP
  let target;
  let proto;
  if (isHttps && upstream === UPSTREAMS.food) {
    target = UPSTREAMS.foodHttps;
    proto = https;
  } else {
    target = upstream;
    proto = http;
  }

  const options = {
    hostname: target.host,
    port: target.port,
    path: req.url,
    method: req.method,
    headers: { ...req.headers },
    rejectUnauthorized: false,
  };

  const proxy = proto.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxy.on('error', (err) => {
    console.error(`[proxy] ${target.host}:${target.port} error:`, err.message);
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('服务暂不可用');
  });

  req.pipe(proxy);
}

// HTTP 服务器 (端口 80)
const httpServer = http.createServer((req, res) => handleRequest(req, res, false));
httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`[proxy] HTTP  :${HTTP_PORT} → 按域名路由`);
});

// HTTPS 服务器 (端口 8443，iptables 443→8443)
let sslOptions = null;
try {
  sslOptions = {
    key: fs.readFileSync('/etc/letsencrypt/live/foodrs.top/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/foodrs.top/fullchain.pem'),
  };
} catch (e) {
  console.log('[proxy] SSL 证书未找到，HTTPS 未启用');
}

if (sslOptions) {
  const httpsServer = https.createServer(sslOptions, (req, res) => handleRequest(req, res, true));
  httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
    console.log(`[proxy] HTTPS :${HTTPS_PORT} → 按域名路由`);
  });
}

console.log('[proxy] foodrs.top      → 127.0.0.1:3000');
console.log('[proxy] foodrs.top (TLS)→ 127.0.0.1:3443');
console.log('[proxy] ai.foodrs.top   → 127.0.0.1:3456');
