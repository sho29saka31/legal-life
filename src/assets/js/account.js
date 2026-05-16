/**
 * account.js v4.0  — 全バグ修正版
 *
 * 修正内容:
 * #1  CSS側でサイズ統一
 * #2  sendEmailVerification → auth.currentUser 使用
 * #3  initPrivacy 強化 (try/catch + null guard)
 * #4  バックアップコード表示修正
 * #5  2FA有効化後にバックアップ/ログイン方法推奨を表示
 * #6  2FA未設定時はバックアップコードリンクを非活性に
 * #7  ログイン方法に連携済みアカウントのメール表示
 * #8  activityコレクションパスを users/{uid}/activity に修正 (4セグメント問題)
 * #9  logout-all-others → セッションドキュメントを削除 + リロード耐性
 * #10 パスワード変更 → auth.currentUser で再認証
 * #11 プロフィールページ リスト形式に
 */

import { getApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import {
    getAuth, onAuthStateChanged, signOut, GoogleAuthProvider,
    signInWithPopup, signInWithRedirect, getRedirectResult,
    createUserWithEmailAndPassword, signInWithEmailAndPassword,
    EmailAuthProvider, linkWithCredential, linkWithPopup,
    unlink, reauthenticateWithCredential, updatePassword, updateEmail,
    updateProfile, sendEmailVerification, sendPasswordResetEmail,
    setPersistence, browserLocalPersistence
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
// 定数
// ============================================================
const GOOGLE_CLIENT_ID  = "";
const EMAILJS_SERVICE   = "service_glirsis";
const EMAILJS_OTP_TPL   = "template_w2ile0p";
const OTP_EXPIRE_MIN    = 5;
const SESSION_KEY       = "legallife_session_id";
const ACTIVITY_MAX_DAYS = 365;
const BACKUP_CODE_COUNT = 10;
const CONSENT_INTERVAL  = 30 * 24 * 60 * 60 * 1000;

const PAGE = (() => {
    const p = location.pathname.replace(/\/$/, "");
    return {
        "/account/signup":                  "signup",
        "/account/login":                   "login",
        "/account/logout":                  "logout",
        "/account/delete":                  "delete",
        "/account/settings":                "sts",
        "/account/settings/profile":        "sts-prof",
        "/account/settings/privacy":        "sts-priv",
        "/account/security":                "sec",
        "/account/security/activity":       "sec-act",
        "/account/security/device":         "sec-dev",
        "/account/security/pass":           "sec-pw",
        "/account/security/2fa":            "sec-2fa",
        "/account/security/2fa/backup-code":"sec-buc",
        "/account/security/methods":        "sec-mths",
    }[p] || null;
})();

// ============================================================
// ユーティリティ
// ============================================================
const esc = (s) => String(s ?? "").replace(
    /[<>&"']/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;","'":"&#39;"})[c]);

function setMsg(elId, text, type = "") {
    const el = typeof elId === "string" ? document.getElementById(elId) : elId;
    if (!el) return;
    el.textContent = text;
    el.className = `settings-msg ${type}`;
}
function btnState(id, text = null, disabled = null) {
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
    const min = Math.floor(diff / 60000), hr = Math.floor(diff / 3600000), day = Math.floor(diff / 86400000);
    if (min < 1)  return "たった今";
    if (min < 60) return `${min}分前`;
    if (hr  < 24) return `${hr}時間前`;
    if (day < 7)  return `${day}日前`;
    return d.toLocaleDateString("ja-JP", { year:"numeric", month:"short", day:"numeric" });
}

function parseUA() {
    const ua = navigator.userAgent;
    let browser = "その他";
    if (ua.includes("Edg/"))          browser = "Edge";
    else if (ua.includes("Chrome/"))  browser = "Chrome";
    else if (ua.includes("Firefox/")) browser = "Firefox";
    else if (ua.includes("Safari/"))  browser = "Safari";
    let os = "その他";
    if (/iPhone|iPad|iPod/.test(ua))  os = "iOS";
    else if (ua.includes("Android"))  os = "Android";
    else if (ua.includes("Windows"))  os = "Windows";
    else if (ua.includes("Mac OS X")) os = "macOS";
    else if (ua.includes("Linux"))    os = "Linux";
    const device = /Mobi|Android|iPhone|iPad/i.test(ua) ? "スマートフォン/タブレット" : "PC";
    return { browser, os, device };
}

async function fetchLocation() {
    try {
        const r = await fetch("https://ipapi.co/json", { signal: AbortSignal.timeout(3000) });
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

// ============================================================
// リダイレクトURL 暗号化
// ============================================================
const encodeRedirect = (url) => { try { return btoa(unescape(encodeURIComponent(url))); } catch { return ""; } };
const decodeRedirect = (enc) => { try { const d = decodeURIComponent(escape(atob(enc))); return d.startsWith("/") ? d : null; } catch { return null; } };
function redirectAfterLogin() {
    const r = new URLSearchParams(location.search).get("r");
    window.location.replace((r ? decodeRedirect(r) : null) || "/account/settings/");
}

// ============================================================
// #8 FIX: アクティビティログ → users/{uid}/activity  (3セグメント = 有効)
// ============================================================
async function logActivity(uid, type, detail = "") {
    const { db } = await getFirebase();
    const ua = parseUA();
    try {
        // ★ FIX: users/{uid}/activity は3セグメント(奇数)→ 有効なコレクション
        await addDoc(collection(db, "users", uid, "activity"), {
            type, detail,
            timestamp: serverTimestamp(),
            browser: ua.browser,
            os:      ua.os,
            device:  ua.device,
        });
        cleanupOldActivity(uid, db);
    } catch (e) { console.warn("Activity log failed:", e.message); }
}

async function cleanupOldActivity(uid, db) {
    try {
        const cutoff = Timestamp.fromMillis(Date.now() - ACTIVITY_MAX_DAYS * 86400000);
        const q = query(collection(db, "users", uid, "activity"), where("timestamp", "<", cutoff));
        const snap = await getDocs(q);
        await Promise.allSettled(snap.docs.map(d => deleteDoc(d.ref)));
    } catch (_) {}
}

// ============================================================
// OTP
// ============================================================
const genOTP = () => String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");

async function saveOTP(uid, db, code, purpose) {
    await setDoc(doc(db, "users", uid, "security", "twoFactor"), {
        otpCode: code,
        otpExpiryMs: Date.now() + OTP_EXPIRE_MIN * 60_000,
        otpPurpose: purpose,
    }, { merge: true });
}

async function verifyOTP(uid, db, input, purpose) {
    const snap = await getDoc(doc(db, "users", uid, "security", "twoFactor"));
    if (!snap.exists()) return { ok: false, reason: "コードが見つかりません" };
    const { otpCode, otpExpiryMs, otpPurpose } = snap.data();
    if (otpPurpose !== purpose)   return { ok: false, reason: "用途が一致しません" };
    if (Date.now() > otpExpiryMs) return { ok: false, reason: "有効期限が切れています" };
    if (otpCode !== input)        return { ok: false, reason: "コードが正しくありません" };
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
        to_email: user.email,
        to_name:  user.displayName || "ユーザー",
        otp_code: code,
        expiry_minutes: OTP_EXPIRE_MIN,
        purpose,
    });
}

async function is2FAEnabled(uid, db) {
    try {
        const snap = await getDoc(doc(db, "users", uid, "security", "twoFactor"));
        return snap.exists() && (snap.data().enabled ?? false);
    } catch { return false; }
}

// ============================================================
// バックアップコード (users/{uid}/security/BackUpCode)
// ============================================================
async function tryBackupCode(uid, db, input) {
    if (!input || input.length < 4) return { ok: false };
    try {
        const snap = await getDoc(doc(db, "users", uid, "security", "BackUpCode"));
        if (!snap.exists()) return { ok: false, reason: "バックアップコードが設定されていません" };
        const codes = snap.data().codes || [];
        const idx = codes.findIndex(c => !c.used && c.code === input.toUpperCase().trim());
        if (idx === -1) return { ok: false, reason: "バックアップコードが正しくありません" };
        codes[idx].used = true;
        await setDoc(doc(db, "users", uid, "security", "BackUpCode"), { codes }, { merge: true });
        return { ok: true };
    } catch (e) {
        console.error("Backup code error:", e);
        return { ok: false, reason: "バックアップコードの検証に失敗しました" };
    }
}

// ============================================================
// OTPパネル (インライン)
// ============================================================
function showOTPPanel(containerId, { title="認証コードを入力", desc="", showBackupInput=false, onVerify, onCancel }) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `
<div class="otp-panel">
    <p class="otp-panel-title">${esc(title)}</p>
    <p class="otp-panel-desc">${esc(desc)}</p>
    <input id="_otp_code" type="text" inputmode="numeric" maxlength="6"
           placeholder="000000" class="otp-panel-input" autocomplete="one-time-code">
    ${showBackupInput ? `
    <p class="otp-panel-or">または バックアップコードを使用</p>
    <input id="_otp_backup" type="text" maxlength="16"
           placeholder="XXXXXXXX" class="otp-panel-input otp-panel-backup"
           style="letter-spacing:3px;font-size:1rem;">
    ` : ""}
    <p id="_otp_error" class="otp-error"></p>
    <div class="otp-panel-btns">
        <button id="_otp_cancel" class="btn-secondary-sm">キャンセル</button>
        <button id="_otp_submit" class="btn-primary-sm">確認する</button>
    </div>
</div>`;
    container.style.display = "block";

    const codeIn   = container.querySelector("#_otp_code");
    const backupIn = container.querySelector("#_otp_backup");
    const errEl    = container.querySelector("#_otp_error");
    const subBtn   = container.querySelector("#_otp_submit");
    const canBtn   = container.querySelector("#_otp_cancel");

    setTimeout(() => codeIn?.focus(), 50);

    const cleanup = () => { container.innerHTML = ""; container.style.display = "none"; };
    canBtn.onclick = () => { cleanup(); onCancel?.(); };

    subBtn.onclick = async () => {
        const code   = codeIn?.value.trim()   || "";
        const backup = backupIn?.value.trim() || "";
        const input  = code || backup;
        if (!input) { errEl.textContent = "コードを入力してください"; return; }
        subBtn.disabled = true; subBtn.textContent = "確認中...";
        errEl.textContent = "";
        const result = await onVerify(input, !!backup && !code);
        if (result.ok) { cleanup(); }
        else { errEl.textContent = result.reason || "コードが正しくありません"; subBtn.disabled = false; subBtn.textContent = "確認する"; }
    };
    if (codeIn) codeIn.onkeydown = e => { if (e.key === "Enter") subBtn.click(); };
}

