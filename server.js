/*
 * MANGAHUB MONOLITH - VERSION 3 (FINAL)
 * All-in-One: Server + API + Frontend (HTML/CSS/JS)
 * * Install Deps: npm install express axios cheerio cors
 * Run: node server.js
 */

const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

// --- CONFIGURATION ---
const PORT = process.env.PORT || 3000;
const SITE_BASE = 'https://manhwa-tower.ir';
const CDN_HOST = 'cdn.megaman-server.ir';

const app = express();
app.use(cors());
app.use(express.json());

// --- SERVER-SIDE STATE & CACHE ---
const Cache = {
    populars: [],
    lastFetch: 0,
    ttl: 15 * 60 * 1000 // 15 mins
};

// --- UTILS ---
const getHeaders = () => ({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/115.0.0.0 Safari/537.36',
    'Referer': SITE_BASE
});

const sanitizeImg = (url) => {
    if (!url) return 'https://placehold.co/300x450?text=No+Cover';
    return url.startsWith('http') ? url : `${SITE_BASE}${url}`;
};

// --- SCRAPER ENGINE ---

async function fetchHome() {
    // Check Cache for Populars
    if (Date.now() - Cache.lastFetch > Cache.ttl) {
        Cache.populars = []; 
    }

    const { data: html } = await axios.get(SITE_BASE, { headers: getHeaders() });
    const $ = cheerio.load(html);
    
    const items = [];
    $('.page-item-detail, article.post, .manga-card').each((i, el) => {
        const a = $(el).find('a').first();
        const href = a.attr('href');
        if (!href || !href.includes('/manhwa/')) return;
        
        const slug = href.split('/manhwa/')[1].replace('/', '');
        const img = $(el).find('img');
        const cover = sanitizeImg(img.attr('data-src') || img.attr('src'));
        const title = a.attr('title') || img.attr('alt') || $(el).text().trim();
        const latest = $(el).find('.chapter-item').first().text().trim() || '';

        items.push({ slug, title, cover, latest });
    });

    // Update Populars if empty (Simple logic: first 8 items)
    if (Cache.populars.length === 0 && items.length > 0) {
        Cache.populars = items.slice(0, 8);
        Cache.lastFetch = Date.now();
    }

    // Deduplicate: Remove items present in Populars from Recent list
    const popularSlugs = new Set(Cache.populars.map(p => p.slug));
    const recents = items.filter(i => !popularSlugs.has(i.slug));

    return { popular: Cache.populars, recents };
}

async function fetchManga(slug) {
    const url = `${SITE_BASE}/manhwa/${slug}/`;
    const { data: html } = await axios.get(url, { headers: getHeaders() });
    const $ = cheerio.load(html);

    const title = $('h1').first().text().trim() || $('.post-title h1').text().trim();
    const cover = sanitizeImg($('.summary_image img').attr('data-src') || $('.summary_image img').attr('src'));
    const desc = $('.summary__content p').text().trim() || 'توضیحات ندارد';
    const genres = [];
    $('.genres-content a').each((i, el) => genres.push($(el).text()));

    const chapters = [];
    $('.wp-manga-chapter').each((i, el) => {
        const a = $(el).find('a');
        const href = a.attr('href');
        // Extract ID from URL like .../chapter-20/
        const parts = href.split('/').filter(Boolean);
        const id = parts[parts.length - 1]; 
        chapters.push({ id, title: a.text().trim(), link: href });
    });

    return { title, cover, desc, genres, chapters };
}

async function fetchChapter(slug, chapterId) {
    const url = `${SITE_BASE}/manhwa/${slug}/${chapterId}/`;
    const { data: html } = await axios.get(url, { headers: getHeaders() });
    const $ = cheerio.load(html);

    const images = [];
    $('.reading-content img').each((i, el) => {
        const src = $(el).attr('data-src') || $(el).attr('src');
        if (src) images.push(sanitizeImg(src.trim()));
    });

    return { images };
}

// --- API ROUTES ---

app.get('/api/home', async (req, res) => {
    try {
        const data = await fetchHome();
        res.json({ ok: true, data });
    } catch (e) { res.status(500).json({ ok: false, msg: e.message }); }
});

