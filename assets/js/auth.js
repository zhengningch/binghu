/**
 * 登录模块
 * - 登录框用 HTML 组件渲染，固定定位，不依赖热区坐标
 */

(function () {
    'use strict';

    const VALID_CODES = new Set(['binghuqiuyue']);
    const STORAGE_KEY = 'wcx_library_authed';

    if (localStorage.getItem(STORAGE_KEY) === '1') {
        window.location.replace('library.html');
        return;
    }

    const $ = (s) => document.querySelector(s);
    const overlayEl = $('#loginOverlay');
    const formEl = $('#loginForm');
    const inputEl = $('#inviteCode');
    const errorEl = $('#loginError');

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

    overlayEl.addEventListener('click', (e) => {
        if (e.target !== inputEl) inputEl.focus();
    });

    inputEl.addEventListener('input', clearError);
})();
