/**
 * account.js v2.0
 * アカウント関連ページ統合スクリプト
 */

import { getApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import {
    getAuth, onAuthStateChanged, signOut, GoogleAuthProvider,
    signInWithRedirect, getRedirectResult, signInWithPopup,
    createUserWithEmailAndPassword, signInWithEmailAndPassword,
    EmailAuthProvider, linkWithCredential, linkWithPopup,
    unlink, reauthenticateWithCredential, updatePassword, updateEmail,
    updateProfile, sendEmailVerification, sendPasswordResetEmail,
    setPersistence, browserLocalPersistence, fetchSignInMethodsForEmail
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import {
    getFirestore, doc, getDoc, setDoc, addDoc, deleteDoc,
    getDocs, collection, query, orderBy, limit, where,
    Timestamp, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// ============================================================
// Firebase 初期化
// ============================================================
let _auth, _db;
async function getFirebase() {
    if (_auth && _db) return { auth: _auth, db: _db };
    const app = await new Promise((resolve) => {
        const check = () => { try { resolve(getApp()); } catch { setTimeout(check, 50); } };
        check();
    });
    _auth = getAuth(app);
    _db   = getFirestore(app);
    await setPersistence(_auth, browserLocalPersistence).catch(() => {});
    return { auth: _auth, db: _db };
}

// ============================================================
// 定数・設定
// ============================================================
// ★ Firebase Console → Authentication → Google → ウェブクライアントID を設定
const GOOGLE_CLIENT_ID   = "218375080608-kc02r32e2fjf6vdud3op740udcv5o4e2.apps.googleusercontent.com";
const EMAILJS_SERVICE    = "service_glirsis";
const EMAILJS_OTP_TPL    = "template_w2ile0p";
const OTP_EXPIRE_MIN     = 5;
const SESSION_KEY        = "legallife_session_id";
const ACTIVITY_MAX_DAYS  = 365;
const BACKUP_CODE_COUNT  = 10;

// ページ判定
const PAGE = (() => {
    const p = location.pathname.replace(/\/$/, "");
    const m = {
        "/account/signup":                  "signup",
        "/account/login":                   "login",
        "/account/logout":                  "logout",
        "/account/delete":                  "delete",
        "/account/settings":                "settings",
        "/account/settings/profile":        "profile",
        "/account/settings/privacy":        "privacy",
        "/account/security":                "security",
        "/account/security/activity":       "activity",
        "/account/security/device":         "device",
        "/account/security/pass":           "pass",
        "/account/security/2fa":            "twofa",
        "/account/security/2fa/backup-code":"backup",
        "/account/security/methods":        "methods",
    };
    return m[p] || null;
})();

// ============================================================
// ユーティリティ
// ============================================================
function esc(s) {
    return String(s ?? "").replace(/[<>&"']/g,
        c => ({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;","'":"&#39;"})[c]);
}

function parseUA() {
    const ua = navigator.userAgent;
    let browser = "その他";
    if (ua.includes("Edg/"))           browser = "Edge";
    else if (ua.includes("Chrome/"))   browser = "Chrome";
    else if (ua.includes("Firefox/"))  browser = "Firefox";
    else if (ua.includes("Safari/"))   browser = "Safari";
    let os = "その他";
    if (/iPhone|iPad|iPod/.test(ua))   os = "iOS";
    else if (ua.includes("Android"))   os = "Android";
    else if (ua.includes("Windows"))   os = "Windows";
    else if (ua.includes("Mac OS X"))  os = "macOS";
    else if (ua.includes("Linux"))     os = "Linux";
    const device = /Mobi|Android|iPhone|iPad/i.test(ua) ? "スマートフォン/タブレット" : "PC";
    return { browser, os, device };
}

async function fetchLocation() {
    try {
        const r = await fetch("https://ipapi.run/json", { signal: AbortSignal.timeout(3000) });
        if (r.ok) {
            const d = await r.json();
            if (d?.country_name) return [d.city, d.country_name].filter(Boolean).join(", ");
        }
    } catch (_) {}
    try {
        const r = await fetch("https://cloudflare.com/cdn-cgi/trace", { signal: AbortSignal.timeout(2000) });
        if (r.ok) return (await r.text()).match(/loc=([A-Z]{2})/)?.[1] || "不明";
    } catch (_) {}
    return "不明";
}

function setMsg(elId, text, type = "") {
    const el = typeof elId === "string" ? document.getElementById(elId) : elId;
    if (!el) return;
    el.textContent = text;
    el.className = `settings-msg ${type}`;
}

function btn(id, text = null, disabled = null) {
    const el = document.getElementById(id);
    if (!el) return;
    if (text !== null)     el.textContent = text;
    if (disabled !== null) el.disabled    = disabled;
}

function show(id) { const el = document.getElementById(id); if (el) el.style.display = "block"; }
function hide(id) { const el = document.getElementById(id); if (el) el.style.display = "none"; }

function formatDate(ts) {
    if (!ts) return "不明";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

function relativeDate(ts) {
    if (!ts) return "不明";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const diff = Date.now() - d.getTime();
    const min  = Math.floor(diff / 60000);
    const hr   = Math.floor(diff / 3600000);
    const day  = Math.floor(diff / 86400000);
    if (min < 1)  return "たった今";
    if (min < 60) return `${min}分前`;
    if (hr  < 24) return `${hr}時間前`;
    if (day < 7)  return `${day}日前`;
    return d.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
}

// ============================================================
// アクティビティログ
// ============================================================
async function logActivity(uid, type, detail = "") {
    const { db } = await getFirebase();
    const ua = parseUA();
    try {
        await addDoc(collection(db, "users", uid, "activity"), {
            type, detail,
            timestamp: serverTimestamp(),
            browser:   ua.browser,
            os:        ua.os,
            device:    ua.device,
        });
        // 1年以上前のログを非同期で削除
        cleanupOldActivity(uid, db);
    } catch (e) {
        console.warn("Activity log failed:", e);
    }
}

async function cleanupOldActivity(uid, db) {
    try {
        const cutoff = Timestamp.fromMillis(Date.now() - ACTIVITY_MAX_DAYS * 86400000);
        const q    = query(collection(db, "users", uid, "activity"), where("timestamp", "<", cutoff));
        const snap = await getDocs(q);
        await Promise.allSettled(snap.docs.map(d => deleteDoc(d.ref)));
    } catch (_) {}
}

// ============================================================
// OTP ユーティリティ
// ============================================================
function genOTP() {
    return String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
}

async function saveOTP(uid, db, code, purpose) {
    await setDoc(doc(db, "users", uid, "security", "twoFactor"), {
        otpCode: code,
        otpExpiryMs: Date.now() + OTP_EXPIRE_MIN * 60_000,
        otpPurpose:  purpose,
    }, { merge: true });
}

async function verifyOTP(uid, db, input, purpose) {
    const snap = await getDoc(doc(db, "users", uid, "security", "twoFactor"));
    if (!snap.exists()) return { ok: false, reason: "コードが見つかりません" };
    const { otpCode, otpExpiryMs, otpPurpose } = snap.data();
    if (otpPurpose !== purpose)      return { ok: false, reason: "用途が一致しません" };
    if (Date.now() > otpExpiryMs)    return { ok: false, reason: "有効期限が切れています" };
    if (otpCode !== input)           return { ok: false, reason: "コードが正しくありません" };
    return { ok: true };
}

async function clearOTP(uid, db) {
    await setDoc(doc(db, "users", uid, "security", "twoFactor"), {
        otpCode: null, otpExpiryMs: null, otpPurpose: null,
    }, { merge: true });
}

async function sendOTPEmail(user, code, purpose) {
    if (!window.emailjs) throw new Error("EmailJS未初期化");
    await window.emailjs.send(EMAILJS_SERVICE, EMAILJS_OTP_TPL, {
        to_email:       user.email,
        to_name:        user.displayName || "ユーザー",
        otp_code:       code,
        expiry_minutes: OTP_EXPIRE_MIN,
        purpose,
    });
}

async function is2FAEnabled(uid, db) {
    const snap = await getDoc(doc(db, "users", uid, "security", "twoFactor"));
    return snap.exists() && (snap.data().enabled ?? false);
}

// OTP確認UIをモーダルで表示 → Promise<boolean>
function showOTPModal(purpose, labelText) {
    return new Promise((resolve) => {
        const overlay = Object.assign(document.createElement("div"), {
            className: "otp-modal-overlay",
            innerHTML: `
<div class="otp-modal-box">
    <p class="otp-modal-title">🔐 認証コードを入力</p>
    <p class="otp-modal-desc">${esc(labelText)}</p>
    <input id="_otpInput" type="text" inputmode="numeric" maxlength="6"
           placeholder="000000" class="otp-input" autocomplete="one-time-code">
    <p id="_otpError" class="otp-error"></p>
    <div class="otp-btns">
        <button id="_otpCancel" class="otp-btn-cancel">キャンセル</button>
        <button id="_otpSubmit" class="otp-btn-submit">確認する</button>
    </div>
</div>`,
        });
        document.body.appendChild(overlay);
        setTimeout(() => overlay.querySelector("#_otpInput")?.focus(), 50);

        const cleanup = (result) => {
            document.body.removeChild(overlay);
            resolve(result);
        };

        overlay.querySelector("#_otpCancel").onclick = () => cleanup(false);
        overlay.querySelector("#_otpSubmit").onclick = async () => {
            const code    = overlay.querySelector("#_otpInput").value.trim();
            const submitB = overlay.querySelector("#_otpSubmit");
            const errEl   = overlay.querySelector("#_otpError");
            if (!code) { errEl.textContent = "コードを入力してください"; return; }
            submitB.disabled = true; submitB.textContent = "確認中...";
            errEl.textContent = "";
            // 呼び出し元でVerify処理を行うため、入力値をカスタムイベントで返す
            overlay.dataset.code = code;
            cleanup(code);
        };
        overlay.querySelector("#_otpInput").onkeydown = (e) => {
            if (e.key === "Enter") overlay.querySelector("#_otpSubmit").click();
        };
    });
}

// ============================================================
// 通知メール
// ============================================================
async function sendNotification(user, db, actionType, detail = "") {
    try {
        if (!user.email || !user.emailVerified) return;
        const prefSnap = await getDoc(doc(db, "users", user.uid, "settings", "notifications"));
        const prefs = prefSnap.exists() ? prefSnap.data() : {};
        if (prefs[actionType] === false) return;
        const msgs = {
            login:           { s:"ログイン通知",         b:`${detail || "アカウントにログインがありました"}\n\n身に覚えがない場合はすぐにパスワードを変更してください。` },
            passwordChange:  { s:"パスワード変更通知",   b:"パスワードが変更されました。身に覚えがない場合は対処してください。" },
            otpChange:       { s:"二段階認証設定変更通知", b:`二段階認証が${detail}されました。` },
            deletionRequest: { s:"アカウント削除依頼",    b:"アカウント削除が申請されました。30日以内にキャンセル可能です。" },
        };
        const msg = msgs[actionType];
        if (!msg || !window.emailjs) return;
        await window.emailjs.send(EMAILJS_SERVICE, EMAILJS_OTP_TPL, {
            to_email: user.email, to_name: user.displayName || "ユーザー",
            otp_code: "", expiry_minutes: "", purpose: msg.s,
            message_body: msg.b,
        });
    } catch (_) {}
}

// ============================================================
// セッション管理
// ============================================================
function getSessionId() {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
        id = Date.now().toString(36) + Math.random().toString(36).slice(2);
        localStorage.setItem(SESSION_KEY, id);
    }
    return id;
}

async function registerSession(user, db) {
    const sid = getSessionId();
    const ref = doc(db, "users", user.uid, "sessions", sid);
    const ua  = parseUA();
    try {
        const snap = await getDoc(ref);
        if (!snap.exists()) {
            const location = await fetchLocation();
            await setDoc(ref, {
                sessionId: sid, browser: ua.browser, os: ua.os, device: ua.device,
                location, loginAt: serverTimestamp(), lastActive: serverTimestamp(),
                shouldLogout: false,
            });
        } else {
            await setDoc(ref, { lastActive: serverTimestamp() }, { merge: true });
        }
    } catch (_) {}
}

async function removeSession(user, db) {
    try {
        const sid = localStorage.getItem(SESSION_KEY);
        if (sid) {
            await deleteDoc(doc(db, "users", user.uid, "sessions", sid));
            localStorage.removeItem(SESSION_KEY);
        }
    } catch (_) {}
}

// ============================================================
// ログイン後のリダイレクト先
// ============================================================
function redirectAfterLogin() {
    const next = new URLSearchParams(location.search).get("next");
    window.location.replace(next || "/account/settings/");
}

// ============================================================
// 認証必須チェック (ログインが必要なページで使用)
// ============================================================
async function requireAuth() {
    const { auth } = await getFirebase();
    return new Promise((resolve) => {
        const unsub = onAuthStateChanged(auth, (user) => {
            unsub();
            if (!user) {
                window.location.replace("/account/login?next=" + encodeURIComponent(location.pathname));
            } else {
                resolve(user);
            }
        });
    });
}

// ============================================================
// ============================================================
// ページ初期化関数
// ============================================================
// ============================================================

// ─────────────────────────────────────────
// /account/signup  アカウント作成
// ─────────────────────────────────────────
async function initSignup() {
    const { auth, db } = await getFirebase();
    onAuthStateChanged(auth, (u) => { if (u) redirectAfterLogin(); });

    // Googleボタン
    document.getElementById("google-signup-btn")?.addEventListener("click", async () => {
        try {
            const provider = new GoogleAuthProvider();
            await signInWithRedirect(auth, provider);
        } catch (e) { showFormError("google-error", e.message); }
    });

    // リダイレクト結果の処理
    try {
        const result = await getRedirectResult(auth);
        if (result?.user) {
            await logActivity(result.user.uid, "signup", "Google");
            redirectAfterLogin();
        }
    } catch (e) { showFormError("google-error", e.message); }

    // メール登録フォーム
    document.getElementById("signup-submit")?.addEventListener("click", async () => {
        const name  = document.getElementById("signup-name")?.value.trim();
        const email = document.getElementById("signup-email")?.value.trim();
        const pass  = document.getElementById("signup-password")?.value;
        const pass2 = document.getElementById("signup-password-confirm")?.value;
        const msgEl = document.getElementById("signup-msg");

        if (!name)              return setMsg(msgEl, "お名前を入力してください", "error");
        if (!email)             return setMsg(msgEl, "メールアドレスを入力してください", "error");
        if (pass.length < 6)    return setMsg(msgEl, "パスワードは6文字以上にしてください", "error");
        if (pass !== pass2)     return setMsg(msgEl, "パスワードが一致しません", "error");

        btn("signup-submit", "作成中...", true);
        setMsg(msgEl, "", "");

        try {
            const cred = await createUserWithEmailAndPassword(auth, email, pass);
            await updateProfile(cred.user, { displayName: name });
            await sendEmailVerification(cred.user);
            await logActivity(cred.user.uid, "signup", "メール");
            redirectAfterLogin();
        } catch (e) {
            const M = {
                "auth/email-already-in-use": "このメールアドレスはすでに使用されています",
                "auth/invalid-email":        "メールアドレスの形式が正しくありません",
                "auth/weak-password":        "パスワードは6文字以上にしてください",
            };
            setMsg(msgEl, M[e.code] || e.message, "error");
            btn("signup-submit", "作成", false);
        }
    });
}

// ─────────────────────────────────────────
// /account/login  ログイン
// ─────────────────────────────────────────
async function initLogin() {
    const { auth, db } = await getFirebase();

    // すでにログイン済みなら即リダイレクト
    onAuthStateChanged(auth, (u) => { if (u) redirectAfterLogin(); });

    // ──── Googleリダイレクト結果の処理 ────
    try {
        btn("google-login-btn", "確認中...", true);
        const result = await getRedirectResult(auth);
        if (result?.user) {
            await _afterLoginSuccess(result.user, "Google", db);
            return;
        }
    } catch (e) {
        const M = {
            "auth/account-exists-with-different-credential":
                "このメールアドレスは別の方法で登録済みです",
        };
        setMsg("google-error", M[e.code] || e.message, "error");
    } finally {
        btn("google-login-btn", "Googleでログイン", false);
    }

    // ──── Google OneTap (GOOGLE_CLIENT_IDが設定されている場合のみ) ────
    if (GOOGLE_CLIENT_ID && window.google?.accounts) {
        google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: async (response) => {
                try {
                    const { GoogleAuthProvider } = await import(
                        "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js"
                    );
                    const credential = GoogleAuthProvider.credential(response.credential);
                    const result = await signInWithPopup(auth, new GoogleAuthProvider());
                    await _afterLoginSuccess(result.user, "Google OneTap", db);
                } catch (e) { setMsg("google-error", e.message, "error"); }
            },
            auto_select: false,
            cancel_on_tap_outside: true,
        });
        const container = document.getElementById("google-onetap-container");
        if (container) {
            google.accounts.id.renderButton(container, {
                type: "standard", theme: "outline", size: "large", width: 340, locale: "ja",
            });
        }
        google.accounts.id.prompt();
    }

    // ──── Googleボタン（リダイレクト方式） ────
    document.getElementById("google-login-btn")?.addEventListener("click", async () => {
        try {
            btn("google-login-btn", "Googleへ移動中...", true);
            await signInWithRedirect(auth, new GoogleAuthProvider());
        } catch (e) {
            setMsg("google-error", e.message, "error");
            btn("google-login-btn", "Googleでログイン", false);
        }
    });

    // ──── メールログイン ────
    document.getElementById("login-submit")?.addEventListener("click", _handleEmailLogin.bind(null, auth, db));
    document.getElementById("login-password")?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") document.getElementById("login-submit")?.click();
    });

    // ──── パスワードリセット ────
    document.getElementById("forgot-password-btn")?.addEventListener("click", async () => {
        const email = document.getElementById("login-email")?.value.trim();
        const msgEl = document.getElementById("login-msg");
        if (!email) return setMsg(msgEl, "メールアドレスを入力してください", "error");
        try {
            await sendPasswordResetEmail(auth, email);
            setMsg(msgEl, "✅ パスワードリセットメールを送信しました", "success");
        } catch (e) {
            const M = {
                "auth/user-not-found": "このメールアドレスは登録されていません",
                "auth/invalid-email":  "メールアドレスの形式が正しくありません",
            };
            setMsg(msgEl, M[e.code] || e.message, "error");
        }
    });

    // ──── 新規登録リンク ────
    document.getElementById("to-signup-btn")?.addEventListener("click", () => {
        window.location.href = "/account/signup";
    });
}

async function _handleEmailLogin(auth, db) {
    const email = document.getElementById("login-email")?.value.trim();
    const pass  = document.getElementById("login-password")?.value;
    const msgEl = document.getElementById("login-msg");

    if (!email || !pass) return setMsg(msgEl, "メールアドレスとパスワードを入力してください", "error");

    btn("login-submit", "ログイン中...", true);
    setMsg(msgEl, "", "");

    try {
        const cred = await signInWithEmailAndPassword(auth, email, pass);

        // ── ログイン時2FAチェック ──
        const enabled = await is2FAEnabled(cred.user.uid, db);
        if (enabled && cred.user.email) {
            // OTP送信
            const code = genOTP();
            await saveOTP(cred.user.uid, db, code, "login_verify");
            await sendOTPEmail(cred.user, code, "ログイン認証");

            // OTP確認モーダル表示
            setMsg(msgEl, `📧 ${cred.user.email} に認証コードを送信しました`, "success");

            const inputCode = await showOTPModal("login_verify", `${cred.user.email} に送信した6桁のコードを入力してください`);
            if (!inputCode) {
                // キャンセル → ログアウト
                await signOut(auth);
                setMsg(msgEl, "認証がキャンセルされました", "error");
                btn("login-submit", "ログイン", false);
                return;
            }

            const result = await verifyOTP(cred.user.uid, db, inputCode, "login_verify");
            if (!result.ok) {
                await signOut(auth);
                setMsg(msgEl, result.reason, "error");
                btn("login-submit", "ログイン", false);
                return;
            }
            await clearOTP(cred.user.uid, db);
        }

        await _afterLoginSuccess(cred.user, "メール", db);
    } catch (e) {
        const M = {
            "auth/user-not-found":     "このメールアドレスは登録されていません",
            "auth/wrong-password":     "パスワードが間違っています",
            "auth/invalid-credential": "メールアドレスまたはパスワードが間違っています",
            "auth/too-many-requests":  "しばらく時間をおいてから再試行してください",
        };
        setMsg(msgEl, M[e.code] || e.message, "error");
        btn("login-submit", "ログイン", false);
    }
}

async function _afterLoginSuccess(user, method, db) {
    await registerSession(user, db);
    await logActivity(user.uid, "login", method);
    await sendNotification(user, db, "login", `${method}でログインしました`);
    redirectAfterLogin();
}

// ─────────────────────────────────────────
// /account/logout  ログアウト
// ─────────────────────────────────────────
async function initLogout() {
    const { auth, db } = await getFirebase();
    try {
        const user = auth.currentUser;
        if (user) {
            await logActivity(user.uid, "logout", "");
            await removeSession(user, db);
        }
        await signOut(auth);
        // セッションキャッシュもクリア
        sessionStorage.removeItem("ll_auth_cache");
        // ログアウト完了UI表示
        show("logout-success");
        hide("logout-loading");
        // 3秒後にトップへ
        setTimeout(() => window.location.replace("/"), 3000);
    } catch (e) {
        console.error("Logout error:", e);
        window.location.replace("/");
    }
}

// ─────────────────────────────────────────
// /account/delete  アカウント削除
// ─────────────────────────────────────────
async function initDelete() {
    const user        = await requireAuth();
    const { auth, db } = await getFirebase();

    // チェックボックス監視
    const checkboxes  = document.querySelectorAll(".deletion-checkbox");
    const executeBtn  = document.getElementById("delete-execute-btn");
    const updateCheck = () => {
        if (executeBtn) executeBtn.disabled =
            ![...checkboxes].every(c => c.checked);
    };
    checkboxes.forEach(c => c.addEventListener("change", updateCheck));
    updateCheck();

    // 削除申請
    executeBtn?.addEventListener("click", async () => {
        const msgEl = document.getElementById("delete-msg");
        btn("delete-execute-btn", "処理中...", true);
        setMsg(msgEl, "", "");

        // 2FA確認
        const enabled = await is2FAEnabled(user.uid, db);
        if (enabled && user.email) {
            const code = genOTP();
            await saveOTP(user.uid, db, code, "account_delete");
            await sendOTPEmail(user, code, "アカウント削除申請");
            setMsg(msgEl, `📧 ${user.email} に認証コードを送信しました`, "success");

            const inputCode = await showOTPModal("account_delete",
                `${user.email} に送信した6桁のコードを入力してください`);
            if (!inputCode) {
                setMsg(msgEl, "キャンセルしました", "error");
                btn("delete-execute-btn", "削除を申請する", false);
                return;
            }
            const res = await verifyOTP(user.uid, db, inputCode, "account_delete");
            if (!res.ok) {
                setMsg(msgEl, res.reason, "error");
                btn("delete-execute-btn", "削除を申請する", false);
                return;
            }
            await clearOTP(user.uid, db);
        }

        // Firestoreに削除スケジュールを記録
        const scheduledAt = Timestamp.fromMillis(Date.now() + 30 * 86400000);
        await setDoc(doc(db, "users", user.uid), {
            deletionPending:   true,
            scheduledDeletion: scheduledAt,
            deletionRequestAt: serverTimestamp(),
        }, { merge: true });

        await logActivity(user.uid, "deletion_request", "30日後削除予定");
        await sendNotification(user, db, "deletionRequest", "");

        // ログアウトして完了画面へ
        await removeSession(user, db);
        await signOut(auth);
        sessionStorage.removeItem("ll_auth_cache");
        hide("delete-form-wrapper");
        show("delete-success");
    });
}

// ─────────────────────────────────────────
// /account/settings/  設定ハブ
// ─────────────────────────────────────────
async function initSettings() {
    const user = await requireAuth();
    const { db } = await getFirebase();

    // 削除申請中バナー
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists() && snap.data().deletionPending) {
        const d = snap.data().scheduledDeletion?.toDate();
        show("deletion-pending-banner");
        const el = document.getElementById("deletion-scheduled-date");
        if (el && d) el.textContent = d.toLocaleString("ja-JP");
    }

    // ユーザー情報表示
    _renderUserCard(user);

    // 削除キャンセル
    document.getElementById("cancel-deletion-btn")?.addEventListener("click", async () => {
        if (!confirm("アカウント削除をキャンセルしますか？")) return;
        await setDoc(doc(db, "users", user.uid), { deletionPending: false, scheduledDeletion: null }, { merge: true });
        hide("deletion-pending-banner");
    });
}

// ─────────────────────────────────────────
// /account/settings/profile  プロフィール
// ─────────────────────────────────────────
async function initProfile() {
    const user = await requireAuth();
    const { db } = await getFirebase();

    _renderUserCard(user);

    // 表示名変更
    const nameInput = document.getElementById("profile-display-name");
    if (nameInput) nameInput.value = user.displayName || "";

    document.getElementById("profile-save-btn")?.addEventListener("click", async () => {
        const name  = document.getElementById("profile-display-name")?.value.trim();
        const msgEl = document.getElementById("profile-msg");
        if (!name) return setMsg(msgEl, "名前を入力してください", "error");
        btn("profile-save-btn", "保存中...", true);
        try {
            await updateProfile(user, { displayName: name });
            setMsg(msgEl, "✅ 更新しました", "success");
            _renderUserCard(user);
            await logActivity(user.uid, "profile_update", "表示名変更");
        } catch (e) {
            setMsg(msgEl, e.message, "error");
        } finally {
            btn("profile-save-btn", "保存", false);
        }
    });

    // メール確認バナー
    if (user.email && !user.emailVerified &&
        user.providerData.some(p => p.providerId === "password")) {
        show("email-verify-banner");
    }

    document.getElementById("send-verify-email-btn")?.addEventListener("click", async () => {
        btn("send-verify-email-btn", "送信中...", true);
        try {
            await sendEmailVerification(user);
            setMsg("verify-email-msg", "✅ 確認メールを送信しました", "success");
        } catch (e) {
            setMsg("verify-email-msg", e.message, "error");
        } finally {
            setTimeout(() => btn("send-verify-email-btn", "確認メールを再送する", false), 60000);
        }
    });
}

// ─────────────────────────────────────────
// /account/settings/privacy  プライバシー
// ─────────────────────────────────────────
const NOTIF_LABELS = {
    login:           "ログイン通知",
    passwordChange:  "パスワード変更通知",
    otpChange:       "二段階認証変更通知",
    deletionRequest: "アカウント削除依頼通知",
};

async function initPrivacy() {
    const user = await requireAuth();
    const { db } = await getFirebase();

    const container = document.getElementById("notification-settings");
    if (!container) return;

    const snap  = await getDoc(doc(db, "users", user.uid, "settings", "notifications"));
    const prefs = snap.exists() ? snap.data() : {};

    container.innerHTML = Object.entries(NOTIF_LABELS).map(([key, label]) => {
        const on = prefs[key] !== false;
        return `
<div class="setting-toggle-item">
    <div class="setting-text">
        <span class="setting-label">${label}</span>
        <p class="setting-description">メールアドレス確認済みの場合のみ有効</p>
    </div>
    <label class="switch">
        <input type="checkbox" class="notif-toggle" data-key="${key}" ${on ? "checked" : ""}
               ${!user.emailVerified ? "disabled" : ""}>
        <span class="slider round"></span>
    </label>
</div>`;
    }).join("");

    if (!user.emailVerified) {
        container.insertAdjacentHTML("beforeend",
            `<p class="info-text" style="color:#e74c3c;margin-top:8px;">
             ⚠️ メールアドレスが確認済みでないと通知を受け取れません</p>`);
    }

    container.querySelectorAll(".notif-toggle").forEach(toggle => {
        toggle.addEventListener("change", async (e) => {
            await setDoc(doc(db, "users", user.uid, "settings", "notifications"),
                { [e.target.dataset.key]: e.target.checked }, { merge: true });
        });
    });
}

// ─────────────────────────────────────────
// /account/security  セキュリティハブ
// ─────────────────────────────────────────
async function initSecurity() {
    const user = await requireAuth();
    const { db } = await getFirebase();

    // 2FAステータス表示
    const enabled = await is2FAEnabled(user.uid, db);
    const el2fa = document.getElementById("2fa-status-badge");
    if (el2fa) {
        el2fa.textContent  = enabled ? "有効" : "無効";
        el2fa.className    = `status-badge ${enabled ? "enabled" : "disabled"}`;
    }

    // パスワード設定状況
    const hasPass = user.providerData.some(p => p.providerId === "password");
    const elPass  = document.getElementById("password-status-badge");
    if (elPass) elPass.textContent = hasPass ? "設定済み" : "未設定";

    // 最終ログイン
    const lastSignIn = user.metadata?.lastSignInTime;
    const elSign = document.getElementById("last-signin-date");
    if (elSign && lastSignIn)
        elSign.textContent = new Date(lastSignIn).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

// ─────────────────────────────────────────
// /account/security/activity  アクティビティ
// ─────────────────────────────────────────
const ACTIVITY_LABELS = {
    login:            { icon: "🔑", label: "ログイン" },
    logout:           { icon: "🚪", label: "ログアウト" },
    signup:           { icon: "✨", label: "アカウント作成" },
    password_change:  { icon: "🔒", label: "パスワード変更" },
    profile_update:   { icon: "👤", label: "プロフィール更新" },
    twofa_change:     { icon: "🛡️", label: "二段階認証変更" },
    email_change:     { icon: "📧", label: "メールアドレス変更" },
    method_change:    { icon: "🔗", label: "ログイン方法変更" },
    deletion_request: { icon: "⚠️", label: "アカウント削除申請" },
};

async function initActivity() {
    const user = await requireAuth();
    const { db } = await getFirebase();

    const listEl = document.getElementById("activity-list");
    if (!listEl) return;

    listEl.innerHTML = '<p class="loading-text">読み込み中...</p>';

    try {
        const q    = query(collection(db, "users", user.uid, "activity"),
                           orderBy("timestamp", "desc"), limit(50));
        const snap = await getDocs(q);

        if (snap.empty) {
            listEl.innerHTML = '<p class="empty-text">アクティビティがありません</p>';
            return;
        }

        listEl.innerHTML = snap.docs.map(d => {
            const data   = d.data();
            const info   = ACTIVITY_LABELS[data.type] || { icon: "📋", label: data.type };
            const ts     = data.timestamp;
            return `
<div class="activity-item">
    <div class="activity-icon-wrap">
        <span style="font-size:1.2rem;">${info.icon}</span>
    </div>
    <div class="activity-details">
        <div class="activity-main">
            <span class="activity-action">${info.label}</span>
            <span class="activity-time">${ts ? relativeDate(ts) : "不明"}</span>
        </div>
        <p class="activity-info">
            ${esc(data.browser || "")} / ${esc(data.os || "")}
            ${data.detail ? ` — ${esc(data.detail)}` : ""}
        </p>
        <p class="activity-info" style="color:#aaa;font-size:12px;">
            ${ts ? formatDate(ts) : ""}
        </p>
    </div>
</div>`;
        }).join("");
    } catch (e) {
        listEl.innerHTML = `<p class="error-text">読み込みに失敗しました: ${esc(e.message)}</p>`;
    }
}

// ─────────────────────────────────────────
// /account/security/device  デバイス管理
// ─────────────────────────────────────────
async function initDevice() {
    const user = await requireAuth();
    const { db } = await getFirebase();

    const listEl = document.getElementById("device-list");
    if (listEl) await _renderDeviceList(user, db, listEl);

    document.getElementById("logout-all-others-btn")
        ?.addEventListener("click", () => _logoutAllOthers(user, db, listEl));
}

async function _renderDeviceList(user, db, listEl) {
    listEl.innerHTML = '<p class="loading-text">読み込み中...</p>';
    try {
        const q    = query(collection(db, "users", user.uid, "sessions"),
                           orderBy("lastActive", "desc"), limit(10));
        const snap = await getDocs(q);
        const currentSid = localStorage.getItem(SESSION_KEY);

        if (snap.empty) {
            listEl.innerHTML = '<p class="empty-text">セッション情報がありません</p>';
            hide("logout-all-others-btn");
            return;
        }

        let hasOthers = false;
        listEl.innerHTML = snap.docs.map(d => {
            const data      = d.data();
            const isCurrent = data.sessionId === currentSid;
            if (!isCurrent) hasOthers = true;
            const icon = (data.device || "").includes("スマートフォン") ? "📱" : "💻";
            return `
<div class="device-item${isCurrent ? " current" : ""}" data-session-id="${esc(data.sessionId)}">
    <div class="device-icon">${icon}</div>
    <div class="device-info">
        <div class="device-name">
            ${esc(data.browser || "不明")}
            ${isCurrent ? '<span class="current-badge">現在の端末</span>' : ""}
        </div>
        <p class="device-meta">
            ${esc(data.os || "不明")} · ${esc(data.location || "不明")} ·
            ${data.lastActive ? relativeDate(data.lastActive) : "不明"}
        </p>
    </div>
    ${!isCurrent ? `<button class="btn-text-only session-logout-btn"
        data-sid="${esc(data.sessionId)}">ログアウト</button>` : ""}
</div>`;
        }).join("");

        if (hasOthers) show("logout-all-others-btn");
        else           hide("logout-all-others-btn");

        // 個別ログアウト
        listEl.querySelectorAll(".session-logout-btn").forEach(b => {
            b.addEventListener("click", async () => {
                if (!confirm("この端末からログアウトしますか？")) return;
                const sid = b.dataset.sid;
                try {
                    await setDoc(doc(db, "users", user.uid, "sessions", sid),
                        { shouldLogout: true }, { merge: true });
                    b.closest(".device-item")?.remove();
                    const remaining = listEl.querySelectorAll(".device-item:not(.current)");
                    if (remaining.length === 0) hide("logout-all-others-btn");
                } catch (e) { alert("失敗しました: " + e.message); }
            });
        });
    } catch (e) {
        listEl.innerHTML = `<p class="error-text">読み込みに失敗しました</p>`;
    }
}

async function _logoutAllOthers(user, db, listEl) {
    const others = document.querySelectorAll(".device-item:not(.current)");
    if (others.length === 0) { alert("他にアクティブな端末はありません"); return; }
    if (!confirm(`${others.length}台の端末からログアウトしますか？`)) return;

    const currentSid = localStorage.getItem(SESSION_KEY);
    try {
        const snap = await getDocs(collection(db, "users", user.uid, "sessions"));
        await Promise.allSettled(
            snap.docs
                .filter(d => d.data().sessionId !== currentSid)
                .map(d => setDoc(d.ref, { shouldLogout: true }, { merge: true }))
        );
        others.forEach(el => el.remove());
        hide("logout-all-others-btn");
    } catch (e) { alert("失敗しました: " + e.message); }
}

// ─────────────────────────────────────────
// /account/security/pass  パスワード変更
// ─────────────────────────────────────────
async function initPass() {
    const user = await requireAuth();
    const { auth, db } = await getFirebase();

    const hasPass = user.providerData.some(p => p.providerId === "password");
    const row     = document.getElementById("current-password-row");
    const title   = document.getElementById("pass-card-title");
    const submitB = document.getElementById("pass-submit-btn");

    if (row)     row.style.display     = hasPass ? "block" : "none";
    if (title)   title.textContent     = hasPass ? "🔑 パスワードを変更する" : "🔑 パスワードを設定する";
    if (submitB) submitB.textContent   = hasPass ? "パスワードを変更する" : "パスワードを設定する";

    submitB?.addEventListener("click", async () => {
        const current = document.getElementById("current-password")?.value;
        const newPass = document.getElementById("new-password")?.value;
        const confirm = document.getElementById("confirm-password")?.value;
        const msgEl   = document.getElementById("pass-msg");

        if (!newPass)         return setMsg(msgEl, "新しいパスワードを入力してください", "error");
        if (newPass.length < 6) return setMsg(msgEl, "パスワードは6文字以上にしてください", "error");
        if (newPass !== confirm) return setMsg(msgEl, "パスワードが一致しません", "error");

        btn("pass-submit-btn", "処理中...", true);
        setMsg(msgEl, "", "");

        // 2FA確認
        const enabled = await is2FAEnabled(user.uid, db);
        if (enabled && user.email) {
            const code = genOTP();
            await saveOTP(user.uid, db, code, "password_change");
            await sendOTPEmail(user, code, "パスワード変更");
            setMsg(msgEl, `📧 ${user.email} に認証コードを送信しました`, "success");

            const inputCode = await showOTPModal("password_change",
                `${user.email} に送信した6桁のコードを入力してください`);
            if (!inputCode) {
                setMsg(msgEl, "キャンセルしました", "error");
                btn("pass-submit-btn", hasPass ? "パスワードを変更する" : "パスワードを設定する", false);
                return;
            }
            const res = await verifyOTP(user.uid, db, inputCode, "password_change");
            if (!res.ok) {
                setMsg(msgEl, res.reason, "error");
                btn("pass-submit-btn", hasPass ? "パスワードを変更する" : "パスワードを設定する", false);
                return;
            }
            await clearOTP(user.uid, db);
        }

        try {
            if (hasPass) {
                if (!current) return setMsg(msgEl, "現在のパスワードを入力してください", "error");
                const cred = EmailAuthProvider.credential(user.email, current);
                await reauthenticateWithCredential(user, cred);
                await updatePassword(user, newPass);
            } else {
                const cred = EmailAuthProvider.credential(user.email, newPass);
                await linkWithCredential(user, cred);
            }
            document.getElementById("current-password").value  = "";
            document.getElementById("new-password").value      = "";
            document.getElementById("confirm-password").value  = "";
            setMsg(msgEl, "✅ 変更しました", "success");
            await logActivity(user.uid, "password_change", "");
            await sendNotification(user, db, "passwordChange", "");
        } catch (e) {
            const M = {
                "auth/wrong-password":        "現在のパスワードが間違っています",
                "auth/requires-recent-login": "セキュリティのため再ログインが必要です",
            };
            setMsg(msgEl, M[e.code] || e.message, "error");
        } finally {
            const hp = user.providerData.some(p => p.providerId === "password");
            btn("pass-submit-btn", hp ? "パスワードを変更する" : "パスワードを設定する", false);
        }
    });
}

// ─────────────────────────────────────────
// /account/security/2fa  二段階認証
// ─────────────────────────────────────────
async function initTwoFA() {
    const user = await requireAuth();
    const { db } = await getFirebase();

    const enabled = await is2FAEnabled(user.uid, db);
    const toggle  = document.getElementById("two-factor-toggle");
    const label   = document.getElementById("two-factor-status-label");
    const badge   = document.getElementById("2fa-status-badge");
    if (toggle) toggle.checked    = enabled;
    if (label)  label.textContent = enabled ? "有効" : "無効";
    if (badge)  { badge.textContent = enabled ? "有効" : "無効"; badge.className = `status-badge ${enabled ? "enabled" : "disabled"}`; }

    toggle?.addEventListener("change", async (e) => {
        const newState  = e.target.checked;
        const purpose   = newState ? "2fa_enable" : "2fa_disable";
        const purposeTxt = newState ? "二段階認証の有効化" : "二段階認証の無効化";
        const msgEl     = document.getElementById("two-factor-msg");

        if (!user.email) {
            setMsg(msgEl, "二段階認証を使用するにはメールアドレスが必要です", "error");
            toggle.checked = !newState;
            return;
        }

        toggle.disabled = true;
        setMsg(msgEl, "認証コードを送信中...", "");

        try {
            const code = genOTP();
            await saveOTP(user.uid, db, code, purpose);
            await sendOTPEmail(user, code, purposeTxt);
            setMsg(msgEl, `📧 ${user.email} に認証コードを送信しました`, "success");

            const inputCode = await showOTPModal(purpose,
                `${user.email} に送信した6桁のコードを入力してください`);
            if (!inputCode) {
                toggle.checked = !newState;
                setMsg(msgEl, "キャンセルしました", "error");
                toggle.disabled = false;
                return;
            }
            const res = await verifyOTP(user.uid, db, inputCode, purpose);
            if (!res.ok) {
                toggle.checked = !newState;
                setMsg(msgEl, res.reason, "error");
                toggle.disabled = false;
                return;
            }
            await clearOTP(user.uid, db);
            await setDoc(doc(db, "users", user.uid, "security", "twoFactor"),
                { enabled: newState }, { merge: true });

            if (label) label.textContent = newState ? "有効" : "無効";
            if (badge) { badge.textContent = newState ? "有効" : "無効"; badge.className = `status-badge ${newState ? "enabled" : "disabled"}`; }
            setMsg(msgEl, `✅ 二段階認証を${newState ? "有効" : "無効"}にしました`, "success");
            await logActivity(user.uid, "twofa_change", newState ? "有効化" : "無効化");
            await sendNotification(user, db, "otpChange", newState ? "有効化" : "無効化");
        } catch (err) {
            toggle.checked = !newState;
            setMsg(msgEl, "送信に失敗しました。メールアドレスをご確認ください", "error");
        } finally {
            toggle.disabled = false;
        }
    });
}

// ─────────────────────────────────────────
// /account/security/2fa/backup-code  バックアップコード
// ─────────────────────────────────────────
function _genBackupCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

async function initBackupCode() {
    const user = await requireAuth();
    const { db } = await getFirebase();

    const gridEl = document.getElementById("backup-codes-grid");
    if (!gridEl) return;

    // 既存コードの取得
    const snap = await getDoc(doc(db, "users", user.uid, "security", "backupCodes"));
    let codes   = snap.exists() ? snap.data().codes || [] : [];

    if (codes.length === 0) {
        // 初回生成
        codes = _generateAndSaveCodes(user.uid, db);
    }

    _renderCodes(gridEl, Array.isArray(codes[0]) ? codes : codes.map(c => ({ code: c, used: false })));

    // 再生成ボタン
    document.getElementById("regenerate-codes-btn")?.addEventListener("click", async () => {
        if (!confirm("現在のバックアップコードはすべて無効になります。よろしいですか？")) return;
        const newCodes = await _generateAndSaveCodes(user.uid, db);
        _renderCodes(gridEl, newCodes);
        await logActivity(user.uid, "twofa_change", "バックアップコード再生成");
    });

    // コピーボタン
    document.getElementById("copy-codes-btn")?.addEventListener("click", () => {
        const text = codes.map(c => c.code || c).join("\n");
        navigator.clipboard.writeText(text).then(() => alert("✅ コピーしました"));
    });
}

async function _generateAndSaveCodes(uid, db) {
    const codes = Array.from({ length: BACKUP_CODE_COUNT }, () =>
        ({ code: _genBackupCode(), used: false }));
    await setDoc(doc(db, "users", uid, "security", "backupCodes"),
        { codes, generatedAt: serverTimestamp() }, { merge: false });
    return codes;
}

function _renderCodes(gridEl, codes) {
    gridEl.innerHTML = codes.map(({ code, used }) =>
        `<div class="code-item${used ? " code-used" : ""}">${used ? "<s>" + esc(code) + "</s>" : esc(code)}</div>`
    ).join("");
}

// ─────────────────────────────────────────
// /account/security/methods  ログイン方法
// ─────────────────────────────────────────
async function initMethods() {
    const user = await requireAuth();
    const { auth, db } = await getFirebase();

    _renderProviders(user, auth, db);

    // メールアドレス変更
    document.getElementById("set-email-btn")?.addEventListener("click", async () => {
        const email = document.getElementById("set-email-input")?.value.trim();
        const msgEl = document.getElementById("set-email-msg");
        if (!email)               return setMsg(msgEl, "メールアドレスを入力してください", "error");
        if (!email.includes("@")) return setMsg(msgEl, "正しいメールアドレスを入力してください", "error");

        btn("set-email-btn", "処理中...", true);
        try {
            await updateEmail(auth.currentUser, email);
            await sendEmailVerification(auth.currentUser);
            setMsg(msgEl, "✅ 設定しました。確認メールをご確認ください。", "success");
            await logActivity(user.uid, "email_change", "");
            _renderProviders(auth.currentUser, auth, db);
        } catch (e) {
            const M = {
                "auth/email-already-in-use": "このメールアドレスはすでに使用されています",
                "auth/requires-recent-login": "セキュリティのため再ログインが必要です",
            };
            setMsg(msgEl, M[e.code] || e.message, "error");
        } finally {
            btn("set-email-btn", "設定する", false);
        }
    });
}

function _renderProviders(user, auth, db) {
    const ids       = user.providerData.map(p => p.providerId);
    const total     = ids.length;
    _renderProviderRow("google", "google.com", ids, total, user, auth, db);
    _renderEmailRow(ids, total, user, auth, db);
}

function _renderProviderRow(key, providerId, ids, total, user, auth, db) {
    const isLinked = ids.includes(providerId);
    const statusEl = document.getElementById(`status-${key}`);
    const btnEl    = document.getElementById(`btn-${key}`);
    if (!statusEl || !btnEl) return;

    statusEl.textContent = isLinked ? "連携済み ✓" : "未連携";
    statusEl.className   = `provider-status ${isLinked ? "linked" : ""}`;

    if (isLinked) {
        btnEl.textContent = "解除する";
        btnEl.className   = "provider-link-btn unlink-btn";
        btnEl.disabled    = total <= 1;
        btnEl.title       = total <= 1 ? "最後のログイン方法は解除できません" : "";
        btnEl.onclick     = async () => {
            const msgEl = document.getElementById("provider-msg");
            if (!confirm("Google連携を解除しますか？")) return;
            try {
                await unlink(auth.currentUser, providerId);
                setMsg(msgEl, "✅ 解除しました", "success");
                await logActivity(user.uid, "method_change", "Google解除");
                _renderProviders(auth.currentUser, auth, db);
            } catch (e) { setMsg(msgEl, e.message, "error"); }
        };
    } else {
        btnEl.textContent = "連携する";
        btnEl.className   = "provider-link-btn link-btn";
        btnEl.disabled    = false;
        btnEl.onclick     = async () => {
            const msgEl = document.getElementById("provider-msg");
            try {
                await linkWithPopup(auth.currentUser, new GoogleAuthProvider());
                setMsg(msgEl, "✅ 連携しました", "success");
                await logActivity(user.uid, "method_change", "Google連携");
                _renderProviders(auth.currentUser, auth, db);
            } catch (e) {
                const M = { "auth/credential-already-in-use": "このGoogleアカウントはすでに別のユーザーに連携されています" };
                setMsg(msgEl, M[e.code] || e.message, "error");
            }
        };
    }
}

function _renderEmailRow(ids, total, user, auth, db) {
    const isLinked = ids.includes("password");
    const statusEl = document.getElementById("status-email");
    const btnEl    = document.getElementById("btn-email");
    const emailCard = document.getElementById("email-setup-card");
    if (emailCard) emailCard.style.display = user.email ? "none" : "block";
    if (!statusEl || !btnEl) return;

    statusEl.textContent = isLinked ? "設定済み ✓" : (user.email ? "未設定" : "先にメールアドレスを設定");
    statusEl.className   = `provider-status ${isLinked ? "linked" : ""}`;
    btnEl.disabled       = !user.email;

    if (isLinked) {
        btnEl.textContent = "解除する";
        btnEl.className   = "provider-link-btn unlink-btn";
        btnEl.disabled    = total <= 1;
        btnEl.onclick     = async () => {
            const msgEl = document.getElementById("provider-msg");
            if (!confirm("メール/パスワードログインを解除しますか？")) return;
            try {
                await unlink(auth.currentUser, "password");
                setMsg(msgEl, "✅ 解除しました", "success");
                await logActivity(user.uid, "method_change", "メール解除");
                _renderProviders(auth.currentUser, auth, db);
            } catch (e) { setMsg(msgEl, e.message, "error"); }
        };
    } else {
        btnEl.textContent = "パスワードを設定する";
        btnEl.className   = "provider-link-btn link-btn";
        btnEl.onclick     = () => { document.getElementById("email-pass-section")?.classList.remove("hidden"); };
    }
}

// ─────────────────────────────────────────
// 共通: ユーザー情報カード描画
// ─────────────────────────────────────────
function _renderUserCard(user) {
    const avatarWrap = document.getElementById("settings-avatar-wrap");
    if (avatarWrap) {
        avatarWrap.innerHTML = user.photoURL
            ? `<img src="${esc(user.photoURL)}" alt="avatar" class="user-info-avatar">`
            : `<div class="user-info-avatar-placeholder">👤</div>`;
    }
    const nameEl  = document.getElementById("settings-user-name");
    const emailEl = document.getElementById("settings-user-email");
    const uuidEl  = document.getElementById("settings-user-uuid");
    const signEl  = document.getElementById("settings-last-signin");
    if (nameEl)  nameEl.textContent  = user.displayName || "名前未設定";
    if (emailEl) emailEl.textContent = user.email || "（メールアドレス未設定）";
    if (uuidEl)  uuidEl.textContent  = user.uid;
    if (signEl && user.metadata?.lastSignInTime)
        signEl.textContent = new Date(user.metadata.lastSignInTime)
            .toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

function showFormError(id, msg) {
    const el = document.getElementById(id);
    if (el) { el.textContent = msg; el.style.display = "block"; }
}

// ============================================================
// ヘッダー内ユーザーUI更新 (important.js と共存)
// ============================================================
export function updateHeaderUI(user) {
    const loginLink  = document.getElementById("header-login-link");
    const logoutLink = document.getElementById("header-logout-link");
    const userArea   = document.getElementById("header-user-area");
    const userName   = document.getElementById("header-user-name");
    const userAvatar = document.getElementById("header-user-avatar");

    if (user) {
        if (loginLink)  loginLink.style.display  = "none";
        if (logoutLink) logoutLink.style.display = "block";
        if (userArea)   userArea.style.display   = "flex";
        if (userName)   userName.textContent     = user.displayName || user.email || "ユーザー";
        if (userAvatar && user.photoURL) userAvatar.src = user.photoURL;
    } else {
        if (loginLink)  loginLink.style.display  = "block";
        if (logoutLink) logoutLink.style.display = "none";
        if (userArea)   userArea.style.display   = "none";
    }
}

// ============================================================
// メインエントリポイント
// ============================================================
document.addEventListener("DOMContentLoaded", async () => {
    // EmailJS 初期化
    if (window.emailjs) window.emailjs.init("eG7KMS7F3Fh0PziYy");

    // ページ別初期化
    switch (PAGE) {
        case "signup":   await initSignup();    break;
        case "login":    await initLogin();     break;
        case "logout":   await initLogout();    break;
        case "delete":   await initDelete();    break;
        case "settings": await initSettings();  break;
        case "profile":  await initProfile();   break;
        case "privacy":  await initPrivacy();   break;
        case "security": await initSecurity();  break;
        case "activity": await initActivity();  break;
        case "device":   await initDevice();    break;
        case "pass":     await initPass();      break;
        case "twofa":    await initTwoFA();     break;
        case "backup":   await initBackupCode(); break;
        case "methods":  await initMethods();   break;
        default: break;
    }
});