app.get('/api/manga/:slug', async (req, res) => {
    try {
        const data = await fetchManga(req.params.slug);
        res.json({ ok: true, data });
    } catch (e) { res.status(500).json({ ok: false }); }
});

app.get('/api/read/:slug/:ch', async (req, res) => {
    try {
        const data = await fetchChapter(req.params.slug, req.params.ch);
        res.json({ ok: true, data });
    } catch (e) { res.status(500).json({ ok: false }); }
});


// --- FRONTEND ASSETS (EMBEDDED) ---

const CSS = `
:root {
    --bg: #0f0f0f; --card: #1a1a1a; --glass: rgba(20,20,20,0.9);
    --accent: #e50914; --text: #eee; --text-muted: #aaa;
    --nav-h: 60px;
}
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; outline: none; }
body { margin: 0; background: var(--bg); color: var(--text); font-family: 'Segoe UI', Tahoma, sans-serif; padding-bottom: 70px; overflow-x: hidden; }
a { text-decoration: none; color: inherit; }

/* LAYOUT */
.app-container { max-width: 1200px; margin: 0 auto; min-height: 100vh; }
.header { position: sticky; top: 0; height: var(--nav-h); background: var(--glass); backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: space-between; padding: 0 20px; z-index: 100; border-bottom: 1px solid #333; }
.logo { font-weight: 900; font-size: 1.5rem; color: var(--accent); letter-spacing: -1px; }
.logo span { color: #fff; }

/* COMPONENTS */
.btn-icon { background: none; border: none; color: #fff; font-size: 1.4rem; cursor: pointer; }
.section-title { font-size: 1.2rem; font-weight: bold; padding: 20px 20px 10px; border-left: 3px solid var(--accent); margin: 10px 0 0 20px; }

/* SLIDER */
.slider { display: flex; gap: 15px; overflow-x: auto; padding: 15px 20px; scroll-snap-type: x mandatory; }
.slider::-webkit-scrollbar { display: none; }
.slide-card { min-width: 260px; height: 160px; border-radius: 12px; overflow: hidden; position: relative; scroll-snap-align: start; cursor: pointer; }
.slide-card img { width: 100%; height: 100%; object-fit: cover; filter: brightness(0.6); }
.slide-info { position: absolute; bottom: 0; padding: 15px; width: 100%; background: linear-gradient(transparent, #000); }
.slide-title { font-weight: bold; font-size: 1rem; text-shadow: 0 2px 4px #000; }

/* GRID */
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 15px; padding: 20px; }
.card { background: var(--card); border-radius: 10px; overflow: hidden; transition: transform 0.2s; cursor: pointer; }
.card:active { transform: scale(0.97); }
.card-img { width: 100%; aspect-ratio: 2/3; object-fit: cover; }
.card-body { padding: 10px; }
.card-title { font-size: 0.9rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card-sub { font-size: 0.75rem; color: var(--text-muted); margin-top: 4px; }

/* DETAIL PAGE */
.banner { height: 35vh; position: relative; }
.banner img { width: 100%; height: 100%; object-fit: cover; mask-image: linear-gradient(to bottom, black 40%, transparent); }
.manga-info { padding: 0 20px; position: relative; margin-top: -60px; z-index: 2; display: flex; flex-direction: column; gap: 15px; }
.manga-cover { width: 140px; border-radius: 8px; box-shadow: 0 5px 20px #000; align-self: center; }
.manga-meta { text-align: center; }
.manga-title { font-size: 1.6rem; font-weight: bold; margin: 10px 0; }
.tags span { font-size: 0.75rem; background: #333; padding: 4px 10px; border-radius: 20px; margin: 2px; display: inline-block; }
.desc { font-size: 0.9rem; color: #ccc; line-height: 1.5; max-height: 100px; overflow-y: auto; margin: 15px 0; background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; }
.chapter-list { padding: 20px; }
.ch-item { display: flex; justify-content: space-between; padding: 15px; background: var(--card); margin-bottom: 8px; border-radius: 8px; cursor: pointer; }
.ch-item:hover { background: #252525; }

/* READER */
.reader-view { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #000; z-index: 200; display: flex; flex-direction: column; }
.reader-bar { padding: 15px; background: var(--glass); display: flex; justify-content: space-between; align-items: center; position: absolute; width: 100%; z-index: 202; transition: transform 0.3s; }
.reader-bar.top { top: 0; }
.reader-bar.bot { bottom: 0; justify-content: center; gap: 20px; }
.reader-content { flex: 1; overflow-y: auto; position: relative; height: 100%; }
.mode-webtoon img { display: block; width: 100%; max-width: 800px; margin: 0 auto; }
.mode-paged { display: flex; align-items: center; justify-content: center; height: 100%; }
.mode-paged img { max-width: 100%; max-height: 100%; object-fit: contain; }
.ui-hidden .top { transform: translateY(-100%); }
.ui-hidden .bot { transform: translateY(100%); }

/* SPINNER */
.loader { border: 4px solid #333; border-top: 4px solid var(--accent); border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 50px auto; }
@keyframes spin { 100% { transform: rotate(360deg); } }
.hidden { display: none !important; }

/* MOBILE NAV */
.nav-bot { position: fixed; bottom: 0; width: 100%; height: 60px; background: var(--glass); display: flex; justify-content: space-around; align-items: center; border-top: 1px solid #333; z-index: 90; }
.nav-item { display: flex; flex-direction: column; align-items: center; font-size: 0.7rem; color: var(--text-muted); cursor: pointer; }
.nav-item i { font-size: 1.4rem; margin-bottom: 2px; }
.nav-item.active { color: var(--accent); }
@media(min-width: 768px) { .nav-bot { display: none; } }
`;

