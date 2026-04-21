// important.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getFirestore, doc, setDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import {
    getAuth, onAuthStateChanged,
    signInWithPopup, signOut,
    GoogleAuthProvider,
    createUserWithEmailAndPassword, signInWithEmailAndPassword,
    updateProfile, fetchSignInMethodsForEmail,
    linkWithCredential, unlink, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app-check.js";

// === ダークモード初期化 ===
(function() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
})();

// === ヘッダー・フッターのfetchを最速で開始<tempファイル内のコード変更時は番号を更新すること！> ===
const LAYOUT_VERSION = "260416-2300";

function fetchWithCache(url) {
    const key = `cache:${url}:v${LAYOUT_VERSION}`;
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith('cache:' + url) && k !== key) sessionStorage.removeItem(k);
    }
    const cached = sessionStorage.getItem(key);
    if (cached) return Promise.resolve(cached);
    return fetch(url)
        .then(r => r.ok ? r.text() : "")
        .then(text => { if (text) sessionStorage.setItem(key, text); return text; });
}

const layoutPromise = Promise.all([
    fetchWithCache("/parts/header.html"),
    fetchWithCache("/parts/footer.html"),
]);

// === Firebase初期化 ===
let app, db, auth, googleProvider;
try {
    const firebaseConfig = __FIREBASE_CONFIG__;
    app = initializeApp(firebaseConfig);
    initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider('6LfYKIMsAAAAAGN3k-0MoBFZC59YGCXckIOWaxK-'),
        isTokenAutoRefreshEnabled: true
    });
    db  = getFirestore(app);
    auth = getAuth(app);
    googleProvider  = new GoogleAuthProvider();
} catch (error) {
    console.error("⚠️ Firebaseの初期化に失敗しました:", error);
    auth = { onAuthStateChanged: () => {} };
}

