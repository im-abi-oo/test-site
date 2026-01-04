/**
 * MANHWA PRO - Complete Logic
 * Backend: Local Express Server with MongoDB
 */

const API_URL = 'https://test-site-6w6v.onrender.com/api'; // یا آدرس Render شما

class AppState {
    constructor() {
        this.token = localStorage.getItem('token');
        this.user = JSON.parse(localStorage.getItem('user'));
        this.theme = localStorage.getItem('theme') || 'dark';
    }
    
    login(token, username) {
        this.token = token;
        this.user = { username };
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(this.user));
        window.location.reload();
    }

    logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.reload();
    }
}
const State = new AppState();

// --- API Service ---
const api = {
    async get(endpoint) {
        const headers = State.token ? { 'Authorization': `Bearer ${State.token}` } : {};
        try {
            const res = await fetch(`${API_URL}${endpoint}`, { headers });
            return await res.json();
        } catch { return { ok: false }; }
    },
    async post(endpoint, body) {
        const headers = { 'Content-Type': 'application/json' };
        if (State.token) headers['Authorization'] = `Bearer ${State.token}`;
        try {
            const res = await fetch(`${API_URL}${endpoint}`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body)
            });
            return await res.json();
        } catch { return { ok: false }; }
    }
};

// --- Reader Manager (Mangaup Style) ---
class Reader {
    constructor() {
        this.overlay = document.getElementById('reader-overlay');
        this.container = document.getElementById('reader-pages');
        this.header = document.getElementById('reader-head');
        this.settings = document.getElementById('reader-settings');
        
        this.images = [];
        this.idx = 0;
        this.mode = localStorage.getItem('reader_mode') || 'webtoon';
        this.zoom = localStorage.getItem('reader_zoom') || 100;
        
        this.initEvents();
    }

    initEvents() {
        // Toggle Settings
        document.getElementById('reader-settings-btn').onclick = () => this.toggleSettings(true);
        document.getElementById('close-settings').onclick = () => this.toggleSettings(false);
        document.getElementById('zone-menu').onclick = () => {
            const isHidden = this.header.classList.contains('-translate-y-full');
            if (isHidden) {
                this.header.classList.remove('-translate-y-full');
                this.toggleSettings(false);
            } else {
                this.header.classList.add('-translate-y-full');
                this.toggleSettings(false);
            }
        };

        // Modes
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.onclick = () => {
                this.mode = btn.dataset.mode;
                localStorage.setItem('reader_mode', this.mode);
                this.render();
                this.updateUI();
            };
        });

        // Zoom
        const slider = document.getElementById('zoom-slider');
        slider.value = this.zoom;
        slider.oninput = (e) => {
            this.zoom = e.target.value;
            this.applyZoom();
            localStorage.setItem('reader_zoom', this.zoom);
        };

        // Paged Navigation
        document.getElementById('zone-next').onclick = () => this.nextPage();
        document.getElementById('zone-prev').onclick = () => this.prevPage();
        
        // Close
        document.getElementById('reader-close').onclick = () => {
            this.overlay.classList.add('hidden');
            document.body.style.overflow = '';
        };

        // Fullscreen
        document.getElementById('fs-toggle').onclick = () => {
            if (!document.fullscreenElement) this.overlay.requestFullscreen();
            else document.exitFullscreen();
        };
    }

    async open(slug, chapter) {
        document.getElementById('loader').classList.remove('hidden');
        const res = await api.get(`/reader?slug=${slug}&chapter=${chapter}`);
        document.getElementById('loader').classList.add('hidden');

        if (!res.ok || !res.pages) return alert('خطا در دریافت تصاویر');

        this.images = res.pages;
        this.idx = 0;
        this.overlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        document.getElementById('reader-title').innerText = `چپتر ${chapter}`;
        
        this.render();
        this.updateUI();
    }

    render() {
        this.container.innerHTML = '';
        this.container.className = this.mode === 'webtoon' ? 'w-full flex flex-col items-center' : 'reader-paged';
        
        // Hide/Show Zones
        const zones = ['zone-prev', 'zone-next', 'zone-menu'];
        zones.forEach(z => document.getElementById(z).style.display = this.mode === 'paged' ? 'block' : 'none');

        if (this.mode === 'webtoon') {
            this.images.forEach(src => {
                const img = document.createElement('img');
                img.src = src;
                img.loading = 'lazy';
                img.referrerPolicy = 'no-referrer';
                img.style.width = `${this.zoom}%`;
                this.container.appendChild(img);
            });
        } else {
            const img = document.createElement('img');
            img.src = this.images[this.idx];
            img.referrerPolicy = 'no-referrer';
            this.container.appendChild(img);
        }
    }

    applyZoom() {
        if (this.mode === 'webtoon') {
            this.container.querySelectorAll('img').forEach(img => img.style.width = `${this.zoom}%`);
        }
    }

    nextPage() {
        if (this.idx < this.images.length - 1) {
            this.idx++;
            this.render();
        } else {
            alert('پایان فصل');
        }
    }

    prevPage() {
        if (this.idx > 0) {
            this.idx--;
            this.render();
        }
    }

    toggleSettings(show) {
        if (show) this.settings.classList.remove('translate-y-full');
        else this.settings.classList.add('translate-y-full');
    }

    updateUI() {
        document.querySelectorAll('.mode-btn').forEach(btn => {
            if (btn.dataset.mode === this.mode) btn.classList.add('active-mode');
            else btn.classList.remove('active-mode');
        });
    }
}
const reader = new Reader();