const SCRIPT = `
const API = '/api';
const app = document.getElementById('app');

// --- ROUTER ---
const Router = {
    routes: {
        'home': renderHome,
        'manga': renderManga,
        'read': renderReader
    },
    init: () => {
        window.addEventListener('hashchange', Router.handle);
        Router.handle();
    },
    handle: () => {
        const hash = window.location.hash.slice(1) || 'home';
        const [page, ...args] = hash.split('/');
        if (Router.routes[page]) Router.routes[page](...args);
    },
    go: (path) => window.location.hash = path
};

// --- VIEWS ---

async function renderHome() {
    app.innerHTML = '<div class="loader"></div>';
    try {
        const res = await fetch(API + '/home').then(r => r.json());
        if(!res.ok) throw new Error();
        
        let html = '';
        
        // Popular Slider
        if(res.data.popular.length) {
            html += \`<div class="section-title">برترین‌های هفته</div><div class="slider">\`;
            res.data.popular.forEach(m => {
                html += \`
                <div class="slide-card" onclick="Router.go('manga/\${m.slug}')">
                    <img src="\${m.cover}">
                    <div class="slide-info"><div class="slide-title">\${m.title}</div></div>
                </div>\`;
            });
            html += \`</div>\`;
        }

        // Recent Grid
        html += \`<div class="section-title">آخرین بروزرسانی‌ها</div><div class="grid">\`;
        res.data.recents.forEach(m => {
            html += \`
            <div class="card" onclick="Router.go('manga/\${m.slug}')">
                <img src="\${m.cover}" class="card-img" loading="lazy">
                <div class="card-body">
                    <div class="card-title">\${m.title}</div>
                    <div class="card-sub">\${m.latest}</div>
                </div>
            </div>\`;
        });
        html += \`</div>\`;
        
        app.innerHTML = html;
        updateNav('home');
    } catch(e) { app.innerHTML = '<p style="text-align:center;padding:20px">خطا در دریافت اطلاعات</p>'; }
}

async function renderManga(slug) {
    app.innerHTML = '<div class="loader"></div>';
    try {
        const res = await fetch(API + '/manga/' + slug).then(r => r.json());
        const m = res.data;
        
        app.innerHTML = \`
            <div class="banner"><img src="\${m.cover}"></div>
            <div class="manga-info">
                <img src="\${m.cover}" class="manga-cover">
                <div class="manga-meta">
                    <div class="manga-title">\${m.title}</div>
                    <div class="tags">\${m.genres.slice(0,4).map(g=>\`<span>\${g}</span>\`).join('')}</div>
                </div>
                <div class="desc">\${m.desc}</div>
                <button onclick="Router.go('read/\${slug}/\${m.chapters[0].id}')" 
                    style="background:var(--accent);border:none;color:#fff;padding:12px;border-radius:8px;font-weight:bold;cursor:pointer">
                    شروع مطالعه
                </button>
            </div>
            <div class="chapter-list">
                <div class="section-title" style="margin:0 0 10px 0">چپترها</div>
                \${m.chapters.map(ch => \`
                    <div class="ch-item" onclick="Router.go('read/\${slug}/\${ch.id}')">
                        <span>\${ch.title}</span>
                        <small style="color:#666">مشاهده</small>
                    </div>
                \`).join('')}
            </div>
        \`;
        window.scrollTo(0,0);
        updateNav('library');
    } catch(e) { app.innerHTML = 'Error'; }
}

async function renderReader(slug, chId) {
    const readerRoot = document.getElementById('reader-overlay');
    readerRoot.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    
    const content = document.getElementById('reader-content');
    content.innerHTML = '<div class="loader"></div>';
    document.getElementById('ch-title').innerText = 'Loading...';

    try {
        const res = await fetch(API + \`/read/\${slug}/\${chId}\`).then(r => r.json());
        const images = res.data.images;
        
        document.getElementById('ch-title').innerText = \`Chapter \${chId}\`;
        
        // Mode: Webtoon (Vertical)
        content.innerHTML = '';
        content.className = 'reader-content mode-webtoon';
        
        images.forEach(src => {
            const img = document.createElement('img');
            img.src = src;
            img.loading = 'lazy';
            img.onclick = toggleReaderUI;
            content.appendChild(img);
        });

    } catch(e) { alert('خطا در لود چپتر'); closeReader(); }
}

// --- READER LOGIC ---
function closeReader() {
    document.getElementById('reader-overlay').classList.add('hidden');
    document.body.style.overflow = 'auto';
}
function toggleReaderUI() {
    document.getElementById('reader-overlay').classList.toggle('ui-hidden');
}

// --- NAV ---
function updateNav(active) {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const target = document.querySelector(\`.nav-item[onclick*="\${active}"]\`);
    if(target) target.classList.add('active');
}

// Init
Router.init();
`;

