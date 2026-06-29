// 访客追踪 — 数据看板
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'visitors.json');
const BACKUP_DIR = path.join(DATA_DIR, 'visitor_backups');
const MAX_ROLLING = 5;
let _lastHourlyBackup = 0;

function readData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('[visitor] 主数据文件损坏，尝试从备份恢复...');
    const recovered = restoreFromBackup();
    if (recovered) return recovered;
  }
  return { users: {}, visits: [], totalVisits: 0, uniqueUsers: 0 };
}

function restoreFromBackup() {
  try {
    for (let i = 1; i <= MAX_ROLLING; i++) {
      const bak = DATA_FILE + '.bak' + i;
      if (fs.existsSync(bak)) {
        const data = JSON.parse(fs.readFileSync(bak, 'utf-8'));
        console.error('[visitor] 从备份恢复成功: bak' + i, 'visits:', (data.visits || []).length);
        atomicWrite(DATA_FILE, data);
        return data;
      }
    }
  } catch (e) {
    console.error('[visitor] 备份恢复失败:', e.message);
  }
  return null;
}

function atomicWrite(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, filePath);
}

function rollingBackup() {
  for (let i = MAX_ROLLING - 1; i >= 1; i--) {
    const src = DATA_FILE + '.bak' + i;
    const dst = DATA_FILE + '.bak' + (i + 1);
    try { if (fs.existsSync(src)) fs.renameSync(src, dst); } catch (e) {}
  }
  const bak1 = DATA_FILE + '.bak1';
  try { if (fs.existsSync(DATA_FILE)) fs.copyFileSync(DATA_FILE, bak1); } catch (e) {}
}

function hourlyBackup() {
  const now = Date.now();
  if (now - _lastHourlyBackup < 60 * 60 * 1000) return;
  _lastHourlyBackup = now;
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    if (!fs.existsSync(DATA_FILE)) return;
    const ts = new Date(now + 8 * 60 * 60 * 1000).toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dst = path.join(BACKUP_DIR, 'visitors_' + ts + '.json');
    fs.copyFileSync(DATA_FILE, dst);
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json')).sort();
    while (files.length > 168) {
      fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
    }
  } catch (e) {
    console.error('[visitor] 小时备份失败:', e.message);
  }
}

function writeData(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  rollingBackup();
  atomicWrite(DATA_FILE, data);
  hourlyBackup();
}

function detectDevice(ua) {
  const uaLC = (ua || '').toLowerCase();
  if (uaLC.includes('iphone') || uaLC.includes('ipad')) return 'iPhone/iPad';
  if (uaLC.includes('android')) return 'Android';
  if (uaLC.includes('windows')) return 'Windows PC';
  if (uaLC.includes('mac os')) return 'Mac';
  if (uaLC.includes('linux')) return 'Linux';
  return 'Other';
}

function detectBrowser(ua) {
  const uaLC = (ua || '').toLowerCase();
  if (uaLC.includes('micromessenger')) return '微信';
  if (uaLC.includes('alipay')) return '支付宝';
  if (uaLC.includes('edg')) return 'Edge';
  if (uaLC.includes('chrome')) return 'Chrome';
  if (uaLC.includes('safari')) return 'Safari';
  if (uaLC.includes('firefox')) return 'Firefox';
  return 'Other';
}

function fmtTime(iso) {
  if (!iso) return '?';
  const d = new Date(iso);
  const bj = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const pad = n => String(n).padStart(2, '0');
  return `${bj.getUTCFullYear()}-${pad(bj.getUTCMonth() + 1)}-${pad(bj.getUTCDate())} ${pad(bj.getUTCHours())}:${pad(bj.getUTCMinutes())}:${pad(bj.getUTCSeconds())}`;
}

function setupAnalyticsRoutes(app) {
  app.post('/api/visitor/ping', (req, res) => {
    const { userId, city, platform, screen } = req.body || {};
    const ua = req.headers['user-agent'] || '';
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const now = new Date().toISOString();
    const device = detectDevice(ua);
    const browser = detectBrowser(ua);
    const devStr = `${device} / ${browser}`;

    const data = readData();
    if (!data.users[userId]) {
      data.users[userId] = {
        userId,
        firstSeen: now,
        lastSeen: now,
        visitCount: 1,
        devices: [devStr],
        cities: {},
        ips: [ip],
        screen: screen || 'unknown'
      };
      data.uniqueUsers++;
    } else {
      const u = data.users[userId];
      u.lastSeen = now;
      u.visitCount++;
      if (!u.devices.includes(devStr)) u.devices.push(devStr);
      if (screen && !u.screen) u.screen = screen;
      if (!u.ips.includes(ip)) u.ips.push(ip);
    }
    if (city) {
      const u = data.users[userId];
      u.cities[city] = (u.cities[city] || 0) + 1;
      u.lastCity = city;
    }

    if (!data.visits) data.visits = [];
    data.visits.push({ userId, time: now, city: city || '?', device: devStr });
    data.totalVisits = (data.totalVisits || 0) + 1;
    writeData(data);
    res.json({ success: true });
  });

  app.get('/api/visitors', (req, res) => {
    const data = readData();
    const visits = (data.visits || []).slice().reverse();

    const rows = visits.map((v, i) => {
      const uidShort = (v.userId || '').slice(-12);
      return `<tr>
        <td>${i + 1}</td>
        <td>${fmtTime(v.time)}</td>
        <td title="${v.userId}">${uidShort}</td>
        <td>${v.device || '?'}</td>
        <td>${v.city || '?'}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>访客追踪</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f0f0f;color:#e0e0e0;padding:20px}
h2{font-size:20px;margin-bottom:14px;color:#fff}
table{width:100%;border-collapse:collapse;background:#1a1a2e;border-radius:10px;overflow:hidden}
th{background:#252540;padding:10px 12px;text-align:left;font-size:13px;color:#aaa}
td{padding:9px 12px;font-size:13px;border-bottom:1px solid #222}
tr:hover{background:#252540}
.empty{text-align:center;color:#666;padding:30px;font-size:14px}
</style>
<meta http-equiv="refresh" content="30">
</head>
<body>
<h2>访客记录 · ${data.uniqueUsers || 0}人 · ${visits.length}次访问</h2>
${visits.length === 0 ? '<div class="empty">暂无访客数据，等待用户扫码进入...</div>' : `
<table>
<thead><tr><th>#</th><th>访问时间</th><th>用户ID</th><th>设备</th><th>城市</th></tr></thead>
<tbody>${rows}</tbody>
</table>`}
</body>
</html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });

  app.get('/api/visitors/data', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({ success: true, data: readData() });
  });
}

module.exports = { setupAnalyticsRoutes };