// ========================================
// 自動アカウント連携ヘルパー
// ========================================
async function autoLinkAndSignIn(error, pendingCredential) {
    if (error.code !== 'auth/account-exists-with-different-credential') throw error;
    const email = error.customData?.email;
    if (!email) throw error;

    console.log(`🔗 同メールアドレス(${email})で別プロバイダーを検出。自動連携を試みます...`);
    const methods = await fetchSignInMethodsForEmail(auth, email);

    if (methods.includes('google.com')) {
        const result = await signInWithPopup(auth, googleProvider);
        await linkWithCredential(result.user, pendingCredential);
        console.log("✅ Googleアカウントに自動連携しました");
        return result;
    }

    if (methods.includes('password')) {
        const e = new Error('このメールアドレスはパスワードログインで登録済みです。先にパスワードでログインし、アカウント設定から連携してください。');
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
        this.start();
    }

    async start() {
        if (auth && auth.onAuthStateChanged) {
            onAuthStateChanged(auth, async (user) => {
                this.currentUser = user;
                console.log("👤 認証状態:", user ? user.displayName || user.email : "ログアウト中");

                // Twitter連携が残っていれば自動解除
                if (user) {
                    const hasTwitter = user.providerData.some(p => p.providerId === 'twitter.com');
                    if (hasTwitter) {
                        try {
                            await unlink(user, 'twitter.com');
                            console.log("🔓 Twitter連携を自動解除しました");
                        } catch (e) {
                            console.warn("Twitter自動解除失敗:", e);
                        }
                    }
                }
                setTimeout(() => this.updateUI(user), 100);
            });
        }
        this.observeModal();
    }

    // ---- UI更新 ----
    updateUI(user) {
        const loginBtn    = document.getElementById("g_id_signin");
        const menuProfile = document.getElementById("user-profile");
        const menuAvatar  = document.getElementById("user-avatar");
        const menuName    = document.getElementById("user-name");

        if (user) {
            if (loginBtn)    loginBtn.style.display    = "none";
            if (menuProfile) menuProfile.style.display = "flex";
            if (menuAvatar)  menuAvatar.src  = user.photoURL || "";
            if (menuName)    menuName.textContent = user.displayName || user.email || "ユーザー";

            const overlay = document.getElementById("auth-modal-overlay");
            if (overlay && overlay.style.display === "flex") {
                this.showModalView('loggedin', user);
            }
        } else {
            if (loginBtn)    loginBtn.style.display    = "block";
            if (menuProfile) menuProfile.style.display = "none";
        }
    }

    // ---- モーダル監視 ----
    observeModal() {
        if (this.tryBindModal()) return;
        const observer = new MutationObserver((_, obs) => {
            if (this.tryBindModal()) obs.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    tryBindModal() {
        const overlay = document.getElementById("auth-modal-overlay");
        if (!overlay || this.initialized) return false;

        // ログインボタン
        document.getElementById("g_id_signin")
            ?.addEventListener("click", () => this.openModal());

        // モーダルを閉じる
        document.getElementById("auth-modal-close")
            ?.addEventListener("click", () => this.closeModal());
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) this.closeModal();
        });
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") this.closeModal();
        });

        // 各プロバイダーボタン
        document.getElementById("auth-google-btn")
            ?.addEventListener("click", () => this.loginWithGoogle());

        // メール画面
        document.getElementById("auth-to-register")
            ?.addEventListener("click", () => this.setEmailMode('register'));
        document.getElementById("auth-to-login")
            ?.addEventListener("click", () => this.setEmailMode('login'));
        document.getElementById("auth-submit-btn")
            ?.addEventListener("click", () => this.submitEmail());

        // パスワードリセット
        document.getElementById("auth-forgot-btn")
            ?.addEventListener("click", () => this.sendPasswordReset());
        document.getElementById("auth-reset-back-btn")
            ?.addEventListener("click", () => this.showModalView('select'));

        // Enterキー送信
        ['auth-email-input', 'auth-password-input', 'auth-name-input'].forEach(id => {
            document.getElementById(id)?.addEventListener("keydown", (e) => {
                if (e.key === "Enter") this.submitEmail();
            });
        });

        // ログアウト
        document.getElementById("logout-btn")
            ?.addEventListener("click", () => this.handleLogout());
        document.getElementById("modal-logout-btn")
            ?.addEventListener("click", () => this.handleLogout());

        // ハンバーガーメニュー内アカウント設定
        document.getElementById("menu-settings-btn")
            ?.addEventListener("click", () => {
                location.href = "/account/settings/";
            });

        // モーダル内アカウント設定
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
        if (this.currentUser) {
            this.showModalView('loggedin', this.currentUser);
        } else {
            this.showModalView('select');
        }
    }

    closeModal() {
        const overlay = document.getElementById("auth-modal-overlay");
        if (overlay) overlay.style.display = "none";
    }

    // ---- 画面切替 ----
    showModalView(view, user = null) {
        ['select', 'loggedin', 'reset'].forEach(v => {
            const el = document.getElementById(`auth-view-${v}`);
            if (el) el.style.display = (v === view) ? "block" : "none";
        });
        if (view === 'loggedin' && user) {
            const avatar = document.getElementById("modal-user-avatar");
            const name   = document.getElementById("modal-user-name");
            if (avatar) avatar.src = user.photoURL || "";
            if (name)   name.textContent = user.displayName || user.email || "ユーザー";
        }
        if (view === 'select') {
            this.setEmailMode('login');
            const errMsg = document.getElementById("auth-error-msg");
            if (errMsg) errMsg.textContent = "";
        }
    }

    setEmailMode(mode) {
        this._emailMode = mode;
        const title          = document.getElementById("auth-email-title");
        const submitBtn      = document.getElementById("auth-submit-btn");
        const nameRow        = document.getElementById("auth-name-row");
        const toRegisterWrap = document.getElementById("auth-to-register-wrap");
        const toLoginWrap    = document.getElementById("auth-to-login-wrap");
        const forgotWrap     = document.getElementById("auth-forgot-wrap");

        if (mode === 'register') {
            if (title)          title.textContent            = "新規登録";
            if (submitBtn)      submitBtn.textContent        = "登録する";
            if (nameRow)        nameRow.style.display        = "block";
            if (toRegisterWrap) toRegisterWrap.style.display = "none";
            if (toLoginWrap)    toLoginWrap.style.display    = "block";
            if (forgotWrap)     forgotWrap.style.display     = "none";
        } else {
            if (title)          title.textContent            = "メールでログイン";
            if (submitBtn)      submitBtn.textContent        = "ログイン";
            if (nameRow)        nameRow.style.display        = "none";
            if (toRegisterWrap) toRegisterWrap.style.display = "block";
            if (toLoginWrap)    toLoginWrap.style.display    = "none";
            if (forgotWrap)     forgotWrap.style.display     = "block";
        }
    }

    // ---- 各認証処理 ----
    async loginWithGoogle() {
        try {
            await signInWithPopup(auth, googleProvider);
            this.closeModal();
        } catch (e) {
            try {
                await autoLinkAndSignIn(e, e.credential);
                this.closeModal();
            } catch (linkErr) {
                console.error("❌ Googleログイン失敗:", linkErr);
                this.showError(linkErr.message || "Googleログインに失敗しました");
            }
        }
    }

    async submitEmail() {
        const email    = document.getElementById("auth-email-input")?.value.trim();
        const password = document.getElementById("auth-password-input")?.value;
        const name     = document.getElementById("auth-name-input")?.value.trim();

        if (!email || !password) {
            this.showError("メールアドレスとパスワードを入力してください");
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
            const messages = {
                'auth/email-already-in-use':  'このメールアドレスはすでに使用されています',
                'auth/invalid-email':          'メールアドレスの形式が正しくありません',
                'auth/weak-password':          'パスワードは6文字以上にしてください',
                'auth/user-not-found':         'このメールアドレスは登録されていません',
                'auth/wrong-password':         'パスワードが間違っています',
                'auth/invalid-credential':     'メールアドレスまたはパスワードが間違っています',
                'auth/too-many-requests':      'しばらく時間をおいてから再試行してください',
            };
            this.showError(messages[e.code] || 'ログインに失敗しました');
        } finally {
            if (submitBtn) {
                submitBtn.textContent = this._emailMode === 'register' ? "登録する" : "ログイン";
                submitBtn.disabled = false;
            }
        }
    }

    // パスワードリセットメール送信
    async sendPasswordReset() {
        const email = document.getElementById("auth-email-input")?.value.trim();
        if (!email) {
            this.showError("メールアドレスを入力してください");
            return;
        }
        try {
            await sendPasswordResetEmail(auth, email);
            const display = document.getElementById("auth-reset-email-display");
            if (display) display.textContent = email;
            this.showModalView('reset');
            console.log("📧 パスワードリセットメールを送信しました:", email);
        } catch (e) {
            console.error("❌ パスワードリセット失敗:", e);
            const messages = {
                'auth/user-not-found':    'このメールアドレスは登録されていません',
                'auth/invalid-email':     'メールアドレスの形式が正しくありません',
                'auth/too-many-requests': 'しばらく時間をおいてから再試行してください',
            };
            this.showError(messages[e.code] || 'メール送信に失敗しました');
        }
    }

    showError(msg) {
        const el = document.getElementById("auth-error-msg");
        if (el) el.textContent = msg;
    }

    handleLogout() {
        signOut(auth).then(() => {
            console.log("👋 ログアウトしました");
            this.updateUI(null);
            const overlay = document.getElementById("auth-modal-overlay");
            if (overlay && overlay.style.display === "flex") {
                this.showModalView('select');
            }
        }).catch(e => console.error("❌ ログアウト失敗:", e));
    }

    // ---- Firestore保存 ----
    async saveToCloud(input, response, category) {
        if (!this.currentUser) return null;
        try {
            const docId = Date.now().toString();
            await setDoc(doc(db, "consultations", docId), {
                userId:     this.currentUser.uid,
                userInput:  input,
                aiResponse: response,
                category:   category,
                timestamp:  serverTimestamp()
            });
            return docId;
        } catch (error) {
            console.error("❌ 保存失敗:", error);
        }
    }

    async deleteConsultation(docId) {
        if (!docId) return;
        try {
            await deleteDoc(doc(db, "consultations", docId));
            console.log("🗑️ クラウドから削除成功");
        } catch (error) {
            console.error("❌ 削除失敗:", error);
        }
    }
}

