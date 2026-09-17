/**
 * 吴承学教授著述表 —— 渲染与交互
 *
 * 数据：assets/data/works.json（由 build_works_data.py 从《吴承学教授简介》docx 生成）
 * 入口：藏书楼右下角朱印；面板为仿古籍册页，四叶：著作 / 论文 / 文编 / 传略
 * 联动：著作中已收录电子版的，可一键跳转到本站阅读器
 */
(function () {
    'use strict';

    var DATA_URL = 'assets/data/works.json';
    var SEEN_KEY = 'wcx_works_seen';
    var STORAGE_KEY = 'wcx_library_authed';

    // 已有电子版的书（与 books.js 的 id 对应）
    var READABLE = [
        { re: /中国古代文体学研究/, id: 'wenti-xue-yanjiu' },
        { re: /中国古代文体形态研究/, id: 'wenti-xingtai-3' },
        { re: /冰壶秋月/, id: 'binghu-qiuyue' },
        { re: /旨永神遥明小品/, id: 'zhi-yong-shen-xia' },
        { re: /中国古代文体学史/, id: 'wenti-xueshi-1' }
    ];

    // 书影映射（assets/img/books/ 内已有图；缺图者用 CSS 仿古籍函套）
    var COVERS = [
        [/先秦两汉文体学史/, 'assets/img/books/cover-xianqin-removebg-preview.png'],
        [/中国古代文体学史/, 'assets/img/books/cover-wentishixue.jpg'],
        [/中国古代文体学研究/, 'assets/img/books/cover-wenti-zhonghua-dark.png'],
        [/中国古代文体形态研究/, 'assets/img/books/cover-xingtai-3.png'],
        [/冰壶秋月/, 'assets/img/books/cover-binghu.png'],
        [/旨永神遥明小品/, 'assets/img/books/cover-mingxiaopin.png'],
        [/近古文章与文体学研究/, 'assets/img/books/cover-jingu.jpg'],
        [/中国早期文体观念的发生/, 'assets/img/books/cover-zaoqi.jpg'],
        [/吴承学自选集/, 'assets/img/books/cover-zixuanji.jpg']
    ];

    var TABS = [
        { id: 'bio', label: '简　介', note: '' },
        { id: 'mono', label: '著　作', note: '' },
        { id: 'papers', label: '论　文', note: '编年' },
        { id: 'antho', label: '文　编', note: '编撰辑录' },
        { id: 'awards', label: '获　奖', note: '' }
    ];

    var data = null;
    var overlay = null;
    var built = false;

    var $ = function (sel, root) { return (root || document).querySelector(sel); };

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }

    function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    function hl(text, kw) {
        var e = esc(text);
        if (!kw) return e;
        try {
            return e.replace(new RegExp('(' + escRe(kw) + ')', 'gi'), '<mark>$1</mark>');
        } catch (err) { return e; }
    }

    // ---------------- 数据辅助 ----------------
    function litGroup(title) {
        var g = (data.literature.groups || []).filter(function (x) { return x.title === title; });
        return g[0] || null;
    }

    function researchSub(title) {
        var g = litGroup('研究成果');
        if (!g) return null;
        var s = (g.subs || []).filter(function (x) { return x.title.indexOf(title) >= 0; });
        return s[0] || null;
    }

    function readableOf(title) {
        for (var i = 0; i < READABLE.length; i++) {
            if (READABLE[i].re.test(title)) return READABLE[i].id;
        }
        return '';
    }

    function coverOf(title) {
        for (var i = 0; i < COVERS.length; i++) {
            if (COVERS[i][0].test(title)) return COVERS[i][1];
        }
        return '';
    }

    // ---------------- 渲染：牌记统计 ----------------
    function figureHTML(num, label) {
        return '<div class="works-figure"><span class="works-figure__num">' + num +
            '</span><span class="works-figure__label">' + label + '</span></div>';
    }

    function counts() {
        var monoSub = researchSub('著作');
        var bookTitles = {};
        (monoSub ? monoSub.items : []).forEach(function (it) { bookTitles[it.title] = 1; });

        var paperSub = researchSub('论文');
        var papers = 0;
        (paperSub ? paperSub.years : []).forEach(function (y) { papers += y.items.length; });

        var antho = 0;
        ['编著', '文献整理', '收录转载'].forEach(function (t) {
            var s = researchSub(t);
            if (s) antho += s.items.length;
        });
        ['序跋', '书评', '学术随笔'].forEach(function (t) {
            var g = litGroup(t);
            if (g) antho += g.items.length;
        });

        var awards = 0;
        (data.awards.groups || []).forEach(function (g) {
            awards += (g.items || []).length;
            (g.subs || []).forEach(function (s) { awards += (s.items || []).length; });
        });

        return {
            books: Object.keys(bookTitles).length,
            papers: papers,
            antho: antho,
            awards: awards,
            years: paperSub ? paperSub.years.length : 0
        };
    }

    // ---------------- 渲染：著作 ----------------
    function renderMono() {
        var sub = researchSub('著作');
        var items = sub ? sub.items : [];
        var grouped = {};
        items.forEach(function (it) {
            (grouped[it.title] = grouped[it.title] || []).push(it);
        });

        var list = Object.keys(grouped).map(function (title) {
            var vers = grouped[title].slice().sort(function (a, b) { return (+a.year || 0) - (+b.year || 0); });
            return { title: title, versions: vers };
        }).sort(function (a, b) {
            return (+a.versions[0].year || 0) - (+b.versions[0].year || 0);
        });

        return '<div class="works-list">' + list.map(function (book) {
            var bid = readableOf(book.title);
            var presses = book.versions.map(function (v) {
                return '<span>' + esc(v.publisher || '') + (v.year ? ' ' + esc(v.year) + '年' : '') +
                    (v.edition ? '<em>' + esc(v.edition) + '</em>' : '') + '</span>';
            }).join('');

            return '<div class="paper mono-item' + (bid ? ' mono-item--readable' : '') + '"' +
                (bid ? ' data-book="' + bid + '" tabindex="0" role="button" aria-label="在书库中定位《' + esc(book.title) + '》"' : '') + '>' +
                '<div class="paper__title">《' + esc(book.title) + '》</div>' +
                '<div class="paper__meta">' +
                (bid ? '<span class="mono__sign">文库可读</span>' : '') + presses +
                '</div>' +
                '</div>';
        }).join('') + '</div>';
    }

    // ---------------- 渲染：论文（编年） ----------------
    function paperHTML(it, kw) {
        if (it.label) {
            return '<div class="paper paper--label">' + esc(it.label) + '</div>';
        }
        var meta = [];
        if (it.venue) meta.push('<span class="paper__venue">《' + esc(it.venue) + '》</span>');
        if (it.issue) meta.push('<span>' + esc(it.issue) + '</span>');
        if (it.pages) meta.push('<span>第' + esc(it.pages) + '页</span>');
        if (it.signature) {
            meta.push('<span class="paper__sign">' +
                (it.signature.type === 'pseudonym' ? '署名 ' : '合著 ') + esc(it.signature.text) + '</span>');
        }
        // 编撰、序跋等条目：版次 / 出版社信息在 rest 里，补出来（去掉与 venue 重复的书名）
        var extra = '';
        if (it.rest) {
            var r = it.rest.replace(/^《[^》]*》[，,]?\s*/, '');
            if (r && /(出版社|\d{4}年[^，。]*版)/.test(r)) {
                extra = '<span>' + esc(r) + '</span>';
            }
        }

        var searchText = [it.title, it.venue, it.issue, it.rest, it.signature && it.signature.text]
            .filter(Boolean).join(' ').toLowerCase();

        var markOpen = it.titleMark === '“' ? '“' : (it.titleMark === '' ? '' : '《');
        var markClose = markOpen === '“' ? '”' : (markOpen === '《' ? '》' : '');
        var prefix = it.prefix ? esc(it.prefix) + '　' : '';

        return '<div class="paper" data-s="' + esc(searchText) + '" data-t="' + esc(it.title) + '"' +
            ' data-tm="' + markOpen + '" data-cl="' + markClose + '" data-p="' + esc(it.prefix || '') + '">' +
            '<div class="paper__title">' + prefix + markOpen + hl(it.title, kw) + markClose + '</div>' +
            '<div class="paper__meta">' + meta.join('') + extra + '</div>' +
            '</div>';
    }

    function volKeyOf(year) {
        var y = +year;
        return y < 1990 ? 1985 : Math.floor(y / 10) * 10;
    }

    function renderPapers() {
        var sub = researchSub('论文');
        var years = (sub ? sub.years : []).slice().reverse(); // 新著在前

        var vols = [], map = {};
        years.forEach(function (y) {
            var k = volKeyOf(y.year);
            if (!map[k]) { map[k] = { key: k, years: [] }; vols.push(map[k]); }
            map[k].years.push(y);
        });

        return '<div class="chrono-tools">' +
            '<label class="chrono-search">' +
            '<span class="chrono-search__icon">尋</span>' +
            '<input type="search" id="chronoInput" placeholder="检索篇名、刊物、年份……" autocomplete="off">' +
            '</label>' +
            '<span class="chrono-stat" id="chronoStat">共 <strong>' + counts().papers + '</strong> 篇 · ' +
            years.length + ' 个年份</span>' +
            '<button class="chrono-toggle" id="chronoToggle" type="button" data-open="1">全部收起</button>' +
            '</div>' +
            '<div id="chronoList">' + vols.map(function (v) {
                var ks = v.years.map(function (y) { return +y.year; });
                var range = Math.min.apply(null, ks) + '–' + Math.max.apply(null, ks);
                var total = v.years.reduce(function (n, y) { return n + y.items.length; }, 0);
                return '<section class="chrono-vol is-open" data-vol="' + v.key + '">' +
                    '<button class="chrono-vol__head" type="button">' +
                    '<span class="chrono-vol__mark">›</span>' +
                    '<span class="chrono-vol__range">' + range + '</span>' +
                    '<span class="chrono-vol__count" data-total="' + total + '">' + total + ' 篇</span>' +
                    '</button>' +
                    '<div class="chrono-vol__body">' + v.years.map(function (y) {
                        return '<div class="chrono-year" data-year="' + esc(y.year) + '">' +
                            '<div class="chrono-year__label">' + esc(y.year) + '年' +
                            '<span class="chrono-year__count">' + y.items.length + ' 篇</span></div>' +
                            y.items.map(function (it) { return paperHTML(it, ''); }).join('') +
                            '</div>';
                    }).join('') + '</div></section>';
            }).join('') + '</div>';
    }

    // ---------------- 渲染：文编 ----------------
    function anthoSets() {
        var sets = [];
        ['编著', '文献整理', '收录转载'].forEach(function (t) {
            var s = researchSub(t);
            if (s) sets.push({ title: t, items: s.items });
        });
        ['序跋', '书评', '学术随笔'].forEach(function (t) {
            var g = litGroup(t);
            if (g) sets.push({ title: t, items: g.items });
        });
        return sets;
    }

    function itemListHTML(items) {
        var html = items.map(function (it) {
            if (it.raw && it.title == null) {
                return '<div class="paper paper--label">' + esc(it.raw) + '</div>';
            }
            return paperHTML(it, '');
        }).join('');
        return html || '<div class="chrono-empty">暂无条目</div>';
    }

    function renderAntho() {
        var sets = anthoSets();
        return '<div class="antho-nav">' + sets.map(function (s, i) {
            return '<button class="antho-chip' + (i === 0 ? ' is-active' : '') + '" type="button" data-antho="' + i + '">' +
                esc(s.title) + '<span class="antho-chip__n">' + s.items.length + '</span></button>';
        }).join('') + '</div>' +
            sets.map(function (s, i) {
                return '<div class="antho-list' + (i === 0 ? ' is-active' : '') + '" data-antho-list="' + i + '">' +
                    itemListHTML(s.items) + '</div>';
            }).join('');
    }

    // ---------------- 渲染：传略 ----------------
    function renderBio() {
        var parts = [];

        parts.push('<div class="bio-lede">' + (data.profile || []).map(function (p) {
            return '<p>' + esc(p) + '</p>';
        }).join('') + '</div>');

        // 开设课程
        var cg = (data.courses && data.courses.groups) || [];
        if (cg.length) {
            parts.push('<div class="bio-block"><div class="works-sec-head">' +
                '<span class="works-sec-head__title">开设课程</span></div>' +
                '<div class="bio-courses">' + cg.map(function (g) {
                    return '<div class="bio-course"><div class="bio-course__title">' + esc(g.title) + '</div><ul>' +
                        (g.items || []).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') +
                        '</ul></div>';
                }).join('') + '</div></div>');
        }

        return parts.join('');
    }

    // ---------------- 渲染：获奖情况（独立一叶） ----------------
    function renderAwards() {
        var ag = (data.awards && data.awards.groups) || [];
        if (!ag.length) return '<div class="chrono-empty">暂无记录</div>';

        return '<div class="bio-awards">' + ag.map(function (g) {
            var blocks = '';
            var direct = (g.items || []).map(function (a) {
                return '<div class="bio-award"><span class="bio-award__year">' + esc(a.year) + '</span>' +
                    '<span>' + esc(a.text) + '</span></div>';
            }).join('');
            if (direct) {
                blocks += '<div class="bio-award-group"><div class="bio-award-group__title">' +
                    esc(g.title) + '</div>' + direct + '</div>';
            }
            (g.subs || []).forEach(function (s) {
                blocks += '<div class="bio-award-group"><div class="bio-award-group__title">' +
                    esc(g.title) + ' · ' + esc(s.title) + '</div>' +
                    (s.items || []).map(function (a) {
                        return '<div class="bio-award"><span class="bio-award__year">' + esc(a.year) + '</span>' +
                            '<span>' + esc(a.text) + '</span></div>';
                    }).join('') + '</div>';
            });
            return blocks;
        }).join('') + '</div>';
    }

    // ---------------- 组装 ----------------
    function build(mount) {
        var c = counts();
        var head = '<header class="works-head">' +
            '<h2 class="works-head__title">' + esc(data.meta.title || '吴承学教授著述表') + '</h2>' +
            '</header>' +
            '<div class="works-figures">' +
            figureHTML(c.books, '著　作') +
            figureHTML(c.papers, '論　文') +
            figureHTML(c.antho, '編　撰') +
            figureHTML(c.awards, '獲　獎') +
            '</div>';

        var body = '<div class="works-body">' +
            '<nav class="works-tabs">' + TABS.map(function (t, i) {
                var n = t.id === 'mono' ? c.books
                    : t.id === 'papers' ? c.papers
                        : t.id === 'antho' ? c.antho
                            : t.id === 'awards' ? c.awards : '';
                var sub = n || t.note || '';
                return '<button class="works-tab' + (i === 0 ? ' is-active' : '') + '" type="button" data-tab="' + t.id + '">' +
                    t.label + (sub ? '<span class="works-tab__count">' + sub + '</span>' : '') + '</button>';
            }).join('') + '</nav>' +
            '<div class="works-leaf">' +
            '<section class="works-pane" data-pane="mono">' + renderMono() + '</section>' +
            '<section class="works-pane" data-pane="papers">' + renderPapers() + '</section>' +
            '<section class="works-pane" data-pane="antho">' + renderAntho() + '</section>' +
            '<section class="works-pane is-active" data-pane="bio">' + renderBio() + '</section>' +
            '<section class="works-pane" data-pane="awards">' + renderAwards() + '</section>' +
            '</div></div>';

        var foot = '<footer class="works-foot">' +
            '<span>资料来源：《吴承学教授简介》' + (data.meta.asOf ? '（统计截至' + esc(data.meta.asOf) + '）' : '') + '</span>' +
            '<span>冰壶秋月 · 单斋</span>' +
            '</footer>';

        mount.innerHTML = '<div class="works-frame">' + head + body + foot + '</div>';
        built = true;
    }

    // ---------------- 交互 ----------------
    function open() {
        if (!overlay) return;
        overlay.classList.remove('hidden');
        // 强制回流，保证过渡生效
        void overlay.offsetWidth;
        overlay.classList.add('is-open');
        overlay.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        markSeen();
        if (!built) {
            var mount = $('.works-scroll', overlay);
            if (data) build(mount);
        }
        var closeBtn = $('.works-close', overlay);
        if (closeBtn) closeBtn.focus();
    }

    function close() {
        if (!overlay) return;
        overlay.classList.remove('is-open');
        overlay.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        setTimeout(function () {
            if (!overlay.classList.contains('is-open')) overlay.classList.add('hidden');
        }, 340);
    }

    function isOpen() { return overlay && overlay.classList.contains('is-open'); }

    function markSeen() {
        try { localStorage.setItem(SEEN_KEY, '1'); } catch (e) { /* ignore */ }
        var seal = $('#worksSeal');
        if (seal) seal.classList.remove('is-new');
    }

    /** 合上著述表，并在书库中定位到对应的那部书 */
    function locateBook(id) {
        close();
        setTimeout(function () {
            var el = document.querySelector('.book-item[data-book-id="' + id + '"]');
            if (!el) return;
            el.scrollIntoView({ block: 'center', behavior: 'smooth' });
            el.classList.add('book-item--locate');
            setTimeout(function () { el.classList.remove('book-item--locate'); }, 2600);
        }, 380);
    }

    function bindPanel() {
        // Tabs
        overlay.addEventListener('click', function (e) {
            var tab = e.target.closest ? e.target.closest('[data-tab]') : null;
            if (tab) {
                var id = tab.getAttribute('data-tab');
                overlay.querySelectorAll('.works-tab').forEach(function (b) {
                    b.classList.toggle('is-active', b === tab);
                });
                overlay.querySelectorAll('.works-pane').forEach(function (p) {
                    p.classList.toggle('is-active', p.getAttribute('data-pane') === id);
                });
                var sc = $('.works-scroll', overlay);
                if (sc) sc.scrollTo({ top: 0, behavior: 'smooth' });
                return;
            }

            // 卷折叠
            var volHead = e.target.closest ? e.target.closest('.chrono-vol__head') : null;
            if (volHead) {
                volHead.parentNode.classList.toggle('is-open');
                return;
            }

            // 文编切换
            var chip = e.target.closest ? e.target.closest('[data-antho]') : null;
            if (chip) {
                var k = chip.getAttribute('data-antho');
                overlay.querySelectorAll('.antho-chip').forEach(function (b) {
                    b.classList.toggle('is-active', b === chip);
                });
                overlay.querySelectorAll('.antho-list').forEach(function (l) {
                    l.classList.toggle('is-active', l.getAttribute('data-antho-list') === k);
                });
                return;
            }

            // 打开书
            var card = e.target.closest ? e.target.closest('.mono-item--readable') : null;
            if (card) {
                locateBook(card.getAttribute('data-book'));
                return;
            }

            // 关闭
            if (e.target.closest && (e.target.closest('.works-close') || e.target.classList.contains('works-overlay'))) {
                close();
            }
        });

        overlay.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('mono--readable')) {
                locateBook(e.target.getAttribute('data-book'));
            }
        });

        // 展开/收起 + 检索
        overlay.addEventListener('click', function (e) {
            if (e.target.id === 'chronoToggle') {
                var openAll = e.target.getAttribute('data-open') !== '1';
                e.target.setAttribute('data-open', openAll ? '1' : '0');
                e.target.textContent = openAll ? '全部收起' : '全部展开';
                overlay.querySelectorAll('.chrono-vol').forEach(function (v) {
                    v.classList.toggle('is-open', openAll);
                });
            }
        });

        overlay.addEventListener('input', function (e) {
            if (e.target.id === 'chronoInput') filterPapers(e.target.value.trim());
        });
    }

    function filterPapers(kw) {
        var vols = overlay.querySelectorAll('.chrono-vol');
        var hits = 0;
        var k = kw.toLowerCase();

        vols.forEach(function (vol) {
            var volHit = 0;
            vol.querySelectorAll('.chrono-year').forEach(function (yr) {
                var yHit = 0;
                var all = yr.querySelectorAll('.paper').length;
                yr.querySelectorAll('.paper').forEach(function (p) {
                    var s = p.getAttribute('data-s') || '';
                    var ok = !k || s.indexOf(k) >= 0;
                    p.style.display = ok ? '' : 'none';
                    var tEl = p.querySelector('.paper__title');
                    if (tEl) {
                        var op = p.getAttribute('data-tm') || '';
                        var cl = p.getAttribute('data-cl') || '';
                        var pf = p.getAttribute('data-p') || '';
                        tEl.innerHTML = (pf ? esc(pf) + '　' : '') + op + hl(p.getAttribute('data-t') || '', kw) + cl;
                    }
                    if (ok) { yHit++; hits++; }
                });
                yr.style.display = yHit ? '' : 'none';
                var yc = yr.querySelector('.chrono-year__count');
                if (yc) yc.textContent = (k ? yHit : all) + ' 篇';
                volHit += yHit;
            });
            vol.style.display = volHit ? '' : 'none';
            var vc = vol.querySelector('.chrono-vol__count');
            if (vc) {
                vc.textContent = (k ? volHit : vc.getAttribute('data-total')) + ' 篇';
            }
            if (k && volHit) vol.classList.add('is-open');
        });

        var stat = $('#chronoStat');
        if (stat) {
            stat.innerHTML = k
                ? '命中 <strong>' + hits + '</strong> 篇'
                : '共 <strong>' + counts().papers + '</strong> 篇 · ' + counts().years + ' 个年份';
        }
        var toggle = $('#chronoToggle');
        if (toggle) toggle.style.display = k ? 'none' : '';
    }

    // ---------------- 初始化 ----------------
    function init() {
        if (!document.body.classList.contains('page-library')) return;
        if (localStorage.getItem(STORAGE_KEY) !== '1') return;

        overlay = $('#worksOverlay');
        if (!overlay) return;

        var seal = $('#worksSeal');
        if (seal) {
            if (!localStorage.getItem(SEEN_KEY)) seal.classList.add('is-new');
            seal.addEventListener('click', open);
        }

        overlay.addEventListener('click', function (e) {
            var t = e.target;
            if (!t) return;
            if (t.classList && t.classList.contains('works-overlay')) { close(); return; }
            if (t.closest && t.closest('.works-close')) close();
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && isOpen()) close();
        });

        fetch(DATA_URL, { cache: 'no-cache' })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function (json) {
                data = json;
                bindPanel();
                if (isOpen()) build($('.works-scroll', overlay));
            })
            .catch(function (err) {
                console.error('著述表数据加载失败', err);
                var sc = $('.works-scroll', overlay);
                if (sc) {
                    sc.innerHTML = '<div class="works-frame"><div class="chrono-empty">' +
                        '著述数据加载失败，请刷新重试。</div></div>';
                }
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
