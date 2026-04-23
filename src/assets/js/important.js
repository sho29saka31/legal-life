// important.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getFirestore, doc, setDoc, deleteDoc, serverTimestamp, getDoc, onSnapshot, collection } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import {
    getAuth, onAuthStateChanged,
    signInWithPopup, signOut,
    GoogleAuthProvider,
    createUserWithEmailAndPassword, signInWithEmailAndPassword,
    updateProfile, fetchSignInMethodsForEmail,
    linkWithCredential, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app-check.js";

// ========================================
// ダークモード初期化（最優先で実行）
// ========================================
(function () {
    if (localStorage.getItem('theme') === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
})();

// ========================================
// ヘッダー・フッター キャッシュ付きfetch
// ========================================
const LAYOUT_VERSION = "260416-2300";

function fetchWithCache(url) {
    const key = `cache:${url}:v${LAYOUT_VERSION}`;

    // 旧バージョンのキャッシュを削除
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const k = sessionStorage.key(i);
        if (k?.startsWith(`cache:${url}`) && k !== key) sessionStorage.removeItem(k);
    }

    const cached = sessionStorage.getItem(key);
    if (cached) return Promise.resolve(cached);

    return fetch(url)
        .then(r => r.ok ? r.text() : "")
        .then(text => {
            if (text) sessionStorage.setItem(key, text);
            return text;
        });
}

const layoutPromise = Promise.all([
    fetchWithCache("/parts/header.html"),
    fetchWithCache("/parts/footer.html"),
]);

// ========================================
// Firebase 初期化
// ========================================
let app, db, auth, googleProvider;

try {
    const firebaseConfig = __FIREBASE_CONFIG__;
    app = initializeApp(firebaseConfig);
    initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider('6LfYKIMsAAAAAGN3k-0MoBFZC59YGCXckIOWaxK-'),
        isTokenAutoRefreshEnabled: true
    });
    db           = getFirestore(app);
    auth         = getAuth(app);
    googleProvider = new GoogleAuthProvider();
} catch (error) {
    console.error("⚠️ Firebase初期化失敗:", error);
    auth = { onAuthStateChanged: () => {} };
}

// ========================================
// 同一メール別プロバイダー 自動連携ヘルパー
// ========================================
async function autoLinkAndSignIn(error, pendingCredential) {
    if (error.code !== 'auth/account-exists-with-different-credential') throw error;

    const email = error.customData?.email;
    if (!email) throw error;

    console.log(`🔗 同メール(${email})で別プロバイダーを検出。自動連携を試みます...`);
    const methods = await fetchSignInMethodsForEmail(auth, email);

    if (methods.includes('google.com')) {
        const result = await signInWithPopup(auth, googleProvider);
        await linkWithCredential(result.user, pendingCredential);
        console.log("✅ Googleアカウントに自動連携しました");
        return result;
    }

    if (methods.includes('password')) {
        const e = new Error(
            'このメールアドレスはパスワードログインで登録済みです。' +
            '先にパスワードでログインし、アカウント設定から連携してください。'
        );
        e.code = 'auth/manual-link-required';
        throw e;
    }

    throw error;
}

// ========================================
// AuthManager
// ========================================
class AuthManager {
    constructor() {
        this.currentUser = null;
        this.initialized = false;
        this._emailMode  = 'login';
        this._start();
    }

    // ---- 認証状態の監視開始 ----
    _start() {
        if (!auth?.onAuthStateChanged) return;

        this._unsubSession = null; // リモートログアウトリスナー

        onAuthStateChanged(auth, (user) => {
            this.currentUser = user;
            console.log("👤 認証状態:", user ? (user.displayName || user.email) : "ログアウト中");

            // 前のセッションリスナーをクリーンアップ
            if (this._unsubSession) {
                this._unsubSession();
                this._unsubSession = null;
            }

            if (user) {
                // セッション記録 + リモートログアウト監視（非同期・ノンブロッキング）
                this._setupSession(user).catch(e => console.warn("セッション設定失敗:", e));
            }

            setTimeout(() => this.updateUI(user), 100);
        });

        this._observeModal();
    }

    // ---- セッションID の取得 or 新規生成 ----
    _getOrCreateSessionId() {
        const KEY = 'legallife_session_id';
        let id = localStorage.getItem(KEY);
        if (!id) {
            id = Date.now().toString(36) + Math.random().toString(36).slice(2);
            localStorage.setItem(KEY, id);
        }
        return id;
    }

