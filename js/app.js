/**
 * AI学习助手 - 前端主逻辑
 */

const state = {
  currentTab: 'report',
  currentSubTab: 'news',
  currentToolSubTab: 'coding',
  currentModelSubTab: 'overall',
  currentCircleTab: 'expert',
  reportData: null,
  toolsData: null,
  modelsData: null,
  expandedCard: null,
  imageCache: {},
  circlePosts: [],
  certification: null,
};

// ========== DOM 元素 ==========
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const mainContent = $('#mainContent');
const loadingOverlay = $('#loadingOverlay');
const detailOverlay = $('#detailOverlay');
const detailBody = $('#detailBody');
const detailSource = $('#detailSource');
const currentDateEl = $('#currentDate');

// ========== 初始化 ==========
function init() {
  sendVisitorPing();
  setTodayDate();
  bindNavEvents();
  bindGlobalLinks();
  // 初始状态 — 默认在 report 页
  $('.app-title').textContent = 'AI早报';
  $('#appSubtitle').textContent = '每天十点定时更新';
  loadReport();
  // 预加载其他 tab 数据，实现瞬间切换
  preloadToolData();
  loadModelsData();
  cacheCertification();
  // 头部相机按钮
  const camBtn = $('#appCameraBtn');
  if (camBtn) camBtn.addEventListener('click', openComposer);
  // 设置按钮
  const setBtn = $('#appSettingsBtn');
  if (setBtn) setBtn.addEventListener('click', openSettings);
}

// 全局外部链接委托 — 用 window.open 避免移动端 target=_blank 被拦截
function bindGlobalLinks() {
  mainContent.addEventListener('click', (e) => {
    const link = e.target.closest('a.s-link, a.btn-link, .fi-link');
    if (!link || !link.href) return;
    e.preventDefault();
    e.stopPropagation();
    window.open(link.href, '_blank', 'noopener,noreferrer');
  });
}

// 静默预加载工具数据（不显示 loading）
async function preloadToolData() {
  try {
    const resp = await fetch('data/tools.json');
    if (resp.ok) state.toolsData = await resp.json();
  } catch (_) {}
}

function setTodayDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  currentDateEl.textContent = `${y}年${m}月${d}日`;
}

// ========== 底部导航 ==========
function bindNavEvents() {
  $$('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab === state.currentTab) return;
      switchTab(tab);
    });
  });
}

function switchTab(tab) {
  state.currentTab = tab;

  $$('.nav-item').forEach(b => b.classList.remove('active'));
  $(`.nav-item[data-tab="${tab}"]`).classList.add('active');

  // 更新顶部标题
  const titleEl = $('.app-title');
  const subEl = $('#appSubtitle');
  const dateEl = $('#currentDate');
  const camBtn = $('#appCameraBtn');
  const setBtn = $('#appSettingsBtn');
  // 先全部隐藏
  if (dateEl) dateEl.style.display = '';
  if (camBtn) camBtn.style.display = 'none';
  if (setBtn) setBtn.style.display = 'none';
  if (subEl) subEl.textContent = '';

  if (tab === 'circle') {
    if (titleEl) titleEl.textContent = 'AI圈';
    if (dateEl) dateEl.style.display = 'none';
    if (camBtn) camBtn.style.display = '';
  } else if (tab === 'profile') {
    if (titleEl) titleEl.textContent = '我的';
    if (dateEl) dateEl.style.display = 'none';
    if (setBtn) setBtn.style.display = '';
  } else if (tab === 'report') {
    if (titleEl) titleEl.textContent = 'AI早报';
    if (subEl) subEl.textContent = '每天十点定时更新';
  } else if (tab === 'tools') {
    if (titleEl) titleEl.textContent = 'AI工具';
    if (subEl) subEl.textContent = '每72小时更新一次';
  } else {
    if (titleEl) titleEl.textContent = 'AI 学习助手';
  }

  if (tab === 'report') {
    if (state.reportData) renderReportPage();
    else loadReport();
  } else if (tab === 'tools') {
    if (state.toolsData) renderToolsPage();
    else loadTools();
  } else if (tab === 'circle') {
    // 有缓存数据时立即渲染，无 loading 闪烁
    if (state.circlePosts.length) renderCirclePage();
    loadCircle();
  } else if (tab === 'profile') {
    renderProfilePage();
    cacheCertification();
  } else {
    renderPlaceholder(tab);
  }
}

// ========== 加载数据 ==========
async function loadReport() {
  showLoading(true);
  try {
    const resp = await fetch('/api/report/latest');
    if (!resp.ok) {
      throw new Error((await resp.json()).error || '加载失败');
    }
    state.reportData = await resp.json();
    renderReportPage();
  } catch (err) {
    console.error('加载早报失败:', err);
    // 尝试加载本地示例数据
    try {
      const resp = await fetch('data/reports/2026-06-26.json');
      if (resp.ok) {
        state.reportData = await resp.json();
        renderReportPage();
        return;
      }
    } catch (_) {}
    mainContent.innerHTML = `
      <div class="empty-state">
        <p>暂无早报数据</p>
        <p style="font-size:12px;margin-top:4px;">请运行 node scripts/generate-report.js 生成早报</p>
      </div>
    `;
  } finally {
    showLoading(false);
  }
}

function showLoading(show) {
  if (show) {
    loadingOverlay.classList.remove('hidden');
  } else {
    loadingOverlay.classList.add('hidden');
  }
}

// ========== 渲染 ==========
function renderReportPage() {
  const data = state.reportData;
  if (!data || !data.sections) {
    mainContent.innerHTML = `<div class="empty-state"><p>暂无早报数据</p></div>`;
    return;
  }

  const sectionKeys = ['news', 'projects', 'academic'];
  const labels = { news: '资讯', projects: '项目', academic: '学术' };
  const colors = { news: '#3B82F6', projects: '#10B981', academic: '#8B5CF6' };
  const gradients = {
    news: 'linear-gradient(135deg, #3B82F6 0%, #6366F1 50%, #8B5CF6 100%)',
    projects: 'linear-gradient(135deg, #10B981 0%, #14B8A6 40%, #06B6D4 100%)',
    academic: 'linear-gradient(135deg, #8B5CF6 0%, #EC4899 50%, #F43F5E 100%)'
  };

  let html = '<div class="sub-tabs">';
  sectionKeys.forEach(key => {
    html += `<button class="sub-tab${state.currentSubTab === key ? ' active' : ''}" data-subtab="${key}">${labels[key]}</button>`;
  });
  html += '</div>';

  const section = data.sections[state.currentSubTab];
  if (!section || !section.items || section.items.length === 0) {
    html += '<div class="empty-state"><p>该分类暂无内容</p></div>';
    mainContent.innerHTML = html;
    return;
  }

  const items = section.items;
  const c = colors[state.currentSubTab];
  const g = gradients[state.currentSubTab];

  html += '<div class="magazine">';

  // Hero — 第一条，全渐变背景
  html += renderHeroCard(items[0], state.currentSubTab, c, g);

  // Feature Grid — 第2-3条，双列
  if (items.length >= 3) {
    html += '<div class="story-grid">';
    html += renderStoryCard(items[1], state.currentSubTab, 1, c);
    html += renderStoryCard(items[2], state.currentSubTab, 2, c);
    html += '</div>';
  } else if (items.length === 2) {
    html += '<div class="story-grid">';
    html += renderStoryCard(items[1], state.currentSubTab, 1, c);
    html += '</div>';
  }

  // Text List — 第4条起
  if (items.length > 3) {
    html += '<div class="mag-section-label"><span>更多内容</span></div>';
    html += '<div class="story-list">';
    for (let i = 3; i < items.length; i++) {
      html += renderListCard(items[i], state.currentSubTab, i, c);
    }
    html += '</div>';
  }

  html += '</div>';
  mainContent.innerHTML = html;

  // 子tab切换
  $$('.sub-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.currentSubTab = btn.dataset.subtab;
      state.expandedCard = null;
      renderReportPage();
      mainContent.scrollTop = 0;
    });
  });

  // 绑定点击展开
  $$('.story-hero, .story-card, .story-row').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.s-link')) return;
      if (e.target.closest('.s-collapse')) { collapseCard(el); return; }
      toggleCard(el);
    });
  });
}