window.authApp = new AuthManager();

// ========================================
// ヘッダー・フッターの読み込み
// ========================================
layoutPromise.then(([headerData, footerData]) => {
    const headerTarget = document.querySelector("#header");
    const footerTarget = document.querySelector("#footer");
    if (headerTarget && headerData) headerTarget.innerHTML = headerData;
    if (footerTarget && footerData) footerTarget.innerHTML = footerData;

    // ダークモード切替
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const html = document.documentElement;
            if (html.getAttribute('data-theme') === 'dark') {
                html.removeAttribute('data-theme');
                localStorage.setItem('theme', 'light');
            } else {
                html.setAttribute('data-theme', 'dark');
                localStorage.setItem('theme', 'dark');
            }
        });
    }

    // ハンバーガーメニュー
    const button = document.querySelector('.hamberger-btn');
    const menu   = document.getElementById('main-menu');
    if (button && menu) {
        const overlay = document.createElement('div');
        overlay.className = 'menu-overlay';
        document.body.appendChild(overlay);

        const toggleMenu = (shouldOpen) => {
            menu.classList.toggle('is-active', shouldOpen);
            button.classList.toggle('is-active', shouldOpen);
            overlay.classList.toggle('is-active', shouldOpen);
            button.setAttribute('aria-expanded', String(shouldOpen));
        };
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMenu(button.getAttribute('aria-expanded') !== 'true');
        });
        document.addEventListener('click', (e) => {
            if (menu.classList.contains('is-active') &&
                !menu.contains(e.target) &&
                !button.contains(e.target)) {
                toggleMenu(false);
            }
        });
        menu.querySelectorAll('a').forEach(link =>
            link.addEventListener('click', () => toggleMenu(false))
        );
    }

    // cookie.jsの動的読み込み
    const cookieScript = document.createElement('script');
    cookieScript.src = '/assets/js/cookie.js';
    cookieScript.onload  = () => console.log('✅ cookie.js: 読み込み完了');
    cookieScript.onerror = () => console.error('❌ cookie.js: 読み込み失敗');
    document.body.appendChild(cookieScript);
})
.catch(err => console.error('important.js_load-error:', err));