    // ---- UA からブラウザ / OS / デバイス種別を判定 ----
    _parseUserAgent() {
        const ua = navigator.userAgent;

        let browser = 'その他';
        if (ua.includes('Edg/'))                               browser = 'Microsoft Edge';
        else if (ua.includes('OPR/') || ua.includes('Opera')) browser = 'Opera';
        else if (ua.includes('Chrome/'))                       browser = 'Google Chrome';
        else if (ua.includes('Firefox/'))                      browser = 'Mozilla Firefox';
        else if (ua.includes('Safari/'))                       browser = 'Safari';

        let os = 'その他';
        if (/iPhone|iPad|iPod/.test(ua))  os = 'iOS';
        else if (ua.includes('Android'))  os = 'Android';
        else if (ua.includes('Windows'))  os = 'Windows';
        else if (ua.includes('Mac OS X')) os = 'macOS';
        else if (ua.includes('Linux'))    os = 'Linux';

        const device = /Mobi|Android|iPhone|iPad/i.test(ua)
            ? 'スマートフォン/タブレット' : 'PC';

        return { browser, os, device };
    }

    // ---- IPジオロケーションで都市・国を取得（失敗時は"不明"）----
    async _fetchLocation() {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 3000);
            const res = await fetch('https://ipapi.co/json/', { signal: controller.signal });
            clearTimeout(timer);
            if (!res.ok) return '不明';
            const data = await res.json();
            return [data.city, data.country_name].filter(Boolean).join(', ') || '不明';
        } catch {
            return '不明';
        }
    }

    // ---- セッションの記録 + リモートログアウトリスナー設置 ----
    async _setupSession(user) {
        const sessionId  = this._getOrCreateSessionId();
        const sessionRef = doc(db, "users", user.uid, "sessions", sessionId);
        const { browser, os, device } = this._parseUserAgent();

        try {
            const snap = await getDoc(sessionRef);
            if (!snap.exists()) {
                // 新規セッション：位置情報を取得してフルレコード作成
                const location = await this._fetchLocation();
                await setDoc(sessionRef, {
                    sessionId,
                    browser, os, device, location,
                    loginAt:      serverTimestamp(),
                    lastActive:   serverTimestamp(),
                    shouldLogout: false,
                });
            } else {
                // 既存セッション：lastActive のみ更新
                await setDoc(sessionRef, { lastActive: serverTimestamp() }, { merge: true });
            }
        } catch (e) {
            console.warn("セッション記録失敗:", e);
        }

        // リモートログアウト監視
        this._unsubSession = onSnapshot(sessionRef, (snap) => {
            if (snap.exists() && snap.data().shouldLogout === true) {
                console.log("📤 リモートログアウト信号を受信");
                localStorage.removeItem('legallife_session_id');
                signOut(auth).then(() => { window.location.href = '/'; });
            }
        });
    }

    // ---- UI 更新 ----
    updateUI(user) {
        const loginBtn    = document.getElementById("g_id_signin");
        const menuProfile = document.getElementById("user-profile");
        const menuAvatar  = document.getElementById("user-avatar");
        const menuName    = document.getElementById("user-name");

        if (user) {
            loginBtn    ?.setAttribute('style', 'display:none');
            menuProfile ?.setAttribute('style', 'display:flex');
            if (menuAvatar) menuAvatar.src = user.photoURL || "";
            if (menuName)   menuName.textContent = user.displayName || user.email || "ユーザー";

            const overlay = document.getElementById("auth-modal-overlay");
            if (overlay?.style.display === "flex") this._showModalView('loggedin', user);
        } else {
            loginBtn    ?.setAttribute('style', 'display:block');
            menuProfile ?.setAttribute('style', 'display:none');
        }
    }

    // ---- モーダル DOM 監視（遅延読み込み対応）----
    _observeModal() {
        if (this._tryBindModal()) return;

        const observer = new MutationObserver((_, obs) => {
            if (this._tryBindModal()) obs.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    _tryBindModal() {
        const overlay = document.getElementById("auth-modal-overlay");
        if (!overlay || this.initialized) return false;

        // ---- ログインボタン ----
        document.getElementById("g_id_signin")
            ?.addEventListener("click", () => this.openModal());

        // ---- モーダルを閉じる ----
        document.getElementById("auth-modal-close")
            ?.addEventListener("click", () => this.closeModal());
        overlay.addEventListener("click", e => { if (e.target === overlay) this.closeModal(); });
        document.addEventListener("keydown", e => { if (e.key === "Escape") this.closeModal(); });

        // ---- Google ----
        document.getElementById("auth-google-btn")
            ?.addEventListener("click", () => this._loginWithGoogle());

        // ---- メール 画面切替 ----
        document.getElementById("auth-to-register")
            ?.addEventListener("click", () => this._setEmailMode('register'));
        document.getElementById("auth-to-login")
            ?.addEventListener("click", () => this._setEmailMode('login'));

        // ---- メール 送信 ----
        document.getElementById("auth-submit-btn")
            ?.addEventListener("click", () => this._submitEmail());

        // ---- Enterキー ----
        ['auth-email-input', 'auth-password-input', 'auth-name-input'].forEach(id => {
            document.getElementById(id)?.addEventListener("keydown", e => {
                if (e.key === "Enter") this._submitEmail();
            });
        });

        // ---- パスワードリセット ----
        document.getElementById("auth-forgot-btn")
            ?.addEventListener("click", () => this._sendPasswordReset());
        document.getElementById("auth-reset-back-btn")
            ?.addEventListener("click", () => this._showModalView('select'));

        // ---- ログアウト ----
        document.getElementById("logout-btn")
            ?.addEventListener("click", () => this._handleLogout());
        document.getElementById("modal-logout-btn")
            ?.addEventListener("click", () => this._handleLogout());

        // ---- アカウント設定 ----
        document.getElementById("menu-settings-btn")
            ?.addEventListener("click", () => { location.href = "/account/settings/"; });
        document.getElementById("modal-settings-link")
            ?.addEventListener("click", () => {
                this.closeModal();
                location.href = "/account/settings/";
            });

        this.initialized = true;
        this.updateUI(this.currentUser);
        console.log("✅ 認証モーダルのバインド完了");
        return true;
    }

    // ---- モーダル開閉 ----
    openModal() {
        const overlay = document.getElementById("auth-modal-overlay");
        if (!overlay) return;
        overlay.style.display = "flex";
        this._showModalView(this.currentUser ? 'loggedin' : 'select', this.currentUser);
    }

    closeModal() {
        const overlay = document.getElementById("auth-modal-overlay");
        if (overlay) overlay.style.display = "none";
    }

    // ---- 画面切替 ----
    _showModalView(view, user = null) {
        ['select', 'loggedin', 'reset'].forEach(v => {
            const el = document.getElementById(`auth-view-${v}`);
            if (el) el.style.display = v === view ? "block" : "none";
        });

        if (view === 'loggedin' && user) {
            const avatar = document.getElementById("modal-user-avatar");
            const name   = document.getElementById("modal-user-name");
            if (avatar) avatar.src = user.photoURL || "";
            if (name)   name.textContent = user.displayName || user.email || "ユーザー";
        }

        if (view === 'select') {
            this._setEmailMode('login');
            const errMsg = document.getElementById("auth-error-msg");
            if (errMsg) errMsg.textContent = "";
        }
    }

    _setEmailMode(mode) {
        this._emailMode = mode;
        const isRegister = mode === 'register';

        const els = {
            title:          document.getElementById("auth-email-title"),
            submitBtn:      document.getElementById("auth-submit-btn"),
            nameRow:        document.getElementById("auth-name-row"),
            toRegisterWrap: document.getElementById("auth-to-register-wrap"),
            toLoginWrap:    document.getElementById("auth-to-login-wrap"),
            forgotWrap:     document.getElementById("auth-forgot-wrap"),
        };

        if (els.title)          els.title.textContent            = isRegister ? "新規登録"      : "メールでログイン";
        if (els.submitBtn)      els.submitBtn.textContent        = isRegister ? "登録する"      : "ログイン";
        if (els.nameRow)        els.nameRow.style.display        = isRegister ? "block"         : "none";
        if (els.toRegisterWrap) els.toRegisterWrap.style.display = isRegister ? "none"          : "block";
        if (els.toLoginWrap)    els.toLoginWrap.style.display    = isRegister ? "block"         : "none";
        if (els.forgotWrap)     els.forgotWrap.style.display     = isRegister ? "none"          : "block";
    }

    // ---- 認証処理 ----
    async _loginWithGoogle() {
        try {
            await signInWithPopup(auth, googleProvider);
            this.closeModal();
        } catch (e) {
            try {
                await autoLinkAndSignIn(e, e.credential);
                this.closeModal();
            } catch (linkErr) {
                console.error("❌ Googleログイン失敗:", linkErr);
                this._showError(linkErr.message || "Googleログインに失敗しました");
            }
        }
    }

    async _submitEmail() {
        const email    = document.getElementById("auth-email-input")?.value.trim();
        const password = document.getElementById("auth-password-input")?.value;
        const name     = document.getElementById("auth-name-input")?.value.trim();

        if (!email || !password) {
            this._showError("メールアドレスとパスワードを入力してください");
            return;
        }

        const submitBtn = document.getElementById("auth-submit-btn");
        if (submitBtn) { submitBtn.textContent = "処理中..."; submitBtn.disabled = true; }

        try {
            if (this._emailMode === 'register') {
                const cred = await createUserWithEmailAndPassword(auth, email, password);
                if (name) await updateProfile(cred.user, { displayName: name });
            } else {
                await signInWithEmailAndPassword(auth, email, password);
            }
            this.closeModal();
        } catch (e) {
            console.error("❌ メール認証失敗:", e);
            const MSG = {
                'auth/email-already-in-use':  'このメールアドレスはすでに使用されています',
                'auth/invalid-email':          'メールアドレスの形式が正しくありません',
                'auth/weak-password':          'パスワードは6文字以上にしてください',
                'auth/user-not-found':         'このメールアドレスは登録されていません',
                'auth/wrong-password':         'パスワードが間違っています',
                'auth/invalid-credential':     'メールアドレスまたはパスワードが間違っています',
                'auth/too-many-requests':      'しばらく時間をおいてから再試行してください',
            };
            this._showError(MSG[e.code] || 'ログインに失敗しました');
        } finally {
            if (submitBtn) {
                submitBtn.textContent = this._emailMode === 'register' ? "登録する" : "ログイン";
                submitBtn.disabled = false;
            }
        }
    }

    async _sendPasswordReset() {
        const email = document.getElementById("auth-email-input")?.value.trim();
        if (!email) { this._showError("メールアドレスを入力してください"); return; }

        try {
            await sendPasswordResetEmail(auth, email);
            const display = document.getElementById("auth-reset-email-display");
            if (display) display.textContent = email;
            this._showModalView('reset');
            console.log("📧 パスワードリセットメール送信:", email);
        } catch (e) {
            console.error("❌ パスワードリセット失敗:", e);
            const MSG = {
                'auth/user-not-found':    'このメールアドレスは登録されていません',
                'auth/invalid-email':     'メールアドレスの形式が正しくありません',
                'auth/too-many-requests': 'しばらく時間をおいてから再試行してください',
            };
            this._showError(MSG[e.code] || 'メール送信に失敗しました');
        }
    }

    _showError(msg) {
        const el = document.getElementById("auth-error-msg");
        if (el) el.textContent = msg;
    }

    _handleLogout() {
        // ログアウト前に現在のセッションドキュメントを削除
        const sessionId = localStorage.getItem('legallife_session_id');
        if (sessionId && this.currentUser) {
            deleteDoc(doc(db, "users", this.currentUser.uid, "sessions", sessionId))
                .catch(e => console.warn("セッション削除失敗:", e));
        }
        localStorage.removeItem('legallife_session_id');

        signOut(auth)
            .then(() => {
                console.log("👋 ログアウトしました");
                this.updateUI(null);
                const overlay = document.getElementById("auth-modal-overlay");
                if (overlay?.style.display === "flex") this._showModalView('select');
            })
            .catch(e => console.error("❌ ログアウト失敗:", e));
    }

    // ========================================
    // Firestore: チャット履歴の保存・削除
    //   パス: content/chat/{uid}/{docId}
    //   ※ "content"=コレクション, "chat"=ドキュメント(固定),
    //      uid=サブコレクション名, docId=メッセージドキュメント
    // ========================================
    async saveToCloud(input, response, category) {
        if (!this.currentUser) return null;

        try {
            const docId = Date.now().toString();
            await setDoc(
                doc(db, "content", "chat", this.currentUser.uid, docId),
                {
                    userInput:  input,
                    aiResponse: response,
                    category:   category,
                    timestamp:  serverTimestamp(),
                }
            );
            return docId;
        } catch (error) {
            console.error("❌ 保存失敗:", error);
            return null;
        }
    }

    async deleteConsultation(docId) {
        if (!docId || !this.currentUser) return;

        try {
            await deleteDoc(doc(db, "content", "chat", this.currentUser.uid, docId));
            console.log("🗑️ クラウドから削除成功");
        } catch (error) {
            console.error("❌ 削除失敗:", error);
        }
    }
}

window.authApp = new AuthManager();

// ========================================
// ヘッダー・フッター 挿入
// ========================================
layoutPromise
    .then(([headerData, footerData]) => {
        const headerTarget = document.querySelector("#header");
        const footerTarget = document.querySelector("#footer");
        if (headerTarget && headerData) headerTarget.innerHTML = headerData;
        if (footerTarget && footerData) footerTarget.innerHTML = footerData;

        _initThemeToggle();
        _initHamburgerMenu();
        _loadCookieScript();
    })
    .catch(err => console.error('important.js_load-error:', err));

function _initThemeToggle() {
    document.getElementById('theme-toggle-btn')?.addEventListener('click', (e) => {
        e.preventDefault();
        const html = document.documentElement;
        const isDark = html.getAttribute('data-theme') === 'dark';
        if (isDark) {
            html.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
        } else {
            html.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
        }
    });
}

function _initHamburgerMenu() {
    const button = document.querySelector('.hamberger-btn');
    const menu   = document.getElementById('main-menu');
    if (!button || !menu) return;

    const overlay = Object.assign(document.createElement('div'), { className: 'menu-overlay' });
    document.body.appendChild(overlay);

    const toggleMenu = (shouldOpen) => {
        menu.classList.toggle('is-active', shouldOpen);
        button.classList.toggle('is-active', shouldOpen);
        overlay.classList.toggle('is-active', shouldOpen);
        button.setAttribute('aria-expanded', String(shouldOpen));
    };

    button.addEventListener('click', e => {
        e.stopPropagation();
        toggleMenu(button.getAttribute('aria-expanded') !== 'true');
    });

    document.addEventListener('click', e => {
        if (menu.classList.contains('is-active') &&
            !menu.contains(e.target) && !button.contains(e.target)) {
            toggleMenu(false);
        }
    });

    menu.querySelectorAll('a').forEach(link =>
        link.addEventListener('click', () => toggleMenu(false))
    );
}

function _loadCookieScript() {
    const cookieScript = Object.assign(document.createElement('script'), {
        src:     '/assets/js/cookie.js',
        onload:  () => console.log('✅ cookie.js: 読み込み完了'),
        onerror: () => console.error('❌ cookie.js: 読み込み失敗'),
    });
    document.body.appendChild(cookieScript);
}

// ========================================
// TOPに戻るボタン
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    document.documentElement.style.overflowX = 'hidden';
    document.body.style.overflowX = 'hidden';

    const isMobile = () => window.innerWidth <= 600;

    const topBtn = Object.assign(document.createElement('button'), {
        id:        'js-scroll-top',
        className: 'scroll-top-btn',
        ariaLabel: 'トップへ戻る',
        innerHTML: '▲',
    });

    const applySize = () => {
        const m = isMobile();
        Object.assign(topBtn.style, {
            position:       'fixed',
            right:          m ? '10px' : '20px',
            bottom:         '20px',
            width:          m ? '45px' : '50px',
            height:         m ? '45px' : '50px',
            backgroundColor:'#00C8E9',
            color:          '#fff',
            border:         'none',
            borderRadius:   '50%',
            cursor:         'pointer',
            display:        'flex',
            justifyContent: 'center',
            alignItems:     'center',
            fontSize:       m ? '18px' : '20px',
            boxShadow:      '0 4px 10px rgba(0,0,0,0.2)',
            zIndex:         '9999',
            opacity:        '0',
            visibility:     'hidden',
            transform:      'translateY(20px)',
            transition:     'all 0.3s ease',
        });
    };

    applySize();
    document.body.appendChild(topBtn);

    window.addEventListener('scroll', () => {
        const show = window.scrollY > 300;
        topBtn.style.opacity    = show ? '1' : '0';
        topBtn.style.visibility = show ? 'visible' : 'hidden';
        topBtn.style.transform  = show ? 'translateY(0)' : 'translateY(20px)';
    });

    topBtn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    window.addEventListener('resize', applySize);
});

// ========================================
// 検索バー クリアボタン（共通）
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-search-clear]').forEach(clearBtn => {
        const targetId = clearBtn.dataset.searchClear;
        const input    = document.getElementById(targetId);
        if (!input) {
            console.warn(`[common-search] #${targetId} が見つかりません。`);
            return;
        }

        const syncVisibility = () => {
            clearBtn.style.display = input.value.length > 0 ? 'flex' : 'none';
        };

        syncVisibility();
        input.addEventListener('input', syncVisibility);

        clearBtn.addEventListener('click', () => {
            input.value = '';
            syncVisibility();
            input.focus();
            input.dispatchEvent(new CustomEvent('search:cleared', {
                bubbles: true,
                detail:  { inputId: targetId },
            }));
        });
    });
});

console.log('%c警告!', 'color: red; font-size: 1.2em; font-weight: bold;',
    '\n不用意なコード実行は避けてください。');