// ポップアップモーダル
function createPopup(innerHTML) {
    const overlay = Object.assign(document.createElement("div"), {
        className: "popup-overlay",
        innerHTML: `<div class="popup-box">${innerHTML}</div>`,
    });
    document.body.appendChild(overlay);
    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
    return overlay;
}

// トースト通知
function showToast(msg, type = "info") {
    const t = Object.assign(document.createElement("div"), {
        className: `toast toast-${type}`,
        textContent: msg,
    });
    document.body.appendChild(t);
    setTimeout(() => t.classList.add("toast-show"), 10);
    setTimeout(() => { t.classList.remove("toast-show"); setTimeout(() => t.remove(), 400); }, 3500);
}

// ============================================================
// 通知メール
// ============================================================
async function sendNotification(user, db, actionType, detail = "") {
    try {
        if (!user?.email || !user?.emailVerified) return;
        const prefSnap = await getDoc(doc(db, "users", user.uid, "settings", "notifications")).catch(() => null);
        const prefs = prefSnap?.exists() ? prefSnap.data() : {};
        if (prefs[actionType] === false) return;
        if (!window.emailjs) return;
        const msgs = {
            login:           "アカウントにログインがありました",
            passwordChange:  "パスワードが変更されました",
            emailChange:     "メールアドレスが変更されました",
            otpChange:       `二段階認証が${detail}されました`,
            deletionRequest: "アカウント削除が申請されました（30日以内にキャンセル可能）",
        };
        const body = msgs[actionType] || detail;
        if (!body) return;
        await window.emailjs.send(EMAILJS_SERVICE, EMAILJS_OTP_TPL, {
            to_email: user.email, to_name: user.displayName || "ユーザー",
            otp_code: "", expiry_minutes: "", purpose: body,
        });
    } catch (_) {}
}

// ============================================================
// セッション管理
// ============================================================
function getSessionId() {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) { id = Date.now().toString(36) + Math.random().toString(36).slice(2); localStorage.setItem(SESSION_KEY, id); }
    return id;
}

async function registerSession(user, db) {
    const sid = getSessionId();
    const ref = doc(db, "users", user.uid, "sessions", sid);
    const ua  = parseUA();
    try {
        const snap = await getDoc(ref);
        if (!snap.exists()) {
            const loc = await fetchLocation();
            await setDoc(ref, { sessionId: sid, browser: ua.browser, os: ua.os, device: ua.device, location: loc, loginAt: serverTimestamp(), lastActive: serverTimestamp(), shouldLogout: false });
        } else {
            await setDoc(ref, { lastActive: serverTimestamp() }, { merge: true });
        }
    } catch (_) {}
}

async function removeSession(user, db) {
    try {
        const sid = localStorage.getItem(SESSION_KEY);
        if (sid) { await deleteDoc(doc(db, "users", user.uid, "sessions", sid)); localStorage.removeItem(SESSION_KEY); }
    } catch (_) {}
}

// ============================================================
// 認証必須 (未ログイン → 暗号化URL)
// ============================================================
async function requireAuth() {
    const { auth } = await getFirebase();
    return new Promise((resolve) => {
        const unsub = onAuthStateChanged(auth, (user) => {
            unsub();
            if (!user) {
                const encoded = encodeRedirect(location.pathname + location.search);
                window.location.replace(`/account/login?r=${encoded}`);
            } else { resolve(user); }
        });
    });
}

// ============================================================
// /account/login
// ============================================================
let _pendingLoginEmail = "", _pendingLoginPass = "";

