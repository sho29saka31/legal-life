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
    getFirestore, doc, getDoc, setDoc, deleteDoc, Timestamp,
    collection, getDocs, query, orderBy, limit
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// ========================================
// Firebase 初期化待ち
// ========================================
async function waitForAuth() {
    return new Promise((resolve) => {
        const check = () => {
            try { resolve(getAuth(getApp())); }
            catch { setTimeout(check, 50); }
        };
        check();
    });
}

const auth           = await waitForAuth();
const googleProvider = new GoogleAuthProvider();
const db             = getFirestore(getApp());

// ========================================
// EmailJS 設定
// ========================================
const EMAILJS_SERVICE_ID  = "service_glirsis";
const EMAILJS_TEMPLATE_ID = "template_w2ile0p";
const EMAILJS_PUBLIC_KEY  = "eG7KMS7F3Fh0PziYy";

window.emailjs.init(EMAILJS_PUBLIC_KEY);

// ========================================
// OTP 定数
// ========================================
const OTP_EXPIRY_MINUTES = 5;
const OTP_DIGITS         = 6;

// ========================================
// OTP ユーティリティ
// ========================================
function generateOTP() {
    return String(Math.floor(Math.random() * 10 ** OTP_DIGITS)).padStart(OTP_DIGITS, '0');
}

async function saveOTP(uid, code, purpose) {
    // Firestore Timestamp で保存 → Firebase TTLポリシーで自動削除対象になる
    const expiryTs = Timestamp.fromMillis(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    await setDoc(doc(db, "users", uid, "security", "twoFactor"), {
        otpCode:    code,
        otpExpiry:  expiryTs,   // Firestore Timestamp（TTLポリシーのターゲットフィールド）
        otpPurpose: purpose,
    }, { merge: true });
}

async function verifyOTP(uid, inputCode, purpose) {
    const snap = await getDoc(doc(db, "users", uid, "security", "twoFactor"));
    if (!snap.exists()) return { ok: false, reason: "コードが見つかりません" };

    const { otpCode, otpExpiry, otpPurpose } = snap.data();
    if (otpPurpose !== purpose)                    return { ok: false, reason: "用途が一致しません" };
    // Firestore Timestamp → JS Date に変換して比較
    if (new Date() > otpExpiry.toDate())           return { ok: false, reason: "コードの有効期限が切れています" };
    if (otpCode !== inputCode)                     return { ok: false, reason: "コードが正しくありません" };

    return { ok: true };
}

async function clearOTP(uid) {
    await setDoc(doc(db, "users", uid, "security", "twoFactor"), {
        otpCode: null, otpExpiry: null, otpPurpose: null,
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
// OTP 確認モーダル（汎用）
// ========================================
function showOtpModal(purpose, onVerified) {
    const overlay   = document.getElementById("otp-modal-overlay");
    const msgEl     = document.getElementById("otp-modal-msg");
    const input     = document.getElementById("otp-modal-input");
    const submitBtn = document.getElementById("otp-modal-submit");
    const cancelBtn = document.getElementById("otp-modal-cancel");

    msgEl.textContent     = "";
    input.value           = "";
    overlay.style.display = "flex";
    document.body.classList.add("otp-modal-open");
    input.focus();

    const cleanup = () => {
        overlay.style.display = "none";
        document.body.classList.remove("otp-modal-open");
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

    input.onkeydown = e => { if (e.key === "Enter") submitBtn.click(); };
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
    input.value        = current === "名前未設定" ? "" : current;
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
    renderRecentActivity(user); // fire-and-forget
}

// ---- ユーザー情報 ----
function renderUserInfo(user) {
    const avatarWrap = document.getElementById("settings-avatar-wrap");
    avatarWrap.innerHTML = user.photoURL
        ? `<img src="${user.photoURL}" alt="avatar" class="user-info-avatar">`
        : `<div class="user-info-avatar-placeholder">👤</div>`;

    document.getElementById("settings-user-name").textContent  = user.displayName || "名前未設定";
    document.getElementById("settings-user-email").textContent = user.email || "（メールアドレス未設定）";

    const uuidEl = document.getElementById("settings-user-uuid");
    if (uuidEl) uuidEl.textContent = user.uid;
}

// ---- プロバイダー連携状態 ----
function renderProviders(user) {
    const ids         = user.providerData.map(p => p.providerId);
    const totalLinked = ids.length;

    updateProviderRow('google', 'google.com', ids, totalLinked, googleProvider);
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
        statusEl.textContent = user.email ? "未設定" : "先にメールアドレスを設定";
        statusEl.className   = "provider-status";
        btnEl.textContent    = user.email ? "設定する" : "先にメールアドレスを設定";
        btnEl.className      = "provider-link-btn link-btn";
        btnEl.disabled       = !user.email;
        btnEl.title          = !user.email ? "先にメールアドレスを設定してください" : "";
        btnEl.onclick        = () => showPasswordCard();
    }
}

// ---- パスワードカード ----
function renderPasswordCard(user) {
    const hasPassword  = user.providerData.some(p => p.providerId === "password");
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

// ---- メールアドレス設定カード ----
function renderEmailSetupCard(user) {
    const emailCard = document.getElementById("email-setup-card");
    emailCard.classList.toggle("hidden", !!user.email);
}

// ========================================
// 二段階認証トグル
// ========================================
async function renderTwoFactorToggle(user) {
    const enabled = await getTwoFactorEnabled(user.uid);
    const toggle  = document.getElementById("two-factor-toggle");
    const label   = document.getElementById("two-factor-status-label");
    if (toggle) toggle.checked    = enabled;
    if (label)  label.textContent = enabled ? "有効" : "無効";
}

document.getElementById("two-factor-toggle")?.addEventListener("change", async (e) => {
    const toggle  = e.target;
    const user    = auth.currentUser;
    const label   = document.getElementById("two-factor-status-label");
    const msgEl   = document.getElementById("two-factor-msg");

    if (!user.email) {
        setMsg(msgEl, "二段階認証を使用するにはメールアドレスの設定が必要です", "error");
        toggle.checked = !toggle.checked;
        return;
    }

    const newState   = toggle.checked;
    const purpose    = newState ? "2fa_enable" : "2fa_disable";
    const purposeTxt = newState ? "二段階認証の有効化" : "二段階認証の無効化";

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
                enabled: newState,
            }, { merge: true });
            toggle.checked    = newState;
            label.textContent = newState ? "有効" : "無効";
            setMsg(msgEl, `✅ 二段階認証を${newState ? "有効" : "無効"}にしました`, "success");
        });
    } catch (err) {
        console.error("二段階認証設定失敗:", err);
        setMsg(msgEl, "送信に失敗しました。メールアドレスをご確認ください", "error");
    } finally {
        toggle.disabled = false;
    }
});

