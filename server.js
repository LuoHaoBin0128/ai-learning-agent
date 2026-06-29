const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { setupAnalyticsRoutes } = require('./analytics');

const app = express();
const PORT = process.env.PORT || 3456;

app.use(express.static(__dirname));
app.use(express.json({ limit: '50mb' }));

// 访客追踪
setupAnalyticsRoutes(app);

const reportsDir = path.join(__dirname, 'data', 'reports');
const keyFile = path.join(__dirname, '.deepseek-key');
const DEEPSEEK_KEY = (() => {
  try { return fs.readFileSync(keyFile, 'utf-8').trim(); } catch (_) { return ''; }
})();

if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

// 获取最新早报
app.get('/api/report/latest', (req, res) => {
  try {
    const dateRe = /^\d{4}-\d{2}-\d{2}\.json$/;
    const files = fs.readdirSync(reportsDir)
      .filter(f => dateRe.test(f))
      .sort()
      .reverse();
    if (files.length === 0) {
      return res.status(404).json({ error: '暂无早报数据，请先生成' });
    }
    const report = JSON.parse(fs.readFileSync(path.join(reportsDir, files[0]), 'utf-8'));
    res.json(report);
  } catch (e) {
    res.status(500).json({ error: '读取早报失败: ' + e.message });
  }
});

// 按日期获取早报
app.get('/api/report', (req, res) => {
  const date = req.query.date;
  if (!date) return res.status(400).json({ error: '请提供日期参数，格式: YYYY-MM-DD' });
  const filePath = path.join(reportsDir, `${date}.json`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: `${date} 暂无早报数据` });
  }
  res.json(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
});

// 手动触发生成
app.post('/api/generate', (req, res) => {
  res.json({ message: '早报生成已触发，请稍候查看' });
  const args = DEEPSEEK_KEY ? `scripts/generate-report.js ${DEEPSEEK_KEY}` : 'scripts/generate-report.js';
  exec(`node ${args}`, { cwd: __dirname }, (err, stdout, stderr) => {
    if (err) console.error('[Generate] 失败:', stderr);
    else console.log('[Generate] 成功:', stdout);
  });
});

// ==================== AI圈 ====================
const circleDir = path.join(__dirname, 'data', 'circle');
const circleImgDir = path.join(circleDir, 'images');
const postsFile = path.join(circleDir, 'posts.json');
[circleDir, circleImgDir].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
if (!fs.existsSync(postsFile)) fs.writeFileSync(postsFile, '[]', 'utf-8');

function readPosts() {
  try { return JSON.parse(fs.readFileSync(postsFile, 'utf-8')); } catch (_) { return []; }
}
function writePosts(posts) {
  fs.writeFileSync(postsFile, JSON.stringify(posts, null, 2), 'utf-8');
}

// 获取所有帖子
app.get('/api/circle/posts', (req, res) => {
  try {
    let posts = readPosts();
    if (req.query.type) {
      posts = posts.filter(p => p.type === req.query.type);
    }
    posts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json({ posts });
  } catch (e) {
    res.status(500).json({ error: '读取帖子失败: ' + e.message });
  }
});

// 发布新帖
app.post('/api/circle/posts', (req, res) => {
  try {
    const { author, avatar, level, content, images, type } = req.body;
    if (!author || !author.trim()) return res.status(400).json({ error: '请输入昵称' });
    if (!content || !content.trim()) return res.status(400).json({ error: '请输入内容' });
    // 达人圈：等级必须 >= 10
    if (type === 'expert' && (level || 0) < 10) {
      return res.status(403).json({ error: '等级10以上才能在达人圈发布' });
    }

    const savedImages = [];
    if (images && Array.isArray(images)) {
      for (const img of images) {
        if (!img || !img.startsWith('data:image/')) continue;
        const mime = img.match(/^data:(image\/\w+);base64,/);
        if (!mime) continue;
        const ext = mime[1] === 'image/png' ? 'png' : mime[1] === 'image/gif' ? 'gif' : 'jpg';
        const base64 = img.replace(/^data:image\/\w+;base64,/, '');
        const buf = Buffer.from(base64, 'base64');
        const fname = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
        fs.writeFileSync(path.join(circleImgDir, fname), buf);
        savedImages.push(`data/circle/images/${fname}`);
      }
    }

    const post = {
      id: crypto.randomUUID(),
      type: type || 'free',
      author: author.trim(),
      avatar: avatar || '',
      level: level || 1,
      content: content.trim(),
      images: savedImages,
      created_at: new Date().toISOString(),
      likes: [],
      comments: []
    };

    const posts = readPosts();
    posts.push(post);
    writePosts(posts);
    res.json({ post });
  } catch (e) {
    res.status(500).json({ error: '发布失败: ' + e.message });
  }
});