// --- Router & Views ---
async function router() {
    const hash = location.hash.slice(1) || '/';
    const params = hash.split('/').filter(Boolean);
    const app = document.getElementById('app');

    // Sidebar Close
    document.getElementById('sidebar').classList.add('hidden');

    if (params[0] === 'reader') {
        reader.open(params[1], params[2]);
        return;
    }

    document.getElementById('loader').classList.remove('hidden');
    window.scrollTo(0,0);

    try {
        if (hash === '/') {
            const data = await api.get('/home?page=1');
            app.innerHTML = `
                <h2 class="text-2xl font-bold mb-6 border-r-4 border-primary pr-3 dark:text-white">جدیدترین‌ها</h2>
                <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    ${data.items.map(cardTemplate).join('')}
                </div>`;
        } 
        else if (params[0] === 'manga') {
            const { manga } = await api.get(`/manga/${params[1]}`);
            const isSaved = State.user ? (await api.get('/user/bookmarks')).bookmarks?.some(b => b.slug === manga.slug) : false;
            
            app.innerHTML = `
                <div class="bg-white dark:bg-dark-surface rounded-2xl p-6 shadow-xl mb-6 md:flex gap-8 relative overflow-hidden">
                    <div class="absolute inset-0 bg-cover bg-center blur-2xl opacity-10" style="background-image:url('${manga.cover}')"></div>
                    <div class="relative w-48 mx-auto md:mx-0 shrink-0 rounded-lg overflow-hidden shadow-2xl">
                        <img src="${manga.cover}" class="w-full h-full object-cover">
                    </div>
                    <div class="relative flex-1 mt-6 md:mt-0 text-center md:text-right">
                        <h1 class="text-3xl font-black mb-4 dark:text-white">${manga.title}</h1>
                        <div class="flex flex-wrap justify-center md:justify-start gap-2 mb-4">
                            ${manga.genres.map(g => `<span class="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold">${g}</span>`).join('')}
                        </div>
                        <p class="text-gray-500 dark:text-gray-400 mb-6 line-clamp-3">${manga.description || 'توضیحات ندارد'}</p>
                        <div class="flex justify-center md:justify-start gap-3">
                            <button onclick="bookmark('${manga.slug}', '${manga.title}', '${manga.cover}')" class="bg-gray-200 dark:bg-white/10 text-gray-800 dark:text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-secondary hover:text-white transition">
                                <i class="${isSaved ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
                            </button>
                        </div>
                    </div>
                </div>
                <div class="bg-white dark:bg-dark-surface rounded-2xl p-6 shadow-lg">
                    <h3 class="font-bold mb-4 dark:text-white">فصل‌ها</h3>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-3 max-h-96 overflow-y-auto pr-2">
                        ${manga.chapters.map(c => `
                            <a href="#/reader/${manga.slug}/${c.chapterId}" class="block p-3 bg-gray-100 dark:bg-dark-card rounded-lg hover:bg-primary hover:text-white transition flex justify-between">
                                <span>فصل ${c.chapterId}</span>
                                <span class="text-xs opacity-60">${c.title}</span>
                            </a>
                        `).join('')}
                    </div>
                </div>`;
        }
        else if (params[0] === 'profile') {
            if (!State.user) return location.hash = '/';
            const { bookmarks } = await api.get('/user/bookmarks');
            app.innerHTML = `
                <div class="bg-gradient-to-r from-primary to-secondary p-8 rounded-2xl text-white mb-8 shadow-lg flex justify-between items-center">
                    <h1 class="text-3xl font-bold">${State.user.username}</h1>
                    <button onclick="State.logout()" class="bg-white/20 px-4 py-2 rounded-lg backdrop-blur">خروج</button>
                </div>
                <h3 class="text-xl font-bold mb-4 dark:text-white">نشان‌شده‌ها</h3>
                <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
                    ${bookmarks.map(b => cardTemplate({link: `/m/${b.slug}`, ...b})).join('')}
                </div>`;
        }
    } catch (e) {
        console.error(e);
        app.innerHTML = `<div class="text-center py-20 text-red-500">خطا در دریافت اطلاعات</div>`;
    }
    document.getElementById('loader').classList.add('hidden');
}

