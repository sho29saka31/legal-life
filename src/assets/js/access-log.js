// access-log.js v2 — Realtime Database 版アクセスログ
// 保存先: analytics/{YYYY-MM-DD}/{pushId}
// 収集情報: GA4 相当（ページビュー・スクロール・クリック・滞在時間・デバイス・地域）
// ※ UID など個人情報は一切保存しない

(function () {
    'use strict';

    const VISITOR_KEY      = 'll_visitor'; // 初回訪問日時（localStorage）
    const SESSION_KEY      = 'll_session'; // セッション開始（sessionStorage）
    const SCROLL_MILESTONES = [25, 50, 75, 100];

    // ---- セッション・訪問者判定 ----
    function getVisitorInfo() {
        const now = Date.now();
        const isNewVisitor = !localStorage.getItem(VISITOR_KEY);
        if (isNewVisitor) localStorage.setItem(VISITOR_KEY, String(now));
        const isNewSession = !sessionStorage.getItem(SESSION_KEY);
        if (isNewSession) sessionStorage.setItem(SESSION_KEY, String(now));
        return { isNewVisitor, isNewSession };
    }

    // ---- UA パーサー ----
    function parseUA() {
        const ua = navigator.userAgent;
        let browser = 'Other';
        if (ua.includes('Edg/'))                               browser = 'Edge';
        else if (ua.includes('OPR/') || ua.includes('Opera')) browser = 'Opera';
        else if (ua.includes('Chrome/'))                       browser = 'Chrome';
        else if (ua.includes('Firefox/'))                      browser = 'Firefox';
        else if (ua.includes('Safari/'))                       browser = 'Safari';

        let os = 'Other';
        if (/iPhone|iPad|iPod/.test(ua))  os = 'iOS';
        else if (ua.includes('Android'))  os = 'Android';
        else if (ua.includes('Windows'))  os = 'Windows';
        else if (ua.includes('Mac OS X')) os = 'macOS';
        else if (ua.includes('Linux'))    os = 'Linux';

        const device = /Mobi|Android|iPhone|iPad/i.test(ua) ? 'Mobile' : 'Desktop';
        return { browser, os, device };
    }

    // ---- IP ジオロケーション（3秒タイムアウト）----
    async function fetchLocation() {
        try {
            const ctrl = new AbortController();
            setTimeout(() => ctrl.abort(), 3000);
            const res = await fetch('https://ipapi.co/json/', { signal: ctrl.signal });
            if (!res.ok) return {};
            const d = await res.json();
            return { country: d.country_name || null, region: d.region || null, city: d.city || null };
        } catch { return {}; }
    }

    // ---- スクロール深度 ----
    function setupScrollTracking(logEvent) {
        const reached = new Set();
        window.addEventListener('scroll', () => {
            const scrolled = window.scrollY + window.innerHeight;
            const total    = document.documentElement.scrollHeight;
            if (!total) return;
            const pct = Math.round((scrolled / total) * 100);
            SCROLL_MILESTONES.forEach(m => {
                if (pct >= m && !reached.has(m)) {
                    reached.add(m);
                    logEvent('scroll', { depth: m });
                }
            });
        }, { passive: true });
    }

    // ---- 滞在時間（beforeunload + visibilitychange）----
    function setupTimeTracking(logEvent) {
        const start = Date.now();
        const send = () => {
            const ms = Date.now() - start;
            if (ms < 2000) return;
            logEvent('engagement', { ms, sec: Math.round(ms / 1000) });
        };
        window.addEventListener('beforeunload', send);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') send();
        });
    }

    // ---- クリックトラッキング ----
    function setupClickTracking(logEvent) {
        const targets = [
            { sel: '.chat-send-btn',      label: 'chat_send'       },
            { sel: '#clearAllButton',      label: 'chat_clear'      },
            { sel: '#searchButton',        label: 'law_search'      },
            { sel: '.siteindex_btn_link',  label: 'top_cta'         },
            { sel: '.hamberger-btn',       label: 'menu_open'       },
            { sel: '#cookie-accept',       label: 'cookie_accept'   },
            { sel: '#cookie-reject',       label: 'cookie_reject'   },
            { sel: '#auth-google-btn',     label: 'login_google'    },
            { sel: '#auth-submit-btn',     label: 'login_email'     },
            { sel: '.lawapi-view-button',  label: 'law_detail_open' },
        ];
        document.addEventListener('click', e => {
            for (const { sel, label } of targets) {
                if (e.target.closest(sel)) {
                    logEvent('click', { element: label });
                    break;
                }
            }
        }, { passive: true });
    }

    // ---- メイン ----
    async function init(rtdb, ref, push, set) {
        const today   = new Date().toISOString().slice(0, 10);
        const session = getVisitorInfo();
        const ua      = parseUA();
        const loc     = await fetchLocation();

        const logEvent = (type, extra = {}) => {
            try {
                const logRef = push(ref(rtdb, `analytics/${today}`));
                set(logRef, {
                    type,
                    path:    location.pathname,
                    ts:      Date.now(),
                    browser: ua.browser,
                    os:      ua.os,
                    device:  ua.device,
                    screen:  `${window.innerWidth}x${window.innerHeight}`,
                    lang:    navigator.language,
                    theme:   window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
                    ...(Object.keys(loc).length ? loc : {}),
                    ...extra,
                });
            } catch (_) { /* ログ失敗は無視 */ }
        };

        // ページビュー
        logEvent('page_view', {
            title:        document.title || null,
            referrer:     document.referrer || null,
            isNewVisitor: session.isNewVisitor,
            isNewSession: session.isNewSession,
        });

        // 行動イベント
        setupScrollTracking(logEvent);
        setupTimeTracking(logEvent);
        setupClickTracking(logEvent);
    }

    function waitAndInit(attempt = 0) {
        if (window._firebaseRTDB?.rtdb) {
            const { rtdb, ref, push, set } = window._firebaseRTDB;
            init(rtdb, ref, push, set);
        } else if (attempt < 50) {
            setTimeout(() => waitAndInit(attempt + 1), 100);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => waitAndInit());
    } else {
        waitAndInit();
    }
})();