// --- MAIN HTML TEMPLATE ---

const HTML_TEMPLATE = `
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>MangaHub V3</title>
    <link href="https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css" rel="stylesheet">
    <style>${CSS}</style>
</head>
<body>
    <header class="header">
        <div class="logo">MANGA<span>HUB</span></div>
        <button class="btn-icon"><i class="ri-search-2-line"></i></button>
    </header>

    <div id="app" class="app-container">
        </div>

    <div id="reader-overlay" class="reader-view hidden">
        <div class="reader-bar top">
            <button class="btn-icon" onclick="closeReader()"><i class="ri-arrow-right-line"></i></button>
            <span id="ch-title" style="font-weight:bold">Chapter</span>
            <button class="btn-icon"><i class="ri-settings-3-line"></i></button>
        </div>
        <div id="reader-content" class="reader-content"></div>
        <div class="reader-bar bot">
            <button class="btn-icon"><i class="ri-skip-forward-mini-fill"></i></button>
            <button class="btn-icon"><i class="ri-skip-back-mini-fill"></i></button>
        </div>
    </div>

    <nav class="nav-bot">
        <div class="nav-item active" onclick="Router.go('home')">
            <i class="ri-home-5-line"></i><span>خانه</span>
        </div>
        <div class="nav-item" onclick="alert('Coming Soon')">
            <i class="ri-compass-3-line"></i><span>کاوش</span>
        </div>
        <div class="nav-item" onclick="alert('Coming Soon')">
            <i class="ri-bookmark-3-line"></i><span>کتابخانه</span>
        </div>
    </nav>

    <script>${SCRIPT}</script>
</body>
</html>
`;

// --- SERVE APP ---
app.get('*', (req, res) => {
    res.send(HTML_TEMPLATE);
});

// --- START ---
app.listen(PORT, () => {
    console.log(`
    ======================================
    MANGAHUB V3 - MONOLITH READY
    ======================================
    > Server running on: http://localhost:${PORT}
    > Mode: All-in-One (Server + UI)
    `);
});