// ========== 三种卡片（v6 Apple-Inspired） ==========
function renderHeroCard(item, sectionKey, color, gradient) {
  const cid = `${sectionKey}-0`;
  const isExpanded = state.expandedCard === cid;
  const readMin = Math.max(1, Math.round(((item.full_content || '') + (item.summary || '')).length / 500));
  const tags = (item.tags || []).slice(0, 3).map(t => `<span class="s-tag">${escHtml(t)}</span>`).join('');
  const starsBadge = item.stars ? `<span class="hk-stars">${item.stars.toLocaleString()}</span>` : '';

  return `
    <div class="story-hero${isExpanded ? ' expanded' : ''}" data-card-id="${cid}" style="--c:${color}">
      <div class="hero-bg" style="background:${gradient}"></div>
      <div class="hero-body">
        <div class="hero-kicker">
          <span class="hk-src">${escHtml(item.source)}</span>
          ${starsBadge}
          <span class="hk-date">${escHtml(item.date || '')}</span>
          <span class="hk-read">${readMin} min</span>
        </div>
        <h2 class="hero-title">${escHtml(item.title)}</h2>
        <p class="hero-dek">${escHtml(item.summary)}</p>
        <div class="hero-tags">${tags}</div>
        ${!isExpanded ? '<div class="hero-expand">展开全文</div>' : ''}
        <div class="hero-detail">
          <div class="s-content">${formatContent(item.full_content)}</div>
          <div class="s-actions">
            ${item.source_url ? `<a href="${escUrl(item.source_url)}" target="_blank" rel="noopener" class="s-link">查看原文</a>` : ''}
            <button class="s-collapse">收起</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderStoryCard(item, sectionKey, index, color) {
  const cid = `${sectionKey}-${index}`;
  const isExpanded = state.expandedCard === cid;
  const readMin = Math.max(1, Math.round(((item.full_content || '') + (item.summary || '')).length / 600));
  const tags = (item.tags || []).slice(0, 2).map(t => `<span class="s-tag">${escHtml(t)}</span>`).join('');
  const starsBadge = item.stars ? `<span class="sc-stars">${item.stars.toLocaleString()}</span>` : '';

  return `
    <div class="story-card${isExpanded ? ' expanded' : ''}" data-card-id="${cid}" style="--c:${color}">
      <div class="sc-accent"></div>
      <div class="sc-inner">
        <div class="sc-kicker"><span class="sc-src-badge">${escHtml(item.source)}</span>${starsBadge}</div>
        <h3 class="sc-title">${escHtml(item.title)}</h3>
        <p class="sc-dek">${escHtml(item.summary)}</p>
        <div class="sc-tags">${tags}</div>
        <div class="sc-meta">${escHtml(item.date || '')} · ${readMin} min</div>
      </div>
      <div class="sc-detail">
        <div class="s-content">${formatContent(item.full_content)}</div>
        <div class="s-actions">
          ${item.source_url ? `<a href="${escUrl(item.source_url)}" target="_blank" rel="noopener" class="s-link">查看原文</a>` : ''}
          <button class="s-collapse">收起</button>
        </div>
      </div>
    </div>
  `;
}

function renderListCard(item, sectionKey, index, color) {
  const cid = `${sectionKey}-${index}`;
  const isExpanded = state.expandedCard === cid;
  const starsBadge = item.stars ? `<span class="sr-stars">${item.stars.toLocaleString()}</span>` : '';

  return `
    <div class="story-row${isExpanded ? ' expanded' : ''}" data-card-id="${cid}" style="--c:${color}">
      <div class="sr-inner">
        <div class="sr-dot" style="background:${color}"></div>
        <div class="sr-text">
          <div class="sr-title">${escHtml(item.title)}</div>
          <div class="sr-sub">
            <span class="sr-sub-src">${escHtml(item.source)}</span>
            ${starsBadge}
            <span>${escHtml(item.date || '')}</span>
          </div>
        </div>
      </div>
      <div class="sr-detail">
        <div class="s-content">${formatContent(item.full_content)}</div>
        <div class="s-actions">
          ${item.source_url ? `<a href="${escUrl(item.source_url)}" target="_blank" rel="noopener" class="s-link">查看原文</a>` : ''}
          <button class="s-collapse">收起</button>
        </div>
      </div>
    </div>
  `;
}

function renderCard(item, sectionKey, index) {
  const itemId = `${sectionKey}-${index}`;
  const isExpanded = state.expandedCard === itemId;
  const isHero = index === 0;

  const accentColor = { news: '#2563eb', projects: '#059669', academic: '#7c3aed' }[sectionKey] || '#4f6ef7';

  const textLen = (item.full_content || '').length + (item.summary || '').length;
  const readMin = Math.max(1, Math.round(textLen / 500));

  return `
    <div class="feed-item${isExpanded ? ' expanded' : ''}${isHero ? ' feed-hero' : ''}" data-card-id="${itemId}" style="--accent: ${accentColor}">
      <div class="feed-strip" style="background:${accentColor}"></div>
      <div class="feed-main">
        <div class="fi-top">
          <span class="fi-src" style="color:${accentColor}">${escHtml(item.source)}</span>
          ${item.date ? `<span class="fi-date">${escHtml(item.date)}</span>` : ''}
          <span class="fi-read">${readMin} min read</span>
        </div>
        <h2 class="fi-title">${escHtml(item.title)}</h2>
        <p class="fi-summary">${escHtml(item.summary)}</p>
        ${item.tags && item.tags.length ? `<div class="fi-tags">${item.tags.slice(0, 3).map(t => `<span class="fi-tag">${escHtml(t)}</span>`).join('')}</div>` : ''}
        ${!isExpanded ? '<div class="fi-expand">展开全文</div>' : ''}
        <div class="fi-detail">
          <div class="fi-content">${formatContent(item.full_content)}</div>
          <div class="fi-actions">
            ${item.source_url ? `<a href="${escUrl(item.source_url)}" target="_blank" rel="noopener" class="fi-link">查看原文</a>` : ''}
            <button class="fi-collapse">收起</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function toggleCard(item) {
  const itemId = item.dataset.cardId;
  const wasExpanded = item.classList.contains('expanded');

  // 收起所有展开项
  $$('.story-hero.expanded, .story-card.expanded, .story-row.expanded').forEach(i => i.classList.remove('expanded'));

  if (!wasExpanded) {
    item.classList.add('expanded');
    state.expandedCard = itemId;
    setTimeout(() => item.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  } else {
    state.expandedCard = null;
  }
}

function collapseCard(item) {
  item.classList.remove('expanded');
  state.expandedCard = null;
}

function toggleToolRow(row) {
  const cardId = row.dataset.cardId;
  const wasExpanded = row.classList.contains('expanded');

  $$('.tool-row.expanded').forEach(r => r.classList.remove('expanded'));

  if (!wasExpanded) {
    row.classList.add('expanded');
    state.expandedCard = cardId;
    setTimeout(() => row.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  } else {
    state.expandedCard = null;
  }
}

function collapseToolRow(row) {
  row.classList.remove('expanded');
  state.expandedCard = null;
}

// ========== 内容格式化 ==========
function formatContent(text) {
  if (!text) return '';
  // 简单 markdown 转换
  let html = escHtml(text);
  // 标题
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  // 加粗
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // 列表项
  html = html.replace(/^- (.+)$/gm, '• $1');
  html = html.replace(/^(\d+)\. (.+)$/gm, '$1. $2');
  // 换行
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');
  return '<p>' + html + '</p>';
}

function escHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// URL 属性专用转义 — 只转义引号，不破坏 & 等 URL 合法字符
function escUrl(str) {
  if (!str) return '';
  return String(str).replace(/"/g, '&quot;');
}

// ========== AI工具页 ==========
async function loadTools() {
  if (state.toolsData) {
    renderToolsPage();
    return;
  }
  // 首次加载显示内联状态，不弹全屏遮罩
  mainContent.innerHTML = '<div class="empty-state"><p>加载中...</p></div>';
  try {
    const resp = await fetch('data/tools.json');
    if (!resp.ok) throw new Error('加载失败');
    state.toolsData = await resp.json();
    renderToolsPage();
  } catch (err) {
    console.error('加载工具数据失败:', err);
    mainContent.innerHTML = `
      <div class="empty-state">
        <p>工具数据加载失败</p>
      </div>
    `;
  }
}

function renderToolsPage() {
  const data = state.toolsData;
  if (!data || !data.categories) return;

  const categoryKeys = ['coding', 'productivity', 'benchmarks', 'models'];
  const labels = { coding: 'Coding', productivity: '生产力', benchmarks: '基准', models: '模型' };

  let html = '<div class="sub-tabs">';
  categoryKeys.forEach(key => {
    html += `
      <button class="sub-tab${state.currentToolSubTab === key ? ' active' : ''}" data-subtab="${key}">
        ${labels[key]}
      </button>
    `;
  });
  html += '</div>';

  if (state.currentToolSubTab === 'models') {
    if (!state.modelsData) {
      html += '<div class="empty-state"><p>加载中...</p></div>';
      mainContent.innerHTML = html;
      loadModelsData().then(() => renderToolsPage());
      return;
    }
    html += renderModelsInTools();
    mainContent.innerHTML = html;
    bindToolSubTabs();
    bindModelSubTabs();
    return;
  }

  const category = data.categories[state.currentToolSubTab];
  if (category && category.items && category.items.length > 0) {
    html += '<div class="tool-list">';
    const sorted = [...category.items].sort((a, b) => b.rating - a.rating);
    sorted.forEach((item, index) => {
      html += renderToolRow(item, index);
    });
    html += '</div>';
  } else {
    html += '<div class="empty-state"><p>暂无数据</p></div>';
  }

  mainContent.innerHTML = html;
  bindToolSubTabs();
  bindToolCards();
}

function bindToolSubTabs() {
  $$('.sub-tab:not(.models-subtab)').forEach(btn => {
    btn.addEventListener('click', () => {
      state.currentToolSubTab = btn.dataset.subtab;
      state.expandedCard = null;
      renderToolsPage();
      mainContent.scrollTop = 0;
    });
  });
}

function bindModelSubTabs() {
  $$('.models-subtab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.currentModelSubTab = btn.dataset.subtab;
      renderToolsPage();
      mainContent.scrollTop = 0;
    });
  });
}

function bindToolCards() {
  $$('.tool-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.btn-link')) return;
      if (e.target.closest('.btn-collapse')) {
        collapseToolRow(row);
        return;
      }
      toggleToolRow(row);
    });
  });
}