// ========================================
// プロバイダー連携
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
        const MSG = {
            'auth/credential-already-in-use': 'このアカウントはすでに別のユーザーと連携されています',
            'auth/popup-closed-by-user':      'ポップアップが閉じられました',
            'auth/cancelled-popup-request':   'ポップアップがキャンセルされました',
        };
        setMsg(msgEl, MSG[e.code] || "連携に失敗しました", "error");
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
        const MSG = {
            'auth/email-already-in-use':  'このメールアドレスはすでに使用されています',
            'auth/invalid-email':          'メールアドレスの形式が正しくありません',
            'auth/requires-recent-login':  'セキュリティのため再ログインが必要です。一度ログアウトして再ログインしてください',
        };
        setMsg(msgEl, MSG[e.code] || "設定に失敗しました", "error");
    } finally {
        btn.disabled    = false;
        btn.textContent = "メールアドレスを設定する";
    }
});

// ========================================
// パスワード変更・設定
// ========================================
async function executePasswordChange(user, currentPassword, newPassword, confirmPassword, msgEl, submitBtn) {
    setMsg(msgEl, "", "");

    if (!newPassword)                   return setMsg(msgEl, "新しいパスワードを入力してください", "error");
    if (newPassword.length < 6)         return setMsg(msgEl, "パスワードは6文字以上にしてください", "error");
    if (newPassword !== confirmPassword) return setMsg(msgEl, "パスワードが一致しません", "error");

    submitBtn.disabled    = true;
    submitBtn.textContent = "処理中...";

    const hasPassword = user.providerData.some(p => p.providerId === "password");

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

        // パスワード変更後：他の端末のログアウトを提案
        showLogoutOthersDialog(user.uid);

    } catch (e) {
        console.error("❌ パスワード処理失敗:", e);
        const MSG = {
            'auth/wrong-password':        '現在のパスワードが間違っています',
            'auth/weak-password':         'パスワードは6文字以上にしてください',
            'auth/requires-recent-login': 'セキュリティのため再ログインが必要です',
            'auth/email-already-in-use':  'このメールアドレスはすでにパスワードと紐付けられています',
        };
        setMsg(msgEl, MSG[e.code] || "エラーが発生しました", "error");
    } finally {
        const hasPass = auth.currentUser?.providerData.some(p => p.providerId === "password");
        submitBtn.textContent = hasPass ? "パスワードを変更する" : "パスワードを設定する";
        submitBtn.disabled    = false;
    }
}

