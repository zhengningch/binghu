/**
 * 吴承学著作文库 - 主页面逻辑
 * 搜索框 + 书籍用 HTML 组件渲染，不依赖热区坐标
 * 支持 EPUB 与 TXT 两种阅读格式
 */

(function () {
    'use strict';

    const STORAGE_KEY = 'wcx_library_authed';

    if (localStorage.getItem(STORAGE_KEY) !== '1') {
        window.location.replace('index.html');
        return;
    }

    const books = window.WCX_BOOKS || [];

    const $ = (s) => document.querySelector(s);
    const logoutBtn = $('#logoutBtn');
    const backBtn = $('#backBtn');

    const searchForm = $('#searchForm');
    const searchInput = $('#searchInput');
    const searchClear = $('#searchClear');
    const searchResultsEl = $('#searchResults');

    const booksShelf = $('#booksShelf');
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

    // TXT 阅读器状态（支持多本 TXT）
    let txtStore = {}; // { bookId: { fullText, chapters } }
    let txtChapters = [];
    let txtCurrentChapter = 0;

    // ============== 渲染书籍排列 ==============
    function renderBooks() {
        booksShelf.innerHTML = '';
        books.forEach((book) => {
            const div = document.createElement('div');
            div.className = 'book-item' + (book.available ? '' : ' unavailable');
            div.dataset.bookId = book.id;

            if (book.cover) {
                const img = document.createElement('img');
                img.src = book.cover;
                img.alt = book.title;
                img.draggable = false;
                div.appendChild(img);
            } else if (book.coverStyle) {
                const placeholder = document.createElement('div');
                placeholder.className = 'book-cover-placeholder';
                placeholder.style.background =
                    'linear-gradient(180deg, ' + book.coverStyle.top + ' 0%, ' + book.coverStyle.bottom + ' 100%)';
                const titleSpan = document.createElement('span');
                titleSpan.className = 'placeholder-title';
                titleSpan.textContent = book.title;
                placeholder.appendChild(titleSpan);
                div.appendChild(placeholder);
            }

            const label = document.createElement('div');
            label.className = 'book-title';
            label.textContent = book.title;
            div.appendChild(label);

            div.addEventListener('click', () => onBookClick(book.id));
            booksShelf.appendChild(div);
        });
    }

    function onBookClick(bookId) {
        const book = books.find((b) => b.id === bookId);
        if (!book) {
            showToast('该书尚未收录到书库');
            return;
        }
        if (!book.available) {
            openModal('《' + book.title + '》', '该书电子版尚在筹备中，敬请期待。');
            return;
        }
        openReader(book);
    }

    // ============== 退出登录 ==============
    function doLogout() {
        if (!confirm('确定要退出登录吗？')) return;
        localStorage.removeItem(STORAGE_KEY);
        window.location.href = 'index.html';
    }
    logoutBtn.addEventListener('click', doLogout);

    // ============== 搜索 ==============
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
        // EPUB 正文搜索
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
        // TXT 正文搜索（多本）
        Object.keys(txtStore).forEach((bookId) => {
            const book = books.find((b) => b.id === bookId);
            if (!book) return;
            const fullText = txtStore[bookId].fullText;
            const lower = fullText.toLowerCase();
            let idx = lower.indexOf(kw);
            let count = 0;
            while (idx !== -1 && count < 5) {
                const start = Math.max(0, idx - 30);
                const end = Math.min(fullText.length, idx + kw.length + 40);
                const snippet = fullText.slice(start, end);
                // 定位章节
                let chapterName = '正文';
                const chs = txtStore[bookId].chapters || [];
                for (let i = chs.length - 1; i >= 0; i--) {
                    if (chs[i].pos <= idx) {
                        chapterName = chs[i].title;
                        break;
                    }
                }
                sectionHits.push({
                    bookId: bookId,
                    bookTitle: book.title,
                    chapter: chapterName,
                    snippets: [snippet],
                    available: book.available,
                    href: null,
                    txtPos: idx,
                });
                count++;
                idx = lower.indexOf(kw, idx + kw.length);
            }
        });

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
                    html += '<li class="result-item" data-book-id="' + escapeHtml(h.bookId) + '" data-href="' + escapeHtml(h.href || '') + '" data-available="' + (h.available ? '1' : '0') + '" data-keyword="' + escapeHtml(keyword) + '"' + (h.txtPos != null ? ' data-txt-pos="' + h.txtPos + '"' : '') + '>' +
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
                const txtPos = li.dataset.txtPos;
                if (!available) {
                    showToast('该书暂未上线阅读');
                    return;
                }
                const book = books.find((b) => b.id === id);
                if (book) {
                    searchResultsEl.classList.add('hidden');
                    searchInput.value = '';
                    searchClear.classList.add('hidden');
                    if (txtPos != null) {
                        openReader(book, { txtPos: parseInt(txtPos), keyword: kw });
                    } else {
                        openReader(book, { href: href, keyword: kw });
                    }
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
        if (!book.available || !book.file) return;
        if (book.format !== 'epub') return;
        if (epubIndex && epubIndex[book.id]) return;

        try {
            const b = ePub(book.file);
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
            b.destroy();
        } catch (err) {
            console.warn('EPUB 索引失败', book.id, err);
        }
    }

    // ============== TXT 索引 ==============
    async function buildTxtIndex(book) {
        if (!book.available || book.format !== 'txt') return;
        if (txtStore[book.id]) return;
        try {
            const resp = await fetch(book.file);
            const fullText = await resp.text();
            const chapters = splitTxtChapters(fullText);
            txtStore[book.id] = { fullText, chapters };
        } catch (err) {
            console.warn('TXT 索引失败', book.id, err);
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
            if (book.format === 'txt') {
                await openTxtReader(book, opts);
            } else {
                await openEpubReader(book, opts);
            }
        } catch (err) {
            console.error('打开阅读器失败', err);
            readerContainer.innerHTML = '<div class="reader-placeholder"><p class="placeholder-text">加载失败：' + escapeHtml(err.message || String(err)) + '</p></div>';
        }
    }

    // ---- EPUB 阅读器 ----
    async function openEpubReader(book, opts = {}) {
        // 隐藏 TXT 专用控件
        readerTocBtn.style.display = '';
        readerPrevBtn.style.display = '';
        readerNextBtn.style.display = '';

        if (epubBook) {
            try { epubBook.destroy(); } catch (_) {}
            epubBook = null;
            epubRendition = null;
        }

        epubBook = ePub(book.file);
        await epubBook.ready;

        // epub.js 0.3 在高分屏 (devicePixelRatio>1) 会把传入宽度乘以 dpr，
        // 导致 view 实际渲染像素超出容器，出现"内容居中、两侧空白"的现象。
        // 这里直接传入容器逻辑尺寸（不放大），让 epub.js 按 CSS 像素渲染。
        const containerW = readerContainer.clientWidth;
        const containerH = readerContainer.clientHeight;
        epubRendition = epubBook.renderTo(readerContainer, {
            width: containerW,
            height: containerH,
            spread: 'none',
            manager: 'default',
            flow: 'paginated',
            snap: true,
            // 关键：禁用 epub.js 的 dpr 缩放
            scale: 1.0,
        });

        epubRendition.themes.fontSize('110%');
        epubRendition.themes.override('color', '#2b2723', true);
        // 注意：不通过 themes.override 设 background，
        // 因为它会注入 inline `background:#f5ecd6 !important` shorthand，
        // 覆盖掉我们在 displayed 事件里注入的 background-image。
        // 背景色块由 wcx-paper-bg style 标签统一控制。
        epubRendition.themes.override('line-height', '1.9', true);
        epubRendition.themes.override('font-family', 'HYChangLiSong, Noto Serif SC, Songti SC, serif', true);
        // 封面图强制自适应（epub.js 0.3 在高分屏会让封面图 max-width 算错导致溢出）
        epubRendition.themes.override('img', 'max-width: 100% !important; max-height: 100% !important; height: auto !important; width: auto !important; display: block; margin: 0 auto;', true);
        epubRendition.themes.override('h1.frontCover', 'display: flex; align-items: center; justify-content: center; height: 100%; margin: 0; padding: 0;', true);

        // 注入色块背景到 EPUB iframe 内部（必须在 display 之前注册 displayed 事件，
        // 否则第一次渲染的 displayed 事件会错过回调，导致背景不注入）
        const paperBgUrl = new URL('assets/img/paper-bg.png', window.location.href).href;
        const injectBgIntoDoc = (doc) => {
            if (!doc || doc.getElementById('wcx-paper-bg')) return;
            const bgStyle = doc.createElement('style');
            bgStyle.id = 'wcx-paper-bg';
            bgStyle.textContent = 'html,body{background-color:#f5ecd6 !important;background-image:url(\'' + paperBgUrl + '\') !important;background-size:768px 384px !important;background-repeat:repeat !important;background-attachment:fixed !important;}';
            (doc.head || doc.documentElement).appendChild(bgStyle);
        };
        const fixEpubIframe = () => {
            const ph = readerContainer.querySelector('.reader-placeholder');
            if (ph) ph.remove();
            const view = readerContainer.querySelector('[id^="epubjs-view"]');
            if (view) {
                view.style.setProperty('width', '100%', 'important');
                view.style.setProperty('height', '100%', 'important');
                view.style.setProperty('flex', '1 1 auto', 'important');
            }
            const container = readerContainer.querySelector('[id^="epubjs-container"]');
            if (container) {
                container.style.setProperty('width', '100%', 'important');
                container.style.setProperty('height', '100%', 'important');
            }
            readerContainer.querySelectorAll('iframe[id^="epubjs-view"]').forEach((iframe) => {
                iframe.style.setProperty('width', '100%', 'important');
                iframe.style.setProperty('height', '100%', 'important');
                const doc = iframe.contentDocument;
                if (doc && doc.readyState === 'complete') {
                    injectBgIntoDoc(doc);
                    const fc = doc.querySelector('h1.frontCover');
                    if (fc) {
                        fc.style.setProperty('display', 'flex', 'important');
                        fc.style.setProperty('align-items', 'center', 'important');
                        fc.style.setProperty('justify-content', 'center', 'important');
                        fc.style.setProperty('width', '100%', 'important');
                        fc.style.setProperty('height', '100%', 'important');
                        fc.style.setProperty('margin', '0', 'important');
                        fc.style.setProperty('padding', '0', 'important');
                    }
                    doc.querySelectorAll('img').forEach((im) => {
                        im.style.setProperty('max-width', '100%', 'important');
                        im.style.setProperty('max-height', '100%', 'important');
                        im.style.setProperty('width', 'auto', 'important');
                        im.style.setProperty('height', 'auto', 'important');
                    });
                } else {
                    // iframe 尚未就绪，等待 load 后再注入
                    iframe.addEventListener('load', () => {
                        injectBgIntoDoc(iframe.contentDocument);
                    });
                }
            });
        };
        epubRendition.on('displayed', fixEpubIframe);
        // epub.js 翻页时会重写 iframe contentDocument，导致已注入的 style 被清除。
        // 用 setInterval 轮询确保每次 contentDocument 被重置后都重新注入。
        const bgInterval = setInterval(() => {
            if (readerOverlay.classList.contains('hidden')) {
                clearInterval(bgInterval);
                return;
            }
            readerContainer.querySelectorAll('iframe[id^="epubjs-view"]').forEach((iframe) => {
                const doc = iframe.contentDocument;
                if (doc && doc.readyState === 'complete' && !doc.getElementById('wcx-paper-bg')) {
                    injectBgIntoDoc(doc);
                }
            });
        }, 300);
        readerOverlay._bgInterval = bgInterval;

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

        // display() 完成后兜底再注入一次（防止 displayed 事件时机问题）
        fixEpubIframe();

        // 窗口缩放时同步调整 rendition 尺寸
        const resizeHandler = () => {
            if (epubRendition && !readerOverlay.classList.contains('hidden')) {
                epubRendition.resize(readerContainer.clientWidth, readerContainer.clientHeight);
            }
        };
        window.addEventListener('resize', resizeHandler);
        readerOverlay._resizeHandler = resizeHandler;

        epubRendition.on('relocated', (loc) => {
            const pct = loc && loc.start && loc.start.percentage
                ? Math.round(loc.start.percentage * 100)
                : 0;
            readerProgressBar.style.width = pct + '%';
            highlightCurrentChapter(loc?.start?.href);
        });

        setupKeyboardHandler();
        readerPrevBtn.onclick = () => epubRendition?.prev();
        readerNextBtn.onclick = () => epubRendition?.next();

        await renderToc();
        buildEpubIndex(book);
    }

    // ---- TXT 阅读器 ----
    async function openTxtReader(book, opts = {}) {
        // 隐藏 EPUB 专用的目录/翻页按钮（TXT 用滚动）
        readerTocBtn.style.display = '';
        readerPrevBtn.style.display = '';
        readerNextBtn.style.display = '';

        if (!txtStore[book.id]) {
            await buildTxtIndex(book);
        }
        const store = txtStore[book.id];
        if (!store) {
            readerContainer.innerHTML = '<div class="reader-placeholder"><p class="placeholder-text">文本加载失败</p></div>';
            return;
        }
        txtChapters = store.chapters;

        let startChapter = 0;
        let startOffset = 0;
        if (opts.txtPos != null) {
            // 定位到包含该位置的章节
            for (let i = txtChapters.length - 1; i >= 0; i--) {
                if (txtChapters[i].pos <= opts.txtPos) {
                    startChapter = i;
                    startOffset = opts.txtPos - txtChapters[i].pos;
                    break;
                }
            }
        }
        txtCurrentChapter = startChapter;

        renderTxtChapter(startOffset, opts.keyword);
        renderTxtToc();
        setupKeyboardHandler();
        // TXT 上下章按钮
        readerPrevBtn.onclick = () => {
            if (txtCurrentChapter > 0) {
                txtCurrentChapter--;
                renderTxtChapter();
            }
        };
        readerNextBtn.onclick = () => {
            if (txtCurrentChapter < txtChapters.length - 1) {
                txtCurrentChapter++;
                renderTxtChapter();
            }
        };
        readerProgressBar.style.width = '0%';
    }

    function splitTxtChapters(text) {
        const chapters = [];
        // 匹配章节标题：
        // - "第N章/节/篇/卷"（N 支持中文数字和阿拉伯数字）
        // - "序/跋/自序/引言/凡例/前言/后记/附录"
        // 排除目录项：目录行末尾带 （页码），如 "第一章先秦盟誓及其文化意蕴（5）"
        // 用 negative lookahead 确保标题行不以括号页码结尾
        const regex = /(^|\n)\s*(第[零一二三四五六七八九十百千0-9]+[章节篇卷]|序|跋|自序|引言|凡例|前言|后记|附录)(?![^\n]*[（(]\s*\d+\s*[)）])/g;
        let lastTitle = '正文';
        let match;
        let bodyStart = 0;
        let started = false;

        while ((match = regex.exec(text)) !== null) {
            // 正则消耗的 match[0] 以 (^|\n)\s* 开头：跳过空白定位标题起点
            const localOffset = match[0].search(/\S/);
            const titleStart = match.index + (localOffset >= 0 ? localOffset : 0);
            const lineEnd = text.indexOf('\n', titleStart);
            const titleLine = text.slice(titleStart, lineEnd > -1 ? lineEnd : text.length);

            if (started) {
                // 保存上一章节（不含标题行）
                const chapterText = text.slice(bodyStart, titleStart);
                if (chapterText.trim().length > 0) {
                    chapters.push({
                        title: lastTitle,
                        text: chapterText,
                        pos: bodyStart,
                    });
                }
            }
            // 切换到新章节：标题行下一行
            lastTitle = titleLine.trim();
            bodyStart = lineEnd > -1 ? lineEnd + 1 : text.length;
            started = true;
        }
        // 最后一段
        if (bodyStart < text.length) {
            const tail = text.slice(bodyStart).trim();
            if (tail.length > 0) {
                chapters.push({
                    title: lastTitle,
                    text: text.slice(bodyStart),
                    pos: bodyStart,
                });
            }
        }
        if (chapters.length === 0) {
            chapters.push({ title: '全文', text: text, pos: 0 });
        }
        return chapters;
    }

    // 把章节文本按段落切分，支持两种分隔方式：
    // 1. 空行分隔（xingtai-3.txt 用此方式，可能是 \n\n 或 \r\n\r\n）
    // 2. 每行一段（zhiyongshenxia.txt 用此方式，段首 4 空格缩进标记新段）
    function splitTxtParagraphs(chapterText) {
        // 统一换行符：把 \r\n 和 \r 都转成 \n
        const text = chapterText.replace(/\r\n?/g, '\n');
        // 优先尝试空行分隔
        let parts = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
        if (parts.length > 1) return parts;
        // 没有空行分隔：每行视为独立段落（去掉行首缩进）
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        return lines.length > 0 ? lines : [text];
    }

    function renderTxtChapter(offset, keyword) {
        const ch = txtChapters[txtCurrentChapter];
        if (!ch) return;
        const container = document.createElement('div');
        container.className = 'txt-reader';

        const titleEl = document.createElement('h2');
        titleEl.className = 'txt-chapter-title';
        titleEl.textContent = ch.title;
        container.appendChild(titleEl);

        const bodyEl = document.createElement('div');
        bodyEl.className = 'txt-chapter-body';
        // 按段落分割（支持空行分隔和缩进分隔两种格式）
        const paragraphs = splitTxtParagraphs(ch.text);
        paragraphs.forEach((p) => {
            const para = document.createElement('p');
            para.textContent = p;
            bodyEl.appendChild(para);
        });
        container.appendChild(bodyEl);

        readerContainer.innerHTML = '';
        readerContainer.appendChild(container);

        // 更新进度条
        const totalChapters = txtChapters.length;
        const pct = Math.round((txtCurrentChapter + 1) / totalChapters * 100);
        readerProgressBar.style.width = pct + '%';

        // 定位到 offset
        if (offset && offset > 0) {
            setTimeout(() => {
                const allText = readerContainer.textContent || '';
                // 简单定位：找到包含 offset 位置的元素
                const walker = document.createTreeWalker(bodyEl, NodeFilter.SHOW_TEXT, null, false);
                let cumulative = 0;
                let node;
                while ((node = walker.nextNode())) {
                    const nextLen = node.nodeValue.length;
                    if (cumulative + nextLen >= offset) {
                        node.parentElement.scrollIntoView({ block: 'center' });
                        break;
                    }
                    cumulative += nextLen;
                }
            }, 50);
        }

        // 高亮关键词
        if (keyword) {
            setTimeout(() => highlightTextInContainer(bodyEl, keyword), 100);
        }
    }

    function highlightTextInContainer(container, keyword) {
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
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
            const range = document.createRange();
            range.setStart(node, idx);
            range.setEnd(node, idx + keyword.length);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            node.parentElement.scrollIntoView({ block: 'center' });
        }
    }

    function renderTxtToc() {
        tocList.innerHTML = '';
        txtChapters.forEach((ch, i) => {
            const li = document.createElement('li');
            li.className = 'lv-1' + (i === txtCurrentChapter ? ' current' : '');
            li.textContent = ch.title;
            li.addEventListener('click', () => {
                txtCurrentChapter = i;
                renderTxtChapter();
                readerTocPanel.classList.add('hidden');
                readerTocBtn.classList.remove('active');
            });
            tocList.appendChild(li);
        });
    }

    // ---- 键盘处理 ----
    function setupKeyboardHandler() {
        const keyHandler = (e) => {
            if (readerOverlay.classList.contains('hidden')) return;
            if (currentBook && currentBook.format === 'txt') {
                if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
                    if (txtCurrentChapter > 0) {
                        txtCurrentChapter--;
                        renderTxtChapter();
                    }
                } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
                    if (txtCurrentChapter < txtChapters.length - 1) {
                        txtCurrentChapter++;
                        renderTxtChapter();
                    }
                    e.preventDefault();
                } else if (e.key === 'Escape') {
                    closeReader();
                }
            } else {
                if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
                    epubRendition?.prev();
                } else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
                    epubRendition?.next();
                    e.preventDefault();
                } else if (e.key === 'Escape') {
                    closeReader();
                }
            }
        };
        readerOverlay._keyHandler && document.removeEventListener('keydown', readerOverlay._keyHandler);
        readerOverlay._keyHandler = keyHandler;
        document.addEventListener('keydown', keyHandler);
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
                    readerTocBtn.classList.remove('active');
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
        if (readerOverlay._resizeHandler) {
            window.removeEventListener('resize', readerOverlay._resizeHandler);
            readerOverlay._resizeHandler = null;
        }
        if (readerOverlay._bgInterval) {
            clearInterval(readerOverlay._bgInterval);
            readerOverlay._bgInterval = null;
        }
        if (epubRendition) {
            try { epubRendition.destroy(); } catch (_) {}
        }
        if (epubBook) {
            try { epubBook.destroy(); } catch (_) {}
        }
        epubRendition = null;
        epubBook = null;
        currentBook = null;
        // 恢复控件显示
        readerTocBtn.style.display = '';
        readerPrevBtn.style.display = '';
        readerNextBtn.style.display = '';
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

    // ============== Modal ==============
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

    // ============== 初始化 ==============
    renderBooks();

    // 预构建可读书的索引（用于搜索正文片段）
    books.filter((b) => b.available).forEach((book, i) => {
        setTimeout(() => {
            if (book.format === 'epub') {
                buildEpubIndex(book);
            } else if (book.format === 'txt') {
                buildTxtIndex(book);
            }
        }, 800 + i * 600);
    });
})();