function renderModelsInTools() {
  const data = state.modelsData;
  if (!data || !data.models || !data.rankings) return '';
  const rankingKeys = ['overall', 'coding', 'reasoning', 'chinese'];
  let html = '<div class="sub-tabs sub-tabs-second">';
  rankingKeys.forEach(key => {
    const r = data.rankings[key];
    html += `<button class="sub-tab models-subtab${state.currentModelSubTab === key ? ' active' : ''}" data-subtab="${key}">${r.title}</button>`;
  });
  html += '</div>';
  const sorted = [...data.models].sort((a, b) => b.scores[state.currentModelSubTab] - a.scores[state.currentModelSubTab]);
  html += '<div class="model-leaderboard">';
  sorted.forEach((model, index) => {
    html += renderModelRow(model, index + 1, model.scores[state.currentModelSubTab]);
  });
  html += '</div>';
  return html;
}

async function loadModelsData() {
  try {
    const resp = await fetch('data/models.json');
    if (resp.ok) state.modelsData = await resp.json();
  } catch (e) { console.error('模型数据加载失败:', e); }
}

function renderToolRow(item, index) {
  const rank = index + 1;
  const rankClass = rank <= 3 ? ` r${rank}` : '';
  const cardId = `tool-${state.currentToolSubTab}-${index}`;
  const isExpanded = state.expandedCard === cardId;

  // 价格精简：取第一部分
  const priceShort = item.pricing ? item.pricing.split(' / ')[0] : '';

  return `
    <div class="tool-row${isExpanded ? ' expanded' : ''}" data-card-id="${cardId}">
      <div class="tool-rank${rankClass}">${rank}</div>
      <div class="tool-row-main">
        <div class="tool-row-name">${escHtml(item.name)}</div>
        <div class="tool-row-summary">${escHtml(item.summary)}</div>
      </div>
      <div class="tool-row-tail">
        <span class="tool-row-pricing">${escHtml(priceShort)}</span>
        <span class="tool-row-arrow">›</span>
      </div>
      <div class="tool-row-body">
        <div class="tool-row-detail">
          <div class="card-body-content">${formatContent(item.full_content)}</div>
          <div class="tool-row-fields">
            ${item.best_for ? `<div class="tool-row-field"><strong>最适合</strong><br>${escHtml(item.best_for)}</div>` : ''}
            ${item.limitations ? `<div class="tool-row-field"><strong>局限性</strong><br>${escHtml(item.limitations)}</div>` : ''}
          </div>
          <div class="card-actions">
            ${item.url ? `<a href="${escUrl(item.url)}" target="_blank" rel="noopener" class="btn-link">访问官网</a>` : ''}
            <button class="btn-collapse">收起</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ========== AI模型页 ==========
async function loadModels() {
  if (state.modelsData) {
    renderModelsPage();
    return;
  }
  showLoading(true);
  try {
    const resp = await fetch('data/models.json');
    if (!resp.ok) throw new Error('加载失败');
    state.modelsData = await resp.json();
    renderModelsPage();
  } catch (err) {
    console.error('加载模型数据失败:', err);
    mainContent.innerHTML = `
      <div class="empty-state">
        <p>模型数据加载失败</p>
      </div>
    `;
  } finally {
    showLoading(false);
  }
}

function renderModelsPage() {
  const data = state.modelsData;
  if (!data || !data.models || !data.rankings) return;

  const rankingKeys = ['overall', 'coding', 'reasoning', 'chinese'];
  const ranking = data.rankings[state.currentModelSubTab];

  let html = '<div class="sub-tabs">';
  rankingKeys.forEach(key => {
    const r = data.rankings[key];
    html += `
      <button class="sub-tab${state.currentModelSubTab === key ? ' active' : ''}" data-subtab="${key}">
        ${r.title}
      </button>
    `;
  });
  html += '</div>';

  const sorted = [...data.models].sort((a, b) =>
    b.scores[state.currentModelSubTab] - a.scores[state.currentModelSubTab]
  );

  html += '<div class="model-leaderboard">';

  sorted.forEach((model, index) => {
    const rank = index + 1;
    const score = model.scores[state.currentModelSubTab];
    html += renderModelRow(model, rank, score);
  });

  html += '</div>';

  mainContent.innerHTML = html;

  // 子tab切换
  $$('.sub-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.currentModelSubTab = btn.dataset.subtab;
      state.expandedCard = null;
      renderModelsPage();
      mainContent.scrollTop = 0;
    });
  });

  // 行点击展开
  $$('.model-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.btn-link')) return;
      if (e.target.closest('.btn-collapse')) {
        collapseModelRow(row);
        return;
      }
      toggleModelRow(row);
    });
  });
}

function renderModelRow(model, rank, score) {
  const cardId = `model-${model.id}`;
  const isExpanded = state.expandedCard === cardId;

  let rankClass = '';
  if (rank <= 3) rankClass = `rank-${rank}`;

  const trendMap = { up: '↑', down: '↓', stable: '→' };
  const trendIcon = trendMap[model.trend] || '';

  return `
    <div class="model-row${isExpanded ? ' expanded' : ''}" data-card-id="${cardId}">
      <div class="model-row-header">
        <div class="model-rank ${rankClass}">${rank}</div>
        <div class="model-main">
          <div class="model-name-line">
            <span class="model-name">${escHtml(model.name)}</span>
            <span class="model-trend">${trendIcon}</span>
          </div>
          <div class="model-meta-line">
            <span class="model-developer">${escHtml(model.developer)}</span>
            ${model.type ? `<span class="model-type">${escHtml(model.type)}</span>` : ''}
            ${model.release ? `<span class="model-release">${escHtml(model.release)}</span>` : ''}
          </div>
        </div>
        <div class="model-score-col">
          <span class="model-score">${score.toFixed(1)}</span>
          <span class="model-score-label">分</span>
        </div>
        <div class="model-expand-arrow">›</div>
      </div>
      <div class="model-row-body">
        <div class="model-summary-text">${escHtml(model.summary)}</div>
        <div class="card-body-content">${formatContent(model.full_content)}</div>
        <div class="model-scores-grid">
          <div class="model-mini-score">
            <span class="mini-label">总榜</span>
            <span class="mini-val">${model.scores.overall.toFixed(1)}</span>
          </div>
          <div class="model-mini-score">
            <span class="mini-label">编程</span>
            <span class="mini-val">${model.scores.coding.toFixed(1)}</span>
          </div>
          <div class="model-mini-score">
            <span class="mini-label">推理</span>
            <span class="mini-val">${model.scores.reasoning.toFixed(1)}</span>
          </div>
          <div class="model-mini-score">
            <span class="mini-label">中文</span>
            <span class="mini-val">${model.scores.chinese.toFixed(1)}</span>
          </div>
        </div>
        <div class="card-actions">
          ${model.pricing ? `<span class="model-pricing-tag">${escHtml(model.pricing)}</span>` : ''}
          ${model.url ? `<a href="${escUrl(model.url)}" target="_blank" rel="noopener" class="btn-link">官网</a>` : ''}
          <button class="btn-collapse">收起</button>
        </div>
      </div>
    </div>
  `;
}

function toggleModelRow(row) {
  const cardId = row.dataset.cardId;
  const wasExpanded = row.classList.contains('expanded');

  $$('.model-row.expanded').forEach(r => r.classList.remove('expanded'));

  if (!wasExpanded) {
    row.classList.add('expanded');
    state.expandedCard = cardId;
    setTimeout(() => {
      row.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  } else {
    state.expandedCard = null;
  }
}

function collapseModelRow(row) {
  row.classList.remove('expanded');
  state.expandedCard = null;
}

// ========== 占位页 ==========
function renderPlaceholder(tab) {
  const config = {
    tools: {
      title: 'AI工具评测',
      desc: '主流AI Coding工具横评、效率工具推荐、插件对比...',
    },
    models: {
      title: 'AI模型对比',
      desc: '大模型能力矩阵、场景推荐、最新版本动态...',
    },
    circle: {
      title: 'AI圈',
      desc: 'AI知识分享社区，发布图文动态，一起交流AI...',
    },
  };

  const c = config[tab] || config.tools;
  mainContent.innerHTML = `
    <div class="placeholder-page">
      <div class="placeholder-title">${c.title}</div>
      <div class="placeholder-desc">${c.desc}</div>
      <p style="font-size:12px;color:#9ca3af;margin-top:16px;">功能开发中，敬请期待</p>
    </div>
  `;
}

// ========== AI圈 ==========
function avatarColor(name) {
  const colors = ['#3B82F6','#EF4444','#10B981','#F59E0B','#8B5CF6','#EC4899','#06B6D4','#F97316'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

async function loadCircle() {
  // 首次加载（无缓存）显示内联加载状态，不弹全屏 loading
  if (!state.circlePosts.length) {
    mainContent.innerHTML = '<div class="empty-state"><p>加载中...</p></div>';
  }
  try {
    const type = state.currentCircleTab;
    const resp = await fetch(`/api/circle/posts?type=${type}`);
    if (!resp.ok) throw new Error('加载失败');
    const data = await resp.json();
    state.circlePosts = data.posts || [];
    if (state.currentTab === 'circle') renderCirclePage();
  } catch (err) {
    console.error('加载AI圈失败:', err);
    if (state.currentTab === 'circle') {
      mainContent.innerHTML = `<div class="empty-state"><p>加载失败，请检查服务器</p></div>`;
    }
  }
}

function renderCirclePage() {
  const posts = state.circlePosts || [];
  const isExpert = state.currentCircleTab === 'expert';
  const userLevel = getLevel(getTotalSeconds());

  let html = '';

  // 子标签：达人圈 / 自由说
  html += '<div class="sub-tabs">';
  html += `<button class="sub-tab${isExpert ? ' active' : ''}" data-circletab="expert">达人圈</button>`;
  html += `<button class="sub-tab${!isExpert ? ' active' : ''}" data-circletab="free">自由说</button>`;
  html += '</div>';

  if (posts.length === 0) {
    const emptyText = isExpert ? '达人圈暂无动态' : '还没有动态';
    const emptyHint = isExpert
      ? (userLevel >= 10 ? '点击右上角相机按钮发表见解' : '等级10以上才能在达人圈发布，快去学习升级吧')
      : '点击右上角相机按钮发布第一条';
    html += `
      <div class="moments-empty">
        <div class="moments-empty-text">${emptyText}</div>
        <div class="moments-empty-hint">${emptyHint}</div>
      </div>
    `;
  } else {
    html += '<div class="moments-feed">';
    html += posts.map(p => renderPostCard(p)).join('');
    html += '</div>';
  }

  mainContent.innerHTML = html;

  // 子tab切换
  $$('[data-circletab]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.currentCircleTab === btn.dataset.circletab) return;
      state.currentCircleTab = btn.dataset.circletab;
      updateComposerAccess();
      loadCircle();
    });
  });

  // 达人圈等级不足时禁用相机
  updateComposerAccess();

  // 评论切换
  $$('.moments-action-comment').forEach(btn => {
    btn.addEventListener('click', () => toggleComments(btn));
  });

  // 评论提交
  $$('.moments-comment-submit').forEach(btn => {
    btn.addEventListener('click', () => {
      const postId = btn.dataset.postId;
      const input = $(`.moments-comment-input[data-post-id="${postId}"]`);
      if (input && input.value.trim()) {
        submitComment(postId, input.value.trim());
        input.value = '';
      }
    });
  });

  // 删除帖子
  $$('.moments-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const postId = btn.dataset.postId;
      if (confirm('确定删除这条动态吗？')) {
        deletePost(postId);
      }
    });
  });

  // 图片点击 → 全屏查看器
  $$('.wx-cell img, .wx-single-wrap img').forEach(img => {
    img.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(img.dataset.imgIdx || '0');
      const parent = img.closest('[data-post-id]');
      const postId = parent ? parent.dataset.postId : null;
      const images = (postId && state.imageCache[postId]) ? state.imageCache[postId] : [img.src];
      openViewer(images, idx);
    });
  });

  // 点赞按钮
  $$('.moments-like-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleLike(btn.dataset.postId);
    });
  });

  // 收藏按钮
  $$('.moments-fav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const liked = toggleFavorite(btn.dataset.postId);
      btn.textContent = liked ? '已收藏' : '收藏';
    });
  });
}

function renderPostCard(post) {
  const name = post.author || '匿名';
  const bg = avatarColor(name);
  const time = formatTime(post.created_at);
  const commentCount = (post.comments || []).length;

  // 头像
  let avatarHtml = '';
  if (post.avatar) {
    avatarHtml = `<img src="${escUrl(post.avatar)}" class="moments-avatar-img" alt="">`;
  } else {
    avatarHtml = `<span class="moments-avatar-text">${name.charAt(0)}</span>`;
  }
  const avatarBg = post.avatar ? 'transparent' : bg;

  // 图片 — 微信朋友圈布局
  const imgs = post.images || [];
  state.imageCache[post.id] = imgs;
  let imagesHtml = '';
  if (imgs.length === 1) {
    imagesHtml = `<div class="wx-images"><div class="wx-single-wrap" data-post-id="${post.id}"><img src="${escUrl(imgs[0])}" alt="" data-img-idx="0" loading="lazy"></div></div>`;
  } else if (imgs.length === 2) {
    imagesHtml = `<div class="wx-images"><div class="wx-grid-2" data-post-id="${post.id}">${imgs.map((i, idx) => `<div class="wx-cell"><img src="${escUrl(i)}" alt="" data-img-idx="${idx}" loading="lazy"></div>`).join('')}</div></div>`;
  } else if (imgs.length === 3) {
    imagesHtml = `<div class="wx-images"><div class="wx-grid-multi" data-post-id="${post.id}">${imgs.map((i, idx) => `<div class="wx-cell"><img src="${escUrl(i)}" alt="" data-img-idx="${idx}" loading="lazy"></div>`).join('')}</div></div>`;
  } else if (imgs.length === 4) {
    imagesHtml = `<div class="wx-images"><div class="wx-grid-4" data-post-id="${post.id}">${imgs.map((i, idx) => `<div class="wx-cell"><img src="${escUrl(i)}" alt="" data-img-idx="${idx}" loading="lazy"></div>`).join('')}</div></div>`;
  } else if (imgs.length > 4) {
    imagesHtml = `<div class="wx-images"><div class="wx-grid-multi" data-post-id="${post.id}">${imgs.map((i, idx) => `<div class="wx-cell"><img src="${escUrl(i)}" alt="" data-img-idx="${idx}" loading="lazy"></div>`).join('')}</div></div>`;
  }

  // 点赞
  const likes = post.likes || [];
  const likedByMe = likes.includes(getProfile().nickname || '');
  const likeCount = likes.length;

  // 评论 + 点赞合并展示区 — 微信风：灰底
  let socialHtml = '';
  if (likeCount > 0 || (post.comments && post.comments.length > 0)) {
    socialHtml = '<div class="moments-social">';
    if (likeCount > 0) {
      socialHtml += `<div class="moments-likes">${likes.map(n => escHtml(n)).join(', ')}</div>`;
    }
    if (post.comments && post.comments.length > 0) {
      socialHtml += post.comments.map(c => `
        <div class="moments-comment-item">
          <span class="moments-comment-name">${escHtml(c.author)}</span>: <span class="moments-comment-text">${escHtml(c.content)}</span>
        </div>
      `).join('');
    }
    socialHtml += '</div>';
  }

  return `
    <div class="moments-post" data-post-id="${post.id}">
      <div class="moments-post-avatar" style="background:${avatarBg}">${avatarHtml}</div>
      <div class="moments-post-body">
        <div class="moments-post-name">${escHtml(name)}${post.level ? `<span class="moments-level">Lv.${post.level}</span>` : ''}</div>
        <div class="moments-post-content">${escHtml(post.content)}</div>
        ${imagesHtml}
        <div class="moments-post-foot">
          <span class="moments-post-time">${time}</span>
          <span class="moments-post-actions">
            <button class="moments-like-btn${likedByMe ? ' liked' : ''}" data-post-id="${post.id}">${likedByMe ? '已赞' : '赞'}${likeCount > 0 ? ' ' + likeCount : ''}</button>
            <button class="moments-action-comment" data-post-id="${post.id}">评论</button>
            <button class="moments-fav-btn" data-post-id="${post.id}">${getFavorites().includes(post.id) ? '已收藏' : '收藏'}</button>
            ${isPostAuthor(post) ? `<button class="moments-delete" data-post-id="${post.id}">删除</button>` : ''}
          </span>
        </div>
        ${socialHtml}
        <div class="moments-comment-box" id="comments-${post.id}">
          <div class="moments-comment-input-row">
            <input type="text" class="moments-comment-input" data-post-id="${post.id}" placeholder="评论...">
            <button class="moments-comment-submit" data-post-id="${post.id}">发送</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function toggleComments(btn) {
  const postId = btn.dataset.postId;
  const box = $('#comments-' + postId);
  if (box) {
    const isOpen = box.classList.contains('open');
    // 关闭所有
    $$('.moments-comment-box.open').forEach(b => b.classList.remove('open'));
    if (!isOpen) box.classList.add('open');
  }
}

async function submitComment(postId, content) {
  const p = getProfile();
  const author = p.nickname || 'AI学习者';
  try {
    const resp = await fetch(`/api/circle/posts/${postId}/comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author, content })
    });
    if (!resp.ok) { const e = await resp.json(); alert(e.error); return; }
    loadCircle();
  } catch (err) {
    alert('评论失败: ' + err.message);
  }
}

function isPostAuthor(post) {
  const p = getProfile();
  return (p.nickname || '').trim() === (post.author || '').trim();
}

async function deletePost(postId) {
  const p = getProfile();
  try {
    const resp = await fetch(`/api/circle/posts/${postId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author: p.nickname || '' })
    });
    if (!resp.ok) { const e = await resp.json(); alert(e.error); return; }
    loadCircle();
  } catch (err) {
    alert('删除失败: ' + err.message);
  }
}

