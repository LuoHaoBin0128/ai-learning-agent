/**
 * AI早报自动生成脚本 v4
 * 每天10:00运行
 *
 * 要求:
 *   资讯: 多数据源, 24小时内, 20条+
 *   项目: GitHub, 72小时内, 按星级排序, 20条+
 *   学术: ArXiv, 一周内, 20条+
 *
 * 使用: node scripts/generate-report.js [DEEPSEEK_API_KEY]
 */

const fs = require('fs');
const path = require('path');

const REPORTS_DIR = path.join(__dirname, '..', 'data', 'reports');
const DEEPSEEK_KEY = process.argv[2] || process.env.DEEPSEEK_API_KEY ||
  (() => { try { return require('fs').readFileSync(require('path').join(__dirname, '..', '.deepseek-key'), 'utf-8').trim(); } catch (_) { return ''; } })();
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

const NOW = Date.now();
const MS_24H = 24 * 3600 * 1000;
const MS_72H = 72 * 3600 * 1000;
const MS_7D = 7 * 86400 * 1000;

const AI_KEYWORDS = [
  'ai', 'llm', 'gpt', 'claude', 'openai', 'anthropic', 'google', 'deepmind',
  'meta', 'microsoft', 'transformer', 'rag', 'agent', 'copilot', 'coding',
  'diffusion', 'langchain', 'vector', 'embedding', 'model', 'machine learning',
  'deep learning', 'neural', 'token', 'prompt', 'fine-tune', 'inference',
  'opensource', 'chatbot', 'generative', 'gpu', 'cuda', 'benchmark',
  'deepseek', 'gemini', 'mistral', 'llama', 'qwen', 'reasoning',
  'safety', 'alignment', 'multimodal', 'vision', 'speech', 'image gen',
  'robot', 'embodied', 'autonomous', 'code gen', 'swe-bench',
  'cursor', 'windsurf', 'aider', 'continue', 'cline', 'v0', 'bolt',
  'vercel', 'replit', 'webagent', 'computer use', 'function call',
  'fable', 'opus', 'sonnet', 'grok', 'kimi', 'minimax',
  'rlhf', 'dpo', 'moe', 'quantization', 'lora', 'distillation',
  'text-to', 'video generation', 'tts', 'stt', 'retrieval',
  'knowledge graph', 'graph neural', 'nlp', 'reinforcement learning'
];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function log(msg) { console.log(`[${new Date().toLocaleTimeString('zh-CN')}] ${msg}`); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchJson(url, headers = {}, timeoutMs = 20000) {
  const resp = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function fetchJsonRetry(url, headers = {}, timeoutMs = 20000, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fetchJson(url, headers, timeoutMs);
    } catch (e) {
      if (i === retries) throw e;
      await sleep(2000);
    }
  }
}

function isAiRelated(title) {
  const t = title.toLowerCase();
  return AI_KEYWORDS.some(kw => t.includes(kw));
}

function hoursAgo(isoDate) {
  if (!isoDate) return Infinity;
  return (NOW - new Date(isoDate).getTime()) / 3600000;
}

// ==================== 数据源 1: HN Firebase ====================
async function fetchHN() {
  log('[HN] 抓取中...');
  try {
    const [topIds, newIds] = await Promise.all([
      fetchJsonRetry('https://hacker-news.firebaseio.com/v0/topstories.json', {}, 30000),
      fetchJsonRetry('https://hacker-news.firebaseio.com/v0/newstories.json', {}, 30000),
    ]);
    const idSet = new Set([...topIds.slice(0, 250), ...newIds.slice(0, 250)]);
    const ids = [...idSet];
    log(`  [HN] 候选 ${ids.length} 条`);

    const items = [];
    let scanned = 0;
    for (const id of ids) {
      try {
        const item = await fetchJsonRetry(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {}, 15000, 1);
        scanned++;
        if (!item || !item.title || item.dead || item.deleted) continue;
        const date = new Date(item.time * 1000).toISOString().substring(0, 10);
        if (hoursAgo(date) > 24) continue;
        if (!isAiRelated(item.title)) continue;

        items.push({
          id: `hn-${id}`, title: item.title,
          summary: (item.text || '').substring(0, 200).replace(/\s+/g, ' ').trim(),
          source: 'Hacker News', source_url: item.url || `https://news.ycombinator.com/item?id=${id}`,
          date, score: item.score || 0, comments: item.descendants || 0,
        });
        if (items.length >= 60) break;
      } catch (_) {}
      if (scanned % 30 === 0) await sleep(50);
    }
    items.sort((a, b) => b.score - a.score);
    log(`  [HN] 24h内AI相关: ${items.length} 条`);
    return items;
  } catch (e) { log(`  [HN] 失败: ${e.message}`); return []; }
}

