// account.js - アカウント設定ページ専用スクリプト
import { getApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import {
    getAuth, onAuthStateChanged,
    GoogleAuthProvider,
    EmailAuthProvider,
    linkWithPopup, linkWithCredential,
    unlink,
    reauthenticateWithCredential,
    updatePassword, updateEmail, updateProfile,
    deleteUser
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import {
    getFirestore, doc, getDoc, setDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// important.js のFirebase初期化完了を待つ
async function waitForAuth() {
    return new Promise((resolve) => {
        const check = () => {
            try { resolve(getAuth(getApp())); }
            catch (e) { setTimeout(check, 50); }
        };
        check();
    });
}

const auth            = await waitForAuth();
const googleProvider  = new GoogleAuthProvider();

const db = getFirestore(getApp());

// EmailJS設定（自分のIDに書き換えてください）
const EMAILJS_SERVICE_ID  = "service_glirsis";
const EMAILJS_TEMPLATE_ID = "template_w2ile0p";
const EMAILJS_PUBLIC_KEY  = "eG7KMS7F3Fh0PziYy";

// EmailJS SDK読み込み
window.emailjs.init(EMAILJS_PUBLIC_KEY);

// OTP設定
const OTP_EXPIRY_MINUTES = 5;
const OTP_DIGITS         = 6;

// ========================================
// OTPユーティリティ
// ========================================
function generateOTP() {
    return String(Math.floor(Math.random() * 10 ** OTP_DIGITS)).padStart(OTP_DIGITS, '0');
}

async function saveOTP(uid, code, purpose) {
    const expiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    await setDoc(doc(db, "users", uid, "security", "twoFactor"), {
        otpCode:    code,
        otpExpiry:  expiry.toISOString(),
        otpPurpose: purpose
    }, { merge: true });
}

async function verifyOTP(uid, inputCode, purpose) {
    const snap = await getDoc(doc(db, "users", uid, "security", "twoFactor"));
    if (!snap.exists()) return { ok: false, reason: "コードが見つかりません" };
    const { otpCode, otpExpiry, otpPurpose } = snap.data();
    if (otpPurpose !== purpose)              return { ok: false, reason: "用途が一致しません" };
    if (new Date() > new Date(otpExpiry))    return { ok: false, reason: "コードの有効期限が切れています" };
    if (otpCode !== inputCode)               return { ok: false, reason: "コードが正しくありません" };
    return { ok: true };
}

async function clearOTP(uid) {
    await setDoc(doc(db, "users", uid, "security", "twoFactor"), {
        otpCode: null, otpExpiry: null, otpPurpose: null
    }, { merge: true });
}

async function sendOTPEmail(user, code, purposeText) {
    await window.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
        to_email:       user.email,
        to_name:        user.displayName || "ユーザー",
        otp_code:       code,
        expiry_minutes: OTP_EXPIRY_MINUTES,
        purpose:        purposeText,
    });
}

async function getTwoFactorEnabled(uid) {
    const snap = await getDoc(doc(db, "users", uid, "security", "twoFactor"));
    return snap.exists() ? (snap.data().enabled ?? false) : false;
}

// ========================================
// OTP確認モーダル（汎用）
// ========================================
function showOtpModal(purpose, onVerified) {
    const overlay = document.getElementById("otp-modal-overlay");
    const msgEl   = document.getElementById("otp-modal-msg");
    const input   = document.getElementById("otp-modal-input");
    const submitBtn = document.getElementById("otp-modal-submit");
    const cancelBtn = document.getElementById("otp-modal-cancel");

    msgEl.textContent  = "";
    input.value        = "";
    overlay.style.display = "flex";
    document.body.classList.add("otp-modal-open");
    input.focus();

    const cleanup = () => {
        overlay.style.display = "none";
        document.body.classList.remove("otp-modal-open")
        submitBtn.onclick = null;
        cancelBtn.onclick = null;
    };

    cancelBtn.onclick = cleanup;

    submitBtn.onclick = async () => {
        const code = input.value.trim();
        if (!code) { msgEl.textContent = "コードを入力してください"; return; }

        submitBtn.disabled    = true;
        submitBtn.textContent = "確認中...";
        msgEl.textContent     = "";

        const result = await verifyOTP(auth.currentUser.uid, code, purpose);
        if (result.ok) {
            await clearOTP(auth.currentUser.uid);
            cleanup();
            await onVerified();
        } else {
            msgEl.textContent     = result.reason;
            submitBtn.disabled    = false;
            submitBtn.textContent = "確認する";
        }
    };

    // Enterキー対応
    input.onkeydown = (e) => { if (e.key === "Enter") submitBtn.click(); };
}

// ========================================
// 認証状態監視
// ========================================
onAuthStateChanged(auth, (user) => {
    document.getElementById("loading-state").style.display = "none";
    if (!user) {
        location.replace("/error/401.html");
        return;
    }
    document.getElementById("settings-content").style.display = "block";
    renderAll(user);
});

// ========================================
// 表示名の編集
// ========================================
document.getElementById("settings-edit-name-btn")?.addEventListener("click", () => {
    const form    = document.getElementById("edit-name-form");
    const input   = document.getElementById("edit-name-input");
    const current = document.getElementById("settings-user-name")?.textContent;
    input.value   = current === "名前未設定" ? "" : current;
    form.style.display = "block";
    input.focus();
});

document.getElementById("edit-name-cancel-btn")?.addEventListener("click", () => {
    document.getElementById("edit-name-form").style.display = "none";
    document.getElementById("edit-name-msg").textContent = "";
});

document.getElementById("edit-name-save-btn")?.addEventListener("click", async () => {
    const input   = document.getElementById("edit-name-input");
    const msgEl   = document.getElementById("edit-name-msg");
    const saveBtn = document.getElementById("edit-name-save-btn");
    const name    = input.value.trim();

    setMsg(msgEl, "", "");
    if (!name) return setMsg(msgEl, "表示名を入力してください", "error");

    saveBtn.disabled    = true;
    saveBtn.textContent = "保存中...";
    try {
        await updateProfile(auth.currentUser, { displayName: name });
        setMsg(msgEl, "✅ 表示名を変更しました", "success");
        renderUserInfo(auth.currentUser);
        setTimeout(() => {
            document.getElementById("edit-name-form").style.display = "none";
            setMsg(msgEl, "", "");
        }, 1500);
    } catch (e) {
        console.error("❌ 表示名更新失敗:", e);
        setMsg(msgEl, "変更に失敗しました", "error");
    } finally {
        saveBtn.disabled    = false;
        saveBtn.textContent = "保存する";
    }
});

// ========================================
// UUID コピー
// ========================================
document.getElementById("copy-uuid-btn")?.addEventListener("click", async () => {
    const uuid = document.getElementById("settings-user-uuid")?.textContent;
    if (!uuid) return;
    try {
        await navigator.clipboard.writeText(uuid);
        const btn = document.getElementById("copy-uuid-btn");
        btn.textContent = "✅";
        setTimeout(() => { btn.textContent = "📋"; }, 2000);
    } catch (e) {
        console.error("コピー失敗:", e);
    }
});

// ========================================
// ログアウト（設定ページ内）
// ========================================
document.getElementById("settings-logout-btn")?.addEventListener("click", async () => {
    if (!confirm("ログアウトしますか？")) return;
    try {
        const { getAuth, signOut } = await import(
            "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js"
        );
        await signOut(getAuth());
        location.href = "/";
    } catch (e) {
        console.error("ログアウト失敗:", e);
    }
});

// ========================================
// 全体描画
// ========================================
async function renderAll(user) {
    renderUserInfo(user);
    renderProviders(user);
    renderPasswordCard(user);
    renderEmailSetupCard(user);
    await renderTwoFactorToggle(user);
}

// ---- ユーザー情報 ----
function renderUserInfo(user) {
    const avatarWrap = document.getElementById("settings-avatar-wrap");
    if (user.photoURL) {
        avatarWrap.innerHTML = `<img src="${user.photoURL}" alt="avatar" class="user-info-avatar">`;
    } else {
        avatarWrap.innerHTML = `<div class="user-info-avatar-placeholder">👤</div>`;
    }
    document.getElementById("settings-user-name").textContent  = user.displayName || "名前未設定";
    document.getElementById("settings-user-email").textContent = user.email || "（メールアドレス未設定）";

    // UUID（UID）表示
    const uuidEl = document.getElementById("settings-user-uuid");
    if (uuidEl) uuidEl.textContent = user.uid;
}

// ---- プロバイダー連携状態 ----
function renderProviders(user) {
    const ids         = user.providerData.map(p => p.providerId);
    const totalLinked = ids.length;

    // Google
    updateProviderRow('google', 'google.com', ids, totalLinked, googleProvider);

    // メール/パスワード
    updateEmailProviderRow(ids, totalLinked, user);
}

function updateProviderRow(key, providerId, providerIds, totalLinked, provider) {
    const isLinked = providerIds.includes(providerId);
    const statusEl = document.getElementById(`status-${key}`);
    const btnEl    = document.getElementById(`btn-${key}`);
    if (!statusEl || !btnEl) return;

    if (isLinked) {
        statusEl.textContent = "連携済み ✓";
        statusEl.className   = "provider-status linked";
        btnEl.textContent    = "解除する";
        btnEl.className      = "provider-link-btn unlink-btn";
        btnEl.disabled       = totalLinked <= 1;
        btnEl.title          = totalLinked <= 1 ? "最後のログイン方法は解除できません" : "";
        btnEl.onclick        = () => handleUnlink(providerId);
    } else {
        statusEl.textContent = "未連携";
        statusEl.className   = "provider-status";
        btnEl.textContent    = "連携する";
        btnEl.className      = "provider-link-btn link-btn";
        btnEl.disabled       = false;
        btnEl.title          = "";
        btnEl.onclick        = () => handleLinkWithPopup(provider, providerId);
    }
}

function updateEmailProviderRow(providerIds, totalLinked, user) {
    const isLinked = providerIds.includes("password");
    const statusEl = document.getElementById("status-email");
    const btnEl    = document.getElementById("btn-email");

    if (isLinked) {
        statusEl.textContent = "設定済み ✓";
        statusEl.className   = "provider-status linked";
        btnEl.textContent    = "解除する";
        btnEl.className      = "provider-link-btn unlink-btn";
        btnEl.disabled       = totalLinked <= 1;
        btnEl.title          = totalLinked <= 1 ? "最後のログイン方法は解除できません" : "";
        btnEl.onclick        = () => handleUnlink("password");
    } else {
        statusEl.textContent = "未設定";
        statusEl.className   = "provider-status";
        btnEl.textContent    = user.email ? "設定する" : "先にメールアドレスを設定";
        btnEl.className      = "provider-link-btn link-btn";
        btnEl.disabled       = !user.email;
        btnEl.title          = !user.email ? "先にメールアドレスを設定してください" : "";
        btnEl.onclick        = () => showPasswordCard();
    }
}

// ---- パスワードカード表示制御 ----
function renderPasswordCard(user) {
    const providerIds  = user.providerData.map(p => p.providerId);
    const hasPassword  = providerIds.includes("password");
    const passwordCard = document.getElementById("password-card");
    const cardTitle    = document.getElementById("password-card-title");
    const currentRow   = document.getElementById("current-password-row");
    const label        = document.getElementById("new-password-label");
    const submitBtn    = document.getElementById("password-submit-btn");

    if (hasPassword) {
        passwordCard.classList.remove("hidden");
        cardTitle.textContent    = "🔑 パスワードを変更する";
        currentRow.style.display = "block";
        label.textContent        = "新しいパスワード";
        submitBtn.textContent    = "パスワードを変更する";
    } else {
        passwordCard.classList.add("hidden");
        cardTitle.textContent    = "🔑 パスワードを設定する";
        currentRow.style.display = "none";
        label.textContent        = "設定するパスワード";
        submitBtn.textContent    = "パスワードを設定する";
    }
}

function showPasswordCard() {
    document.getElementById("password-card").classList.remove("hidden");
    document.getElementById("password-card").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---- メールアドレス設定カード（メールなし時に表示） ----
function renderEmailSetupCard(user) {
    const emailCard = document.getElementById("email-setup-card");
    if (!user.email) {
        emailCard.classList.remove("hidden");
    } else {
        emailCard.classList.add("hidden");
    }
}

// ========================================
// 二段階認証トグル
// ========================================
async function renderTwoFactorToggle(user) {
    const enabled = await getTwoFactorEnabled(user.uid);
    const toggle  = document.getElementById("two-factor-toggle");
    const label   = document.getElementById("two-factor-status-label");
    if (toggle) toggle.checked = enabled;
    if (label)  label.textContent = enabled ? "有効" : "無効";
}

document.getElementById("two-factor-toggle")?.addEventListener("change", async (e) => {
    const toggle  = e.target;
    const user    = auth.currentUser;
    const label   = document.getElementById("two-factor-status-label");
    const msgEl   = document.getElementById("two-factor-msg");

    // メールアドレスがなければ操作不可
    if (!user.email) {
        setMsg(msgEl, "二段階認証を使用するにはメールアドレスの設定が必要です", "error");
        toggle.checked = !toggle.checked;
        return;
    }

    const newState   = toggle.checked;
    const purpose    = newState ? "2fa_enable" : "2fa_disable";
    const purposeTxt = newState ? "二段階認証の有効化" : "二段階認証の無効化";

    // 一旦チェックを元に戻して確認後に反映
    toggle.checked  = !newState;
    toggle.disabled = true;
    setMsg(msgEl, "認証コードを送信中...", "");

    try {
        const code = generateOTP();
        await saveOTP(user.uid, code, purpose);
        await sendOTPEmail(user, code, purposeTxt);
        setMsg(msgEl, `📧 ${user.email} に認証コードを送信しました`, "success");

        showOtpModal(purpose, async () => {
            await setDoc(doc(db, "users", user.uid, "security", "twoFactor"), {
                enabled: newState
            }, { merge: true });
            toggle.checked        = newState;
            label.textContent     = newState ? "有効" : "無効";
            setMsg(msgEl, `✅ 二段階認証を${newState ? "有効" : "無効"}にしました`, "success");
            toggle.disabled = false;
        });
    } catch (err) {
        console.error("二段階認証設定失敗:", err);
        setMsg(msgEl, "送信に失敗しました。メールアドレスをご確認ください", "error");
    } finally {
        toggle.disabled = false;
    }
});

// ========================================
// プロバイダー連携処理
// ========================================
async function handleLinkWithPopup(provider, providerId) {
    const keyMap = { "google.com": "google" };
    const key    = keyMap[providerId] || providerId;
    const btn    = document.getElementById(`btn-${key}`);
    const msgEl  = document.getElementById("provider-msg");

    btn.disabled    = true;
    btn.textContent = "処理中...";
    setMsg(msgEl, "", "");

    try {
        await linkWithPopup(auth.currentUser, provider);
        setMsg(msgEl, "✅ 連携しました", "success");
        renderAll(auth.currentUser);
    } catch (e) {
        console.error(`❌ ${providerId} 連携失敗:`, e);
        const messages = {
            'auth/credential-already-in-use': 'このアカウントはすでに別のユーザーと連携されています',
            'auth/popup-closed-by-user':      'ポップアップが閉じられました',
            'auth/cancelled-popup-request':   'ポップアップがキャンセルされました',
        };
        setMsg(msgEl, messages[e.code] || "連携に失敗しました", "error");
        renderAll(auth.currentUser);
    }
}

async function handleUnlink(providerId) {
    const msgEl = document.getElementById("provider-msg");
    setMsg(msgEl, "", "");

    try {
        await unlink(auth.currentUser, providerId);
        setMsg(msgEl, "✅ 連携を解除しました", "success");
        renderAll(auth.currentUser);
    } catch (e) {
        console.error(`❌ ${providerId} 解除失敗:`, e);
        setMsg(msgEl, "解除に失敗しました", "error");
    }
}

// ========================================
// メールアドレス設定
// ========================================
document.getElementById("set-email-btn").addEventListener("click", async () => {
    const email = document.getElementById("set-email-input").value.trim();
    const msgEl = document.getElementById("set-email-msg");
    const btn   = document.getElementById("set-email-btn");

    setMsg(msgEl, "", "");
    if (!email)               return setMsg(msgEl, "メールアドレスを入力してください", "error");
    if (!email.includes("@")) return setMsg(msgEl, "正しいメールアドレスを入力してください", "error");

    btn.disabled    = true;
    btn.textContent = "処理中...";

    try {
        await updateEmail(auth.currentUser, email);
        setMsg(msgEl, "✅ メールアドレスを設定しました", "success");
        document.getElementById("set-email-input").value = "";
        renderAll(auth.currentUser);
    } catch (e) {
        console.error("❌ メール設定失敗:", e);
        const messages = {
            'auth/email-already-in-use':  'このメールアドレスはすでに使用されています',
            'auth/invalid-email':          'メールアドレスの形式が正しくありません',
            'auth/requires-recent-login':  'セキュリティのため再ログインが必要です。一度ログアウトして再ログインしてください',
        };
        setMsg(msgEl, messages[e.code] || "設定に失敗しました", "error");
    } finally {
        btn.disabled    = false;
        btn.textContent = "メールアドレスを設定する";
    }
});

// ========================================
// executePasswordChange（リスナーの外に定義）
// ========================================
async function executePasswordChange(user, currentPassword, newPassword, confirmPassword, msgEl, submitBtn) {
    setMsg(msgEl, "", "");
    if (!newPassword)                    return setMsg(msgEl, "新しいパスワードを入力してください", "error");
    if (newPassword.length < 6)          return setMsg(msgEl, "パスワードは6文字以上にしてください", "error");
    if (newPassword !== confirmPassword)  return setMsg(msgEl, "パスワードが一致しません", "error");

    submitBtn.disabled    = true;
    submitBtn.textContent = "処理中...";

    const providerIds = user.providerData.map(p => p.providerId);
    const hasPassword = providerIds.includes("password");

    try {
        if (hasPassword) {
            if (!currentPassword) return setMsg(msgEl, "現在のパスワードを入力してください", "error");
            const cred = EmailAuthProvider.credential(user.email, currentPassword);
            await reauthenticateWithCredential(user, cred);
            await updatePassword(user, newPassword);
            setMsg(msgEl, "✅ パスワードを変更しました", "success");
        } else {
            const cred = EmailAuthProvider.credential(user.email, newPassword);
            await linkWithCredential(user, cred);
            setMsg(msgEl, "✅ パスワードを設定しました。次回からメール＋パスワードでもログインできます", "success");
        }
        document.getElementById("current-password").value = "";
        document.getElementById("new-password").value     = "";
        document.getElementById("confirm-password").value = "";
        renderAll(auth.currentUser);
    } catch (e) {
        console.error("❌ パスワード処理失敗:", e);
        const messages = {
            'auth/wrong-password':        '現在のパスワードが間違っています',
            'auth/weak-password':         'パスワードは6文字以上にしてください',
            'auth/requires-recent-login': 'セキュリティのため再ログインが必要です',
            'auth/email-already-in-use':  'このメールアドレスはすでにパスワードと紐付けられています',
        };
        setMsg(msgEl, messages[e.code] || "エラーが発生しました", "error");
    } finally {
        const hasPass = auth.currentUser?.providerData.map(p => p.providerId).includes("password");
        submitBtn.textContent = hasPass ? "パスワードを変更する" : "パスワードを設定する";
        submitBtn.disabled    = false;
    }
}

// ========================================
// パスワード設定・変更
// ========================================
document.getElementById("password-submit-btn").addEventListener("click", async () => {
    // ← 変数を先頭で宣言
    const user            = auth.currentUser;
    const currentPassword = document.getElementById("current-password").value;
    const newPassword     = document.getElementById("new-password").value;
    const confirmPassword = document.getElementById("confirm-password").value;
    const msgEl           = document.getElementById("password-msg");
    const submitBtn       = document.getElementById("password-submit-btn");

    // 二段階認証チェック
    const twoFactorOn = await getTwoFactorEnabled(user.uid);
    if (twoFactorOn) {
        if (!user.email) {
            return setMsg(msgEl, "メールアドレスが設定されていないため二段階認証を実行できません", "error");
        }
        submitBtn.disabled    = true;
        submitBtn.textContent = "認証コード送信中...";

        const code = generateOTP();
        await saveOTP(user.uid, code, "password_change");
        await sendOTPEmail(user, code, "パスワード変更");
        setMsg(msgEl, `📧 ${user.email} に認証コードを送信しました`, "success");

        showOtpModal("password_change", async () => {
            await executePasswordChange(user, currentPassword, newPassword, confirmPassword, msgEl, submitBtn);
        });
        return;
    }

    await executePasswordChange(user, currentPassword, newPassword, confirmPassword, msgEl, submitBtn);
});

// ========================================
// アカウント削除
// ========================================
document.getElementById("delete-account-btn").addEventListener("click", () => {
    document.getElementById("delete-msg").textContent = "";
    document.getElementById("delete-confirm-overlay").style.display = "flex";
});

document.getElementById("delete-cancel-btn").addEventListener("click", () => {
    document.getElementById("delete-confirm-overlay").style.display = "none";
});

document.getElementById("delete-confirm-overlay").addEventListener("click", (e) => {
    if (e.target === document.getElementById("delete-confirm-overlay")) {
        document.getElementById("delete-confirm-overlay").style.display = "none";
    }
});

document.getElementById("delete-execute-btn").addEventListener("click", async () => {
    const msgEl   = document.getElementById("delete-msg");
    const execBtn = document.getElementById("delete-execute-btn");

    execBtn.disabled    = true;
    execBtn.textContent = "削除中...";
    msgEl.textContent   = "";

    try {
        await deleteUser(auth.currentUser);
        alert("アカウントを削除しました。ご利用ありがとうございました。");
        location.href = "/";
    } catch (e) {
        console.error("❌ アカウント削除失敗:", e);
        msgEl.textContent = e.code === 'auth/requires-recent-login'
            ? "セキュリティのため再ログインが必要です。一度ログアウトして再ログインしてから削除してください。"
            : "削除に失敗しました。時間をおいて再試行してください。";
        execBtn.disabled    = false;
        execBtn.textContent = "削除する";
    }
});

// ---- ユーティリティ ----
function setMsg(el, text, type) {
    el.textContent = text;
    el.className   = `settings-msg ${type}`;
}