document.getElementById("password-submit-btn").addEventListener("click", async () => {
    const user            = auth.currentUser;
    const currentPassword = document.getElementById("current-password").value;
    const newPassword     = document.getElementById("new-password").value;
    const confirmPassword = document.getElementById("confirm-password").value;
    const msgEl           = document.getElementById("password-msg");
    const submitBtn       = document.getElementById("password-submit-btn");

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

/** 削除確認モーダルの開閉 */
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

/** 削除実行（2FA チェック後に呼ばれる） */
async function executeDeleteAccount() {
    const msgEl   = document.getElementById("delete-msg");
    const execBtn = document.getElementById("delete-execute-btn");

    execBtn.disabled    = true;
    execBtn.textContent = "削除中...";

    try {
        await deleteUser(auth.currentUser);
        alert("アカウントを削除しました。ご利用ありがとうございました。");
        location.href = "/";
    } catch (e) {
        console.error("❌ アカウント削除失敗:", e);
        const msg = e.code === 'auth/requires-recent-login'
            ? "セキュリティのため再ログインが必要です。一度ログアウトして再ログインしてから削除してください。"
            : "削除に失敗しました。時間をおいて再試行してください。";
        msgEl.textContent = msg;
        execBtn.disabled    = false;
        execBtn.textContent = "削除する";
    }
}

/** 削除ボタン：2FA が有効なら先に OTP 認証 */
document.getElementById("delete-execute-btn").addEventListener("click", async () => {
    const msgEl   = document.getElementById("delete-msg");
    const execBtn = document.getElementById("delete-execute-btn");
    const user    = auth.currentUser;

    execBtn.disabled    = true;
    execBtn.textContent = "確認中...";
    msgEl.textContent   = "";

    try {
        const twoFactorOn = await getTwoFactorEnabled(user.uid);

        if (twoFactorOn) {
            if (!user.email) {
                setMsg(msgEl, "メールアドレスが設定されていないため二段階認証を実行できません", "error");
                execBtn.disabled    = false;
                execBtn.textContent = "削除する";
                return;
            }

            execBtn.textContent = "認証コード送信中...";
            const code = generateOTP();
            await saveOTP(user.uid, code, "account_delete");
            await sendOTPEmail(user, code, "アカウント削除");
            setMsg(msgEl, `📧 ${user.email} に認証コードを送信しました`, "success");

            execBtn.disabled    = false;
            execBtn.textContent = "削除する";

            showOtpModal("account_delete", async () => {
                await executeDeleteAccount();
            });
            return;
        }

        // 2FA 無効の場合はそのまま削除
        await executeDeleteAccount();

    } catch (e) {
        console.error("❌ 削除前処理失敗:", e);
        setMsg(msgEl, "エラーが発生しました。再試行してください", "error");
        execBtn.disabled    = false;
        execBtn.textContent = "削除する";
    }
});


// ========================================
// 最近のアクション（ログインセッション）
// ========================================

const SESSION_ID_KEY = 'legallife_session_id';

/** セッション一覧を描画 */
async function renderRecentActivity(user) {
    const listEl       = document.getElementById("sessions-list");
    const logoutAllBtn = document.getElementById("logout-all-others-btn");
    if (!listEl) return;

    listEl.innerHTML = '<p class="session-loading">読み込み中...</p>';

    try {
        const sessionsRef = collection(db, "users", user.uid, "sessions");
        const q    = query(sessionsRef, orderBy("lastActive", "desc"), limit(10));
        const snap = await getDocs(q);

        if (snap.empty) {
            listEl.innerHTML = '<p class="session-empty">セッション情報がありません</p>';
            if (logoutAllBtn) logoutAllBtn.style.display = 'none';
            return;
        }

        const currentSessionId = localStorage.getItem(SESSION_ID_KEY);
        let hasOtherSessions   = false;

        listEl.innerHTML = snap.docs.map(d => {
            const data      = d.data();
            const isCurrent = data.sessionId === currentSessionId;
            if (!isCurrent) hasOtherSessions = true;
            return _buildSessionItemHtml(data, isCurrent, user.uid);
        }).join('');

        if (logoutAllBtn) {
            logoutAllBtn.style.display = hasOtherSessions ? 'block' : 'none';
        }
    } catch (e) {
        console.error("セッション取得失敗:", e);
        listEl.innerHTML = '<p class="session-empty" style="color:#e74c3c;">読み込みに失敗しました</p>';
    }
}

/** セッション1件分のHTML生成 */
function _buildSessionItemHtml(data, isCurrent, uid) {
    const icon   = (data.device || '').includes('スマートフォン') ? '📱' : '💻';
    const loginAt = data.loginAt?.toDate?.() || data.lastActive?.toDate?.();
    const dateStr = loginAt ? _formatRelativeDate(loginAt) : '不明';

    const currentBadge = isCurrent
        ? '<span class="session-badge-current">現在の端末</span>'
        : '';
    const logoutBtn = !isCurrent
        ? `<button class="session-logout-btn"
               onclick="window.logoutSession('${_esc(uid)}', '${_esc(data.sessionId)}')">
               ログアウト
           </button>`
        : '';

    return `
<div class="session-item${isCurrent ? ' session-item--current' : ''}">
    <div class="session-device-icon">${icon}</div>
    <div class="session-info">
        <div class="session-browser">
            ${_esc(data.browser || '不明')} / ${_esc(data.os || '不明')}
            ${currentBadge}
        </div>
        <div class="session-meta">
            <span>📍 ${_esc(data.location || '不明')}</span>
            <span class="session-meta-sep">·</span>
            <span>🕒 ${dateStr}</span>
        </div>
        <div class="session-device-label">${_esc(data.device || '不明')}</div>
    </div>
    ${logoutBtn}
</div>`;
}

/** HTML エスケープ（最小限） */
function _esc(str) {
    return String(str).replace(/[<>&"']/g, c =>
        ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&#39;' }[c])
    );
}

/** 相対的な日時表示 */
function _formatRelativeDate(date) {
    const diff    = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours   = Math.floor(diff / 3600000);
    const days    = Math.floor(diff / 86400000);

    if (minutes < 1)  return 'たった今';
    if (minutes < 60) return `${minutes}分前`;
    if (hours < 24)   return `${hours}時間前`;
    if (days < 7)     return `${days}日前`;
    return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** 指定セッションをリモートログアウト */
async function logoutSession(uid, sessionId) {
    try {
        await setDoc(
            doc(db, "users", uid, "sessions", sessionId),
            { shouldLogout: true },
            { merge: true }
        );
        await renderRecentActivity(auth.currentUser);
    } catch (e) {
        console.error("セッションログアウト失敗:", e);
    }
}

/** 他のすべてのセッションをリモートログアウト */
async function logoutAllOtherSessions(uid) {
    const currentSessionId = localStorage.getItem(SESSION_ID_KEY);

    try {
        const snap = await getDocs(collection(db, "users", uid, "sessions"));
        const targets = snap.docs.filter(d => d.data().sessionId !== currentSessionId);
        await Promise.allSettled(
            targets.map(d => setDoc(d.ref, { shouldLogout: true }, { merge: true }))
        );
        await renderRecentActivity(auth.currentUser);
    } catch (e) {
        console.error("全セッションログアウト失敗:", e);
    }
}

/**
 * パスワード変更後に表示するダイアログ
 * 「現在の端末のみ」or「すべての端末をログアウト」を選択させる
 */
function showLogoutOthersDialog(uid) {
    // 他セッションが存在しない場合はダイアログ不要
    const sessionsRef = collection(db, "users", uid, "sessions");
    getDocs(sessionsRef).then(snap => {
        const currentSessionId = localStorage.getItem(SESSION_ID_KEY);
        const hasOthers = snap.docs.some(d => d.data().sessionId !== currentSessionId);
        if (!hasOthers) return;

        const overlay = Object.assign(document.createElement('div'), {
            className: 'modal-overlay',
            innerHTML: `
<div class="modal-box" role="dialog" aria-modal="true">
    <div class="modal-icon">🔑</div>
    <p class="modal-message">
        パスワードを変更しました。<br>
        <span style="font-size:0.9rem; color:#666;">他の端末もログアウトしますか？</span>
    </p>
    <div class="modal-actions">
        <button class="modal-btn modal-btn-cancel" id="_logoutOthersNo">現在の端末のみ</button>
        <button class="modal-btn modal-btn-confirm" id="_logoutOthersYes"
            style="background:#00C8E9;">すべてログアウト</button>
    </div>
</div>`,
        });

        document.body.appendChild(overlay);

        const close = async (doLogout) => {
            document.body.removeChild(overlay);
            if (doLogout) await logoutAllOtherSessions(uid);
        };

        document.getElementById('_logoutOthersYes').onclick = () => close(true);
        document.getElementById('_logoutOthersNo').onclick  = () => close(false);
        overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
    }).catch(() => {}); // セッション取得失敗時は無視
}

// グローバル公開（HTMLのonclick属性から呼ばれる）
window.logoutSession        = logoutSession;
window.logoutAllOtherSessions = logoutAllOtherSessions;

// ========================================
// ユーティリティ
// ========================================
function setMsg(el, text, type) {
    el.textContent = text;
    el.className   = `settings-msg ${type}`;
}