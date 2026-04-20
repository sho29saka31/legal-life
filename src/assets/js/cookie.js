// cookie.js - Cookie同意管理専用ファイル
// 測定ID = 'G-PFE76QZ3J6'

// cookie.js - Cookie同意管理専用ファイル
// Google Analytics測定ID（必ず実際のIDに置き換えてください）
const GA_MEASUREMENT_ID = 'G-PFE76QZ3J6'; // ← あなたの測定IDに置き換え

// ========================================
// Cookie操作関数
// ========================================

/**
 * Cookieを設定する
 * @param {string} name - Cookie名
 * @param {string} value - Cookie値
 * @param {number} days - 有効期限（日数）
 */
function setCookie(name, value, days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    const expires = "expires=" + date.toUTCString();
    document.cookie = name + "=" + value + ";" + expires + ";path=/;SameSite=Lax";
    console.log(`🍪 Cookie設定: ${name}=${value} (有効期限: ${days}日)`);
}

/**
 * Cookieを取得する
 * @param {string} name - Cookie名
 * @returns {string|null} Cookie値、存在しない場合はnull
 */
function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) == ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
}

/**
 * Cookieを削除する
 * @param {string} name - Cookie名
 */
function deleteCookie(name) {
    document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    console.log(`🗑️ Cookie削除: ${name}`);
}

// ========================================
// Google Analytics制御関数
// ========================================

/**
 * Google Analyticsを有効化する
 */
function enableGoogleAnalytics() {
    // 無効化フラグを解除
    window['ga-disable-' + GA_MEASUREMENT_ID] = false;
    
    // gtag.jsが既に読み込まれているか確認
    if (typeof gtag !== 'function') {
        // まだ読み込まれていない場合、スクリプトを動的に追加
        const script = document.createElement('script');
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
        script.onload = function() {
            console.log('📊 Google Analytics: スクリプト読み込み完了');
        };
        document.head.appendChild(script);
        
        // dataLayerの初期化
        window.dataLayer = window.dataLayer || [];
        function gtag() { dataLayer.push(arguments); }
        window.gtag = gtag;
        gtag('js', new Date());
        gtag('config', GA_MEASUREMENT_ID, {
            'anonymize_ip': true, // IPアドレスの匿名化（プライバシー保護）
            'cookie_flags': 'SameSite=Lax;Secure' // Cookieのセキュリティ設定
        });
        console.log('📊 Google Analytics: 初回読み込みと有効化');
    } else {
        console.log('📊 Google Analytics: 既に読み込み済み（測定再開）');
    }
}

/**
 * Google Analyticsを無効化する
 */
function disableGoogleAnalytics() {
    window['ga-disable-' + GA_MEASUREMENT_ID] = true;

    const gaCookies = ['_ga', '_gid', '_gat', `_ga_${GA_MEASUREMENT_ID.replace('G-', '')}`];
    gaCookies.forEach(name => {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${location.hostname}`;
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.${location.hostname}`;
    });
    console.log('🚫 Google Analytics: 無効化されました');
}

// ========================================
// Cookie同意バナーの制御
// ========================================

/**
 * Cookie同意バナーを初期化する
 */
function initCookieBanner() {
    // DOM要素の取得
    const banner = document.getElementById('cookie-banner');
    const acceptBtn = document.getElementById('cookie-accept');
    const rejectBtn = document.getElementById('cookie-reject');

    if (!banner) {
        console.warn('⚠️ Cookie同意バナーの要素が見つかりません');
        return;
    }

    // Cookie同意状態を確認
    const cookieConsent = getCookie('cookie_consent');
    console.log('🔍 Cookie同意状態チェック:', cookieConsent || '未設定');

    if (!cookieConsent) {
        // 未設定の場合、バナーを表示
        showBanner(banner);
    } else if (cookieConsent === 'accepted') {
        // 同意済みの場合、Google Analyticsを有効化
        console.log('✅ Cookie同意済み - Google Analyticsを有効化します');
        enableGoogleAnalytics();
    } else if (cookieConsent === 'rejected') {
        console.log('❌ Cookie拒否済み - Google Analyticsは無効のままです');
    }

    // イベントリスナーの設定
    if (acceptBtn) {
        acceptBtn.addEventListener('click', function() {
            handleAccept(banner);
        });
    }

    if (rejectBtn) {
        rejectBtn.addEventListener('click', function() {
            handleReject(banner);
        });
    }
}

/**
 * バナーを表示する
 * @param {HTMLElement} banner - バナー要素
 */
function showBanner(banner) {
    console.log('⏳ 0.5秒後にCookie同意バナーを表示します...');
    setTimeout(() => {
        banner.classList.add('is-show');
        console.log('✅ Cookie同意バナーを表示しました');
    }, 500);
}

/**
 * 「同意する」ボタンのクリック処理
 * @param {HTMLElement} banner - バナー要素
 */
function handleAccept(banner) {
    setCookie('cookie_consent', 'accepted', 365);
    banner.classList.remove('is-show');
    enableGoogleAnalytics();
    console.log('✅ ユーザーがCookieに同意しました');
}

/**
 * 「拒否する」ボタンのクリック処理
 * @param {HTMLElement} banner - バナー要素
 */
function handleReject(banner) {
    setCookie('cookie_consent', 'rejected', 365);
    banner.classList.remove('is-show');
    disableGoogleAnalytics();
    console.log('❌ ユーザーがCookieを拒否しました');
}

// ========================================
// デバッグ用関数（本番環境では削除可）
// ========================================

/**
 * Cookie同意をリセットする（デバッグ用）
 */
function resetCookieConsent() {
    deleteCookie('cookie_consent');
    console.log('🔄 Cookie同意をリセットしました。ページをリロードしてください。');
    setTimeout(() => {
        location.reload();
    }, 1000);
}

// ========================================
// 初期化処理
// ========================================

/**
 * Cookie同意バナーの初期化を遅延実行
 * footer.htmlが読み込まれた後に確実に実行されるように待機
 */
function initWithRetry() {
    const banner = document.getElementById('cookie-banner');
    
    if (banner) {
        // バナー要素が見つかったら初期化
        initCookieBanner();
        console.log('🍪 cookie.js: Cookie同意バナー初期化完了');
    } else {
        // まだ読み込まれていない場合は少し待ってから再試行
        console.log('⏳ cookie.js: footer.htmlの読み込み待機中...');
        setTimeout(initWithRetry, 100);
    }
}

// DOMContentLoadedイベントで初期化開始
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWithRetry);
} else {
    // 既にDOMが読み込まれている場合は即座に実行
    initWithRetry();
}

console.log('🍪 cookie.js: スクリプト読み込み完了');