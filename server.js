// server.js - Final Full Version
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// --- تنظیمات اصلی ---
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://user:pass@cluster.mongodb.net/manhwapromax?retryWrites=true&w=majority'; // آدرس دیتابیس خود را ست کنید
const JWT_SECRET = process.env.JWT_SECRET || 'secret_key_manhwa_tower_secure';

const SITE_BASE = 'https://manhwa-tower.ir';
const CDN_SAMPLE_HOST = 'cdn.megaman-server.ir';
const MAX_PAGE_CHECK = 2000;

// --- اتصال به دیتابیس ---
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ DB Error:', err));

// --- مدل کاربر ---
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  bookmarks: [{
    slug: String,
    title: String,
    cover: String,
    addedAt: { type: Date, default: Date.now }
  }]
});
const User = mongoose.model('User', userSchema);

const app = express();
app.use(express.json({ limit: '500kb' }));
app.use(cors());

// --- توابع کمکی اسکرپینگ (کامل) ---
function logErr(err, ctx = '') {
  console.error('[ERROR]', ctx, err && (err.stack || err.message || err));
}
function sanitizeSlug(slug) {
  if (!slug || typeof slug !== 'string') return null;
  const m = slug.match(/[A-Za-z0-9\-_]+/g);
  return m ? m.join('-') : null;
}
function parsePage(q, fallback = 1) {
  const p = parseInt(q || String(fallback), 10);
  if (isNaN(p) || p < 1) return fallback;
  return p;
}
function normalizeChapterParam(ch) {
  if (!ch) return null;
  return String(ch).replace(/[_\-]/g, '.').trim();
}

async function fetchHtml(url, timeout = 20000) {
  try {
    const r = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36' },
      timeout,
      maxRedirects: 5,
      validateStatus: s => s >= 200 && s < 400
    });
    return r.data;
  } catch (e) {
    throw new Error(`fetchHtml failed for ${url}: ${e.message}`);
  }
}

async function existsUrl(url, timeout = 8000) {
  try {
    const r = await axios.head(url, { timeout, maxRedirects: 3, validateStatus: () => true });
    return r.status >= 200 && r.status < 300;
  } catch (e) {
    try {
      const r2 = await axios.get(url, { headers: { Range: 'bytes=0-32', 'User-Agent': 'bot' }, timeout, validateStatus: () => true });
      return r2.status >= 200 && r2.status < 300;
    } catch (_) { return false; }
  }
}

// --- استخراج کننده‌ها ---

async function extractHomePage(page = 1) {
  const candidates = [
    `${SITE_BASE}/page/${page}`,
    `${SITE_BASE}/?paged=${page}`,
    `${SITE_BASE}/page/${page}/`
  ];
  let html = null;
  for (const u of candidates) {
    try {
      html = await fetchHtml(u);
      if (html && (html.includes('manhwa-card') || html.includes('post'))) break;
    } catch (e) {}
  }
  if (!html) throw new Error('Could not fetch home page');

  const $ = cheerio.load(html);
  const map = new Map();

  $('.manhwa-card, article, .post, .card').each((i, el) => {
    const a = $(el).find('a[href*="/Manhwa/"], a[href*="/manhwa/"]').first();
    const href = a.attr('href');
    if (!href) return;
    
    const link = new URL(href, SITE_BASE).href;
    const img = $(el).find('img').first();
    const title = a.attr('title') || img.attr('alt') || $(el).find('h2, h3').text().trim();
    let cover = img.attr('src') || img.attr('data-src');
    if (cover && !cover.startsWith('http')) cover = new URL(cover, SITE_BASE).href;

    if (link && title) map.set(link, { link, title, cover });
  });

  return Array.from(map.values());
}

async function extractMangaDetail(slug) {
  const safeSlug = sanitizeSlug(slug) || slug;
  const url = `${SITE_BASE}/Manhwa/${safeSlug}/`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const title = $('h1').first().text().trim() || $('.display-5').text().trim();
  let description = $('.kholase, .description, .post-content').text().trim();
  
  const genres = [];
  $('.genre-tag, .tags a, a[href*="gener.php"]').each((i, el) => genres.push($(el).text().trim()));

  const chapters = [];
  $('.chapter-item a, .chapter-list a, .chapters a').each((i, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const text = $(el).text().trim();
    
    // Extract ID
    let chapterId = null;
    const m = href.match(/Chapter=([\d.]+)/) || text.match(/([\d.]+)/);
    if (m) chapterId = m[1];
    else chapterId = String(i + 1);

    chapters.push({ 
      chapterId, 
      title: text || `Chapter ${chapterId}`, 
      link: new URL(href, SITE_BASE).href 
    });
  });

  let cover = $('.cover img, .card-img-top, .summary_image img').first().attr('src');
  if (cover && !cover.startsWith('http')) cover = new URL(cover, SITE_BASE).href;

  return { slug: safeSlug, title, description, genres, cover, chapters };
}