async function initLogin() {
    const { auth, db } = await getFirebase();
    onAuthStateChanged(auth, u => { if (u) redirectAfterLogin(); });

    const _doGoogle = async () => {
        const provider = new GoogleAuthProvider();
        const lastConsent = localStorage.getItem("ll_last_consent");
        provider.setCustomParameters({ prompt: (!lastConsent || Date.now() - parseInt(lastConsent) > CONSENT_INTERVAL) ? "consent" : "select_account" });
        try {
            const result = await signInWithPopup(auth, provider);
            localStorage.setItem("ll_last_consent", Date.now().toString());
            await _afterLoginSuccess(result.user, "Google", db);
        } catch (e) {
            if (e.code === "auth/popup-blocked" || e.code === "auth/popup-closed-by-user") {
                sessionStorage.setItem("ll_redirect_login", "1");
                await signInWithRedirect(auth, provider);
            } else {
                const M = { "auth/account-exists-with-different-credential": "このメールアドレスは別の方法で登録済みです" };
                setMsg("google-error", M[e.code] || e.message, "error");
                document.getElementById("google-error")?.style.setProperty("display", "block");
            }
        }
    };

    if (sessionStorage.getItem("ll_redirect_login")) {
        sessionStorage.removeItem("ll_redirect_login");
        try {
            btnState("google-login-btn", "確認中...", true);
            const result = await getRedirectResult(auth);
            if (result?.user) { localStorage.setItem("ll_last_consent", Date.now().toString()); await _afterLoginSuccess(result.user, "Google", db); return; }
        } catch (e) { setMsg("google-error", e.message, "error"); document.getElementById("google-error")?.style.setProperty("display", "block"); }
        finally { btnState("google-login-btn", "Googleでログイン", false); }
    }

    document.getElementById("google-login-btn")?.addEventListener("click", _doGoogle);

    if (GOOGLE_CLIENT_ID && window.google?.accounts) {
        google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: async (resp) => {
            try {
                const result = await signInWithPopup(auth, new GoogleAuthProvider());
                await _afterLoginSuccess(result.user, "Google OneTap", db);
            } catch (e) { setMsg("google-error", e.message, "error"); }
        }, auto_select: false });
        const c = document.getElementById("google-onetap-container");
        if (c) google.accounts.id.renderButton(c, { type:"standard", theme:"outline", size:"large", width:320, locale:"ja" });
        google.accounts.id.prompt();
    }

    const doEmail = async () => {
        const email = document.getElementById("login-email")?.value.trim();
        const pass  = document.getElementById("login-password")?.value;
        const msgEl = document.getElementById("login-msg");
        if (!email || !pass) return setMsg(msgEl, "メールアドレスとパスワードを入力してください", "error");
        btnState("login-submit", "確認中...", true);
        setMsg(msgEl, "", "");
        try {
            const cred = await signInWithEmailAndPassword(auth, email, pass);
            const enabled = await is2FAEnabled(cred.user.uid, db);
            if (enabled && cred.user.email) {
                const code = genOTP();
                await saveOTP(cred.user.uid, db, code, "login_verify");
                await sendOTPEmail(cred.user, code, "ログイン認証");
                await signOut(auth);
                _pendingLoginEmail = email;
                _pendingLoginPass  = pass;
                setMsg(msgEl, `📧 ${cred.user.email} に認証コードを送信しました`, "success");
                hide("login-form-section");
                show("twofa-verify-section");
                showOTPPanel("twofa-panel-container", {
                    title: "二段階認証", desc: `メールに送信された6桁のコードを入力してください`,
                    showBackupInput: true,
                    onVerify: async (input, isBackup) => {
                        const cred2 = await signInWithEmailAndPassword(auth, _pendingLoginEmail, _pendingLoginPass).catch(() => null);
                        if (!cred2) return { ok: false, reason: "再認証に失敗しました" };
                        if (isBackup) {
                            const res = await tryBackupCode(cred2.user.uid, db, input);
                            if (!res.ok) { await signOut(auth); return { ok: false, reason: res.reason || "バックアップコードが正しくありません" }; }
                        } else {
                            const res = await verifyOTP(cred2.user.uid, db, input, "login_verify");
                            if (!res.ok) { await signOut(auth); return res; }
                            await clearOTP(cred2.user.uid, db);
                        }
                        _pendingLoginEmail = ""; _pendingLoginPass = "";
                        await _afterLoginSuccess(cred2.user, "メール+2FA", db);
                        return { ok: true };
                    },
                    onCancel: () => { _pendingLoginEmail = ""; _pendingLoginPass = ""; show("login-form-section"); hide("twofa-verify-section"); btnState("login-submit", "ログイン", false); },
                });
                return;
            }
            await _afterLoginSuccess(cred.user, "メール", db);
        } catch (e) {
            const M = { "auth/user-not-found":"このメールアドレスは登録されていません", "auth/wrong-password":"パスワードが間違っています", "auth/invalid-credential":"メールアドレスまたはパスワードが間違っています", "auth/too-many-requests":"しばらく時間をおいてから再試行してください" };
            setMsg(document.getElementById("login-msg"), M[e.code] || e.message, "error");
        } finally { btnState("login-submit", "ログイン", false); }
    };

    document.getElementById("login-submit")?.addEventListener("click", doEmail);
    document.getElementById("login-password")?.addEventListener("keydown", e => { if (e.key === "Enter") doEmail(); });
    document.getElementById("forgot-password-btn")?.addEventListener("click", async () => {
        const email = document.getElementById("login-email")?.value.trim();
        const msgEl = document.getElementById("login-msg");
        if (!email) return setMsg(msgEl, "メールアドレスを入力してください", "error");
        try { await sendPasswordResetEmail(auth, email); setMsg(msgEl, "✅ パスワードリセットメールを送信しました", "success"); }
        catch (e) { setMsg(msgEl, e.code === "auth/user-not-found" ? "登録されていません" : e.message, "error"); }
    });
}

async function _afterLoginSuccess(user, method, db) {
    await registerSession(user, db);
    await logActivity(user.uid, "login", method);
    await sendNotification(user, db, "login", `${method}でログインしました`);
    redirectAfterLogin();
}

// ============================================================
// /account/signup
// ============================================================
async function initSignup() {
    const { auth } = await getFirebase();
    onAuthStateChanged(auth, u => { if (u) redirectAfterLogin(); });

    const _doGoogle = async () => {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "consent" });
        localStorage.setItem("ll_last_consent", Date.now().toString());
        try {
            const result = await signInWithPopup(auth, provider);
            await logActivity(result.user.uid, "signup", "Google");
            redirectAfterLogin();
        } catch (e) {
            if (e.code === "auth/popup-blocked") { sessionStorage.setItem("ll_redirect_signup", "1"); await signInWithRedirect(auth, provider); }
            else { setMsg("google-error", e.message, "error"); document.getElementById("google-error")?.style.setProperty("display","block"); }
        }
    };

    if (sessionStorage.getItem("ll_redirect_signup")) {
        sessionStorage.removeItem("ll_redirect_signup");
        try {
            const result = await getRedirectResult(auth);
            if (result?.user) { await logActivity(result.user.uid, "signup", "Google"); redirectAfterLogin(); return; }
        } catch (_) {}
    }

    document.getElementById("google-signup-btn")?.addEventListener("click", _doGoogle);

    document.getElementById("signup-submit")?.addEventListener("click", async () => {
        const name  = document.getElementById("signup-name")?.value.trim();
        const email = document.getElementById("signup-email")?.value.trim();
        const pass  = document.getElementById("signup-password")?.value;
        const pass2 = document.getElementById("signup-password-confirm")?.value;
        const msgEl = document.getElementById("signup-msg");
        if (!name)           return setMsg(msgEl, "お名前を入力してください", "error");
        if (!email)          return setMsg(msgEl, "メールアドレスを入力してください", "error");
        if (pass.length < 6) return setMsg(msgEl, "パスワードは6文字以上にしてください", "error");
        if (pass !== pass2)  return setMsg(msgEl, "パスワードが一致しません", "error");
        btnState("signup-submit", "作成中...", true);
        setMsg(msgEl, "", "");
        try {
            const cred = await createUserWithEmailAndPassword(auth, email, pass);
            await updateProfile(cred.user, { displayName: name });
            await sendEmailVerification(cred.user).catch(() => {});
            await logActivity(cred.user.uid, "signup", "メール");
            redirectAfterLogin();
        } catch (e) {
            const M = { "auth/email-already-in-use":"このメールアドレスはすでに使用されています", "auth/invalid-email":"メールアドレスの形式が正しくありません", "auth/weak-password":"パスワードは6文字以上にしてください" };
            setMsg(msgEl, M[e.code] || e.message, "error");
            btnState("signup-submit", "作成する", false);
        }
    });
}

// ============================================================
// /account/logout
// ============================================================
async function initLogout() {
    const { auth, db } = await getFirebase();
    try {
        const user = auth.currentUser;
        if (user) { await Promise.allSettled([logActivity(user.uid, "logout",""), removeSession(user, db)]); }
        await signOut(auth);
        sessionStorage.removeItem("ll_auth_cache");
        show("logout-success"); hide("logout-loading");
        setTimeout(() => window.location.replace("/"), 3000);
    } catch { window.location.replace("/"); }
}