// 发表评论
app.post('/api/circle/posts/:id/comment', (req, res) => {
  try {
    const { author, content } = req.body;
    if (!author || !author.trim()) return res.status(400).json({ error: '请输入昵称' });
    if (!content || !content.trim()) return res.status(400).json({ error: '请输入评论内容' });

    const posts = readPosts();
    const post = posts.find(p => p.id === req.params.id);
    if (!post) return res.status(404).json({ error: '帖子不存在' });

    const comment = {
      id: crypto.randomUUID(),
      author: author.trim(),
      content: content.trim(),
      created_at: new Date().toISOString()
    };
    post.comments.push(comment);
    writePosts(posts);
    res.json({ comment });
  } catch (e) {
    res.status(500).json({ error: '评论失败: ' + e.message });
  }
});

// 点赞/取消点赞
app.post('/api/circle/posts/:id/like', (req, res) => {
  try {
    const { nickname } = req.body;
    if (!nickname) return res.status(400).json({ error: '请先设置昵称' });

    const posts = readPosts();
    const post = posts.find(p => p.id === req.params.id);
    if (!post) return res.status(404).json({ error: '帖子不存在' });

    if (!post.likes) post.likes = [];
    const idx = post.likes.indexOf(nickname);
    if (idx >= 0) {
      post.likes.splice(idx, 1);
    } else {
      post.likes.push(nickname);
    }
    writePosts(posts);
    res.json({ likes: post.likes });
  } catch (e) {
    res.status(500).json({ error: '操作失败: ' + e.message });
  }
});

// 删除帖子（仅作者可删）
app.delete('/api/circle/posts/:id', (req, res) => {
  try {
    let posts = readPosts();
    const post = posts.find(p => p.id === req.params.id);
    if (!post) return res.status(404).json({ error: '帖子不存在' });

    // 校验作者身份
    const requester = (req.body.author || '').trim();
    if (!requester) return res.status(400).json({ error: '请先设置昵称' });
    if (requester !== post.author) return res.status(403).json({ error: '只能删除自己的帖子' });

    // 删除关联图片
    if (post.images && Array.isArray(post.images)) {
      for (const img of post.images) {
        const imgPath = path.join(__dirname, img);
        try { if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath); } catch (_) {}
      }
    }

    posts = posts.filter(p => p.id !== req.params.id);
    writePosts(posts);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: '删除失败: ' + e.message });
  }
});

// ==================== 我的建议 ====================
const suggestionsFile = path.join(__dirname, 'data', 'suggestions.json');
if (!fs.existsSync(suggestionsFile)) fs.writeFileSync(suggestionsFile, '[]', 'utf-8');

function readSuggestions() {
  try { return JSON.parse(fs.readFileSync(suggestionsFile, 'utf-8')); } catch (_) { return []; }
}
function writeSuggestions(list) {
  fs.writeFileSync(suggestionsFile, JSON.stringify(list, null, 2), 'utf-8');
}

app.get('/api/suggestions', (req, res) => {
  try {
    const author = req.query.author;
    let list = readSuggestions();
    if (author) {
      list = list.filter(s => s.author === author);
    }
    list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json({ suggestions: list });
  } catch (e) {
    res.status(500).json({ error: '读取建议失败: ' + e.message });
  }
});