// ==================== 数据源 2: HN Algolia Search ====================
async function fetchHNAlgolia() {
  log('[HN Algolia] 抓取中...');
  const queries = ['ai', 'llm', 'machine learning', 'openai', 'claude', 'deepseek'];
  const allItems = [];
  const ts24h = Math.floor((NOW - MS_24H) / 1000);

  for (const q of queries) {
    try {
      const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=25&numericFilters=created_at_i>${ts24h}`;
      const data = await fetchJsonRetry(url, {}, 15000);
      for (const hit of (data.hits || [])) {
        if (!hit.title || hit._tags?.includes('dead')) continue;
        if (!isAiRelated(hit.title)) continue;
        allItems.push({
          id: `hnalg-${hit.objectID}`,
          title: hit.title,
          summary: (hit.story_text || hit.comment_text || '').substring(0, 200).replace(/\s+/g, ' ').trim(),
          source: 'Hacker News',
          source_url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
          date: hit.created_at ? hit.created_at.substring(0, 10) : '',
          score: hit.points || 0, comments: hit.num_comments || 0,
        });
      }
    } catch (e) { log(`  [HN Algolia] "${q}" 失败: ${e.message}`); }
    await sleep(500);
  }

  const seen = new Set();
  const unique = allItems.filter(i => {
    const k = i.title.toLowerCase().substring(0, 60);
    if (seen.has(k)) return false; seen.add(k); return true;
  });
  unique.sort((a, b) => b.score - a.score);
  log(`  [HN Algolia] 24h内: ${unique.length} 条`);
  return unique;
}

// ==================== 数据源 3: DEV.to ====================
async function fetchDevTo() {
  log('[DEV.to] 抓取中...');
  const tags = ['ai', 'llm', 'machinelearning', 'generativeai', 'chatgpt'];
  const allItems = [];

  for (const tag of tags) {
    try {
      const url = `https://dev.to/api/articles?tag=${tag}&per_page=15`;
      const articles = await fetchJsonRetry(url, {}, 15000);
      for (const a of articles) {
        if (!a.title || !a.published_at) continue;
        if (hoursAgo(a.published_at) > 24) continue;
        const title = a.title.replace(/<[^>]+>/g, '').trim();
        if (!isAiRelated(title) && !isAiRelated(a.description || '')) continue;

        allItems.push({
          id: `devto-${a.id}`,
          title,
          summary: (a.description || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().substring(0, 200),
          source: 'DEV.to',
          source_url: a.url || a.canonical_url || '',
          date: a.published_at.substring(0, 10),
          score: a.positive_reactions_count || 0, comments: a.comments_count || 0,
        });
      }
    } catch (e) { log(`  [DEV.to] "${tag}" 失败: ${e.message}`); }
    await sleep(800);
  }

  const seen = new Set();
  const unique = allItems.filter(i => {
    const k = i.title.toLowerCase().substring(0, 60);
    if (seen.has(k)) return false; seen.add(k); return true;
  });
  unique.sort((a, b) => b.score - a.score);
  log(`  [DEV.to] 24h内AI: ${unique.length} 条`);
  return unique;
}

// ==================== 数据源 4: Lobste.rs ====================
async function fetchLobsters() {
  log('[Lobste.rs] 抓取中...');
  try {
    const stories = await fetchJsonRetry('https://lobste.rs/hottest.json', {}, 15000);
    const items = [];
    for (const s of stories) {
      if (hoursAgo(s.created_at) > 24) continue;
      if (!isAiRelated(s.title)) continue;
      items.push({
        id: `lob-${s.short_id}`, title: s.title,
        summary: (s.description || '').replace(/\s+/g, ' ').trim().substring(0, 200),
        source: 'Lobste.rs',
        source_url: s.url || `https://lobste.rs/s/${s.short_id}`,
        date: s.created_at?.substring(0, 10) || '',
        score: s.score || 0, comments: s.comment_count || 0,
      });
    }
    log(`  [Lobste.rs] 24h内AI: ${items.length} 条`);
    return items;
  } catch (e) { log(`  [Lobste.rs] 失败: ${e.message}`); return []; }
}

// ==================== 数据源 5: GitHub (72小时内, 按Star排序) ====================
async function fetchGitHub() {
  log('[GitHub] 抓取最热项目 (72h)...');
  const since = new Date(NOW - MS_72H).toISOString().substring(0, 10);
  const allItems = [];

  // ===== 策略1: 高星活跃仓库 (stars>100, pushed<72h, sort by stars) =====
  log('[GitHub] 策略1 — 高星活跃仓库...');
  const searchQueries = [
    'ai+topic:artificial-intelligence+stars:>100',
    'llm+topic:large-language-models+stars:>100',
    'agent+topic:ai+stars:>100',
    'ai+coding+topic:developer-tools+stars:>100',
    'machine+learning+topic:deep-learning+stars:>100',
    'rag+topic:retrieval-augmented-generation+stars:>100',
    'generative+ai+stars:>500',
    'mcp+topic:agent+stars:>100',
    'langchain+stars:>500',
    'openai+api+stars:>500',
  ];

  for (const q of searchQueries) {
    try {
      const url = `https://api.github.com/search/repositories?q=${q}+pushed:>=${since}&sort=stars&order=desc&per_page=100`;
      const data = await fetchJsonRetry(url, { 'User-Agent': 'AI-Learning-Agent/1.0' }, 15000);
      for (const repo of (data.items || [])) {
        allItems.push({
          id: `gh-${repo.id}`, title: repo.full_name,
          summary: repo.description || '',
          source: 'GitHub',
          source_url: repo.html_url,
          date: repo.pushed_at ? repo.pushed_at.substring(0, 10) : '',
          stars: repo.stargazers_count,
          language: repo.language || '',
          topics: repo.topics || [],
        });
      }
      log(`  [GitHub] "${q}": ${(data.items||[]).length} 个`);
    } catch (e) { log(`  [GitHub] "${q}" 失败: ${e.message}`); }
    await sleep(2500);
  }

  // ===== 策略2: 新建热门仓库 (created<72h, stars>10, sort by stars) =====
  log('[GitHub] 策略2 — 新建热门仓库...');
  const newQueries = [
    'ai+agent+language:python+stars:>10',
    'llm+tool+language:python+stars:>10',
    'ai+framework+stars:>20',
    'rag+embedding+stars:>10',
    'ai+coding+assistant+stars:>20',
  ];

  for (const q of newQueries) {
    try {
      const url = `https://api.github.com/search/repositories?q=${q}+created:>=${since}&sort=stars&order=desc&per_page=50`;
      const data = await fetchJsonRetry(url, { 'User-Agent': 'AI-Learning-Agent/1.0' }, 15000);
      for (const repo of (data.items || [])) {
        allItems.push({
          id: `gh-${repo.id}`, title: repo.full_name,
          summary: repo.description || '',
          source: 'GitHub',
          source_url: repo.html_url,
          date: repo.created_at ? repo.created_at.substring(0, 10) : '',
          stars: repo.stargazers_count,
          language: repo.language || '',
          topics: repo.topics || [],
        });
      }
      log(`  [GitHub] new "${q}": ${(data.items||[]).length} 个`);
    } catch (e) { log(`  [GitHub] new "${q}" 失败: ${e.message}`); }
    await sleep(2500);
  }

  // 去重 + 按星级降序排列
  const seen = new Set();
  const unique = allItems.filter(i => {
    const key = i.title.toLowerCase();
    if (seen.has(key)) return false; seen.add(key); return true;
  });
  unique.sort((a, b) => (b.stars || 0) - (a.stars || 0));
  log(`  [GitHub] 去重后共 ${unique.length} 个, 最高 ${unique[0]?.stars || 0}★, 最低 ${unique[unique.length-1]?.stars || 0}★`);
  return unique;
}

// ==================== 数据源 6: ArXiv (一周内) ====================
async function fetchArxiv() {
  log('[ArXiv] 抓取中 (7天内)...');
  const cats = ['cs.AI', 'cs.CL', 'cs.LG', 'cs.CV', 'cs.MA', 'cs.RO', 'cs.HC', 'cs.CY'];
  const allPapers = [];

  for (const cat of cats) {
    try {
      const url = `http://export.arxiv.org/api/query?search_query=cat:${cat}&sortBy=submittedDate&sortOrder=descending&max_results=15`;
      const xml = await (await fetch(url, { signal: AbortSignal.timeout(20000) })).text();
      const entries = xml.split('<entry>').slice(1);

      for (const entry of entries) {
        const id = (entry.match(/<id>([\s\S]*?)<\/id>/i) || [])[1]?.trim() || '';
        const title = (entry.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.trim() || '';
        const summary = (entry.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i) || [])[1]?.trim() || '';
        const published = (entry.match(/<published[^>]*>([\s\S]*?)<\/published>/i) || [])[1]?.trim() || '';
        const names = [...entry.matchAll(/<name>([^<]+)<\/name>/g)].map(m => m[1]);

        if (!title) continue;
        if (hoursAgo(published?.substring(0, 10)) > 168) continue; // 7天
        if (!isAiRelated(title)) continue;

        allPapers.push({
          id: `arxiv-${id.replace(/[^a-zA-Z0-9.]/g, '')}`,
          title: title.replace(/\s+/g, ' ').trim(),
          summary: summary.replace(/\s+/g, ' ').trim().substring(0, 300),
          authors: names.slice(0, 4).join(', '),
          source: 'ArXiv', source_url: id || '',
          date: published ? published.substring(0, 10) : '',
        });
      }
      log(`  [ArXiv] ${cat}: ${entries.length} 篇`);
    } catch (e) { log(`  [ArXiv] ${cat} 失败: ${e.message}`); }
    await sleep(2000);
  }

  const seen = new Set();
  const unique = allPapers.filter(p => {
    const k = p.title.substring(0, 60);
    if (seen.has(k)) return false; seen.add(k); return true;
  });
  unique.sort((a, b) => b.date.localeCompare(a.date));
  log(`  [ArXiv] 7天内: ${unique.length} 篇`);
  return unique;
}

// ==================== DeepSeek 翻译 ====================
async function translateWithDeepSeek(items, category) {
  if (!DEEPSEEK_KEY) {
    log(`  [翻译] 无Key，基础模式`);
    return items.map(item => basicFormat(item, category));
  }

  log(`  [翻译] ${items.length} 条 [${category}]...`);
  const batchSize = 8;
  const results = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    try {
      results.push(...await translateBatch(batch, category));
      log(`    翻译进度: ${results.length}/${items.length}`);
    } catch (e) {
      log(`    批次失败: ${e.message}，使用基础格式`);
      results.push(...batch.map(item => basicFormat(item, category)));
    }
    if (i + batchSize < items.length) await sleep(2000);
  }
  return results;
}