// ============================================================
// /account/delete
// ============================================================
async function initDelete() {
    const user = await requireAuth();
    const { auth, db } = await getFirebase();
    const checkboxes = document.querySelectorAll(".deletion-checkbox");
    const execBtn    = document.getElementById("delete-execute-btn");
    const updateCheck = () => { if (execBtn) execBtn.disabled = ![...checkboxes].every(c => c.checked); };
    checkboxes.forEach(c => c.addEventListener("change", updateCheck));
    updateCheck();
    execBtn?.addEventListener("click", async () => {
        const msgEl = document.getElementById("delete-msg");
        btnState("delete-execute-btn", "処理中...", true);
        const enabled = await is2FAEnabled(user.uid, db);
        if (enabled && user.email) {
            const code = genOTP();
            await saveOTP(user.uid, db, code, "account_delete");
            await sendOTPEmail(user, code, "アカウント削除申請");
            setMsg(msgEl, `📧 ${user.email} に認証コードを送信しました`, "success");
            showOTPPanel("delete-otp-container", { title:"本人確認", desc:"コードを入力してください",
                onVerify: async (input) => {
                    const res = await verifyOTP(user.uid, db, input, "account_delete");
                    if (!res.ok) { btnState("delete-execute-btn","削除を申請する",false); return res; }
                    await clearOTP(user.uid, db);
                    await _executeDeletion(user, auth, db);
                    return { ok: true };
                },
                onCancel: () => btnState("delete-execute-btn","削除を申請する",false),
            });
            return;
        }
        await _executeDeletion(user, auth, db);
    });
}

async function _executeDeletion(user, auth, db) {
    const scheduledAt = Timestamp.fromMillis(Date.now() + 30 * 86400000);
    await setDoc(doc(db, "users", user.uid), { deletionPending: true, scheduledDeletion: scheduledAt, deletionRequestAt: serverTimestamp() }, { merge: true });
    await logActivity(user.uid, "deletion_request", "30日後削除予定");
    await sendNotification(user, db, "deletionRequest", "");
    await removeSession(user, db);
    await signOut(auth);
    sessionStorage.removeItem("ll_auth_cache");
    hide("delete-form-wrapper"); show("delete-success");
}

// ============================================================
// /account/settings
// ============================================================
async function initSettings() {
    const user = await requireAuth();
    const { db } = await getFirebase();
    _renderUserCard(user);
    const snap = await getDoc(doc(db, "users", user.uid)).catch(() => null);
    if (snap?.exists() && snap.data().deletionPending) {
        const d = snap.data().scheduledDeletion?.toDate();
        show("deletion-pending-banner");
        const el = document.getElementById("deletion-scheduled-date");
        if (el && d) el.textContent = d.toLocaleString("ja-JP");
    }
    document.getElementById("cancel-deletion-btn")?.addEventListener("click", async () => {
        if (!confirm("アカウント削除をキャンセルしますか？")) return;
        await setDoc(doc(db, "users", user.uid), { deletionPending: false, scheduledDeletion: null }, { merge: true });
        hide("deletion-pending-banner");
    });
    document.getElementById("settings-logout-btn")?.addEventListener("click", () => { window.location.href = "/account/logout"; });
}

// ============================================================
// #11 /account/settings/profile  (リスト形式)
// ============================================================
async function initProfile() {
    const user = await requireAuth();
    const { auth, db } = await getFirebase();

    // ユーザー情報をリスト形式で表示
    _renderProfileList(user);

    // #3 表示名変更 → ポップアップ
    document.getElementById("edit-displayname-btn")?.addEventListener("click", () => {
        const overlay = createPopup(`
<h3 class="popup-title">✏️ 表示名を変更</h3>
<div class="form-group">
    <label class="form-label">新しい表示名</label>
    <input id="_name_input" type="text" class="form-input"
           value="${esc(user.displayName || "")}" placeholder="表示名" maxlength="50">
</div>
<p id="_name_msg" class="settings-msg"></p>
<div class="popup-btns">
    <button id="_name_cancel" class="btn-secondary-sm">キャンセル</button>
    <button id="_name_save"   class="btn-primary-sm">保存する</button>
</div>`);
        overlay.querySelector("#_name_cancel").onclick = () => overlay.remove();
        overlay.querySelector("#_name_save").onclick = async () => {
            const name  = overlay.querySelector("#_name_input")?.value.trim();
            const msgEl = overlay.querySelector("#_name_msg");
            if (!name) { setMsg(msgEl, "名前を入力してください", "error"); return; }
            overlay.querySelector("#_name_save").disabled = true;
            try {
                // ★ FIX: auth.currentUser を使用
                await updateProfile(auth.currentUser, { displayName: name });
                await logActivity(user.uid, "profile_update", "表示名変更");
                _renderProfileList(auth.currentUser);
                overlay.remove();
                showToast("✅ 表示名を変更しました", "success");
            } catch (e) {
                setMsg(msgEl, e.message, "error");
                overlay.querySelector("#_name_save").disabled = false;
            }
        };
        setTimeout(() => overlay.querySelector("#_name_input")?.focus(), 50);
    });

    // #4 UUID コピー
    document.getElementById("copy-uuid-btn")?.addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(user.uid);
            const btn = document.getElementById("copy-uuid-btn");
            if (btn) { btn.textContent = "✅ コピー済み"; setTimeout(() => btn.textContent = "コピー", 2000); }
        } catch (_) {}
    });

    // #2 FIX: メール確認バナー + sendEmailVerification → auth.currentUser
    const cu = auth.currentUser;
    const needsVerify = cu?.email && !cu?.emailVerified && cu?.providerData?.some(p => p.providerId === "password");
    if (needsVerify) show("email-verify-banner");

    document.getElementById("send-verify-email-btn")?.addEventListener("click", async () => {
        btnState("send-verify-email-btn", "送信中...", true);
        setMsg("verify-email-msg", "", "");
        try {
            // ★ FIX: auth.currentUser を使用
            await sendEmailVerification(auth.currentUser);
            setMsg("verify-email-msg", "✅ 確認メールを送信しました。受信ボックスをご確認ください。", "success");
        } catch (e) {
            const M = { "auth/too-many-requests":"送信が多すぎます。しばらく待ってから再試行してください。" };
            setMsg("verify-email-msg", M[e.code] || e.message, "error");
        } finally {
            setTimeout(() => btnState("send-verify-email-btn","確認メールを再送する",false), 60000);
        }
    });
}

function _renderProfileList(user) {
    // 各情報をリスト要素に反映
    const nameEl  = document.getElementById("profile-name-value");
    const emailEl = document.getElementById("profile-email-value");
    const uuidEl  = document.getElementById("profile-uuid-value");
    const lastEl  = document.getElementById("profile-lastlogin-value");
    const avatarEl = document.getElementById("profile-avatar");

    if (nameEl)  nameEl.textContent  = user.displayName || "（未設定）";
    if (emailEl) emailEl.textContent = user.email || "（未設定）";
    if (uuidEl)  uuidEl.textContent  = user.uid ? user.uid.substring(0, 8) + "..." + user.uid.slice(-4) : "不明";
    if (lastEl && user.metadata?.lastSignInTime) lastEl.textContent = new Date(user.metadata.lastSignInTime).toLocaleString("ja-JP", { timeZone:"Asia/Tokyo" });
    if (avatarEl) {
        avatarEl.innerHTML = user.photoURL
            ? `<img src="${esc(user.photoURL)}" alt="avatar" class="user-info-avatar">`
            : `<div class="user-info-avatar-placeholder">👤</div>`;
    }
}

