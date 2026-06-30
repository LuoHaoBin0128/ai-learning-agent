# AI Learning Assistant · 人工智能学习助手

<p align="center">
  <img src="https://img.shields.io/badge/status-live-success?style=for-the-badge" alt="Status" />
  <img src="https://img.shields.io/badge/express-4.x-blue?style=for-the-badge&logo=express" alt="Express" />
  <img src="https://img.shields.io/badge/deepseek-api-4B6BFB?style=for-the-badge" alt="DeepSeek" />
  <img src="https://img.shields.io/badge/node-18+-green?style=for-the-badge&logo=node.js" alt="Node.js" />
  <img src="https://img.shields.io/badge/license-MIT-brightgreen?style=for-the-badge" alt="License" />
  <img src="https://img.shields.io/badge/PRs-welcome-blueviolet?style=for-the-badge" alt="PRs Welcome" />
</p>

<p align="center">
  <b>Daily AI news digest · Developer tool library · AI community · Visitor analytics</b>
</p>

<p align="center">
  <a href="https://ai.foodrs.top"><b>Live Demo</b></a> ·
  <a href="#-what-problem-does-this-solve">Why</a> ·
  <a href="#-features">Features</a> ·
  <a href="#-quick-start">Quick Start</a> ·
  <a href="#-architecture">Architecture</a>
</p>

---

## What problem does this solve?

Every morning, AI practitioners spend **30–60 minutes** scanning Twitter, Reddit, arXiv, GitHub, and Chinese tech media to catch up on AI news. This tool automates that workflow:

1. **Aggregates** AI news from multiple sources into a daily digest
2. **Translates** English content to Chinese automatically (via DeepSeek API)
3. **Categorizes** into News / Projects / Papers so you can scan in 5 minutes
4. **Builds community** with an AI Circle (like a mini Twitter for AI learners)
5. **Tracks visitors** across devices with a real-time dashboard

## Live Demo

| Service | URL |
|---------|-----|
| **AI Learning Assistant** | [https://ai.foodrs.top](https://ai.foodrs.top) |
| **Visitor Dashboard** | [https://ai.foodrs.top/api/visitors](https://ai.foodrs.top/api/visitors) |
| **Dual-System Dashboard** | [https://ai.foodrs.top/dashboard.html](https://ai.foodrs.top/dashboard.html) |

> The demo server is an 896MB Alibaba Cloud ECS in Singapore. It also hosts a separate [food recommendation system](https://foodrs.top) on the same machine — proving this architecture is lightweight and production-ready.

## Features

### Daily AI Briefing
- **3 categories**: News (资讯), Projects (项目), Academic Papers (学术)
- **Batch translation**: 95+ items translated from English to Chinese via DeepSeek API
- **Scheduled generation**: Cron job runs daily at 9:40 AM Beijing time — ready by 10:00
- **One-click detail view** with original source links

### AI Tools Directory
- **80+ curated AI tools** organized by category (Coding, Writing, Image, Video, etc.)
- **AI Models comparison** — pricing, context windows, capabilities
- **Search & filter** across the entire tool database

### AI Circle (Community)
- **Expert Circle** (level 10+) and **Free Talk** sections
- **Rich media posts** with image upload support
- **Comments, likes, favorites** — full social interaction
- **Verified identity system** (大V认证)
- **Author-only deletion** — dual frontend + backend authorization

### Visitor Analytics
- **Real-time visitor tracking** — device, browser, city, IP
- **Desktop dashboard** with dark theme, auto-refresh
- **5 rolling backups + 168 hourly snapshots** — crash-safe data persistence
- **Atomic file writes** — no corrupted data on power loss
- **Separate tracking** for multiple services on the same server

### Tech Highlights
- **Single-page app** with instant tab switching (preloaded cache)
- **Subdomain routing** via lightweight Node.js reverse proxy (no Nginx needed)
- **Zero-downtime deployment** with PM2 process management
- **896MB RAM total** for 3 services + reverse proxy

## Quick Start

### Prerequisites
- Node.js 18+
- npm

### Installation

```bash
git clone https://github.com/LuoHaoBin0128/ai-learning-agent.git
cd ai-learning-agent
npm install
echo "your-deepseek-api-key" > .deepseek-key
node server.js
# Server runs on http://localhost:3456
```

### Generate your first report

```bash
node scripts/generate-report.js
```

### Production deployment

```bash
npm install -g pm2
pm2 start server.js --name ai-agent
pm2 save

# Daily cron (9:40 AM Beijing = 1:40 AM UTC)
crontab -e
# Add: 40 1 * * * /usr/bin/node /path/to/scripts/generate-report.js >> /path/to/data/generate.log 2>&1
```

## Architecture

```
                    Internet
                        │
            :80 (HTTP)  │  :443 (HTTPS)
                        │
        ┌───────────────┴───────────────┐
        │                               │
        ▼                               ▼
  ┌───────────┐                 ┌──────────────┐
  │ proxy.js  │                 │  iptables    │
  │ (Host     │                 │  443 → 3443  │
  │  routing) │                 │              │
  └──┬────┬───┘                 └──────┬───────┘
     │    │                            │
 ai.*│    │foodrs.top                  │ ai.* host check
     │    │                   (Express middleware)
     ▼    ▼                            │
┌──────┐ ┌──────┐              ┌───────┴───────┐
│:3456 │ │:3000 │              │    :3443      │
│ AI   │ │ Food │              │  Food HTTPS   │
│Agent │ │ HTTP │              │               │
└──────┘ └──────┘              └───────────────┘
```

## Project Structure

```
ai-learning-agent/
├── server.js              # Express backend
├── analytics.js           # Visitor tracking module
├── proxy.js               # Host-based reverse proxy
├── index.html             # SPA shell
├── dashboard.html         # Dual-system visitor dashboard
├── package.json           # Dependencies
├── css/
│   └── style.css          # Complete UI styles
├── js/
│   └── app.js             # Frontend logic
├── scripts/
│   └── generate-report.js # AI daily report generator
└── data/
    ├── tools.json         # AI tools database (80+)
    └── models.json        # AI models comparison data
```

## Why Vanilla JS?

No React, Vue, or build tools. This project runs on a **896MB shared server** alongside another production service. The entire frontend is a single JavaScript file with zero dependencies:

- **Instant load** — no bundle, no tree-shaking, no compilation
- **Tiny memory footprint** — ~60MB for the Node process
- **No build step** — edit and deploy directly
- **Compatible with WeChat browsers** on low-end Android phones

## Contributing

Areas where help is especially appreciated:

- [ ] Add more AI news sources
- [ ] i18n support (English UI)
- [ ] Database migration (SQLite or PostgreSQL)
- [ ] Docker containerization
- [ ] PWA / offline support
- [ ] Automated tests

Please open an issue first to discuss what you would like to change.

## Star History

<a href="https://star-history.com/#LuoHaoBin0128/ai-learning-agent&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=LuoHaoBin0128/ai-learning-agent&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=LuoHaoBin0128/ai-learning-agent&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=LuoHaoBin0128/ai-learning-agent&type=Date" />
  </picture>
</a>

## License

MIT © [LuoHaoBin0128](https://github.com/LuoHaoBin0128)

---

<p align="center">
  <sub>Built with  ❤️ for the AI learning community · 每天十点更新 · Never miss an AI breakthrough</sub>
</p>
