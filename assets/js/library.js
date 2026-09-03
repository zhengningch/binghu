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
    const readerSettingsBtn = $('#readerSettings');
    const settingsModal = $('#settingsModal');
    const settingsOkBtn = $('#settingsOk');
    const settingsMask = $('#settingsMask');
    const readerPageInfo = $('#readerPageInfo');
    const pageJump = $('#pageJump');
    const pageJumpInput = $('#pageJumpInput');
    const pageJumpBtn = $('#pageJumpBtn');
    const pageJumpTotal = $('#pageJumpTotal');
    // 书内检索
    const readerSearchBtn = $('#readerSearch');
    const readerSearchPanel = $('#readerSearchPanel');
    const bookSearchInput = $('#bookSearchInput');
    const bookSearchStatus = $('#bookSearchStatus');
    const bookSearchList = $('#bookSearchList');

    let currentBook = null;
    let epubBook = null;
    let epubRendition = null;
    let epubIndex = null;

    // TXT 阅读器状态（支持多本 TXT）
    let txtStore = {}; // { bookId: { fullText, chapters } }
    let txtChapters = [];
    let txtCurrentChapter = 0;
    // 段落切分模式：'line' = 每行一段（xingtai-3.txt 的排版），'auto' = 空行优先/行回退
    let txtParagraphMode = 'auto';

    // PDF（原页渲染）阅读器状态
    let pdfStore = {}; // { bookId: { meta, toc, pages, pageTexts, pageCount } } —— OCR 文本索引，仅服务目录/检索
    let pdfBook = null; // 当前 pdf 书 { book, store }
    let pdfCurrentPage = 1;
    let pdfManifest = null; // { files, total, partSize } —— PDF 分片清单
    let pdfParts = {}; // partIdx -> Promise<PDFDocumentProxy>
    let pdfRecent = { partIdx: -1, doc: null }; // 最近打开的 PDF 文档（其余自动销毁）
    let pdfRenderTask = null; // 当前渲染任务（可取消）
    let pdfBusy = false; // 渲染进行中（翻页排队）
    let pdfPending = null; // 排队中的目标页码
    let pdfSearchKw = null; // 书内检索关键词：渲染原页后按 OCR 坐标画命中框
    const PDFJS_WORKER =
        'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
    if (window.pdfjsLib && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    }

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
        // PDF（OCR 逐页）正文搜索（多本）
        Object.keys(pdfStore).forEach((bookId) => {
            const book = books.find((b) => b.id === bookId);
            if (!book) return;
            const store = pdfStore[bookId];
            const pageTexts = store.pageTexts || [];
            let count = 0;
            for (let p = 0; p < pageTexts.length && count < 6; p++) {
                const lower = pageTexts[p].toLowerCase();
                const idx = lower.indexOf(kw);
                if (idx === -1) continue;
                const pageNo = p + 1;
                const start = Math.max(0, idx - 30);
                const end = Math.min(lower.length, idx + kw.length + 40);
                const snippet = pageTexts[p].slice(start, end);
                const title = pageTitleAt(store, pageNo);
                sectionHits.push({
                    bookId: bookId,
                    bookTitle: book.title,
                    chapter: (title ? title + ' · ' : '') + '第' + pageNo + '页',
                    snippets: [snippet],
                    available: book.available,
                    href: null,
                    page: pageNo,
                });
                count++;
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
                    html += '<li class="result-item" data-book-id="' + escapeHtml(h.bookId) + '" data-href="' + escapeHtml(h.href || '') + '" data-available="' + (h.available ? '1' : '0') + '" data-keyword="' + escapeHtml(keyword) + '"' + (h.txtPos != null ? ' data-txt-pos="' + h.txtPos + '"' : '') + (h.page != null ? ' data-page="' + h.page + '"' : '') + '>' +
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
                const page = li.dataset.page;
                if (!available) {
                    showToast('该书暂未上线阅读');
                    return;
                }
                const book = books.find((b) => b.id === id);
                if (book) {
                    searchResultsEl.classList.add('hidden');
                    searchInput.value = '';
                    searchClear.classList.add('hidden');
                    if (page != null) {
                        openReader(book, { page: parseInt(page, 10), keyword: kw });
                    } else if (txtPos != null) {
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
    const epubIndexBusy = {}; // bookId -> Promise（防止并发重复建索引）

    async function buildEpubIndex(book) {
        if (!book.available || !book.file) return;
        if (book.format !== 'epub') return;
        if (epubIndex && epubIndex[book.id]) return;
        if (epubIndexBusy[book.id]) return epubIndexBusy[book.id];
        epubIndexBusy[book.id] = doBuildEpubIndex(book);
        try {
            await epubIndexBusy[book.id];
        } finally {
            delete epubIndexBusy[book.id];
        }
    }

    async function doBuildEpubIndex(book) {
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

    // ============== PDF（OCR）索引 ==============
    async function buildPdfIndex(book) {
        if (!book.available || book.format !== 'pdf') return;
        if (pdfStore[book.id]) return;
        // OCR 文本单独放在 book.ocr（book.file 现指向 PDF 分片清单）
        const src = book.ocr || book.file;
        if (!src) return;
        try {
            const resp = await fetch(src);
            const data = await resp.json();
            const pages = data.pages || [];
            const pageTexts = pages.map((pg) => {
                const parts = [];
                (pg.b || []).forEach((blk) => {
                    if (blk && blk[1]) parts.push(blk[1]);
                });
                (pg.f || []).forEach((n) => parts.push(n));
                return parts.join(' ').replace(/\s+/g, ' ').trim();
            });
            pdfStore[book.id] = {
                meta: data.meta || {},
                toc: data.toc || [],
                pages,
                pageTexts,
                pageCount: pages.length,
                // OCR 输入图分辨率（全书恒定，供原页画框坐标换算）
                ocrW: (data.meta && data.meta.ocrW) || 913,
                ocrH: (data.meta && data.meta.ocrH) || 1338,
            };
        } catch (err) {
            console.warn('PDF 索引失败', book.id, err);
        }
    }

    // 定位某页所属的最近标题（用于结果/目录显示）
    function pageTitleAt(store, pageNo) {
        let title = '';
        (store.toc || []).forEach((item) => {
            if (item.p <= pageNo) title = item.t;
        });
        return title || '';
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
            } else if (book.format === 'pdf') {
                await openPdfReader(book, opts);
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
        // 显示通用控件（目录、设置、左右翻章按钮）
        readerTocBtn.style.display = '';
        readerSettingsBtn.style.display = '';
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
            // 统一用 scrolled-doc：每章独立 iframe，章节内滚动浏览
            // 左右按钮 = 翻章，上下方向键 = 章节内滚动
            flow: 'scrolled-doc',
            snap: true,
            // 关键：禁用 epub.js 的 dpr 缩放
            scale: 1.0,
        });

        epubRendition.themes.fontSize((localStorage.getItem('wcx_reader_fontsize') || '110') + '%');
        epubRendition.themes.override('color', '#2b2723', true);
        // 注意：不通过 themes.override 设 background，
        // 因为它会注入 inline `background:#f5ecd6 !important` shorthand，
        // 覆盖掉我们在 displayed 事件里注入的 background-image。
        // 背景色块由 wcx-paper-bg style 标签统一控制。
        epubRendition.themes.override('line-height', '2', true);
        // 正文统一系统宋体（iframe 内加载不到站点 @font-face 的 HYChangLiSong，
        // 显式走系统宋体栈，与 TXT 阅读正文保持一致；宋刻字只用于标题/目录）
        epubRendition.themes.override('font-family', '"Noto Serif SC", "Songti SC", "STSong", "Source Han Serif SC", "SimSun", serif', true);
        // 封面图强制自适应（epub.js 0.3 在高分屏会让封面图 max-width 算错导致溢出）
        epubRendition.themes.override('img', 'max-width: 100% !important; max-height: 100% !important; height: auto !important; width: auto !important; display: block; margin: 0 auto;', true);
        epubRendition.themes.override('h1.frontCover', 'display: flex; align-items: center; justify-content: center; height: 100%; margin: 0; padding: 0;', true);

        // 注入色块背景到 EPUB iframe 内部（必须在 display 之前注册 displayed 事件，
        // 否则第一次渲染的 displayed 事件会错过回调，导致背景不注入）
        const paperBgUrl = new URL('assets/img/paper-bg.png', window.location.href).href;
        const fontUrl = new URL('assets/fonts/HYCHANGLISONGKEBENTRUINGS.TTF', window.location.href).href;
        const injectBgIntoDoc = (doc) => {
            if (!doc || doc.getElementById('wcx-paper-bg')) return;
            const bgStyle = doc.createElement('style');
            bgStyle.id = 'wcx-paper-bg';
            bgStyle.textContent = 'html,body{background-color:#f5ecd6 !important;background-image:url(\'' + paperBgUrl + '\') !important;background-size:768px 384px !important;background-repeat:repeat !important;background-attachment:fixed !important;}';
            (doc.head || doc.documentElement).appendChild(bgStyle);
        };
        // 把微信读书 EPUB 中的注解 img 转为悬浮显示的 sup 标记
        // 原始格式：<img class="qqreader-footnote" alt="注释内容" src="../Images/note.png" />
        // 转换后：<sup class="fn-ref">[注]<span class="fn-tooltip">注释内容</span></sup>
        const injectReaderStyles = (doc) => {
            if (!doc || doc.getElementById('wcx-reader-fonts')) return;
            const style = doc.createElement('style');
            style.id = 'wcx-reader-fonts';
            style.textContent = [
                '@font-face {',
                '  font-family: "HYChangLiSong";',
                '  src: url("' + fontUrl + '") format("truetype");',
                '  font-weight: normal;',
                '  font-style: normal;',
                '  font-display: swap;',
                '}',
                'html, body, p, div, span, section, article, li, td, th, blockquote, figcaption, em, strong {',
                '  font-family: "Noto Serif SC", "Songti SC", "STSong", "Source Han Serif SC", "SimSun", serif !important;',
                '}',
                'h1, h2, h3, h4, h5, h6, .chapter-title, .part-title, .title {',
                '  font-family: "HYChangLiSong", "Noto Serif SC", "Songti SC", "STSong", serif !important;',
                '  font-weight: normal !important;',
                '}',
            ].join('\n');
            (doc.head || doc.documentElement).appendChild(style);
        };
        const convertFootnotes = (doc) => {
            if (!doc) return;
            // 注入 tooltip 样式（用 id 去重）
            if (!doc.getElementById('wcx-fn-style')) {
                const style = doc.createElement('style');
                style.id = 'wcx-fn-style';
                style.textContent = [
                    '.fn-ref{',
                    '  position:relative;',
                    '  display:inline-block;',
                    '  vertical-align:super;',
                    '  font-size:0.75em;',
                    '  color:#8b6f3a;',
                    '  cursor:pointer;',
                    '  margin:0 1px;',
                    '}',
                    '.fn-ref::before{content:"[";}',
                    '.fn-ref::after{content:"]";}',
                    '.fn-tooltip{',
                    '  position:absolute;',
                    '  bottom:1.5em;',
                    '  left:50%;',
                    '  transform:translateX(-50%);',
                    '  display:none;',
                    '  min-width:200px;',
                    '  max-width:340px;',
                    '  padding:8px 12px;',
                    '  background:#fff8e8;',
                    '  color:#3a3025;',
                    '  border:1px solid #c9a86b;',
                    '  border-radius:4px;',
                    '  box-shadow:0 2px 8px rgba(0,0,0,0.18);',
                    '  font-size:12px;',
                    '  line-height:1.55;',
                    '  font-weight:normal;',
                    '  white-space:normal;',
                    '  text-align:left;',
                    '  z-index:9999;',
                    '  pointer-events:none;',
                    '}',
                    '.fn-ref:hover .fn-tooltip,',
                    '.fn-ref.tapped .fn-tooltip{display:block;}',
                ].join('\n');
                (doc.head || doc.documentElement).appendChild(style);
            }
            // 转换所有未处理的 qqreader-footnote img
            const imgs = doc.querySelectorAll('img.qqreader-footnote:not([data-wcx-fn])');
            imgs.forEach((im) => {
                im.setAttribute('data-wcx-fn', 'done');
                const noteText = (im.getAttribute('alt') || '').trim();
                if (!noteText) return;
                const sup = doc.createElement('sup');
                sup.className = 'fn-ref';
                const span = doc.createElement('span');
                span.className = 'fn-tooltip';
                span.textContent = noteText;
                sup.appendChild(doc.createTextNode('注'));
                sup.appendChild(span);
                // 移动端 tap 切换
                sup.addEventListener('click', (e) => {
                    e.preventDefault();
                    sup.classList.toggle('tapped');
                });
                im.parentNode.replaceChild(sup, im);
            });
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
                    // 把微信读书的注解 img 转为悬浮 tooltip
                    convertFootnotes(doc);
                    // 统一字体：正文用系统宋体栈，标题用宋刻
                    injectReaderStyles(doc);
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
                    iframe.addEventListener('load', () => {
                        injectBgIntoDoc(iframe.contentDocument);
                        convertFootnotes(iframe.contentDocument);
                        injectReaderStyles(iframe.contentDocument);
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
                    convertFootnotes(doc);
                    injectReaderStyles(doc);
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
        // 《中国古代文体形态研究》排版为一行一段（连续行即自然段），用行切分；其余 TXT 走自动规则
        txtParagraphMode = (book.id === 'wenti-xingtai-3') ? 'line' : 'auto';
        // TXT 也显示左右翻章按钮（与 EPUB 统一）
        readerTocBtn.style.display = '';
        readerSettingsBtn.style.display = '';
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
        // - "总序/序/跋/自序/引言/凡例/前言/后记/附录/目录/绪论"
        // 排除目录项：目录行末尾带 （页码），如 "第一章先秦盟誓及其文化意蕴（5）"
        // 用 negative lookahead 确保标题行不以括号页码结尾
        const regex = /(^|\n)\s*(第[零一二三四五六七八九十百千0-9]+[章节篇卷]|总序|序|跋|自序|引言|凡例|前言|后记|附录|目录|绪论)(?![^\n]*[（(]\s*\d+\s*[)）])/g;
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

    // 把含 【注N】内容【/注】 标记的文本追加到 element
    // 标记转为悬浮注解 <sup class="fn-ref">注<span class="fn-tooltip">内容</span></sup>
    function appendTxtWithNotes(element, text) {
        const regex = /【注\d+】([\s\S]*?)【\/注】/g;
        let lastIdx = 0;
        let match;
        while ((match = regex.exec(text)) !== null) {
            // 标记前的纯文本
            if (match.index > lastIdx) {
                element.appendChild(document.createTextNode(text.slice(lastIdx, match.index)));
            }
            // 注解节点
            const sup = document.createElement('sup');
            sup.className = 'fn-ref';
            sup.textContent = '注';
            const span = document.createElement('span');
            span.className = 'fn-tooltip';
            span.textContent = match[1].trim();
            sup.appendChild(span);
            sup.addEventListener('click', (e) => {
                e.preventDefault();
                sup.classList.toggle('tapped');
            });
            element.appendChild(sup);
            lastIdx = match.index + match[0].length;
        }
        // 剩余纯文本
        if (lastIdx < text.length) {
            element.appendChild(document.createTextNode(text.slice(lastIdx)));
        }
    }

    // 把章节文本按段落切分：
    // mode='line'：每行视为独立段落（xingtai-3.txt：全书正文连续行即为自然段，空行仅装饰，
    //              若按空行合并会把无空行分隔的连续自然段错误合成一大段）
    // mode='auto'：优先按空行切分；无空行时每行一段（其余 TXT）
    function splitTxtParagraphs(chapterText, mode) {
        // 统一换行符：把 \r\n 和 \r 都转成 \n
        const text = chapterText.replace(/\r\n?/g, '\n');
        if (mode === 'line') {
            const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
            return lines.length > 0 ? lines : [text];
        }
        // 优先尝试空行分隔
        let parts = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
        if (parts.length > 1) return parts;
        // 没有空行分隔：每行视为独立段落（去掉行首缩进）
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        return lines.length > 0 ? lines : [text];
    }

    function renderTxtChapter(offset, keyword, hitOrdinal) {
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
        bodyEl.style.fontSize = (localStorage.getItem('wcx_reader_fontsize') || '110') + '%';
        // 按段落分割（xingtai-3 用 line 模式逐行成段，其余自动）
        const paragraphs = splitTxtParagraphs(ch.text, txtParagraphMode);
        paragraphs.forEach((p) => {
            const para = document.createElement('p');
            // 处理 【注N】内容【/注】 标记，转为悬浮注解
            appendTxtWithNotes(para, p);
            bodyEl.appendChild(para);
        });
        // 注入 TXT 注解 tooltip 样式
        if (!bodyEl.querySelector('#wcx-txt-fn-style')) {
            const style = document.createElement('style');
            style.id = 'wcx-txt-fn-style';
            style.textContent = [
                '.fn-ref{position:relative;display:inline-block;vertical-align:super;font-size:0.75em;color:#8b6f3a;cursor:pointer;margin:0 1px;}',
                '.fn-ref::before{content:"[";}',
                '.fn-ref::after{content:"]";}',
                '.fn-tooltip{position:absolute;bottom:1.5em;left:50%;transform:translateX(-50%);display:none;min-width:200px;max-width:340px;padding:8px 12px;background:#fff8e8;color:#3a3025;border:1px solid #c9a86b;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,0.18);font-size:12px;line-height:1.55;font-weight:normal;white-space:normal;text-align:left;z-index:9999;pointer-events:none;}',
                '.fn-ref:hover .fn-tooltip,.fn-ref.tapped .fn-tooltip{display:block;}',
            ].join('\n');
            bodyEl.appendChild(style);
        }
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
            setTimeout(() => highlightTextInContainer(bodyEl, keyword, hitOrdinal || 0), 100);
        }
    }

    function highlightTextInContainer(container, keyword, ordinal = 0) {
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
        const nodes = [];
        let n;
        while ((n = walker.nextNode())) {
            if (n.nodeValue.toLowerCase().includes(keyword.toLowerCase())) {
                nodes.push(n);
            }
        }
        if (nodes.length) {
            // ordinal：跳到第 ordinal+1 处命中（用于书内检索结果逐条定位）
            const node = nodes[Math.min(ordinal, nodes.length - 1)];
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

    // ---- PDF（pdf.js 原页渲染）阅读器 ----
    async function openPdfReader(book, opts = {}) {
        if (!window.pdfjsLib) {
            showToast('PDF 渲染组件加载失败，请检查网络');
            return;
        }
        pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
        // 工具栏：目录/翻页/页信息/页码跳转可用；字号设置对原页不适用，隐藏 ⚙
        readerTocBtn.style.display = '';
        readerSettingsBtn.style.display = 'none';
        readerPrevBtn.style.display = '';
        readerNextBtn.style.display = '';
        readerPageInfo.classList.remove('hidden');
        pageJump.classList.remove('hidden');

        if (!pdfStore[book.id]) {
            await buildPdfIndex(book); // OCR 文本索引（目录/检索）
        }
        pdfBook = { book: book, store: pdfStore[book.id] };

        // 读取分片清单
        try {
            const resp = await fetch(book.file);
            const m = await resp.json();
            pdfManifest = {
                files: m.files || [],
                total: m.total || 0,
                partSize: m.partSize || 25,
            };
        } catch (err) {
            readerContainer.innerHTML =
                '<div class="reader-placeholder"><p class="placeholder-text">PDF 分片清单加载失败，请检查网络</p></div>';
            return;
        }
        if (!pdfManifest.total || !pdfManifest.files.length) {
            readerContainer.innerHTML =
                '<div class="reader-placeholder"><p class="placeholder-text">PDF 分片数据为空</p></div>';
            return;
        }
        // 重新打开时重置文档缓存与渲染队列
        pdfParts = {};
        pdfRecent = { partIdx: -1, doc: null };
        pdfRenderTask = null;
        pdfBusy = false;
        pdfPending = null;

        pageJumpTotal.textContent = '/ ' + pdfManifest.total;
        let start = 1;
        if (opts.page != null) {
            const v = parseInt(opts.page, 10);
            if (v >= 1 && v <= pdfManifest.total) start = v;
        }
        pdfCurrentPage = start;
        // 书内检索关键词（打开时若带 keyword 则在该页画框，如从书库全文检索跳来）
        pdfSearchKw = opts.keyword ? String(opts.keyword) : null;
        renderPdfToc();
        setupKeyboardHandler();
        readerPrevBtn.onclick = () => gotoPdfPage(pdfCurrentPage - 1);
        readerNextBtn.onclick = () => gotoPdfPage(pdfCurrentPage + 1);
        if (opts.keyword) {
            showPdfHitBar(start, opts.keyword);
        }
        gotoPdfPage(start);
    }

    function gotoPdfPage(pageNo) {
        if (!pdfBook || !pdfManifest) return;
        let p = Math.floor(pageNo) || 1;
        if (p < 1) p = 1;
        if (p > pdfManifest.total) p = pdfManifest.total;
        pdfCurrentPage = p;
        renderPdfPage(p);
    }

    function partIndexFor(pageNo) {
        const i = Math.floor((pageNo - 1) / pdfManifest.partSize);
        return Math.max(0, Math.min(i, pdfManifest.files.length - 1));
    }

    async function loadPdfPart(partIdx) {
        if (pdfParts[partIdx]) return pdfParts[partIdx];
        const dir = (currentBook.file || '').replace(/[^/]*$/, '');
        const url = dir + pdfManifest.files[partIdx];
        const task = pdfjsLib.getDocument({ url: url });
        pdfParts[partIdx] = task.promise;
        try {
            await task.promise;
        } catch (err) {
            delete pdfParts[partIdx];
            throw err;
        }
        return task.promise;
    }

    async function ensurePdfDoc(partIdx) {
        const doc = await loadPdfPart(partIdx);
        if (pdfRecent.partIdx !== partIdx && pdfRecent.doc) {
            const old = pdfRecent.doc;
            pdfRecent.doc = null;
            try {
                old.destroy();
            } catch (e) { /* 忽略 */ }
        }
        pdfRecent.partIdx = partIdx;
        pdfRecent.doc = doc;
        return doc;
    }

    // 提前加载相邻分片，跨片翻页更顺滑
    async function prefetchPdfPart(partIdx) {
        if (!pdfManifest || partIdx < 0 || partIdx >= pdfManifest.files.length) return;
        if (pdfParts[partIdx]) return;
        loadPdfPart(partIdx).catch(() => {});
    }

    async function renderPdfPage(pageNo) {
        // 渲染进行中则排队（只保留最后一次请求）
        if (pdfBusy) {
            pdfPending = pageNo;
            return;
        }
        pdfBusy = true;
        pdfPending = null;
        try {
            readerPageInfo.textContent = '第 ' + pageNo + ' / ' + pdfManifest.total + ' 页';
            readerProgressBar.style.width = Math.round((pageNo / pdfManifest.total) * 100) + '%';
            highlightTocCurrent(pageNo);

            let root = document.getElementById('pdfReaderRoot');
            if (!root) {
                root = document.createElement('div');
                root.className = 'pdf-reader';
                root.id = 'pdfReaderRoot';
                readerContainer.innerHTML = '';
                readerContainer.appendChild(root);
            }
            let wrap = root.querySelector('.pdf-canvas-wrap');
            if (!wrap) {
                wrap = document.createElement('div');
                wrap.className = 'pdf-canvas-wrap';
                root.appendChild(wrap);
            }
            let card = wrap.querySelector('.pdf-canvas-card');
            if (!card) {
                card = document.createElement('div');
                card.className = 'pdf-canvas-card';
                wrap.appendChild(card);
            }
            if (pdfRenderTask) {
                try {
                    pdfRenderTask.cancel();
                } catch (e) { /* 忽略 */ }
                pdfRenderTask = null;
            }

            const partIdx = partIndexFor(pageNo);
            const pageWithin = pageNo - partIdx * pdfManifest.partSize;
            const loadEl = document.createElement('div');
            loadEl.className = 'pdf-loading';
            loadEl.textContent = '正在加载原页 ' + pageNo + ' …';
            card.appendChild(loadEl);

            try {
                const doc = await ensurePdfDoc(partIdx);
                if (pdfCurrentPage !== pageNo) return;
                const pdfPage = await doc.getPage(pageWithin);
                if (pdfCurrentPage !== pageNo) return;
                const vp1 = pdfPage.getViewport({ scale: 1 });
                const avail = root.clientWidth - 16;
                const cssW = Math.min(Math.max(avail, 300), 980);
                const dpr = Math.min(window.devicePixelRatio || 1, 2);
                const scale = (cssW / vp1.width) * dpr;
                const viewport = pdfPage.getViewport({ scale: scale });
                const canvas = document.createElement('canvas');
                canvas.width = Math.floor(viewport.width);
                canvas.height = Math.floor(viewport.height);
                canvas.style.width = cssW + 'px';
                canvas.style.maxWidth = '100%';
                const ctx = canvas.getContext('2d', { alpha: false });
                card.replaceChildren(canvas);
                pdfRenderTask = pdfPage.render({ canvasContext: ctx, viewport: viewport });
                await pdfRenderTask.promise;
                pdfRenderTask = null;
                prefetchPdfPart(partIdx + 1);
                // 书内检索：在当前原页上按 OCR 坐标画命中块框
                drawPdfHitBoxes(ctx, pageNo, canvas.width, canvas.height);
            } catch (err) {
                if (err && err.name === 'RenderingCancelledException') return;
                if (pdfCurrentPage === pageNo) {
                    card.replaceChildren();
                    const erEl = document.createElement('div');
                    erEl.className = 'pdf-loading';
                    erEl.textContent = '第 ' + pageNo + ' 页渲染失败，请检查网络后重试';
                    card.appendChild(erEl);
                }
            }
        } finally {
            pdfBusy = false;
            if (pdfPending != null) {
                const q = pdfPending;
                pdfPending = null;
                renderPdfPage(q);
            }
        }
    }

    // 书内检索：canvas 渲染完成后，按 OCR 像素坐标把命中文本块画上朱色框。
    // OCR 输入图分辨率恒定 ocrW x ocrH（见 build_xianqin_data.py / meta），
    // 直接把 OCR 像素坐标等比映射到 canvas 像素即可（OCR 输入图即 PDF 页渲染图）。
    function drawPdfHitBoxes(ctx, pageNo, cw, ch) {
        if (!pdfSearchKw || !pdfBook || !pdfBook.store) return 0;
        const store = pdfBook.store;
        const pg = store.pages && store.pages[pageNo - 1];
        const bl = pg && pg.bl;
        if (!bl || !bl.length) return 0;
        const ocrW = store.ocrW || 913;
        const ocrH = store.ocrH || 1338;
        const lowerKw = pdfSearchKw.toLowerCase();
        const kx = cw / ocrW;
        const ky = ch / ocrH;
        let n = 0;
        ctx.save();
        ctx.lineWidth = Math.max(1.5, cw / 1200);
        ctx.strokeStyle = 'rgba(184, 57, 47, 0.95)';
        ctx.fillStyle = 'rgba(214, 90, 79, 0.16)';
        bl.forEach((it) => {
            const text = String(it[4] || '').toLowerCase();
            if (!text.includes(lowerKw)) return;
            const x = it[0] * kx;
            const y = it[1] * ky;
            const w = (it[2] - it[0]) * kx;
            const h = (it[3] - it[1]) * ky;
            ctx.fillRect(x, y, w, h);
            ctx.strokeRect(x, y, w, h);
            n++;
        });
        ctx.restore();
        return n;
    }

    function renderPdfToc() {
        tocList.innerHTML = '';
        const toc = (pdfBook.store && pdfBook.store.toc) || [];
        toc.forEach((item) => {
            const li = document.createElement('li');
            const lv = Math.min(parseInt(item.l, 10) || 1, 3);
            li.className = 'lv-' + lv;
            const title = String(item.t || '').replace(/[①-⑳]+$/g, '').trim();
            li.textContent = title + '（第' + item.p + '页）';
            li.dataset.page = item.p;
            li.addEventListener('click', () => {
                gotoPdfPage(item.p);
                readerTocPanel.classList.add('hidden');
                readerTocBtn.classList.remove('active');
            });
            tocList.appendChild(li);
        });
        highlightTocCurrent(pdfCurrentPage);
    }

    let pdfHitTimer = null;

    function showPdfHitBar(pageNo, keyword) {
        const bar = document.getElementById('pdfHitBar');
        if (!bar) return;
        bar.innerHTML = '';
        const span = document.createElement('span');
        span.innerHTML =
            'OCR 检索：第 <b>' +
            pageNo +
            '</b> 页含有 “<b>' +
            escapeHtml(keyword) +
            '</b>”，已为你翻开原页（引文请以页面原貌为准）。';
        const close = document.createElement('i');
        close.className = 'pdf-hitbar-close';
        close.textContent = '✕';
        close.addEventListener('click', () => bar.classList.add('hidden'));
        bar.appendChild(span);
        bar.appendChild(close);
        bar.classList.remove('hidden');
        clearTimeout(pdfHitTimer);
        pdfHitTimer = setTimeout(() => bar.classList.add('hidden'), 10000);
    }

    function highlightTocCurrent(pageNo) {
        if (!tocList) return;
        const items = tocList.querySelectorAll('li[data-page]');
        let target = null;
        items.forEach((li) => {
            const p = parseInt(li.dataset.page, 10);
            if (!isNaN(p) && p <= pageNo) target = li;
        });
        items.forEach((li) => li.classList.remove('current'));
        if (target) target.classList.add('current');
    }

    // ---- 键盘处理（EPUB/TXT/PDF 统一）----
    function setupKeyboardHandler() {
        const keyHandler = (e) => {
            if (readerOverlay.classList.contains('hidden')) return;
            // 设置面板打开时不响应快捷键
            if (settingsModal && !settingsModal.classList.contains('hidden')) {
                if (e.key === 'Escape') {
                    settingsModal.classList.add('hidden');
                    e.preventDefault();
                }
                return;
            }
            // 统一交互：左右键 = 翻章，上下方向键 = 章节内滚动（默认行为，不拦截）
            if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
                if (currentBook && currentBook.format === 'pdf') {
                    gotoPdfPage(pdfCurrentPage - 1);
                } else if (currentBook && currentBook.format === 'txt') {
                    if (txtCurrentChapter > 0) {
                        txtCurrentChapter--;
                        renderTxtChapter();
                    }
                } else {
                    epubRendition?.prev();
                }
                e.preventDefault();
            } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
                if (currentBook && currentBook.format === 'pdf') {
                    gotoPdfPage(pdfCurrentPage + 1);
                } else if (currentBook && currentBook.format === 'txt') {
                    if (txtCurrentChapter < txtChapters.length - 1) {
                        txtCurrentChapter++;
                        renderTxtChapter();
                    }
                } else {
                    epubRendition?.next();
                }
                e.preventDefault();
            } else if (e.key === 'Escape') {
                // 先关检索面板，再关目录面板，最后关闭阅读器
                if (!readerSearchPanel.classList.contains('hidden')) {
                    readerSearchPanel.classList.add('hidden');
                    readerSearchBtn.classList.remove('active');
                } else if (!readerTocPanel.classList.contains('hidden')) {
                    readerTocPanel.classList.add('hidden');
                    readerTocBtn.classList.remove('active');
                } else {
                    closeReader();
                }
            }
            // ArrowUp/ArrowDown 不拦截，让浏览器自然滚动
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
        // 释放 PDF 文档与状态
        if (pdfRecent.doc) {
            try { pdfRecent.doc.destroy(); } catch (_) {}
        }
        pdfRecent = { partIdx: -1, doc: null };
        pdfParts = {};
        pdfRenderTask = null;
        pdfManifest = null;
        pdfBusy = false;
        pdfPending = null;
        pdfBook = null;
        // 重置书内检索面板
        clearTimeout(bookSearchTimer);
        bookSearchInput.value = '';
        bookSearchList.innerHTML = '';
        setBookSearchStatus('');
        readerSearchPanel.classList.add('hidden');
        readerSearchBtn.classList.remove('active');
        pdfSearchKw = null;
        const hitBar = document.getElementById('pdfHitBar');
        if (hitBar) hitBar.classList.add('hidden');
        currentBook = null;
        // 隐藏 PDF 专属控件
        readerPageInfo.classList.add('hidden');
        pageJump.classList.add('hidden');
        // 恢复控件显示
        readerTocBtn.style.display = '';
        readerSettingsBtn.style.display = '';
        readerPrevBtn.style.display = '';
        readerNextBtn.style.display = '';
        // 关闭可能打开的设置面板
        settingsModal.classList.add('hidden');
        setTimeout(() => {
            readerContainer.innerHTML = '<div class="reader-placeholder"><p class="placeholder-text">已关闭阅读器</p></div>';
        }, 200);
    }

    backBtn.addEventListener('click', closeReader);
    readerTocBtn.addEventListener('click', () => {
        readerTocPanel.classList.toggle('hidden');
        readerTocBtn.classList.toggle('active');
    });

    // ============== 书内检索（EPUB / TXT / PDF 原页） ==============
    let bookSearchTimer = null;

    readerSearchBtn.addEventListener('click', () => {
        const opening = readerSearchPanel.classList.contains('hidden');
        if (opening) {
            // 打开检索时收起目录面板，避免互相遮挡
            readerTocPanel.classList.add('hidden');
            readerTocBtn.classList.remove('active');
        }
        readerSearchPanel.classList.toggle('hidden');
        readerSearchBtn.classList.toggle('active');
        if (opening) {
            bookSearchInput.focus();
            if (bookSearchInput.value.trim()) runBookSearch(bookSearchInput.value);
        }
    });

    function setBookSearchStatus(text) {
        if (text) {
            bookSearchStatus.textContent = text;
            bookSearchStatus.classList.remove('hidden');
        } else {
            bookSearchStatus.textContent = '';
            bookSearchStatus.classList.add('hidden');
        }
    }

    function snippetAround(text, kw, from) {
        const s = String(text || '');
        const lower = s.toLowerCase();
        let i = from;
        if (i == null) i = lower.indexOf(String(kw || '').toLowerCase());
        if (i < 0) return s.slice(0, 80);
        const start = Math.max(0, i - 30);
        const end = Math.min(s.length, i + String(kw).length + 70);
        return (start > 0 ? '…' : '') + s.slice(start, end) + (end < s.length ? '…' : '');
    }

    function renderBookHits(items, note) {
        bookSearchList.innerHTML = '';
        setBookSearchStatus(note || '');
        if (!items.length) {
            const li = document.createElement('li');
            li.className = 'no-hits';
            li.textContent = '未找到相关内容，换个关键词试试';
            bookSearchList.appendChild(li);
            return;
        }
        items.forEach((it) => {
            const li = document.createElement('li');
            li.dataset.kind = it.kind;
            li.dataset.kw = it.kw;
            if (it.page != null) li.dataset.page = String(it.page);
            if (it.ci != null) li.dataset.ci = String(it.ci);
            if (it.ord != null) li.dataset.ord = String(it.ord);
            if (it.href) li.dataset.href = it.href;
            const meta = document.createElement('div');
            meta.className = 'bs-meta';
            meta.innerHTML = it.metaHtml;
            const sn = document.createElement('div');
            sn.className = 'bs-snippet';
            sn.innerHTML = it.snippetHtml;
            li.appendChild(meta);
            li.appendChild(sn);
            bookSearchList.appendChild(li);
        });
    }

    function runBookSearch(rawKw) {
        const kw = String(rawKw || '').trim();
        if (!currentBook || !currentBook.format) return;
        clearTimeout(bookSearchTimer);
        if (!kw) {
            bookSearchList.innerHTML = '';
            setBookSearchStatus('');
            if (currentBook.format === 'pdf') {
                // 清空关键词：重绘当前页去掉高亮框
                pdfSearchKw = null;
                if (pdfBook) gotoPdfPage(pdfCurrentPage);
            }
            return;
        }
        if (currentBook.format === 'pdf') return searchPdfBook(kw);
        if (currentBook.format === 'txt') return searchTxtBook(kw);
        if (currentBook.format === 'epub') return searchEpubBook(kw);
    }

    function searchPdfBook(kw) {
        const store = pdfBook && pdfBook.store;
        if (!store) {
            setBookSearchStatus('书籍索引尚未就绪，请稍后再试');
            return;
        }
        pdfSearchKw = kw;
        const lower = kw.toLowerCase();
        let totalHits = 0;
        for (const t of store.pageTexts) {
            if ((t || '').toLowerCase().includes(lower)) totalHits++;
        }
        const MAX = 60;
        const items = [];
        store.pageTexts.forEach((t, idx) => {
            if (items.length >= MAX) return;
            const text = t || '';
            if (!text.toLowerCase().includes(lower)) return;
            const pg = store.pages[idx] || {};
            let snip = '';
            const hitBl = (pg.bl || []).find((it) => String(it[4] || '').toLowerCase().includes(lower));
            if (hitBl) snip = snippetAround(hitBl[4], kw);
            else snip = snippetAround(text, kw);
            const title = pageTitleAt(store, idx + 1);
            items.push({
                kind: 'pdf',
                page: idx + 1,
                kw: kw,
                metaHtml: escapeHtml('第 ' + (idx + 1) + ' 页' + (title ? ' · ' + title : '')),
                snippetHtml: highlight(snip, kw),
            });
        });
        renderBookHits(
            items,
            totalHits
                ? totalHits > items.length
                    ? '共 ' + totalHits + ' 页命中，仅显示前 ' + items.length + ' 条'
                    : '共 ' + totalHits + ' 页命中'
                : ''
        );
        // 当前页也有命中时立即重绘，让框立刻可见
        const cur = (store.pageTexts[pdfCurrentPage - 1] || '').toLowerCase();
        if (cur.includes(lower)) gotoPdfPage(pdfCurrentPage);
    }

    function searchTxtBook(kw) {
        const store = txtStore[currentBook.id];
        if (!store) {
            setBookSearchStatus('文本索引尚未就绪，请稍后再试');
            return;
        }
        const lower = kw.toLowerCase();
        let totalHits = 0;
        store.chapters.forEach((ch) => {
            const lt = (ch.text || '').toLowerCase();
            let i = 0;
            while ((i = lt.indexOf(lower, i)) !== -1) {
                totalHits++;
                i += Math.max(lower.length, 1);
            }
        });
        const MAX = 80;
        const items = [];
        store.chapters.forEach((ch, ci) => {
            if (items.length >= MAX) return;
            const text = ch.text || '';
            const lt = text.toLowerCase();
            let idx = 0;
            let ord = 0;
            while (ord < 4 && (idx = lt.indexOf(lower, idx)) !== -1) {
                if (items.length >= MAX) break;
                items.push({
                    kind: 'txt',
                    ci: ci,
                    ord: ord,
                    kw: kw,
                    metaHtml: escapeHtml(ch.title || ('第 ' + (ci + 1) + ' 章')),
                    snippetHtml: highlight(snippetAround(text, kw, idx), kw),
                });
                idx += Math.max(lower.length, 1);
                ord++;
            }
        });
        renderBookHits(
            items,
            totalHits
                ? totalHits > items.length
                    ? '共 ' + totalHits + ' 处命中，仅显示前 ' + items.length + ' 条'
                    : '共 ' + totalHits + ' 处命中'
                : ''
        );
    }

    async function searchEpubBook(kw) {
        if (!epubIndex || !epubIndex[currentBook.id]) {
            setBookSearchStatus('正在索引本书全部章节，请稍候…');
            await buildEpubIndex(currentBook);
        }
        const entries = (epubIndex && epubIndex[currentBook.id]) || [];
        const lower = kw.toLowerCase();
        let totalHits = 0;
        entries.forEach((en) => {
            const lt = (en.text || '').toLowerCase();
            let i = 0;
            while ((i = lt.indexOf(lower, i)) !== -1) {
                totalHits++;
                i += Math.max(lower.length, 1);
            }
        });
        const MAX = 80;
        const items = [];
        for (const en of entries) {
            if (items.length >= MAX) break;
            const text = en.text || '';
            const lt = text.toLowerCase();
            let idx = 0;
            let c = 0;
            while (c < 4 && (idx = lt.indexOf(lower, idx)) !== -1) {
                items.push({
                    kind: 'epub',
                    href: en.href,
                    kw: kw,
                    metaHtml: escapeHtml(en.chapter || '章节'),
                    snippetHtml: highlight(snippetAround(text, kw, idx), kw),
                });
                idx += Math.max(lower.length, 1);
                c++;
            }
        }
        renderBookHits(
            items,
            totalHits
                ? totalHits > items.length
                    ? '全书共 ' + totalHits + ' 处命中，仅显示前 ' + items.length + ' 条'
                    : '全书共 ' + totalHits + ' 处命中'
                : ''
        );
    }

    async function jumpEpubHit(href, kw) {
        if (!epubRendition) return;
        try {
            if (href) await epubRendition.display(href);
            setTimeout(() => highlightInReader(kw), 350);
        } catch (err) {
            try {
                await epubRendition.display();
            } catch (_) { /* 忽略 */ }
            setTimeout(() => highlightInReader(kw), 350);
        }
    }

    bookSearchList.addEventListener('click', (e) => {
        const li = e.target.closest('li[data-kind]');
        if (!li || !currentBook) return;
        const kind = li.dataset.kind;
        const kw = li.dataset.kw || '';
        if (kind === 'pdf') {
            pdfSearchKw = kw;
            gotoPdfPage(parseInt(li.dataset.page, 10));
        } else if (kind === 'txt') {
            const ci = parseInt(li.dataset.ci, 10);
            const ord = parseInt(li.dataset.ord || '0', 10);
            if (ci >= 0 && ci < txtChapters.length) {
                txtCurrentChapter = ci;
                renderTxtChapter(0, kw, ord);
            }
        } else if (kind === 'epub') {
            jumpEpubHit(li.dataset.href, kw);
        }
    });

    bookSearchInput.addEventListener('input', () => {
        const kw = bookSearchInput.value.trim();
        clearTimeout(bookSearchTimer);
        if (!kw) {
            runBookSearch('');
            return;
        }
        bookSearchTimer = setTimeout(() => runBookSearch(kw), 300);
    });
    bookSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            clearTimeout(bookSearchTimer);
            runBookSearch(bookSearchInput.value.trim());
        }
    });

    // PDF 页码跳转
    function jumpByInput() {
        const v = parseInt(pageJumpInput.value, 10);
        if (!v || v < 1 || !pdfBook) return;
        const total = pdfBook.store.pageCount;
        gotoPdfPage(v > total ? total : v);
        pageJumpInput.value = '';
        readerTocPanel.classList.add('hidden');
        readerTocBtn.classList.remove('active');
    }
    pageJumpBtn.addEventListener('click', jumpByInput);
    pageJumpInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            jumpByInput();
        }
    });

    // ============== 阅读设置（字号）==============
    function updateSettingsUI() {
        const size = localStorage.getItem('wcx_reader_fontsize') || '110';
        const radio = document.querySelector(`input[name="fontSize"][value="${size}"]`);
        if (radio) radio.checked = true;
    }
    readerSettingsBtn.addEventListener('click', () => {
        updateSettingsUI();
        settingsModal.classList.remove('hidden');
    });
    settingsMask.addEventListener('click', () => {
        settingsModal.classList.add('hidden');
    });
    settingsOkBtn.addEventListener('click', async () => {
        const checked = document.querySelector('input[name="fontSize"]:checked');
        const size = checked ? checked.value : '110';
        localStorage.setItem('wcx_reader_fontsize', size);
        settingsModal.classList.add('hidden');
        // 应用字号
        if (epubRendition) {
            epubRendition.themes.fontSize(size + '%');
        }
        const txtBody = document.querySelector('.txt-chapter-body');
        if (txtBody) {
            txtBody.style.fontSize = size + '%';
        }
        const pdfBody = document.querySelector('.pdf-page-body');
        if (pdfBody) {
            pdfBody.style.fontSize = size + '%';
        }
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
            } else if (book.format === 'pdf') {
                buildPdfIndex(book);
            }
        }, 800 + i * 600);
    });
})();