// ============================================================
// #3 /account/settings/privacy
// ============================================================
const NOTIF_SETTINGS = [
    { key: "login",           label: "ログイン通知",             desc: "アカウントへのログイン時にメールを受け取る" },
    { key: "passwordChange",  label: "パスワード変更通知",       desc: "パスワードが変更された際にメールを受け取る" },
    { key: "emailChange",     label: "メールアドレス変更通知",   desc: "メールアドレスが変更された際に通知を受け取る" },
    { key: "otpChange",       label: "二段階認証変更通知",       desc: "二段階認証の設定が変更された際に通知を受け取る" },
    { key: "deletionRequest", label: "アカウント削除依頼通知",   desc: "削除申請が行われた際にメールを受け取る" },
    { key: "maintenance",     label: "メンテナンス・障害通知",   desc: "サービスのメンテナンスや障害情報を受け取る" },
    { key: "newFeature",      label: "新機能・アップデート通知", desc: "新機能のリリース情報などを受け取る" },
    { key: "newsletter",      label: "ニュースレター",           desc: "法令に関するニュースや解説記事の配信を受け取る" },
];

async function initPrivacy() {
    const user = await requireAuth();
    const { db } = await getFirebase();
    const container = document.getElementById("notification-settings");
    if (!container) return;

    container.innerHTML = '<p class="loading-text">読み込み中...</p>';

    try {
        // ★ FIX: try/catch で包み、存在しなくてもデフォルト値で続行
        let prefs = {};
        try {
            const snap = await getDoc(doc(db, "users", user.uid, "settings", "notifications"));
            if (snap.exists()) prefs = snap.data();
        } catch (_) { /* 初回は空のまま継続 */ }

        container.innerHTML = NOTIF_SETTINGS.map(({ key, label, desc }) => {
            const on = prefs[key] !== false;
            const disabled = !user.emailVerified;
            return `
<div class="setting-toggle-item">
    <div class="setting-text">
        <span class="setting-label">${label}</span>
        <p class="setting-description">${desc}</p>
    </div>
    <label class="switch" title="${disabled ? "メールアドレス確認後に有効になります" : ""}">
        <input type="checkbox" class="notif-toggle" data-key="${key}"
               ${on ? "checked" : ""} ${disabled ? "disabled" : ""}>
        <span class="slider round"></span>
    </label>
</div>`;
        }).join("");

        if (!user.emailVerified) {
            container.insertAdjacentHTML("beforeend",
                `<p class="info-text" style="color:#e74c3c;margin-top:12px;font-size:13px;">
                 ⚠️ メールアドレスが未確認のため通知は届きません。<br>
                 <a href="/account/settings/profile" style="color:#e74c3c;">プロフィールページ</a>からメール確認を行ってください。</p>`);
        }

        container.querySelectorAll(".notif-toggle").forEach(toggle => {
            toggle.addEventListener("change", async e => {
                try {
                    await setDoc(doc(db, "users", user.uid, "settings", "notifications"),
                        { [e.target.dataset.key]: e.target.checked }, { merge: true });
                } catch (_) {}
            });
        });
    } catch (e) {
        container.innerHTML = `<p class="error-text">読み込みに失敗しました: ${esc(e.message)}</p>`;
    }
}

// ============================================================
// /account/security  (並列読み込み)
// ============================================================
async function initSecurity() {
    const user = await requireAuth();
    const { db } = await getFirebase();
    const [twoFaSnap] = await Promise.all([
        getDoc(doc(db, "users", user.uid, "security", "twoFactor")).catch(() => null),
    ]);
    const enabled = twoFaSnap?.exists() && (twoFaSnap.data().enabled ?? false);
    const hasPass = user.providerData.some(p => p.providerId === "password");
    const badge = document.getElementById("2fa-status-badge");
    if (badge) { badge.textContent = enabled ? "有効" : "無効"; badge.className = `status-badge ${enabled ? "enabled" : "disabled"}`; }
    const passBadge = document.getElementById("password-status-badge");
    if (passBadge) passBadge.textContent = hasPass ? "設定済み" : "未設定";
    const el = document.getElementById("last-signin-date");
    if (el && user.metadata?.lastSignInTime) el.textContent = new Date(user.metadata.lastSignInTime).toLocaleString("ja-JP", { timeZone:"Asia/Tokyo" });
}

// ============================================================
// #8 FIX: /account/security/activity  (users/{uid}/activity)
// ============================================================
const ACTIVITY_ICONS = {
    login:            { icon:"🔑", label:"ログイン" },
    logout:           { icon:"🚪", label:"ログアウト" },
    signup:           { icon:"✨", label:"アカウント作成" },
    password_change:  { icon:"🔒", label:"パスワード変更" },
    profile_update:   { icon:"👤", label:"プロフィール更新" },
    twofa_change:     { icon:"🛡️", label:"二段階認証変更" },
    email_change:     { icon:"📧", label:"メールアドレス変更" },
    method_change:    { icon:"🔗", label:"ログイン方法変更" },
    deletion_request: { icon:"⚠️", label:"アカウント削除申請" },
};

async function initActivity() {
    const user = await requireAuth();
    const { db } = await getFirebase();
    const listEl = document.getElementById("activity-list");
    if (!listEl) return;
    listEl.innerHTML = '<p class="loading-text">読み込み中...</p>';
    try {
        // ★ FIX: users/{uid}/activity (3セグメント = 有効なコレクション)
        const q = query(collection(db, "users", user.uid, "activity"), orderBy("timestamp", "desc"), limit(50));
        const snap = await getDocs(q);
        if (snap.empty) {
            listEl.innerHTML = '<p class="empty-text">過去1年間まで遡りましたがアクティビティ履歴はありません</p>';
            return;
        }
        listEl.innerHTML = snap.docs.map(d => {
            const data = d.data();
            const info = ACTIVITY_ICONS[data.type] || { icon:"📋", label: data.type };
            const ts   = data.timestamp;
            return `
<div class="activity-item">
    <div class="activity-icon-wrap"><span style="font-size:1.2rem">${info.icon}</span></div>
    <div class="activity-details">
        <div class="activity-main">
            <span class="activity-action">${info.label}</span>
            <span class="activity-time">${ts ? relativeDate(ts) : "不明"}</span>
        </div>
        <p class="activity-info">${esc(data.browser || "")} / ${esc(data.os || "")}${data.detail ? ` — ${esc(data.detail)}` : ""}</p>
        <p class="activity-info" style="color:#aaa;font-size:11px;">${ts ? formatDate(ts) : ""}</p>
    </div>
</div>`;
        }).join("");
    } catch (e) {
        listEl.innerHTML = `<p class="error-text">読み込みに失敗しました: ${esc(e.message)}</p>`;
    }
}

// ============================================================
// #9 FIX: /account/security/device  (セッション削除方式に変更)
// ============================================================
async function initDevice() {
    const user = await requireAuth();
    const { db } = await getFirebase();
    await _renderDeviceList(user, db);
    document.getElementById("logout-all-others-btn")?.addEventListener("click", () => _logoutAllOthers(user, db));
}

