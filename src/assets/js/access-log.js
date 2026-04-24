// access-log.js
// 役割: ページアクセス情報を Firestore に記録する軽量ログ収集モジュール
// 保存先: access_logs/{auto-id}
// ※ 個人情報は一切保存しない（UID は保存しない）

// ========================================
// ログ収集の実行
//   important.js の Firebase 初期化完了後に
//   window._logAccess() として呼び出される
// ========================================

(function () {
    'use strict';

    // ---- UA パーサー ----
    function parseUA() {
        const ua = navigator.userAgent;

        let browser = 'その他';
        if (ua.includes('Edg/'))                               browser = 'Edge';
        else if (ua.includes('OPR/') || ua.includes('Opera')) browser = 'Opera';
        else if (ua.includes('Chrome/'))                       browser = 'Chrome';
        else if (ua.includes('Firefox/'))                      browser = 'Firefox';
        else if (ua.includes('Safari/'))                       browser = 'Safari';

        let os = 'その他';
        if (/iPhone|iPad|iPod/.test(ua))  os = 'iOS';
        else if (ua.includes('Android'))  os = 'Android';
        else if (ua.includes('Windows'))  os = 'Windows';
        else if (ua.includes('Mac OS X')) os = 'macOS';
        else if (ua.includes('Linux'))    os = 'Linux';

        const device = /Mobi|Android|iPhone|iPad/i.test(ua) ? 'Mobile' : 'Desktop';

        return { browser, os, device };
    }

    // ---- 位置情報（IP ベース、失敗時は '不明'）----
    async function fetchRegion() {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 3000);
            const res = await fetch('https://ipapi.co/json/', { signal: controller.signal });
            clearTimeout(timer);
            if (!res.ok) return { country: '不明', region: '不明' };
            const data = await res.json();
            return {
                country: data.country_name || '不明',
                region:  data.region       || '不明',
            };
        } catch {
            return { country: '不明', region: '不明' };
        }
    }

    // ---- メイン処理 ----
    async function recordAccessLog(db, addDoc, collection, serverTimestamp) {
        try {
            const { browser, os, device } = parseUA();
            const { country, region }     = await fetchRegion();

            await addDoc(collection(db, 'access_logs'), {
                // ページ情報
                path:     location.pathname,
                title:    document.title || '未設定',
                referrer: document.referrer || '直接アクセス',
                // 環境情報
                browser, os, device,
                // 地域情報
                country, region,
                // 表示設定
                language:  navigator.language  || '不明',
                theme:     window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
                screen:    `${window.innerWidth}x${window.innerHeight}`,
                // タイムスタンプ
                timestamp: serverTimestamp(),
            });

            console.log('📝 access-log: 記録完了');
        } catch (e) {
            // ログ失敗はユーザー体験に影響させない
            console.warn('📝 access-log: 記録失敗', e.message);
        }
    }

    // ---- important.js の Firebase 初期化を待って起動 ----
    function waitAndLog(attempt = 0) {
        // window._firebaseDb は important.js 側でセットされる想定
        // （後述の important.js への1行追加が必要）
        if (window._firebaseDb && window._firebaseModules) {
            const { db }                              = window._firebaseDb;
            const { addDoc, collection, serverTimestamp } = window._firebaseModules;
            recordAccessLog(db, addDoc, collection, serverTimestamp);
        } else if (attempt < 50) {
            setTimeout(() => waitAndLog(attempt + 1), 100);
        }
    }

    // DOMContentLoaded 後に開始（ページ描画を妨げない）
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => waitAndLog());
    } else {
        waitAndLog();
    }
})();