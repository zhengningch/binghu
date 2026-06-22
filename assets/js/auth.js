/**
 * 登录模块
 * - 加载 scenes.json，根据图片实际渲染位置定位"登录"输入框
 * - 输入框直接显示在图上"登录"位置（和检索一致），不弹 modal
 * - 输入邀请码 → 回车或点 → 提交 → 跳转
 */

(function () {
    'use strict';

    const VALID_CODES = new Set(['binghuqiuyue']);
    const STORAGE_KEY = 'wcx_library_authed';

    // 已登录则直接跳转
    if (localStorage.getItem(STORAGE_KEY) === '1') {
        window.location.replace('library.html');
        return;
    }

    const $ = (s) => document.querySelector(s);
    const bgEl = $('#bg');
    const overlayEl = $('#loginOverlay');
    const formEl = $('#loginForm');
    const inputEl = $('#inviteCode');
    const errorEl = $('#loginError');

    // 兜底坐标：即使 scenes.json 失败也能定位登录框
    const fallbackHotspot = { action: 'login-inline', x: 5320, y: 2905, w: 1638, h: 223 };

    let currentHotspots = [fallbackHotspot];
    let naturalW = 8001;
    let naturalH = 4501;

    // === 加载 scenes.json → 渲染登录场景的热区 ===
    (async () => {
        try {
            const resp = await fetch('assets/data/scenes.json', { cache: 'no-store' });
            if (!resp.ok) throw new Error('scenes.json 加载失败');
            const data = await resp.json();
            const scene = data.scenes && data.scenes.login;
            if (!scene) throw new Error('未找到 login scene');
            const hotspots = scene.hotspots && scene.hotspots.length ? scene.hotspots : [fallbackHotspot];
            currentHotspots = hotspots;
            if (scene.naturalSize) {
                naturalW = scene.naturalSize.width;
                naturalH = scene.naturalSize.height;
            }
            layoutHotspots();
        } catch (err) {
            console.error('scenes.json 加载失败，使用兜底坐标:', err);
            currentHotspots = [fallbackHotspot];
            layoutHotspots();
        }
    })();

    function ready() { layoutHotspots(); }
    if (document.readyState === 'complete') ready();
    else window.addEventListener('load', ready);
    window.addEventListener('resize', layoutHotspots);

    /**
     * 核心：根据图片实际渲染区域（含 contain 后的留白），把热区从"原始像素坐标"换算到"屏幕像素坐标"
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

        let placed = false;
        currentHotspots.forEach((hs) => {
            if (hs.action === 'login-inline') {
                overlayEl.style.left   = (offsetX + (hs.x / naturalW) * renderW) + 'px';
                overlayEl.style.top    = (offsetY + (hs.y / naturalH) * renderH) + 'px';
                overlayEl.style.width  = ((hs.w / naturalW) * renderW) + 'px';
                const calcH = (hs.h / naturalH) * renderH;
                overlayEl.style.height = Math.max(calcH, 46) + 'px';
                placed = true;
            }
        });

        if (placed) {
            overlayEl.classList.add('is-ready');
        }
    }

    // 提交邀请码
    formEl.addEventListener('submit', (e) => {
        e.preventDefault();
        const code = (inputEl.value || '').trim();
        if (!code) {
            showError('请输入邀请码');
            inputEl.focus();
            return;
        }
        if (VALID_CODES.has(code)) {
            localStorage.setItem(STORAGE_KEY, '1');
            clearError();
            overlayEl.style.opacity = '0.6';
            overlayEl.style.pointerEvents = 'none';
            setTimeout(() => {
                window.location.href = 'library.html';
            }, 180);
        } else {
            showError('邀请码不正确，请核对后重试');
            inputEl.select();
            inputEl.animate(
                [
                    { transform: 'translateX(0)' },
                    { transform: 'translateX(-6px)' },
                    { transform: 'translateX(6px)' },
                    { transform: 'translateX(-4px)' },
                    { transform: 'translateX(0)' },
                ],
                { duration: 320, easing: 'ease-in-out' }
            );
        }
    });

    function showError(msg) {
        errorEl.textContent = msg;
        errorEl.classList.add('show');
    }
    function clearError() {
        errorEl.textContent = '';
        errorEl.classList.remove('show');
    }

    // 点击登录框任意位置都可直接开始输入
    overlayEl.addEventListener('click', (e) => {
        if (e.target !== inputEl) inputEl.focus();
    });

    inputEl.addEventListener('input', clearError);
})();