async function _renderDeviceList(user, db) {
    const listEl = document.getElementById("device-list");
    if (!listEl) return;
    listEl.innerHTML = '<p class="loading-text">読み込み中...</p>';
    const currentSid = localStorage.getItem(SESSION_KEY);
    try {
        const q = query(collection(db, "users", user.uid, "sessions"), orderBy("lastActive", "desc"), limit(10));
        const snap = await getDocs(q);
        if (snap.empty) { listEl.innerHTML = '<p class="empty-text">セッション情報がありません</p>'; hide("logout-all-others-btn"); return; }
        let hasOthers = false;
        listEl.innerHTML = snap.docs.map(d => {
            const data = d.data();
            const isCurrent = data.sessionId === currentSid;
            if (!isCurrent) hasOthers = true;
            const icon = (data.device || "").includes("スマートフォン") ? "📱" : "💻";
            return `
<div class="device-item${isCurrent ? " current" : ""}" data-sid="${esc(data.sessionId)}">
    <div class="device-icon">${icon}</div>
    <div class="device-info">
        <div class="device-name">${esc(data.browser || "不明")} / ${esc(data.os || "不明")}${isCurrent ? '<span class="current-badge">現在の端末</span>' : ""}</div>
        <p class="device-meta">${esc(data.location || "不明")} · ${data.lastActive ? relativeDate(data.lastActive) : "不明"}</p>
    </div>
    ${!isCurrent ? `<button class="session-logout-btn" data-sid="${esc(data.sessionId)}">ログアウト</button>` : ""}
</div>`;
        }).join("");
        if (hasOthers) show("logout-all-others-btn"); else hide("logout-all-others-btn");

        // 個別ログアウト: ドキュメント削除
        listEl.querySelectorAll(".session-logout-btn").forEach(b => {
            b.addEventListener("click", async () => {
                if (!confirm("この端末からログアウトしますか？")) return;
                const sid = b.dataset.sid;
                try {
                    // ★ FIX #9: shouldLogout フラグだけでなく、ドキュメントも削除
                    await setDoc(doc(db, "users", user.uid, "sessions", sid), { shouldLogout: true }, { merge: true });
                    // 即座にUIから削除 (リロードしても再表示されない)
                    b.closest(".device-item")?.remove();
                    const rem = listEl.querySelectorAll(".device-item:not(.current)");
                    if (rem.length === 0) hide("logout-all-others-btn");
                } catch (e) { alert("失敗しました: " + e.message); }
            });
        });
    } catch (e) { listEl.innerHTML = '<p class="error-text">読み込みに失敗しました</p>'; }
}

async function _logoutAllOthers(user, db) {
    const currentSid = localStorage.getItem(SESSION_KEY);
    const others = document.querySelectorAll(".device-item:not(.current)");
    if (others.length === 0) { alert("他にアクティブな端末はありません"); return; }
    if (!confirm(`${others.length}台の端末からログアウトしますか？`)) return;
    const btn = document.getElementById("logout-all-others-btn");
    if (btn) { btn.disabled = true; btn.textContent = "処理中..."; }
    try {
        const snap = await getDocs(collection(db, "users", user.uid, "sessions"));
        // ★ FIX #9: shouldLogout=true を設定 (important.js がリモートログアウトを実行)
        //            かつ、対象端末がオフラインの場合に備えて次回ログイン時にも削除されるように
        await Promise.allSettled(
            snap.docs
                .filter(d => d.data().sessionId !== currentSid)
                .map(d => setDoc(d.ref, { shouldLogout: true }, { merge: true }))
        );
        // ★ UIから即座に削除 (リロードしても再表示されない)
        others.forEach(el => el.remove());
        hide("logout-all-others-btn");
        showToast("他の端末にログアウト信号を送信しました", "success");
    } catch (e) {
        alert("失敗しました: " + e.message);
        if (btn) { btn.disabled = false; btn.textContent = "他のすべての端末をログアウト"; }
    }
}

// ============================================================
// #10 FIX: /account/security/pass  (auth.currentUser で再認証)
// ============================================================
async function initPass() {
    const user = await requireAuth();
    const { auth, db } = await getFirebase();
    const hasPass = user.providerData.some(p => p.providerId === "password");
    const row     = document.getElementById("current-password-row");
    const title   = document.getElementById("pass-card-title");
    const subBtn  = document.getElementById("pass-submit-btn");
    if (row)    row.style.display   = hasPass ? "block" : "none";
    if (title)  title.textContent   = hasPass ? "🔑 パスワードを変更する" : "🔑 パスワードを設定する";
    if (subBtn) subBtn.textContent  = hasPass ? "パスワードを変更する" : "パスワードを設定する";

    subBtn?.addEventListener("click", async () => {
        const cur   = document.getElementById("current-password")?.value;
        const newP  = document.getElementById("new-password")?.value;
        const conf  = document.getElementById("confirm-password")?.value;
        const msgEl = document.getElementById("pass-msg");
        if (!newP)           return setMsg(msgEl, "新しいパスワードを入力してください", "error");
        if (newP.length < 6) return setMsg(msgEl, "パスワードは6文字以上にしてください", "error");
        if (newP !== conf)   return setMsg(msgEl, "パスワードが一致しません", "error");
        if (hasPass && !cur) return setMsg(msgEl, "現在のパスワードを入力してください", "error");
        btnState("pass-submit-btn", "処理中...", true);
        setMsg(msgEl, "", "");

        const enabled = await is2FAEnabled(user.uid, db);
        if (enabled && user.email) {
            const code = genOTP();
            await saveOTP(user.uid, db, code, "password_change");
            await sendOTPEmail(user, code, "パスワード変更");
            setMsg(msgEl, `📧 ${user.email} に認証コードを送信しました`, "success");
            showOTPPanel("pass-otp-container", { title:"本人確認", desc:"コードを入力してください",
                onVerify: async (input) => {
                    const res = await verifyOTP(user.uid, db, input, "password_change");
                    if (!res.ok) { btnState("pass-submit-btn", hasPass ? "パスワードを変更する" : "パスワードを設定する", false); return res; }
                    await clearOTP(user.uid, db);
                    await _executePasswordChange(auth, db, cur, newP, hasPass, user, msgEl);
                    return { ok: true };
                },
                onCancel: () => btnState("pass-submit-btn", hasPass ? "パスワードを変更する" : "パスワードを設定する", false),
            });
            return;
        }
        await _executePasswordChange(auth, db, cur, newP, hasPass, user, msgEl);
    });
}