async function extractReaderPages(readerUrl) {
  const html = await fetchHtml(readerUrl);
  const $ = cheerio.load(html);
  const imgs = [];

  $('img.manhwa-image, .reader img, .mhreader img').each((i, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src');
    if (src) imgs.push(src.trim());
  });

  // Script extraction fallback
  const scripts = $('script').text();
  const matches = scripts.match(/https?:\/\/[^'"\s]+\.(jpg|jpeg|png|webp)/gi);
  if (matches) matches.forEach(u => imgs.push(u));

  const unique = Array.from(new Set(imgs)).filter(u => u.startsWith('http'));
  return unique;
}

async function extractGenres() {
  const html = await fetchHtml(`${SITE_BASE}/gener.php`);
  const $ = cheerio.load(html);
  const genres = [];
  $('a[href*="gener.php"], .genre-list a').each((i, el) => {
    const name = $(el).text().trim();
    const href = $(el).attr('href');
    let slug = null;
    try {
      const u = new URL(href, SITE_BASE);
      slug = u.searchParams.get('slug');
    } catch {}
    if (name && slug) genres.push({ name, slug });
  });
  return genres;
}

// --- میدل‌ور احراز هویت ---
const authenticate = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ ok: false, error: 'Token missing' });
  try {
    const decoded = jwt.verify(token.split(' ')[1], JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (e) {
    res.status(401).json({ ok: false, error: 'Invalid Token' });
  }
};

/* -------------------------
   API ROUTES
   ------------------------- */

// 1. Auth
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (await User.findOne({ username })) return res.status(400).json({ ok: false, error: 'نام کاربری تکراری است' });
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword });
    await user.save();
    const token = jwt.sign({ id: user._id }, JWT_SECRET);
    res.json({ ok: true, token, username });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ ok: false, error: 'نام کاربری یا رمز عبور اشتباه است' });
    }
    const token = jwt.sign({ id: user._id }, JWT_SECRET);
    res.json({ ok: true, token, username });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// 2. User Data
app.get('/api/user/bookmarks', authenticate, async (req, res) => {
  const user = await User.findById(req.userId);
  res.json({ ok: true, bookmarks: user.bookmarks });
});

app.post('/api/user/bookmark', authenticate, async (req, res) => {
  const { slug, title, cover } = req.body;
  const user = await User.findById(req.userId);
  const idx = user.bookmarks.findIndex(b => b.slug === slug);
  let action = 'added';
  if (idx > -1) {
    user.bookmarks.splice(idx, 1);
    action = 'removed';
  } else {
    user.bookmarks.push({ slug, title, cover });
  }
  await user.save();
  res.json({ ok: true, action });
});

// 3. Manga Content
app.get('/api/home', async (req, res) => {
  try {
    const page = parsePage(req.query.page);
    const items = await extractHomePage(page);
    res.json({ ok: true, items });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/api/manga/:slug', async (req, res) => {
  try {
    const detail = await extractMangaDetail(req.params.slug);
    res.json({ ok: true, manga: detail });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/api/reader', async (req, res) => {
  try {
    const { slug, chapter } = req.query;
    const manga = await extractMangaDetail(slug);
    const targetChapter = manga.chapters.find(c => c.chapterId == chapter || c.title.includes(chapter));
    
    if (!targetChapter) return res.status(404).json({ ok: false, error: 'فصل پیدا نشد' });
    
    const pages = await extractReaderPages(targetChapter.link);
    res.json({ ok: true, pages, next: null, prev: null }); // Next/Prev logic handled in frontend for simplicity
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/api/genres', async (req, res) => {
  try {
    const genres = await extractGenres();
    res.json({ ok: true, genres });
  } catch (e) { res.status(500).json({ ok: false }); }
});

app.get('/api/popular', async (req, res) => {
  // Simple logic: return home items as popular for now
  try {
    const items = await extractHomePage(1);
    res.json({ ok: true, items: items.slice(0, 10) });
  } catch (e) { res.status(500).json({ ok: false }); }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