function cardTemplate(item) {
    const slug = item.link ? item.link.split('/').filter(Boolean).pop() : item.slug;
    return `
    <a href="#/manga/${slug}" class="manga-card block bg-white dark:bg-dark-surface rounded-xl overflow-hidden shadow-md group relative">
        <div class="aspect-[2/3] overflow-hidden">
            <img src="${item.cover}" class="w-full h-full object-cover transition duration-500 group-hover:scale-110" loading="lazy">
        </div>
        <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
            <h4 class="text-white font-bold text-sm text-shadow">${item.title}</h4>
        </div>
    </a>`;
}

window.bookmark = async (slug, title, cover) => {
    if (!State.user) return showAuth();
    await api.post('/user/bookmark', { slug, title, cover });
    router(); // refresh
};

// --- Auth UI ---
const authModal = document.getElementById('auth-modal');
const showAuth = () => {
    authModal.classList.remove('hidden');
    setTimeout(() => authModal.classList.remove('opacity-0'), 10);
};
document.getElementById('auth-close').onclick = () => {
    authModal.classList.add('opacity-0');
    setTimeout(() => authModal.classList.add('hidden'), 300);
};

let isLogin = true;
document.getElementById('auth-switch').onclick = () => {
    isLogin = !isLogin;
    document.getElementById('auth-title').innerText = isLogin ? 'ورود' : 'ثبت نام';
    document.querySelector('#auth-form button').innerText = isLogin ? 'ورود' : 'ثبت نام';
};

document.getElementById('auth-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd);
    const res = await api.post(isLogin ? '/auth/login' : '/auth/register', data);
    
    if (res.ok) {
        State.login(res.token, res.username);
    } else {
        alert(res.error || 'خطا');
    }
};

// --- Init ---
window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', () => {
    router();
    
    // Auth Check
    const authArea = document.getElementById('auth-area');
    if (State.user) {
        authArea.innerHTML = `<a href="#/profile" class="w-9 h-9 bg-primary rounded-full flex items-center justify-center text-white font-bold">${State.user.username[0].toUpperCase()}</a>`;
        document.querySelectorAll('.auth-req').forEach(el => el.classList.remove('hidden'));
    } else {
        authArea.innerHTML = `<button onclick="showAuth()" class="bg-primary/10 text-primary px-4 py-2 rounded-lg font-bold text-sm">ورود</button>`;
    }

    // Sidebar
    document.getElementById('mobile-menu-btn').onclick = () => {
        const sb = document.getElementById('sidebar');
        sb.classList.remove('hidden');
        setTimeout(() => {
            sb.classList.remove('opacity-0');
            sb.children[0].classList.remove('translate-x-full');
        }, 10);
    };
    document.getElementById('close-sidebar').onclick = () => {
        const sb = document.getElementById('sidebar');
        sb.children[0].classList.add('translate-x-full');
        sb.classList.add('opacity-0');
        setTimeout(() => sb.classList.add('hidden'), 300);
    };
});