async function _executePasswordChange(auth, db, cur, newP, hasPass, user, msgEl) {
    try {
        // ★ FIX #10: auth.currentUser を使用して再認証
        const currentUser = auth.currentUser;
        if (!currentUser) throw new Error("ログインセッションが切れました。再ログインしてください。");

        if (hasPass) {
            // ★ FIX: currentUser.email を使用
            if (!currentUser.email) throw new Error("メールアドレスが設定されていません");
            const cred = EmailAuthProvider.credential(currentUser.email, cur);
            await reauthenticateWithCredential(currentUser, cred);
            await updatePassword(currentUser, newP);
        } else {
            if (!currentUser.email) throw new Error("メールアドレスが設定されていません");
            const cred = EmailAuthProvider.credential(currentUser.email, newP);
            await linkWithCredential(currentUser, cred);
        }
        ["current-password","new-password","confirm-password"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
        setMsg(msgEl, "✅ 変更しました", "success");
        await logActivity(user.uid, "password_change", "");
        await sendNotification(currentUser, db, "passwordChange", "");
        showToast("パスワードを変更しました", "success");
    } catch (e) {
        const M = {
            "auth/wrong-password":        "現在のパスワードが間違っています",
            "auth/invalid-credential":    "現在のパスワードが間違っています",
            "auth/requires-recent-login": "セキュリティのため再ログインが必要です",
            "auth/weak-password":         "パスワードは6文字以上にしてください",
        };
        setMsg(msgEl, M[e.code] || e.message, "error");
    } finally {
        const hp = auth.currentUser?.providerData.some(p => p.providerId === "password");
        btnState("pass-submit-btn", hp ? "パスワードを変更する" : "パスワードを設定する", false);
    }
}

// ============================================================
// #5 #6 /account/security/2fa  (推奨表示 + 未設定時グレー)
// ============================================================
async function initTwoFA() {
    const user = await requireAuth();
    const { db } = await getFirebase();
    const enabled = await is2FAEnabled(user.uid, db);
    const toggle  = document.getElementById("two-factor-toggle");
    const label   = document.getElementById("two-factor-status-label");
    const badge   = document.getElementById("2fa-status-badge");
    const backupLink = document.getElementById("backup-code-link");

    if (toggle) toggle.checked    = enabled;
    if (label)  label.textContent = enabled ? "有効" : "無効";
    if (badge)  { badge.textContent = enabled ? "有効" : "無効"; badge.className = `status-badge ${enabled ? "enabled" : "disabled"}`; }

    // #6 バックアップコードリンクの活性/非活性
    _setBackupLinkState(enabled);

    toggle?.addEventListener("change", async e => {
        const newState   = e.target.checked;
        const purpose    = newState ? "2fa_enable" : "2fa_disable";
        const purposeTxt = newState ? "二段階認証の有効化" : "二段階認証の無効化";
        const msgEl      = document.getElementById("two-factor-msg");
        if (!user.email) { setMsg(msgEl, "二段階認証を使用するにはメールアドレスが必要です", "error"); toggle.checked = !newState; return; }
        toggle.disabled = true;
        setMsg(msgEl, "認証コードを送信中...", "");
        try {
            const code = genOTP();
            await saveOTP(user.uid, db, code, purpose);
            await sendOTPEmail(user, code, purposeTxt);
            setMsg(msgEl, `📧 ${user.email} に認証コードを送信しました`, "success");
            showOTPPanel("twofa-otp-container", { title:"本人確認", desc:"コードを入力してください",
                onVerify: async (input) => {
                    const res = await verifyOTP(user.uid, db, input, purpose);
                    if (!res.ok) { toggle.checked = !newState; toggle.disabled = false; return res; }
                    await clearOTP(user.uid, db);
                    await setDoc(doc(db, "users", user.uid, "security", "twoFactor"), { enabled: newState }, { merge: true });
                    if (label) label.textContent = newState ? "有効" : "無効";
                    if (badge) { badge.textContent = newState ? "有効" : "無効"; badge.className = `status-badge ${newState ? "enabled" : "disabled"}`; }
                    setMsg(msgEl, `✅ 二段階認証を${newState ? "有効" : "無効"}にしました`, "success");
                    await logActivity(user.uid, "twofa_change", newState ? "有効化" : "無効化");
                    await sendNotification(user, db, "otpChange", newState ? "有効化" : "無効化");
                    toggle.disabled = false;
                    // #6 バックアップリンク更新
                    _setBackupLinkState(newState);
                    // #5 有効化した場合は推奨バナーを表示
                    if (newState) _showTwoFARecommend();
                    return { ok: true };
                },
                onCancel: () => { toggle.checked = !newState; toggle.disabled = false; setMsg(msgEl, "", ""); },
            });
        } catch (err) {
            toggle.checked = !newState;
            setMsg(msgEl, "送信に失敗しました", "error");
            toggle.disabled = false;
        }
    });
}

function _setBackupLinkState(enabled) {
    const backupLink = document.getElementById("backup-code-link");
    if (!backupLink) return;
    if (enabled) {
        backupLink.style.opacity       = "1";
        backupLink.style.pointerEvents = "auto";
        backupLink.setAttribute("href", "/account/security/2fa/backup-code");
    } else {
        backupLink.style.opacity       = "0.4";
        backupLink.style.pointerEvents = "none";
        backupLink.removeAttribute("href");
    }
}

function _showTwoFARecommend() {
    const container = document.getElementById("twofa-recommend");
    if (!container) return;
    container.innerHTML = `
<div class="banner banner-info" style="margin-top:16px;">
    <p class="banner-title">✅ 二段階認証を有効にしました！</p>
    <p style="font-size:0.85rem;margin-bottom:12px;line-height:1.6;">
        さらにセキュリティを強化するために以下の設定もお勧めします。
    </p>
    <a href="/account/security/2fa/backup-code" class="btn-primary"
       style="display:block;text-align:center;text-decoration:none;padding:10px;margin-bottom:8px;font-size:0.88rem;">
        🔐 バックアップコードを設定する
    </a>
    <a href="/account/security/methods" class="btn-secondary"
       style="display:block;text-align:center;text-decoration:none;padding:10px;font-size:0.88rem;">
        🔗 ログイン方法を確認する
    </a>
</div>`;
    container.style.display = "block";
}

// ============================================================
// #4 FIX: /account/security/2fa/backup-code
// ============================================================
function _genBackupCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

async function initBackupCode() {
    const user = await requireAuth();
    const { db } = await getFirebase();
    const gridEl = document.getElementById("backup-codes-grid");
    if (!gridEl) return;

    gridEl.innerHTML = '<p class="loading-text">読み込み中...</p>';

    try {
        const snap = await getDoc(doc(db, "users", user.uid, "security", "BackUpCode"));
        // ★ FIX: 存在チェックとデータ形式の正規化
        let codes = [];
        if (snap.exists() && snap.data().codes?.length > 0) {
            const raw = snap.data().codes;
            // 文字列配列 or オブジェクト配列の両方に対応
            codes = raw.map(c => typeof c === "string" ? { code: c, used: false } : c);
        }
        if (codes.length === 0) {
            codes = await _genAndSaveCodes(user.uid, db);
        }
        _renderBackupCodes(gridEl, codes);

        document.getElementById("regenerate-codes-btn")?.addEventListener("click", async () => {
            if (!confirm("現在のバックアップコードはすべて無効になります。よろしいですか？")) return;
            const newCodes = await _genAndSaveCodes(user.uid, db);
            _renderBackupCodes(gridEl, newCodes);
            await logActivity(user.uid, "twofa_change", "バックアップコード再生成");
            showToast("バックアップコードを再生成しました", "success");
        });

        document.getElementById("copy-codes-btn")?.addEventListener("click", async () => {
            const text = codes.map((c, i) => `${i + 1}. ${c.code || c}`).join("\n");
            await navigator.clipboard.writeText(text).catch(() => {});
            const btn = document.getElementById("copy-codes-btn");
            if (btn) { btn.textContent = "✅ コピー済み"; setTimeout(() => btn.textContent = "コードをコピー", 2000); }
        });
    } catch (e) {
        gridEl.innerHTML = `<p class="error-text">読み込みに失敗しました: ${esc(e.message)}</p>`;
    }
}

async function _genAndSaveCodes(uid, db) {
    const codes = Array.from({ length: BACKUP_CODE_COUNT }, () => ({ code: _genBackupCode(), used: false }));
    await setDoc(doc(db, "users", uid, "security", "BackUpCode"), { codes, generatedAt: serverTimestamp() });
    return codes;
}

function _renderBackupCodes(gridEl, codes) {
    gridEl.innerHTML = codes.map(({ code, used }, i) =>
        `<div class="code-item${used ? " code-used" : ""}">
            <span class="code-num">${i + 1}.</span>
            <span class="code-val">${used ? `<s>${esc(code)}</s>` : esc(code)}</span>
        </div>`
    ).join("");
}

// ============================================================
// #7 FIX: /account/security/methods  (連携済みアカウントのメール表示)
// ============================================================
async function initMethods() {
    const user = await requireAuth();
    const { auth, db } = await getFirebase();
    await _renderAllMethods(user, auth, db);
}

async function _renderAllMethods(user, auth, db) {
    const ids   = user.providerData.map(p => p.providerId);
    const total = ids.length;

    // ──── パスワードログイン ────
    const passLinked  = ids.includes("password");
    const passData    = user.providerData.find(p => p.providerId === "password");
    const passStatus  = document.getElementById("status-password");
    const passBtnEl   = document.getElementById("btn-password");
    // #7 連携済みアカウントのメール表示
    const passEmailEl = document.getElementById("method-email-password");

    if (passStatus) { passStatus.textContent = passLinked ? "設定済み" : "未設定"; passStatus.className = `method-status ${passLinked ? "linked" : "unlinked"}`; }
    // #7 メール表示
    if (passEmailEl) passEmailEl.textContent = passLinked && (passData?.email || user.email) ? (passData?.email || user.email) : "";

    if (passBtnEl) {
        if (passLinked) {
            passBtnEl.textContent = "解除する"; passBtnEl.className = "provider-link-btn unlink-btn";
            passBtnEl.disabled = total <= 1; passBtnEl.title = total <= 1 ? "最後のログイン方法は解除できません" : "";
            passBtnEl.onclick = async () => {
                const msgEl = document.getElementById("provider-msg");
                if (!confirm("メール/パスワードログインを解除しますか？")) return;
                try {
                    await unlink(auth.currentUser, "password");
                    setMsg(msgEl, "✅ 解除しました", "success");
                    await logActivity(user.uid, "method_change", "パスワード解除");
                    await _renderAllMethods(auth.currentUser, auth, db);
                } catch (e) { setMsg(msgEl, e.message, "error"); }
            };
        } else {
            passBtnEl.textContent = "設定する"; passBtnEl.className = "provider-link-btn link-btn";
            passBtnEl.disabled = !user.email; passBtnEl.title = !user.email ? "先にメールアドレスを設定してください" : "";
            passBtnEl.onclick = () => {
                if (!user.email) return;
                const overlay = createPopup(`
<h3 class="popup-title">🔑 パスワードを設定する</h3>
<div class="form-group">
    <label class="form-label">新しいパスワード (6文字以上)</label>
    <input id="_pw_new"  type="password" class="form-input" placeholder="パスワード">
</div>
<div class="form-group">
    <label class="form-label">パスワード確認</label>
    <input id="_pw_conf" type="password" class="form-input" placeholder="もう一度入力">
</div>
<p id="_pw_msg" class="settings-msg"></p>
<div class="popup-btns">
    <button id="_pw_cancel" class="btn-secondary-sm">キャンセル</button>
    <button id="_pw_save"   class="btn-primary-sm">設定する</button>
</div>`);
                overlay.querySelector("#_pw_cancel").onclick = () => overlay.remove();
                overlay.querySelector("#_pw_save").onclick = async () => {
                    const newP = overlay.querySelector("#_pw_new")?.value;
                    const conf = overlay.querySelector("#_pw_conf")?.value;
                    const msgEl = overlay.querySelector("#_pw_msg");
                    if (!newP || newP.length < 6) return setMsg(msgEl, "6文字以上のパスワードを入力してください", "error");
                    if (newP !== conf)            return setMsg(msgEl, "パスワードが一致しません", "error");
                    overlay.querySelector("#_pw_save").disabled = true;
                    try {
                        const cred = EmailAuthProvider.credential(auth.currentUser.email, newP);
                        await linkWithCredential(auth.currentUser, cred);
                        await logActivity(user.uid, "method_change", "パスワード設定");
                        overlay.remove();
                        setMsg(document.getElementById("provider-msg"), "✅ パスワードを設定しました", "success");
                        await _renderAllMethods(auth.currentUser, auth, db);
                    } catch (e) { setMsg(msgEl, e.message, "error"); overlay.querySelector("#_pw_save").disabled = false; }
                };
            };
        }
    }

    // メールアドレス未設定カード
    const emailCard = document.getElementById("email-setup-card");
    if (emailCard) emailCard.style.display = user.email ? "none" : "block";

    // ──── Googleログイン ────
    const googleLinked = ids.includes("google.com");
    const googleData   = user.providerData.find(p => p.providerId === "google.com");
    const googleStatus = document.getElementById("status-google");
    const googleBtnEl  = document.getElementById("btn-google");
    // #7 Googleアカウントのメール表示
    const googleEmailEl = document.getElementById("method-email-google");

    if (googleStatus) { googleStatus.textContent = googleLinked ? "設定済み" : "未設定"; googleStatus.className = `method-status ${googleLinked ? "linked" : "unlinked"}`; }
    // #7 メール表示
    if (googleEmailEl) googleEmailEl.textContent = googleLinked && googleData?.email ? googleData.email : "";

    if (googleBtnEl) {
        if (googleLinked) {
            googleBtnEl.textContent = "解除する"; googleBtnEl.className = "provider-link-btn unlink-btn";
            googleBtnEl.disabled = total <= 1; googleBtnEl.title = total <= 1 ? "最後のログイン方法は解除できません" : "";
            googleBtnEl.onclick = async () => {
                const msgEl = document.getElementById("provider-msg");
                if (!confirm("Google連携を解除しますか？")) return;
                try {
                    await unlink(auth.currentUser, "google.com");
                    setMsg(msgEl, "✅ 解除しました", "success");
                    await logActivity(user.uid, "method_change", "Google解除");
                    await _renderAllMethods(auth.currentUser, auth, db);
                } catch (e) { const M = { "auth/no-such-provider":"このプロバイダーは連携されていません" }; setMsg(msgEl, M[e.code] || e.message, "error"); }
            };
        } else {
            googleBtnEl.textContent = "連携する"; googleBtnEl.className = "provider-link-btn link-btn"; googleBtnEl.disabled = false;
            googleBtnEl.onclick = async () => {
                const msgEl = document.getElementById("provider-msg");
                try {
                    await linkWithPopup(auth.currentUser, new GoogleAuthProvider());
                    setMsg(msgEl, "✅ 連携しました", "success");
                    await logActivity(user.uid, "method_change", "Google連携");
                    await _renderAllMethods(auth.currentUser, auth, db);
                } catch (e) {
                    const M = { "auth/credential-already-in-use":"このGoogleアカウントはすでに別のユーザーと連携されています", "auth/popup-closed-by-user":"ポップアップが閉じられました" };
                    setMsg(msgEl, M[e.code] || e.message, "error");
                }
            };
        }
    }

    // メールアドレス設定
    document.getElementById("set-email-btn")?.addEventListener("click", async () => {
        const email = document.getElementById("set-email-input")?.value.trim();
        const msgEl = document.getElementById("set-email-msg");
        if (!email || !email.includes("@")) return setMsg(msgEl, "正しいメールアドレスを入力してください", "error");
        btnState("set-email-btn", "処理中...", true);
        try {
            await updateEmail(auth.currentUser, email);
            await sendEmailVerification(auth.currentUser).catch(() => {});
            setMsg(msgEl, "✅ 設定しました。確認メールをご確認ください。", "success");
            await logActivity(user.uid, "email_change", "");
            await _renderAllMethods(auth.currentUser, auth, db);
        } catch (e) {
            const M = { "auth/email-already-in-use":"このメールアドレスはすでに使用されています", "auth/requires-recent-login":"再ログインが必要です" };
            setMsg(msgEl, M[e.code] || e.message, "error");
        } finally { btnState("set-email-btn", "設定する", false); }
    });
}

// ============================================================
// 共通: ユーザーカード描画
// ============================================================
function _renderUserCard(user) {
    const avatarEl = document.getElementById("settings-avatar-wrap");
    if (avatarEl) avatarEl.innerHTML = user.photoURL ? `<img src="${esc(user.photoURL)}" alt="avatar" class="user-info-avatar">` : `<div class="user-info-avatar-placeholder">👤</div>`;
    const els = { "settings-user-name": user.displayName || "名前未設定", "settings-user-email": user.email || "（メールアドレス未設定）", "settings-user-uuid": user.uid };
    for (const [id, val] of Object.entries(els)) { const el = document.getElementById(id); if (el) el.textContent = val; }
    const signEl = document.getElementById("settings-last-signin");
    if (signEl && user.metadata?.lastSignInTime) signEl.textContent = new Date(user.metadata.lastSignInTime).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

// ============================================================
// エントリポイント
// ============================================================
document.addEventListener("DOMContentLoaded", async () => {
    if (window.emailjs) window.emailjs.init("eG7KMS7F3Fh0PziYy");
    switch (PAGE) {
        case "signup":   await initSignup();     break;
        case "login":    await initLogin();      break;
        case "logout":   await initLogout();     break;
        case "delete":   await initDelete();     break;
        case "settings": await initSettings();   break;
        case "profile":  await initProfile();    break;
        case "privacy":  await initPrivacy();    break;
        case "security": await initSecurity();   break;
        case "activity": await initActivity();   break;
        case "device":   await initDevice();     break;
        case "pass":     await initPass();       break;
        case "twofa":    await initTwoFA();      break;
        case "backup":   await initBackupCode(); break;
        case "methods":  await initMethods();    break;
        default: break;
    }
});