async function translateBatch(items, category) {
  const itemsJson = items.map((item, i) => ({
    index: i, title: item.title, summary: item.summary || '',
    source: item.source, date: item.date,
  }));

  const catLabel = category === 'news' ? '资讯' : category === 'projects' ? '项目' : '学术';

  const body = JSON.stringify({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: '你是专业的AI行业分析师。将以下英文AI内容翻译为中文并生成深度解读。输出严格JSON数组格式。' },
      { role: 'user', content: `处理以下${catLabel}类AI内容：\n${JSON.stringify(itemsJson, null, 2)}\n\n每条返回: {"index":原index, "title":"中文标题", "summary":"一句话摘要50字内", "full_content":"详细解读300-500字，用##分段，含背景/核心内容/为什么重要，产品经理视角", "tags":["2-4个中文标签"], "importance":"high或medium"}\n中文专业流畅，突出"为什么重要"。` },
    ],
    temperature: 0.7, max_tokens: 8192,
  });

  const resp = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
    body,
    signal: AbortSignal.timeout(120000),
  });

  if (!resp.ok) throw new Error(`DeepSeek HTTP ${resp.status}`);
  const data = await resp.json();
  const text = data.choices[0].message.content;
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('无有效JSON');

  let translated;
  try { translated = JSON.parse(jsonMatch[0]); }
  catch (_) {
    const fixed = jsonMatch[0].replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
    translated = JSON.parse(fixed);
  }

  return translated.map(t => {
    const orig = items[t.index];
    return { ...t, id: orig.id, source: orig.source, source_url: orig.source_url,
      date: orig.date, score: orig.score, comments: orig.comments,
      stars: orig.stars, authors: orig.authors };
  });
}