// ========================================
// TOPに戻るボタン
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    document.documentElement.style.overflowX = 'hidden';
    document.body.style.overflowX = 'hidden';

    const topBtn = document.createElement('button');
    topBtn.id        = 'js-scroll-top';
    topBtn.className = 'scroll-top-btn';
    topBtn.ariaLabel = 'トップへ戻る';
    topBtn.innerHTML = '▲';

    const isMobile = window.innerWidth <= 600;
    topBtn.style.cssText = `
        position: fixed !important;
        right: ${isMobile ? '10px' : '20px'} !important;
        bottom: 20px !important;
        width: ${isMobile ? '45px' : '50px'} !important;
        height: ${isMobile ? '45px' : '50px'} !important;
        background-color: #00C8E9 !important;
        color: #fff !important;
        border: none !important;
        border-radius: 50% !important;
        cursor: pointer !important;
        display: flex !important;
        justify-content: center !important;
        align-items: center !important;
        font-size: ${isMobile ? '18px' : '20px'} !important;
        box-shadow: 0 4px 10px rgba(0,0,0,0.2) !important;
        z-index: 9999 !important;
        opacity: 0 !important;
        visibility: hidden !important;
        transform: translateY(20px) !important;
        transition: all 0.3s ease !important;
    `;
    document.body.appendChild(topBtn);

    window.addEventListener('scroll', () => {
        const show = window.scrollY > 300;
        topBtn.style.opacity    = show ? '1' : '0';
        topBtn.style.visibility = show ? 'visible' : 'hidden';
        topBtn.style.transform  = show ? 'translateY(0)' : 'translateY(20px)';
    });
    topBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    window.addEventListener('resize', () => {
        const m = window.innerWidth <= 600;
        topBtn.style.right    = m ? '10px' : '20px';
        topBtn.style.width    = m ? '45px' : '50px';
        topBtn.style.height   = m ? '45px' : '50px';
        topBtn.style.fontSize = m ? '18px' : '20px';
    });
});

console.log('%c警告!', 'color: red; font-size: 1.2em; font-weight: bold;', '\n不用意なコード実行は避けてください。');

// 役割: 検索バーのクリアボタンの「表示/非表示制御」と「入力リセット」のみを担当。
// 固有のフィルタリングや再検索ロジックは一切持たず、
// 処理完了後に CustomEvent を発火して各ページの JS に委譲する。

document.addEventListener('DOMContentLoaded', () => {

    // [data-search-clear="入力欄のID"] を持つボタンをすべて検索し、共通処理をバインド
    document.querySelectorAll('[data-search-clear]').forEach(clearBtn => {

        const targetId = clearBtn.dataset.searchClear;
        const input    = document.getElementById(targetId);

        // 対応する入力欄が存在しない場合はスキップ（エラー防止）
        if (!input) {
            console.warn(`[common-search] #${targetId} が見つかりません。`);
            return;
        }

        // ---- 表示制御ヘルパー ----
        const syncVisibility = () => {
            // 入力があれば表示、なければ非表示
            clearBtn.style.display = input.value.length > 0 ? 'flex' : 'none';
        };

        // 初期状態を即時反映（ページ読み込み時に値が残っているケースへの対応）
        syncVisibility();

        // 入力値が変わるたびに表示状態を更新
        input.addEventListener('input', syncVisibility);

        // ---- クリアボタンのクリック処理 ----
        clearBtn.addEventListener('click', () => {
            input.value = '';
            syncVisibility();       // ボタンを非表示に
            input.focus();          // 入力欄にフォーカスを戻す

            // 「クリアされた」ことを伝えるカスタムイベントを発火。
            // bubbles: true にすることで document レベルでも受け取れる。
            // detail に inputId を含めることで、複数の検索バーを持つページでも判別可能。
            input.dispatchEvent(new CustomEvent('search:cleared', {
                bubbles: true,
                detail: { inputId: targetId }
            }));
        });
    });
});