app.post('/api/suggestions', (req, res) => {
  try {
    const { author, content } = req.body;
    if (!author || !author.trim()) return res.status(400).json({ error: '请输入昵称' });
    if (!content || !content.trim()) return res.status(400).json({ error: '请输入建议内容' });

    const suggestion = {
      id: crypto.randomUUID(),
      author: author.trim(),
      content: content.trim(),
      created_at: new Date().toISOString(),
      likes: []
    };

    const list = readSuggestions();
    list.push(suggestion);
    writeSuggestions(list);
    res.json({ suggestion });
  } catch (e) {
    res.status(500).json({ error: '提交建议失败: ' + e.message });
  }
});

// ==================== 认证系统 ====================
const certFile = path.join(__dirname, 'data', 'certifications.json');
if (!fs.existsSync(certFile)) fs.writeFileSync(certFile, '[]', 'utf-8');

function readCerts() {
  try { return JSON.parse(fs.readFileSync(certFile, 'utf-8')); } catch (_) { return []; }
}
function writeCerts(list) {
  fs.writeFileSync(certFile, JSON.stringify(list, null, 2), 'utf-8');
}

// 查询认证状态（不传author则返回全部，管理端用）
app.get('/api/certification', (req, res) => {
  try {
    const author = req.query.author;
    const certs = readCerts();
    if (!author) {
      certs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return res.json({ certifications: certs });
    }
    const cert = certs.find(c => c.author === author);
    res.json({ certification: cert || null });
  } catch (e) {
    res.status(500).json({ error: '查询认证失败: ' + e.message });
  }
});

// 提交认证申请
app.post('/api/certification', (req, res) => {
  try {
    const { author, type, realName, company, position, email, platform, accountName, followerCount, accountUrl, note } = req.body;
    if (!author || !author.trim()) return res.status(400).json({ error: '请先设置昵称' });
    if (!type || !['worker', 'blogger'].includes(type)) return res.status(400).json({ error: '请选择认证类型' });

    const certs = readCerts();
    // 检查是否已有申请
    const existing = certs.find(c => c.author === author && c.status !== 'rejected');
    if (existing) return res.status(400).json({ error: '您已有认证申请在处理中' });

    if (type === 'worker') {
      if (!realName || !realName.trim()) return res.status(400).json({ error: '请填写真实姓名' });
      if (!company || !company.trim()) return res.status(400).json({ error: '请填写公司/机构' });
      if (!position || !position.trim()) return res.status(400).json({ error: '请填写职位' });
    } else {
      if (!platform || !platform.trim()) return res.status(400).json({ error: '请填写平台名称' });
      if (!accountName || !accountName.trim()) return res.status(400).json({ error: '请填写账号名称' });
      const fc = parseInt(followerCount, 10);
      if (!fc || fc < 100000) return res.status(400).json({ error: '粉丝量需达到10万以上' });
    }

    const cert = {
      id: crypto.randomUUID(),
      author: author.trim(),
      type,
      status: 'pending',
      realName: (realName || '').trim(),
      company: (company || '').trim(),
      position: (position || '').trim(),
      email: (email || '').trim(),
      platform: (platform || '').trim(),
      accountName: (accountName || '').trim(),
      followerCount: parseInt(followerCount, 10) || 0,
      accountUrl: (accountUrl || '').trim(),
      note: (note || '').trim(),
      created_at: new Date().toISOString(),
      reviewed_at: null
    };

    certs.push(cert);
    writeCerts(certs);
    res.json({ certification: cert });
  } catch (e) {
    res.status(500).json({ error: '提交认证失败: ' + e.message });
  }
});

// 审核认证（管理端用）
app.put('/api/certification/:id', (req, res) => {
  try {
    const { status } = req.body;
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: '状态无效' });

    const certs = readCerts();
    const cert = certs.find(c => c.id === req.params.id);
    if (!cert) return res.status(404).json({ error: '认证申请不存在' });

    cert.status = status;
    cert.reviewed_at = new Date().toISOString();
    writeCerts(certs);
    res.json({ certification: cert });
  } catch (e) {
    res.status(500).json({ error: '审核失败: ' + e.message });
  }
});

app.listen(PORT, () => {
  console.log(`AI学习助手已启动: http://localhost:${PORT}`);
});