function basicFormat(item, category) {
  const prefix = category === 'projects' ? `Stars: ${item.stars || 0} | ` : '';
  return {
    id: item.id, title: item.title,
    summary: prefix + (item.summary || '').substring(0, 100),
    full_content: `## 原始信息\n\n${item.summary || '暂无详细描述'}\n\n> 设置 DEEPSEEK_API_KEY 可获取AI中文深度解读。`,
    source: item.source, source_url: item.source_url, date: item.date,
    tags: item.topics || [],
    importance: (item.score || item.stars || 0) > 100 ? 'high' : 'medium',
  };
}

// ==================== 主流程 ====================
async function main() {
  log('===== AI早报 v4 生成开始 =====');
  log(`日期: ${todayStr()} | 资讯24h / 项目72h / 学术7天`);

  // 1. 并行抓取全部6个数据源
  const [hn, hnAlg, devto, lobsters, github, arxiv] = await Promise.all([
    fetchHN(), fetchHNAlgolia(), fetchDevTo(), fetchLobsters(),
    fetchGitHub(), fetchArxiv(),
  ]);

  // 2. 合并资讯（4个源 -> 去重 -> 按热度排序 -> 取20+）
  const newsRaw = [...hn, ...hnAlg, ...devto, ...lobsters];
  const newsSeen = new Set();
  let newsItems = newsRaw.filter(i => {
    const k = i.title.toLowerCase().substring(0, 60);
    if (newsSeen.has(k)) return false; newsSeen.add(k); return true;
  });
  newsItems.sort((a, b) => (b.score || 0) - (a.score || 0));
  log(`\n资讯合并: ${newsItems.length} 条 (HN ${hn.length} + Algolia ${hnAlg.length} + DEV.to ${devto.length} + Lobsters ${lobsters.length} 去重)`);

  // 3. 项目: 按GitHub star排序
  let projectsItems = github;
  log(`项目: ${projectsItems.length} 个 (GitHub)`);

  // 4. 学术
  let academicItems = arxiv;
  log(`学术: ${academicItems.length} 篇 (ArXiv)`);

  // 5. 取每类尽量多
  newsItems = newsItems.slice(0, 35);
  projectsItems = projectsItems.slice(0, 30);
  academicItems = academicItems.slice(0, 30);

  log(`\n最终: 资讯${newsItems.length} / 项目${projectsItems.length} / 学术${academicItems.length}\n`);

  // 6. 翻译
  const translatedNews = await translateWithDeepSeek(newsItems, 'news');
  const translatedProjects = await translateWithDeepSeek(projectsItems, 'projects');
  const translatedAcademic = await translateWithDeepSeek(academicItems, 'academic');

  // 7. 生成报告
  const report = {
    date: todayStr(),
    generated_at: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    time_window: '资讯24h / 项目72h / 学术7天',
    sources: { news: ['HN', 'HN Algolia', 'DEV.to', 'Lobste.rs'], projects: ['GitHub'], academic: ['ArXiv'] },
    sections: {
      news: { title: '资讯', items: translatedNews },
      projects: { title: '项目', items: translatedProjects },
      academic: { title: '学术', items: translatedAcademic },
    },
  };

  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const filePath = path.join(REPORTS_DIR, `${todayStr()}.json`);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf-8');

  const total = translatedNews.length + translatedProjects.length + translatedAcademic.length;
  log(`===== 完成: ${total} 条 (资讯${translatedNews.length}/项目${translatedProjects.length}/学术${translatedAcademic.length}) =====`);
  log(`保存: ${filePath}`);
}

main().catch(err => { console.error('生成失败:', err); process.exit(1); });
