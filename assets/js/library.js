/**
 * 吴承学著作文库 - 主页面逻辑（v4 — 干净版）
 *
 * 架构：
 *   - 只展示 library.jpg，不在上面叠任何装饰
 *   - 加载 scenes.json，根据图片实际渲染位置（contain 后）定位热区
 *   - 点"关键词检索"热区 → 弹搜索 modal
 *   - 点书热区 → 全屏 EPUB 阅读器（覆盖层）
 *   - 右下角迷你"退出"按钮
 */

(function () {
    'use strict';

    const STORAGE_KEY = 'wcx_library_authed';

    // === 鉴权 ===
    if (localStorage.getItem(STORAGE_KEY) !== '1') {
        window.location.replace('index.html');
        return;
    }

    const books = window.WCX_BOOKS || [];

    // === DOM 引用 ===
    const $ = (s) => document.querySelector(s);
    const bgEl = $('#bg');
    const layerEl = $('#hotspotLayer');
    const logoutBtn = $('#logoutBtn');
    const backBtn = $('#backBtn');

    const searchOverlay = $('#searchOverlay');
    const searchForm = $('#searchForm');
    const searchInput = $('#searchInput');
    const searchClear = $('#searchClear');
    const searchResultsEl = $('#searchResults');

    const toastEl = $('#toast');

    // 阅读器
    const readerOverlay = $('#readerOverlay');
    const readerTitle = $('#readerTitle');
    const readerContainer = $('#readerContainer');
    const readerProgressBar = $('#readerProgressBar');
    const readerTocBtn = $('#readerToc');
    const readerTocPanel = $('#readerTocPanel');
    const tocList = $('#tocList');
    const readerPrevBtn = $('#readerPrev');
    const readerNextBtn = $('#readerNext');

    let currentBook = null;
    let epubBook = null;
    let epubRendition = null;
    let epubIndex = null;

    // === 当前场景状态 ===
    let sceneHotspots = [];
    let naturalW = 8001;
    let naturalH = 4501;

    // ============== 初始化：加载 scenes.json ==============
    (async () => {
        try {
            const resp = await fetch('assets/data/scenes.json');
            if (!resp.ok) throw new Error('scenes.json 加载失败');
            const data = await resp.json();
            const scene = data.scenes && data.scenes.library;
            if (!scene) throw new Error('未找到 library scene');
            sceneHotspots = scene.hotspots || [];
            if (scene.naturalSize) {
                naturalW = scene.naturalSize.width;
                naturalH = scene.naturalSize.height;
            }
            layoutHotspots();
        } catch (err) {
            console.error(err);
            layerEl.innerHTML = '<p style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);color:#b8392f;background:rgba(255,250,235,0.95);padding:10px 20px;border-radius:2px;font-family:serif;">场景配置加载失败</p>';
        }
    })();

    function ready() { layoutHotspots(); }
    if (document.readyState === 'complete') ready();
    else window.addEventListener('load', ready);
    window.addEventListener('resize', layoutHotspots);

    /**
     * 核心：图片 contain 后会有留白，把热区从"原始像素坐标"换算到"屏幕像素坐标"
     */
    function layoutHotspots() {
        const rect = bgEl.getBoundingClientRect();
        const containerW = rect.width;
        const containerH = rect.height;
        if (containerW === 0 || containerH === 0) return;

        const imgAspect = naturalW / naturalH;
        const containerAspect = containerW / containerH;

        let renderW, renderH, offsetX, offsetY;
        if (imgAspect > containerAspect) {
            renderW = containerW;
            renderH = containerW / imgAspect;
            offsetX = 0;
            offsetY = (containerH - renderH) / 2;
        } else {
            renderH = containerH;
            renderW = containerH * imgAspect;
            offsetX = (containerW - renderW) / 2;
            offsetY = 0;
        }

        // 只清空动态生成的 hotspot 元素，保留 search-overlay 等静态子元素
        layerEl.querySelectorAll('.hotspot').forEach((el) => el.remove());

        sceneHotspots.forEach((hs) => {
            // search-inline 类型不生成 hotspot，由 layoutSearchOverlay 处理
            if (hs.action === 'search-inline') {
                layoutSearchOverlay(hs, renderW, renderH, offsetX, offsetY);
                return;
            }
            const el = document.createElement('div');
            el.className = 'hotspot' + (hs.type === 'action' ? ' action' : '');
            el.dataset.id = hs.id || '';
            el.style.left = (offsetX + (hs.x / naturalW) * renderW) + 'px';
            el.style.top = (offsetY + (hs.y / naturalH) * renderH) + 'px';
            el.style.width = ((hs.w / naturalW) * renderW) + 'px';
            el.style.height = ((hs.h / naturalH) * renderH) + 'px';
            el.addEventListener('click', () => onHotspotClick(hs));
            layerEl.appendChild(el);
        });
    }

    function layoutSearchOverlay(hs, renderW, renderH, offsetX, offsetY) {
        searchOverlay.style.left = (offsetX + (hs.x / naturalW) * renderW) + 'px';
        searchOverlay.style.top = (offsetY + (hs.y / naturalH) * renderH) + 'px';
        searchOverlay.style.width = ((hs.w / naturalW) * renderW) + 'px';
        // 高度保证至少 46px，确保 input 有合理可用的输入区
        const calcH = (hs.h / naturalH) * renderH;
        searchOverlay.style.height = Math.max(calcH, 46) + 'px';
        searchOverlay.classList.add('is-ready');
    }

    function onHotspotClick(hs) {
        // search-inline 类型不通过 click 触发（搜索框直接显示在图上）
        if (hs.action === 'search-inline') return;
        if (hs.type === 'book') {
            onBookHotspotClick(hs);
            return;
        }
    }

    function onBookHotspotClick(hs) {
        const book = matchBookByHotspot(hs);
        const available = (typeof hs.available === 'boolean') ? hs.available : (book ? book.available : false);

        if (!book) {
            showToast('《' + (hs.title || '未命名') + '》尚未收录到书库');
            return;
        }
        if (!available) {
            openModal('《' + book.title + '》', '该书电子版尚在筹备中，敬请期待。');
            return;
        }
        openReader(book);
    }

    // 匹配 books.js
    function matchBookByHotspot(hs) {
        let book = hs.id ? books.find((b) => b.id === hs.id) : null;
        if (!book && hs.title) {
            const norm = (s) => String(s || '').replace(/[\s\-_·,，。.、《》（）()【】:：]/g, '');
            const t = norm(hs.title);
            book = books.find((b) => {
                const bt = norm(b.title);
                return bt && (bt.includes(t) || t.includes(bt));
            });
        }
        return book;
    }

    // ============== 退出登录 ==============
    function doLogout() {
        if (!confirm('确定要退出登录吗？')) return;
        localStorage.removeItem(STORAGE_KEY);
        window.location.href = 'index.html';
    }
    logoutBtn.addEventListener('click', doLogout);

    // ============== 搜索（直接显示在图上，不需要 modal） ==============
    let searchDebounce = null;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchDebounce);
        const v = searchInput.value.trim();
        searchClear.classList.toggle('hidden', !v);
        searchDebounce = setTimeout(() => searchBooks(v), 220);
    });

    searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        searchBooks(searchInput.value.trim());
    });

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            searchBooks(searchInput.value.trim());
        }
    });

    searchClear.addEventListener('click', () => {
        searchInput.value = '';
        searchClear.classList.add('hidden');
        searchResultsEl.innerHTML = '';
        searchResultsEl.classList.add('hidden');
        searchInput.focus();
    });

    function searchBooks(keyword) {
        const kw = (keyword || '').trim().toLowerCase();
        if (!kw) {
            searchResultsEl.innerHTML = '';
            searchResultsEl.classList.add('hidden');
            return;
        }
        const metaHits = books.filter((b) => matchBookMeta(b, kw));

        const sectionHits = [];
        if (epubIndex) {
            Object.keys(epubIndex).forEach((bookId) => {
                const book = books.find((b) => b.id === bookId);
                if (!book) return;
                epubIndex[bookId].forEach((entry) => {
                    const lower = entry.text.toLowerCase();
                    let idx = lower.indexOf(kw);
                    if (idx === -1) return;
                    const snippets = [];
                    while (idx !== -1 && snippets.length < 3) {
                        const start = Math.max(0, idx - 30);
                        const end = Math.min(entry.text.length, idx + kw.length + 40);
                        snippets.push(entry.text.slice(start, end));
                        idx = lower.indexOf(kw, idx + kw.length);
                    }
                    sectionHits.push({
                        bookId: book.id,
                        bookTitle: book.title,
                        chapter: entry.chapter,
                        snippets,
                        available: book.available,
                        href: entry.href,
                    });
                });
            });
        }

        renderSearchResults(kw, metaHits, sectionHits);
    }

    function matchBookMeta(book, kw) {
        const fields = [
            book.title, book.subtitle, book.author, book.publisher,
            book.summary, (book.tags || []).join(' '),
        ].filter(Boolean).join(' ').toLowerCase();
        return fields.includes(kw);
    }

    function renderSearchResults(keyword, metaHits, sectionHits) {
        searchResultsEl.classList.remove('hidden');
        let html = '';
        if (metaHits.length === 0 && sectionHits.length === 0) {
            html = '<div class="empty">没有匹配的结果</div>';
        } else {
            html += '<div class="meta">检索「<strong>' + escapeHtml(keyword) + '</strong>」 · 命中 ' + metaHits.length + ' 部著作' + (sectionHits.length ? ' · 正文 ' + sectionHits.length + ' 处' : '') + '</div>';
            if (sectionHits.length) {
                html += '<div class="results-title">正文片段</div><ul class="results-list">';
                sectionHits.forEach((h) => {
                    const snippetHtml = h.snippets.map((s) => highlight(s, keyword)).join(' …… ');
                    html += '<li class="result-item" data-book-id="' + escapeHtml(h.bookId) + '" data-href="' + escapeHtml(h.href || '') + '" data-available="' + (h.available ? '1' : '0') + '" data-keyword="' + escapeHtml(keyword) + '">' +
                        '<div class="result-book">' + escapeHtml(h.bookTitle) + '<br><span style="font-size:11px;color:var(--ink-faint)">' + escapeHtml(h.chapter || '') + '</span></div>' +
                        '<div class="result-chapter">' + snippetHtml + '</div>' +
                        '</li>';
                });
                html += '</ul>';
            }
        }
        searchResultsEl.innerHTML = html;
        searchResultsEl.querySelectorAll('.result-item').forEach((li) => {
            li.addEventListener('click', () => {
                const id = li.dataset.bookId;
                const href = li.dataset.href;
                const available = li.dataset.available === '1';
                const kw = li.dataset.keyword;
                if (!available) {
                    showToast('该书暂未上线阅读');
                    return;
                }
                const book = books.find((b) => b.id === id);
                if (book) {
                    // 关闭搜索结果浮层（不是 modal）
                    searchResultsEl.classList.add('hidden');
                    searchInput.value = '';
                    searchClear.classList.add('hidden');
                    openReader(book, { href: href, keyword: kw });
                }
            });
        });
    }

    function highlight(text, keyword) {
        const safe = escapeHtml(text);
        const safeKw = escapeHtml(keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return safe.replace(new RegExp(safeKw, 'gi'), (m) => '<mark>' + m + '</mark>');
    }

    // ============== EPUB 内容索引 ==============
    async function buildEpubIndex(book) {
        if (!book.available || !book.epub) return;
        if (epubIndex && epubIndex[book.id]) return;

        try {
            const b = ePub(book.epub);
            await b.ready;
            const entries = [];
            const spine = b.spine;
            const nav = (await b.navigation?.toc) || [];
            const tocByHref = {};
            nav.forEach((n) => {
                tocByHref[n.href.split('#')[0]] = n.label;
            });

            for (const item of spine.spineItems) {
                try {
                    const doc = await item.load(b.load.bind(b));
                    const text = (doc.textContent || '').replace(/\s+/g, ' ').trim();
                    if (text.length > 50) {
                        const chapter = tocByHref[item.href.split('#')[0]] || item.href;
                        entries.push({ chapter, text, href: item.href });
                    }
                } catch (err) {
                    console.warn('章节加载失败', item.href, err);
                }
            }

            epubIndex = epubIndex || {};
            epubIndex[book.id] = entries;
        } catch (err) {
            console.warn('EPUB 索引失败', book.id, err);
        }
    }

    // ============== 全屏阅读器 ==============
    async function openReader(book, opts = {}) {
        currentBook = book;
        readerTitle.textContent = book.title;
        readerOverlay.classList.remove('hidden');
        readerOverlay.setAttribute('aria-hidden', 'false');
        readerContainer.innerHTML = '<div class="reader-placeholder"><p class="placeholder-text">正在加载书籍内容…</p></div>';

        try {
            if (epubBook) {
                try { epubBook.destroy(); } catch (_) {}
                epubBook = null;
                epubRendition = null;
            }

            epubBook = ePub(book.epub);
            await epubBook.ready;

            epubRendition = epubBook.renderTo(readerContainer, {
                width: '100%',
                height: '100%',
                spread: 'none',
                manager: 'default',
                flow: 'paginated',
                snap: true,
            });

            epubRendition.themes.fontSize('110%');
            epubRendition.themes.override('color', '#2b2723', true);
            epubRendition.themes.override('background', '#f8f2e3', true);
            epubRendition.themes.override('line-height', '1.9', true);
            epubRendition.themes.override('font-family', 'Noto Serif SC, Songti SC, serif', true);

            if (opts.href) {
                try {
                    await epubRendition.display(opts.href);
                    if (opts.keyword) {
                        setTimeout(() => highlightInReader(opts.keyword), 300);
                    }
                } catch (e) {
                    await epubRendition.display();
                }
            } else {
                await epubRendition.display();
            }

            epubRendition.on('relocated', (loc) => {
                const pct = loc && loc.start && loc.start.percentage
                    ? Math.round(loc.start.percentage * 100)
                    : 0;
                readerProgressBar.style.width = pct + '%';
                highlightCurrentChapter(loc?.start?.href);
            });

            const keyHandler = (e) => {
                if (readerOverlay.classList.contains('hidden')) return;
                if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
                    epubRendition?.prev();
                } else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
                    epubRendition?.next();
                    e.preventDefault();
                } else if (e.key === 'Escape') {
                    closeReader();
                }
            };
            readerOverlay._keyHandler && document.removeEventListener('keydown', readerOverlay._keyHandler);
            readerOverlay._keyHandler = keyHandler;
            document.addEventListener('keydown', keyHandler);

            readerPrevBtn.onclick = () => epubRendition?.prev();
            readerNextBtn.onclick = () => epubRendition?.next();

            await renderToc();

            buildEpubIndex(book);
        } catch (err) {
            console.error('打开阅读器失败', err);
            readerContainer.innerHTML = '<div class="reader-placeholder"><p class="placeholder-text">加载失败：' + escapeHtml(err.message || String(err)) + '</p></div>';
        }
    }

    async function renderToc() {
        tocList.innerHTML = '';
        if (!epubBook || !epubBook.navigation) return;
        const toc = epubBook.navigation.toc || [];
        const flatten = (items, depth = 1) => {
            items.forEach((item) => {
                const li = document.createElement('li');
                li.className = 'lv-' + depth;
                li.textContent = item.label;
                li.dataset.href = item.href;
                li.addEventListener('click', () => {
                    epubRendition.display(item.href);
                    readerTocPanel.classList.add('hidden');
                });
                tocList.appendChild(li);
                if (item.subitems && item.subitems.length) {
                    flatten(item.subitems, Math.min(depth + 1, 3));
                }
            });
        };
        flatten(toc);
    }

    let currentChapterHref = null;
    function highlightCurrentChapter(href) {
        if (!href) return;
        const base = href.split('#')[0];
        if (base === currentChapterHref) return;
        currentChapterHref = base;
        tocList.querySelectorAll('li').forEach((li) => {
            const liHref = (li.dataset.href || '').split('#')[0];
            li.classList.toggle('current', liHref === base);
        });
    }

    function highlightInReader(keyword) {
        try {
            const iframe = readerContainer.querySelector('iframe');
            if (!iframe) return;
            const doc = iframe.contentDocument;
            if (!doc) return;
            const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null, false);
            const range = doc.createRange();
            const nodes = [];
            let n;
            while ((n = walker.nextNode())) {
                if (n.nodeValue.toLowerCase().includes(keyword.toLowerCase())) {
                    nodes.push(n);
                }
            }
            if (nodes.length) {
                const node = nodes[0];
                const idx = node.nodeValue.toLowerCase().indexOf(keyword.toLowerCase());
                range.setStart(node, idx);
                range.setEnd(node, idx + keyword.length);
                const sel = iframe.contentWindow.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
                node.parentElement.scrollIntoView({ block: 'center' });
            }
        } catch (e) {
            console.warn('高亮失败', e);
        }
    }

    function closeReader() {
        readerOverlay.classList.add('hidden');
        readerOverlay.setAttribute('aria-hidden', 'true');
        if (epubRendition) {
            try { epubRendition.destroy(); } catch (_) {}
        }
        if (epubBook) {
            try { epubBook.destroy(); } catch (_) {}
        }
        epubRendition = null;
        epubBook = null;
        currentBook = null;
        setTimeout(() => {
            readerContainer.innerHTML = '<div class="reader-placeholder"><p class="placeholder-text">已关闭阅读器</p></div>';
        }, 200);
    }

    backBtn.addEventListener('click', closeReader);
    readerTocBtn.addEventListener('click', () => {
        readerTocPanel.classList.toggle('hidden');
        readerTocBtn.classList.toggle('active');
    });

    // ============== Toast ==============
    let toastTimer = null;
    function showToast(text) {
        toastEl.textContent = text;
        toastEl.classList.remove('hidden');
        void toastEl.offsetWidth;
        toastEl.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            toastEl.classList.remove('show');
            setTimeout(() => toastEl.classList.add('hidden'), 300);
        }, 2200);
    }

    // ============== Modal（敬请期待等） ==============
    const modal = $('#modal');
    const modalTitle = $('#modalTitle');
    const modalContent = $('#modalContent');
    const modalOk = $('#modalOk');

    function openModal(title, content) {
        modalTitle.textContent = title;
        modalContent.innerHTML = content;
        modal.classList.remove('hidden');
    }
    function closeModal() {
        modal.classList.add('hidden');
    }
    modalOk.addEventListener('click', closeModal);
    modal.querySelectorAll('[data-modal-close]').forEach((el) => {
        el.addEventListener('click', closeModal);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            closeModal();
        }
    });

    // ============== 工具 ==============
    function escapeHtml(str) {
        return String(str || '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        })[c]);
    }

    // 预构建唯一可读书的索引（用于搜索正文片段）
    const availableBook = books.find((b) => b.available);
    if (availableBook) {
        setTimeout(() => buildEpubIndex(availableBook), 800);
    }
})();