async function toggleLike(postId) {
  const p = getProfile();
  const nickname = p.nickname || 'AI学习者';
  try {
    const resp = await fetch(`/api/circle/posts/${postId}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname })
    });
    if (!resp.ok) { const e = await resp.json(); alert(e.error); return; }
    loadCircle();
  } catch (err) {
    alert('操作失败: ' + err.message);
  }
}

// ===== 全屏图片查看器 — 微信朋友圈风格 =====
let viewerImages = [];
let viewerIndex = 0;
let viewerTouchStart = 0;

function ensureViewer() {
  if ($('#imgViewer')) return;
  const html = `
    <div class="img-viewer" id="imgViewer">
      <div class="img-viewer-header">
        <button class="img-viewer-close" id="imgViewerClose">×</button>
        <span class="img-viewer-counter" id="imgViewerCounter"></span>
      </div>
      <div class="img-viewer-stage" id="imgViewerStage"></div>
      <button class="img-viewer-prev" id="imgViewerPrev">‹</button>
      <button class="img-viewer-next" id="imgViewerNext">›</button>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
  $('#imgViewerClose').addEventListener('click', closeViewer);
  $('#imgViewer').addEventListener('click', (e) => {
    if (e.target === $('#imgViewer') || e.target === $('#imgViewerStage')) closeViewer();
  });
  $('#imgViewerPrev').addEventListener('click', (e) => { e.stopPropagation(); viewerNav(-1); });
  $('#imgViewerNext').addEventListener('click', (e) => { e.stopPropagation(); viewerNav(1); });
  // 触摸滑动
  const stage = $('#imgViewerStage');
  stage.addEventListener('touchstart', (e) => { viewerTouchStart = e.touches[0].clientX; });
  stage.addEventListener('touchend', (e) => {
    const diff = viewerTouchStart - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) viewerNav(diff > 0 ? 1 : -1);
  });
}

function openViewer(images, index) {
  ensureViewer();
  viewerImages = images;
  viewerIndex = index;
  showViewerImage();
  $('#imgViewer').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeViewer() {
  $('#imgViewer').classList.remove('open');
  document.body.style.overflow = '';
}

function viewerNav(dir) {
  const n = viewerIndex + dir;
  if (n < 0 || n >= viewerImages.length) return;
  viewerIndex = n;
  showViewerImage();
}

function showViewerImage() {
  const total = viewerImages.length;
  $('#imgViewerCounter').textContent = total > 1 ? `${viewerIndex + 1}/${total}` : '';
  $('#imgViewerPrev').style.visibility = viewerIndex > 0 ? 'visible' : 'hidden';
  $('#imgViewerNext').style.visibility = viewerIndex < total - 1 ? 'visible' : 'hidden';
  $('#imgViewerStage').innerHTML = `<img src="${escUrl(viewerImages[viewerIndex])}" alt="">`;
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  if (diff < 172800000) return '昨天';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatAbsoluteTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth()+1}月${d.getDate()}日 ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// ===== Composer =====
let composerImages = [];

function ensureComposer() {
  if ($('#composerOverlay')) return;
  const html = `
    <div class="composer-overlay" id="composerOverlay">
      <div class="composer-sheet" id="composerSheet">
        <div class="composer-header">
          <button class="composer-close" id="composerClose">取消</button>
          <span class="composer-title" id="composerTitle">发表文字</span>
          <button class="composer-submit" id="composerSubmit">发表</button>
        </div>
        <input type="hidden" id="composerName">
        <div class="composer-field">
          <textarea id="composerContent" placeholder="请勿发表与AI无关的话题！"></textarea>
        </div>
        <div class="composer-images" id="composerImages"></div>
        <input type="file" id="composerFileInput" accept="image/*" multiple style="display:none">
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);

  $('#composerClose').addEventListener('click', closeComposer);
  $('#composerOverlay').addEventListener('click', (e) => {
    if (e.target === $('#composerOverlay')) closeComposer();
  });
  $('#composerSubmit').addEventListener('click', submitPost);
  $('#composerFileInput').addEventListener('change', handleImageSelect);
}

function updateComposerAccess() {
  const camBtn = $('#appCameraBtn');
  if (!camBtn) return;
  const isExpert = state.currentCircleTab === 'expert';
  const userLevel = getLevel(getTotalSeconds());
  if (isExpert && userLevel < 10) {
    camBtn.style.opacity = '0.35';
    camBtn.title = '等级10以上才能在达人圈发布';
  } else {
    camBtn.style.opacity = '';
    camBtn.title = '';
  }
}

function openComposer() {
  const isExpert = state.currentCircleTab === 'expert';
  const userLevel = getLevel(getTotalSeconds());
  if (isExpert && userLevel < 10) {
    alert('等级10以上才能在达人圈发布！\n当前等级：Lv.' + userLevel + '，还差 ' + (10 - userLevel) + ' 级');
    return;
  }
  ensureComposer();
  composerImages = [];
  const p = getProfile();
  $('#composerName').value = p.nickname || 'AI学习者';
  $('#composerContent').value = '';
  $('#composerTitle').textContent = isExpert ? '达人圈发布' : '发表文字';
  $('#composerContent').placeholder = isExpert ? '达人圈发言，请确保内容有深度' : '请勿发表与AI无关的话题！';
  renderComposerImages();
  $('#composerOverlay').classList.add('open');
  setTimeout(() => $('#composerContent').focus(), 350);
}

function closeComposer() {
  $('#composerOverlay').classList.remove('open');
}

function handleImageSelect(e) {
  const files = Array.from(e.target.files || []);
  files.forEach(file => {
    if (composerImages.length >= 9) return;
    resizeImage(file, 1200).then(dataUrl => {
      composerImages.push(dataUrl);
      renderComposerImages();
    });
  });
  e.target.value = '';
}

function resizeImage(file, maxSize) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w <= maxSize && h <= maxSize) {
          resolve(ev.target.result);
          return;
        }
        if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
        else       { w = Math.round(w * maxSize / h); h = maxSize; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function removeComposerImage(index) {
  composerImages.splice(index, 1);
  renderComposerImages();
}

function renderComposerImages() {
  const container = $('#composerImages');
  if (!container) return;
  let html = composerImages.map((img, i) => `
    <div class="composer-img-item">
      <img src="${img}" alt="">
      <button class="composer-img-remove" data-img-index="${i}">×</button>
    </div>
  `).join('');
  if (composerImages.length < 9) {
    html += '<button class="composer-add-img" id="composerAddImg">+</button>';
  }
  container.innerHTML = html;

  const addBtn = $('#composerAddImg');
  if (addBtn) addBtn.addEventListener('click', () => $('#composerFileInput').click());

  $$('.composer-img-remove').forEach(btn => {
    btn.addEventListener('click', () => removeComposerImage(parseInt(btn.dataset.imgIndex)));
  });
}

async function submitPost() {
  const p = getProfile();
  const author = p.nickname || 'AI学习者';
  const avatar = p.avatar || '';
  const level = getLevel(getTotalSeconds());
  const content = $('#composerContent').value.trim();
  const type = state.currentCircleTab; // 'expert' | 'free'
  if (!content) { alert('请输入内容'); return; }

  // 达人圈二次校验
  if (type === 'expert' && level < 10) {
    alert('等级10以上才能在达人圈发布！');
    return;
  }

  // 乐观更新：立即关闭弹窗并显示
  const optPost = {
    id: 'opt-' + Date.now(),
    type, author, avatar, level, content,
    images: composerImages.map(b64 => b64),
    created_at: new Date().toISOString(),
    likes: [],
    comments: []
  };
  state.circlePosts.unshift(optPost);
  closeComposer();
  renderCirclePage();

  try {
    const resp = await fetch('/api/circle/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, author, avatar, level, content, images: composerImages })
    });
    if (!resp.ok) { const e = await resp.json(); alert(e.error); }
    loadCircle(); // 用服务器数据刷新
  } catch (err) {
    alert('发布失败: ' + err.message);
    loadCircle();
  }
}

// ========== 我的 (Profile) ==========
const PROFILE_KEY = 'profile-data';
const USER_ID_KEY = 'ai-user-id';

function getUserId() {
  let uid = localStorage.getItem(USER_ID_KEY);
  if (!uid) {
    uid = 'user_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    localStorage.setItem(USER_ID_KEY, uid);
  }
  return uid;
}

function sendVisitorPing() {
  try {
    const ua = navigator.userAgent.toLowerCase();
    const platform = ua.includes('iphone') || ua.includes('ipad') ? 'iOS'
      : ua.includes('android') ? 'Android'
      : ua.includes('windows') ? 'Windows'
      : ua.includes('mac') ? 'Mac' : 'Other';
    fetch('/api/visitor/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: getUserId(),
        city: '',
        platform: platform,
        screen: (window.screen ? window.screen.width + 'x' + window.screen.height : '?')
      })
    }).catch(function() {});
  } catch(e) {}
}

function getProfile() {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY)) || {};
  } catch (_) { return {}; }
}
function saveProfile(data) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(data));
}

function initProfileDefaults() {
  const p = getProfile();
  if (!p.nickname) p.nickname = 'AI学习者';
  if (!p.avatar) p.avatar = '';
  if (!p.daily) p.daily = {};
  if (!p.sessionStart) p.sessionStart = 0;
  saveProfile(p);
  return p;
}

// 每秒更新学习时长
let profileTickInterval = null;
function startProfileTick() {
  if (profileTickInterval) return;
  initProfileDefaults();
  const p = getProfile();
  p.sessionStart = Date.now();
  saveProfile(p);
  profileTickInterval = setInterval(() => {
    const now = Date.now();
    const p = getProfile();
    if (!p.sessionStart) { p.sessionStart = now; saveProfile(p); return; }
    const elapsed = Math.floor((now - p.sessionStart) / 1000);
    p.sessionStart = now;
    const today = new Date().toISOString().substring(0, 10);
    p.daily[today] = (p.daily[today] || 0) + elapsed;
    saveProfile(p);
  }, 10000); // 每10秒存一次
}

function stopProfileTick() {
  if (profileTickInterval) { clearInterval(profileTickInterval); profileTickInterval = null; }
}

function getTodaySeconds() {
  const p = getProfile();
  const today = new Date().toISOString().substring(0, 10);
  return p.daily?.[today] || 0;
}

function getWeekSeconds() {
  const p = getProfile();
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().substring(0, 10);
    total += (p.daily?.[key] || 0);
  }
  return total;
}

function getTotalSeconds() {
  const p = getProfile();
  return Object.values(p.daily || {}).reduce((a, b) => a + b, 0);
}

function getWeekData() {
  const p = getProfile();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().substring(0, 10);
    const label = (d.getMonth() + 1) + '/' + d.getDate();
    const seconds = p.daily?.[key] || 0;
    days.push({ label, seconds, hours: (seconds / 3600).toFixed(1) });
  }
  return days;
}

function formatDuration(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return h + '小时' + m + '分';
  return m + '分钟';
}

function getLevel(totalSec) {
  const totalHours = totalSec / 3600;
  const baseLevel = Math.floor(totalHours / 10) + 1;
  if (state.certification && state.certification.status === 'approved') {
    return Math.max(baseLevel, 10);
  }
  return baseLevel;
}
function getLevelProgress(totalSec) {
  const totalHours = totalSec / 3600;
  return ((totalHours % 10) / 10 * 100).toFixed(1);
}

// ===== 认证系统 =====
async function cacheCertification() {
  const p = getProfile();
  if (!p.nickname) return;
  try {
    const resp = await fetch(`/api/certification?author=${encodeURIComponent(p.nickname)}`);
    if (resp.ok) {
      const data = await resp.json();
      state.certification = data.certification;
    }
  } catch (_) {}
}

function getCertBadgeHtml() {
  const c = state.certification;
  if (!c) return '未认证';
  if (c.status === 'approved') {
    const label = c.type === 'worker' ? 'AI行业工作者' : 'AI博主';
    return `<span class="cert-badge cert-approved">${label} 已认证</span>`;
  }
  if (c.status === 'pending') return '<span class="cert-badge cert-pending">审核中</span>';
  if (c.status === 'rejected') return '<span class="cert-badge cert-rejected">未通过</span>';
  return '未认证';
}

function showCertification() {
  $('.app-header').style.display = 'none';
  let listHeader = $('#listHeader');
  if (!listHeader) {
    const h = document.createElement('div');
    h.id = 'listHeader';
    h.className = 'wx-navbar';
    h.innerHTML = `
      <button class="wx-navbar-back" id="wxListBack">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span class="wx-navbar-title" id="wxListTitle">我的认证</span>
    `;
    $('.app-header').after(h);
  } else {
    listHeader.style.display = '';
    $('#wxListTitle').textContent = '我的认证';
  }
  const backBtn = $('#wxListBack');
  if (backBtn) { backBtn.onclick = backToProfile; }

  const c = state.certification;
  let html = '<div class="wx-list-page">';

  if (c && c.status === 'approved') {
    // 已认证 — 展示认证详情
    const typeLabel = c.type === 'worker' ? 'AI行业工作者' : 'AI博主';
    html += `
      <div class="cert-result-card">
        <div class="cert-result-icon">
          <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="#10B981" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="8 12 11 15 16 9"/>
          </svg>
        </div>
        <div class="cert-result-title">认证已通过</div>
        <div class="cert-result-type">${typeLabel}</div>
        <div class="cert-result-info">
          ${c.type === 'worker' ? `
            <div class="cert-info-row"><span class="cert-info-label">真实姓名</span><span>${escHtml(c.realName)}</span></div>
            <div class="cert-info-row"><span class="cert-info-label">公司/机构</span><span>${escHtml(c.company)}</span></div>
            <div class="cert-info-row"><span class="cert-info-label">职位</span><span>${escHtml(c.position)}</span></div>
          ` : `
            <div class="cert-info-row"><span class="cert-info-label">平台</span><span>${escHtml(c.platform)}</span></div>
            <div class="cert-info-row"><span class="cert-info-label">账号</span><span>${escHtml(c.accountName)}</span></div>
            <div class="cert-info-row"><span class="cert-info-label">粉丝数</span><span>${(c.followerCount || 0).toLocaleString()}</span></div>
          `}
        </div>
        <div class="cert-result-note">账号已升至 Lv.10</div>
      </div>
    `;
  } else if (c && c.status === 'pending') {
    // 审核中
    html += `
      <div class="cert-result-card">
        <div class="cert-result-icon">
          <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="#F59E0B" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="13"/>
            <circle cx="12" cy="16" r="0.5" fill="#F59E0B"/>
          </svg>
        </div>
        <div class="cert-result-title">审核中</div>
        <div class="cert-result-desc">您的认证申请正在审核，请耐心等待</div>
        <div class="cert-result-type" style="color:#8e8e93;font-size:13px">${c.type === 'worker' ? 'AI行业工作者' : 'AI博主'} · ${formatTime(c.created_at)}</div>
      </div>
    `;
  } else if (c && c.status === 'rejected') {
    // 未通过 — 可重新申请
    html += `
      <div class="cert-result-card">
        <div class="cert-result-icon">
          <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="#EF4444" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        </div>
        <div class="cert-result-title">未通过审核</div>
        <div class="cert-result-desc">您可以重新提交认证申请</div>
      </div>
      <div class="weui-cells" style="margin-top:0">${renderCertForm()}</div>
    `;
  } else {
    // 未认证 — 展示表单
    html += renderCertForm();
  }

  html += '</div>';
  mainContent.innerHTML = html;

  // 绑定表单事件
  bindCertFormEvents();
}

function renderCertForm() {
  return `
    <div class="cert-form-intro">
      <div class="cert-form-intro-title">身份认证</div>
      <div class="cert-form-intro-desc">认证通过后账号直接升至 Lv.10，彰显专业身份</div>
    </div>
    <div class="cert-type-select" id="certTypeSelect">
      <div class="cert-type-card" data-type="worker">
        <div class="cert-type-icon">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="2" y="7" width="20" height="14" rx="2"/>
            <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
            <circle cx="12" cy="14" r="2"/>
          </svg>
        </div>
        <div class="cert-type-label">AI行业工作者</div>
        <div class="cert-type-hint">AI行业在职人员</div>
      </div>
      <div class="cert-type-card" data-type="blogger">
        <div class="cert-type-icon">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M18 6L6 18"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="18" r="2"/>
            <rect x="2" y="2" width="20" height="20" rx="4"/>
          </svg>
        </div>
        <div class="cert-type-label">AI博主</div>
        <div class="cert-type-hint">粉丝量10万以上</div>
      </div>
    </div>
    <div class="weui-cells" id="certFormFields" style="display:none"></div>
    <div class="cert-submit-wrap" id="certSubmitWrap" style="display:none">
      <button class="cert-submit-btn" id="certSubmitBtn">提交认证申请</button>
    </div>
  `;
}

function renderCertFields(type) {
  if (type === 'worker') {
    return `
      <div class="weui-cell">
        <div class="weui-cell-bd"><input type="text" class="cert-input" id="certRealName" placeholder="真实姓名" maxlength="30"></div>
      </div>
      <div class="weui-cell">
        <div class="weui-cell-bd"><input type="text" class="cert-input" id="certCompany" placeholder="公司/机构名称" maxlength="80"></div>
      </div>
      <div class="weui-cell">
        <div class="weui-cell-bd"><input type="text" class="cert-input" id="certPosition" placeholder="职位" maxlength="50"></div>
      </div>
      <div class="weui-cell">
        <div class="weui-cell-bd"><input type="email" class="cert-input" id="certEmail" placeholder="工作邮箱（选填）" maxlength="100"></div>
      </div>
      <div class="weui-cell">
        <div class="weui-cell-bd"><input type="text" class="cert-input" id="certNote" placeholder="补充说明（选填）" maxlength="200"></div>
      </div>
    `;
  }
  return `
    <div class="weui-cell">
      <div class="weui-cell-bd"><input type="text" class="cert-input" id="certPlatform" placeholder="平台名称，如：微博、B站、抖音" maxlength="50"></div>
    </div>
    <div class="weui-cell">
      <div class="weui-cell-bd"><input type="text" class="cert-input" id="certAccountName" placeholder="账号名称" maxlength="50"></div>
    </div>
    <div class="weui-cell">
      <div class="weui-cell-bd"><input type="number" class="cert-input" id="certFollowerCount" placeholder="粉丝数量（需达到100,000）"></div>
    </div>
    <div class="weui-cell">
      <div class="weui-cell-bd"><input type="url" class="cert-input" id="certAccountUrl" placeholder="账号链接（选填）" maxlength="200"></div>
    </div>
    <div class="weui-cell">
      <div class="weui-cell-bd"><input type="text" class="cert-input" id="certNote" placeholder="补充说明（选填）" maxlength="200"></div>
    </div>
  `;
}

let certSelectedType = '';
function bindCertFormEvents() {
  const typeCards = $$('.cert-type-card');
  const fieldsEl = $('#certFormFields');
  const submitWrap = $('#certSubmitWrap');

  typeCards.forEach(card => {
    card.addEventListener('click', () => {
      typeCards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      certSelectedType = card.dataset.type;
      if (fieldsEl) fieldsEl.innerHTML = renderCertFields(certSelectedType);
      if (fieldsEl) fieldsEl.style.display = '';
      if (submitWrap) submitWrap.style.display = '';
    });
  });

  const submitBtn = $('#certSubmitBtn');
  if (submitBtn) submitBtn.addEventListener('click', submitCertification);
}

async function submitCertification() {
  const p = getProfile();
  if (!certSelectedType) {
    showCertToast('请选择认证类型');
    return;
  }

  const btn = $('#certSubmitBtn');
  btn.disabled = true;
  btn.textContent = '提交中...';

  const body = { author: p.nickname, type: certSelectedType };

  if (certSelectedType === 'worker') {
    body.realName = ($('#certRealName')?.value || '').trim();
    body.company = ($('#certCompany')?.value || '').trim();
    body.position = ($('#certPosition')?.value || '').trim();
    body.email = ($('#certEmail')?.value || '').trim();
    body.note = ($('#certNote')?.value || '').trim();
  } else {
    body.platform = ($('#certPlatform')?.value || '').trim();
    body.accountName = ($('#certAccountName')?.value || '').trim();
    body.followerCount = ($('#certFollowerCount')?.value || '').trim();
    body.accountUrl = ($('#certAccountUrl')?.value || '').trim();
    body.note = ($('#certNote')?.value || '').trim();
  }

  try {
    const resp = await fetch('/api/certification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await resp.json();
    if (!resp.ok) {
      showCertToast(data.error || '提交失败');
      btn.disabled = false;
      btn.textContent = '提交认证申请';
      return;
    }
    state.certification = data.certification;
    showCertification();
    showCertToast('认证申请已提交');
  } catch (e) {
    showCertToast('提交失败: ' + e.message);
    btn.disabled = false;
    btn.textContent = '提交认证申请';
  }
}

function showCertToast(msg) {
  let toast = $('#certToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'certToast';
    toast.className = 'suggestion-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

function renderProfilePage() {
  initProfileDefaults();
  const p = getProfile();

  const todaySec = getTodaySeconds();
  const weekSec = getWeekSeconds();
  const totalSec = getTotalSeconds();
  const level = getLevel(totalSec);
  const progress = getLevelProgress(totalSec);

  let html = '';

  // 头像 + 昵称 + 等级（不可编辑，仅展示）
  const avatarContent = p.avatar
    ? `<img src="${escUrl(p.avatar)}" alt="头像" class="pf-avatar-img">`
    : `<span class="pf-avatar-text">${escHtml(p.nickname.charAt(0))}</span>`;
  const avatarBg = p.avatar ? '#f0f0f0' : avatarColor(p.nickname);

  html += `
    <div class="pf-header">
      <div class="pf-avatar-wrap" style="background:${avatarBg}">
        ${avatarContent}
      </div>
      <div class="pf-name-col">
        <span class="pf-nickname">${escHtml(p.nickname)}</span>
        <div class="pf-level-badge">Lv.${level}</div>
      </div>
    </div>
    <div class="pf-level-bar-wrap">
      <div class="pf-level-bar" style="width:${progress}%"></div>
      <span class="pf-level-label">距 Lv.${level+1} 还需 ${(10 - (totalSec/3600)%10).toFixed(1)} 小时</span>
    </div>
  `;

  // 时长统计 — 本周在前，今日在后
  html += `
    <div class="pf-stats">
      <div class="pf-stat-item">
        <div class="pf-stat-val">${formatDuration(weekSec)}</div>
        <div class="pf-stat-label">本周学习</div>
      </div>
      <div class="pf-stat-item">
        <div class="pf-stat-val">${formatDuration(todaySec)}</div>
        <div class="pf-stat-label">今日学习</div>
      </div>
      <div class="pf-stat-item">
        <div class="pf-stat-val">${formatDuration(totalSec)}</div>
        <div class="pf-stat-label">累计学习</div>
      </div>
    </div>
  `;

  // 微信风格菜单列表
  const myPosts = (state.circlePosts || []).filter(post => post.author === p.nickname);
  const favIds = getFavorites();
  const favPosts = (state.circlePosts || []).filter(post => favIds.includes(post.id));

  html += `<div class="weui-cells">
    <div class="weui-cell weui-cell_access" id="pfCertification">
      <div class="weui-cell-bd">我的认证</div>
      <div class="weui-cell-ft">${getCertBadgeHtml()}</div>
    </div>
    <div class="weui-cell weui-cell_access" id="pfMyPosts">
      <div class="weui-cell-bd">我的发布</div>
      <div class="weui-cell-ft">${myPosts.length ? myPosts.length + '条' : ''}</div>
    </div>
    <div class="weui-cell weui-cell_access" id="pfMyFavs">
      <div class="weui-cell-bd">我的收藏</div>
      <div class="weui-cell-ft">${favPosts.length ? favPosts.length + '条' : ''}</div>
    </div>
    <div class="weui-cell weui-cell_access" id="pfSuggestions">
      <div class="weui-cell-bd">我的建议</div>
      <div class="weui-cell-ft"></div>
    </div>
    <div class="weui-cell weui-cell_access" id="pfVisitors">
      <div class="weui-cell-bd">访客数据</div>
      <div class="weui-cell-ft"></div>
    </div>
  </div>`;

  mainContent.innerHTML = html;

  // 点击事件
  const certRow = $('#pfCertification');
  const postsRow = $('#pfMyPosts');
  const favsRow = $('#pfMyFavs');
  const sugRow = $('#pfSuggestions');
  if (certRow) certRow.addEventListener('click', () => showCertification());
  if (postsRow) postsRow.addEventListener('click', () => showMyPosts(myPosts));
  if (favsRow) favsRow.addEventListener('click', () => showMyFavs(favPosts));
  if (sugRow) sugRow.addEventListener('click', () => showSuggestions());
  const visRow = $('#pfVisitors');
  if (visRow) visRow.addEventListener('click', () => window.open('/api/visitors', '_blank'));
}

function showMyPosts(posts) {
  // 隐藏主 header，显示列表 header
  $('.app-header').style.display = 'none';
  let listHeader = $('#listHeader');
  if (!listHeader) {
    const h = document.createElement('div');
    h.id = 'listHeader';
    h.className = 'wx-navbar';
    h.innerHTML = `
      <button class="wx-navbar-back" id="wxListBack">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span class="wx-navbar-title" id="wxListTitle"></span>
    `;
    $('.app-header').after(h);
    h.querySelector('#wxListBack').addEventListener('click', backToProfile);
  }
  $('#listHeader').style.display = '';
  $('#wxListTitle').textContent = '我的发布';

  let html = '<div class="wx-list-page"><div class="wx-list-body">';
  if (posts.length === 0) {
    html += '<div class="wx-list-empty">暂无发布内容</div>';
  } else {
    posts.forEach(post => {
      const imgs = post.images || [];
      const thumb = imgs.length > 0 ? `<div class="wx-list-thumb"><img src="${escUrl(imgs[0])}" alt=""></div>` : '';
      html += `
        <div class="wx-list-item">
          ${thumb}
          <div class="wx-list-item-bd">
            <div class="wx-list-item-content">${escHtml(post.content).substring(0, 80)}${post.content.length > 80 ? '...' : ''}</div>
            <div class="wx-list-item-time">${formatTime(post.created_at)} · ${(post.likes||[]).length}赞 · ${(post.comments||[]).length}评论</div>
          </div>
        </div>
      `;
    });
  }
  html += '</div></div>';
  $('#mainContent').innerHTML = html;
}

function showMyFavs(posts) {
  // 隐藏主 header，显示列表 header
  $('.app-header').style.display = 'none';
  let listHeader = $('#listHeader');
  if (!listHeader) {
    const h = document.createElement('div');
    h.id = 'listHeader';
    h.className = 'wx-navbar';
    h.innerHTML = `
      <button class="wx-navbar-back" id="wxListBack">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span class="wx-navbar-title" id="wxListTitle"></span>
    `;
    $('.app-header').after(h);
    h.querySelector('#wxListBack').addEventListener('click', backToProfile);
  }
  $('#listHeader').style.display = '';
  $('#wxListTitle').textContent = '我的收藏';

  let html = '<div class="wx-list-page"><div class="wx-list-body">';
  if (posts.length === 0) {
    html += '<div class="wx-list-empty">暂无收藏内容</div>';
  } else {
    posts.forEach(post => {
      const imgs = post.images || [];
      const thumb = imgs.length > 0 ? `<div class="wx-list-thumb"><img src="${escUrl(imgs[0])}" alt=""></div>` : '';
      html += `
        <div class="wx-list-item">
          ${thumb}
          <div class="wx-list-item-bd">
            <div class="wx-list-item-content">${escHtml(post.content).substring(0, 80)}${post.content.length > 80 ? '...' : ''}</div>
            <div class="wx-list-item-time">${formatTime(post.created_at)} · ${(post.likes||[]).length}赞 · ${(post.comments||[]).length}评论</div>
          </div>
        </div>
      `;
    });
  }
  html += '</div></div>';
  $('#mainContent').innerHTML = html;
  $('#wxListBack').addEventListener('click', backToProfile);
}

// ===== 我的建议 =====
let suggestionsData = [];

async function showSuggestions() {
  $('.app-header').style.display = 'none';
  let listHeader = $('#listHeader');
  if (!listHeader) {
    const h = document.createElement('div');
    h.id = 'listHeader';
    h.className = 'wx-navbar';
    h.innerHTML = `
      <button class="wx-navbar-back" id="wxListBack">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span class="wx-navbar-title" id="wxListTitle"></span>
    `;
    $('.app-header').after(h);
    h.querySelector('#wxListBack').addEventListener('click', backToProfile);
  }
  $('#listHeader').style.display = '';
  $('#wxListTitle').textContent = '我的建议';

  showLoading(true);
  try {
    const p = getProfile();
    const author = p.nickname || 'AI学习者';
    const resp = await fetch(`/api/suggestions?author=${encodeURIComponent(author)}`);
    if (!resp.ok) throw new Error('加载失败');
    const data = await resp.json();
    suggestionsData = data.suggestions || [];
  } catch (_) {
    suggestionsData = [];
  } finally {
    showLoading(false);
  }
  renderSuggestionsPage();
}

function renderSuggestionsPage() {
  let html = '<div class="wx-list-page"><div class="wx-list-body">';

  if (suggestionsData.length === 0) {
    html += '<div class="wx-list-empty">暂无建议，快来发表第一条吧</div>';
  } else {
    suggestionsData.forEach(s => {
      const name = s.author || '匿名';
      const time = formatTime(s.created_at);
      html += `
        <div class="suggestion-card">
          <div class="suggestion-avatar" style="background:${avatarColor(name)}">${name.charAt(0)}</div>
          <div class="suggestion-bd">
            <div class="suggestion-name">${escHtml(name)}</div>
            <div class="suggestion-content">${escHtml(s.content)}</div>
            <div class="suggestion-time">${time}</div>
          </div>
        </div>
      `;
    });
  }

  html += '</div></div>';

  // 底部固定输入栏
  html += `
    <div class="suggestion-bar" id="suggestionBar">
      <div class="suggestion-bar-hint">提出建议可获 <strong>30分钟</strong> 学习时长，助力账号升级</div>
      <div class="suggestion-bar-row">
        <input type="text" class="suggestion-input" id="suggestionInput" placeholder="写下你的建议...">
        <button class="suggestion-submit" id="suggestionSubmit">提交</button>
      </div>
    </div>
  `;

  $('#mainContent').innerHTML = html;

  // 提交事件
  $('#suggestionSubmit').addEventListener('click', submitSuggestion);
  $('#suggestionInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitSuggestion();
  });
}

async function submitSuggestion() {
  const input = $('#suggestionInput');
  const content = (input.value || '').trim();
  if (!content) return;

  const p = getProfile();
  const author = p.nickname || 'AI学习者';

  try {
    const resp = await fetch('/api/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author, content })
    });
    if (!resp.ok) { const e = await resp.json(); alert(e.error); return; }

    // 奖励 30 分钟学习时长
    const profile = getProfile();
    if (!profile.daily) profile.daily = {};
    const today = new Date().toISOString().substring(0, 10);
    profile.daily[today] = (profile.daily[today] || 0) + 1800; // 30分钟 = 1800秒
    saveProfile(profile);

    // 刷新列表（使用服务器返回的 id）
    const result = await resp.json();
    suggestionsData.unshift({
      id: result.suggestion.id,
      author,
      content,
      created_at: result.suggestion.created_at
    });
    input.value = '';
    renderSuggestionsPage();

    // 成功提示
    showSuggestionToast();
  } catch (err) {
    alert('提交失败: ' + err.message);
  }
}

function showSuggestionToast() {
  let toast = $('#suggestionToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'suggestionToast';
    toast.className = 'suggestion-toast';
    document.body.appendChild(toast);
  }
  toast.innerHTML = '感谢反馈！学习时长 <strong>+30分钟</strong>';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

function editNickname() {
  const p = getProfile();
  const name = prompt('输入新昵称：', p.nickname || '');
  if (name && name.trim()) {
    p.nickname = name.trim();
    saveProfile(p);
    renderProfilePage();
  }
}

function handleAvatarChange(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const p = getProfile();
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // 保持原比例，只限制最大尺寸
      const maxSize = 300;
      let w = img.width, h = img.height;
      if (w > h && w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize; }
      else if (h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize; }
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      p.avatar = canvas.toDataURL('image/jpeg', 0.8);
      saveProfile(p);
      renderProfilePage();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

// ===== 设置弹窗 =====
function backToProfile() {
  // 隐藏列表 header，恢复主 header
  const lh = $('#listHeader');
  if (lh) lh.style.display = 'none';
  $('.app-header').style.display = '';
  renderProfilePage();
}

function openSettings() {
  const p = getProfile();
  const html = `
    <div class="settings-overlay" id="settingsOverlay">
      <div class="settings-card">
        <div class="settings-head">
          <span>设置</span>
          <button class="settings-close" id="settingsClose">×</button>
        </div>
        <div class="settings-body">
          <div class="settings-row" id="settingsAvatar">
            <span>头像</span>
            <div class="settings-avatar-preview">${p.avatar ? `<img src="${escUrl(p.avatar)}" alt="">` : (p.nickname||'A')[0]}</div>
          </div>
          <div class="settings-row" id="settingsNickname">
            <span>昵称</span>
            <span class="settings-val">${escHtml(p.nickname)}</span>
          </div>
        </div>
        <input type="file" id="pfAvatarInput" accept="image/*" style="display:none">
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
  $('#settingsClose').addEventListener('click', () => $('#settingsOverlay').remove());
  $('#settingsOverlay').addEventListener('click', (e) => {
    if (e.target === $('#settingsOverlay')) $('#settingsOverlay').remove();
  });
  $('#settingsAvatar').addEventListener('click', () => $('#pfAvatarInput').click());
  $('#settingsNickname').addEventListener('click', () => {
    const name = prompt('输入新昵称：', p.nickname || '');
    if (name && name.trim()) {
      p.nickname = name.trim();
      saveProfile(p);
      renderProfilePage();
      $('#settingsOverlay').remove();
    }
  });
  $('#pfAvatarInput').addEventListener('change', (e) => {
    handleAvatarChange(e);
    $('#settingsOverlay').remove();
  });
}

// ===== 收藏 =====
function getFavorites() {
  try { return JSON.parse(localStorage.getItem('fav-posts') || '[]'); } catch (_) { return []; }
}
function toggleFavorite(postId) {
  const favs = getFavorites();
  const idx = favs.indexOf(postId);
  if (idx >= 0) favs.splice(idx, 1);
  else favs.push(postId);
  localStorage.setItem('fav-posts', JSON.stringify(favs));
  return idx < 0;
}

// 页面加载时启动计时
startProfileTick();

// ========== 详情弹窗（预留，未来用于全屏阅读） ==========
$('#detailBack').addEventListener('click', () => {
  detailOverlay.classList.remove('open');
});

// ========== 启动 ==========
document.addEventListener('DOMContentLoaded', init);
