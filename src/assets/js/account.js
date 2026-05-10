// account.js - アカウント設定ページ専用スクリプト
import {
  getApp
  } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, EmailAuthProvider, linkWithPopup, linkWithCredential, unlink, reauthenticateWithCredential, updatePassword, updateEmail, updateProfile, deleteUser,sendEmailVerification,
  } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc, Timestamp, collection, getDocs, query, orderBy, limit,
  } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

async function waitForAuth() {
  return new Promise((resolve) => {
    const check = () => {
      try {
        resolve(getAuth(getApp()));
      } catch {
        setTimeout(check, 50);
      }
    };
    check();
  });
}

const auth = await waitForAuth();
const googleProvider = new GoogleAuthProvider();
const db = getFirestore(getApp());

// ========================================
// EmailJS 設定
// ========================================
const EMAILJS_SERVICE_ID = "service_glirsis";
const EMAILJS_OTP_TEMPLATE = "template_w2ile0p";
const EMAILJS_NOTIFY_TEMPLATE = "template_w2ile0p"; // 通知用テンプレ（別途作成推奨）
const EMAILJS_PUBLIC_KEY = "eG7KMS7F3Fh0PziYy";

window.emailjs.init(EMAILJS_PUBLIC_KEY);

// ========================================
// OTP 定数・ユーティリティ
// ========================================
const OTP_EXPIRY_MINUTES = 5;
const OTP_DIGITS = 6;

function generateOTP() {
  return String(Math.floor(Math.random() * 10 ** OTP_DIGITS)).padStart(
    OTP_DIGITS,
    "0",
  );
}

async function saveOTP(uid, code, purpose) {
  const expiryTs = Timestamp.fromMillis(
    Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000,
  );
  await setDoc(
    doc(db, "users", uid, "security", "twoFactor"),
    {
      otpCode: code,
      otpExpiry: expiryTs,
      otpPurpose: purpose,
    },
    { merge: true },
  );
}

async function verifyOTP(uid, inputCode, purpose) {
  const snap = await getDoc(doc(db, "users", uid, "security", "twoFactor"));
  if (!snap.exists()) return { ok: false, reason: "コードが見つかりません" };

  const { otpCode, otpExpiry, otpPurpose } = snap.data();
  if (otpPurpose !== purpose)
    return { ok: false, reason: "用途が一致しません" };
  if (new Date() > otpExpiry.toDate())
    return { ok: false, reason: "コードの有効期限が切れています" };
  if (otpCode !== inputCode)
    return { ok: false, reason: "コードが正しくありません" };
  return { ok: true };
}

async function clearOTP(uid) {
  await setDoc(
    doc(db, "users", uid, "security", "twoFactor"),
    {
      otpCode: null,
      otpExpiry: null,
      otpPurpose: null,
    },
    { merge: true },
  );
}

async function sendOTPEmail(user, code, purposeText) {
  await window.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_OTP_TEMPLATE, {
    to_email: user.email,
    to_name: user.displayName || "ユーザー",
    otp_code: code,
    expiry_minutes: OTP_EXPIRY_MINUTES,
    purpose: purposeText,
  });
}

async function getTwoFactorEnabled(uid) {
  const snap = await getDoc(doc(db, "users", uid, "security", "twoFactor"));
  return snap.exists() ? (snap.data().enabled ?? false) : false;
}

// ★ 追加: アクション通知メール送信ヘルパー
async function sendActionNotification(user, actionType, detail = "") {
  try {
    // 通知設定を取得
    const prefSnap = await getDoc(
      doc(db, "users", user.uid, "settings", "notifications"),
    );
    const prefs = prefSnap.exists() ? prefSnap.data() : {};

    // 未確認メールや通知OFF の場合はスキップ
    if (!user.email || !user.emailVerified) return;
    if (prefs[actionType] === false) return;

    const messages = {
      login: {
        subject: "ログイン通知",
        body: `あなたのアカウントにログインがありました。\n\n詳細: ${detail}\n\n身に覚えがない場合は、すぐにパスワードを変更し、他の端末をログアウトしてください。`,
      },
      passwordChange: {
        subject: "パスワード変更通知",
        body: `パスワードが変更されました。\n\n身に覚えがない場合は、すぐにアカウントの保護を行ってください。`,
      },
      otpChange: {
        subject: "二段階認証設定変更通知",
        body: `二段階認証の設定が変更されました。(${detail})\n\n身に覚えがない場合は、すぐにパスワードを変更してください。`,
      },
      deletionRequest: {
        subject: "アカウント削除依頼受付",
        body: `アカウント削除のリクエストを受け付けました。\n30日後に完全削除されます。\nキャンセルはアカウント設定ページから可能です。`,
      },
    };

    const msg = messages[actionType];
    if (!msg) return;

    await window.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_NOTIFY_TEMPLATE, {
      to_email: user.email,
      to_name: user.displayName || "ユーザー",
      subject: msg.subject,
      message_body: msg.body,
      otp_code: "", // 通知テンプレートはOTPフィールド不要だが互換性のため
      expiry_minutes: "",
      purpose: msg.subject,
    });
    console.log(`📧 通知送信: ${actionType}`);
  } catch (e) {
    console.warn("通知メール送信失敗（継続）:", e);
  }
}

// ========================================
// ★ FIX 0: OTP確認モーダル（ボタンリセット修正）
// ========================================
function showOtpModal(purpose, onVerified) {
  const overlay = document.getElementById("otp-modal-overlay");
  const msgEl = document.getElementById("otp-modal-msg");
  const input = document.getElementById("otp-modal-input");
  const submitBtn = document.getElementById("otp-modal-submit");
  const cancelBtn = document.getElementById("otp-modal-cancel");

  /* ★ FIX: 前回の呼び出し状態を完全リセット */
  msgEl.textContent = "";
  input.value = "";
  submitBtn.disabled = false;
  submitBtn.textContent = "確認する";
  /* onclick 上書きで旧ハンドラを破棄 */
  submitBtn.onclick = null;
  cancelBtn.onclick = null;
  input.onkeydown = null;

  overlay.style.display = "flex";
  document.body.classList.add("otp-modal-open");
  setTimeout(() => input.focus(), 50);

  const cleanup = () => {
    overlay.style.display = "none";
    document.body.classList.remove("otp-modal-open");
    submitBtn.onclick = null;
    cancelBtn.onclick = null;
    input.onkeydown = null;
  };

  cancelBtn.onclick = cleanup;

  submitBtn.onclick = async () => {
    const code = input.value.trim();
    if (!code) {
      msgEl.textContent = "コードを入力してください";
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "確認中...";
    msgEl.textContent = "";

    try {
      const result = await verifyOTP(auth.currentUser.uid, code, purpose);
      if (result.ok) {
        await clearOTP(auth.currentUser.uid);
        cleanup();
        await onVerified();
      } else {
        msgEl.textContent = result.reason;
        /* ★ FIX: 失敗時は必ず再活性化 */
        submitBtn.disabled = false;
        submitBtn.textContent = "確認する";
      }
    } catch (e) {
      msgEl.textContent = "エラーが発生しました。再試行してください。";
      submitBtn.disabled = false;
      submitBtn.textContent = "確認する";
    }
  };

  input.onkeydown = (e) => {
    if (e.key === "Enter") submitBtn.click();
  };
}

// ========================================
// 認証状態監視
// ========================================
onAuthStateChanged(auth, async (user) => {
  document.getElementById("loading-state").style.display = "none";
  if (!user) {
    location.replace("/error/401.html");
    return;
  }
  document.getElementById("settings-content").style.display = "block";

  // ★ アカウント削除スケジュール確認
  const delSnap = await getDoc(doc(db, "users", user.uid));
  if (
    delSnap.exists() &&
    delSnap.data().scheduledDeletion &&
    delSnap.data().deletionPending
  ) {
    showDeletionPendingBanner(
      user.uid,
      delSnap.data().scheduledDeletion.toDate(),
    );
  }

  renderAll(user);
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
  await renderNotificationSettings(user); // ★ 追加
  renderRecentActivity(user);
}

// ★ 修正: ユーザー情報描画（lastSignInTime・メール確認状態を追加）
function renderUserInfo(user) {
  const avatarWrap = document.getElementById("settings-avatar-wrap");
  avatarWrap.innerHTML = user.photoURL
    ? `<img src="${user.photoURL}" alt="avatar" class="user-info-avatar">`
    : `<div class="user-info-avatar-placeholder">👤</div>`;

  document.getElementById("settings-user-name").textContent =
    user.displayName || "名前未設定";
  document.getElementById("settings-user-email").textContent =
    user.email || "（メールアドレス未設定）";

  const uuidEl = document.getElementById("settings-user-uuid");
  if (uuidEl) uuidEl.textContent = user.uid;

  // ★ 追加: 最終ログイン日時
  const lastSignIn = user.metadata?.lastSignInTime;
  const lastSignInEl = document.getElementById("settings-last-signin");
  if (lastSignInEl && lastSignIn) {
    lastSignInEl.textContent = new Date(lastSignIn).toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
    });
  }

  // ★ 追加: メールアドレス確認バナー
  const verifyBanner = document.getElementById("email-verify-banner");
  if (verifyBanner) {
    const needsVerify =
      user.email &&
      !user.emailVerified &&
      user.providerData.some((p) => p.providerId === "password");
    verifyBanner.style.display = needsVerify ? "block" : "none";
  }
}

// ========================================
// ★ 追加: 通知設定描画
// ========================================
const NOTIFICATION_KEYS = {
  login: "ログイン通知",
  passwordChange: "パスワード変更通知",
  otpChange: "二段階認証変更通知",
  deletionRequest: "アカウント削除依頼通知",
};

async function renderNotificationSettings(user) {
  const container = document.getElementById("notification-settings-container");
  if (!container) return;

  const snap = await getDoc(
    doc(db, "users", user.uid, "settings", "notifications"),
  );
  const prefs = snap.exists() ? snap.data() : {};

  container.innerHTML = Object.entries(NOTIFICATION_KEYS)
    .map(([key, label]) => {
      const checked = prefs[key] !== false; // デフォルト ON
      return `
<div class="two-factor-row" style="padding: 12px 0; border-bottom: 1px solid #f0f0f0;">
    <div class="two-factor-info">
        <div class="two-factor-label">${label}</div>
    </div>
    <div class="two-factor-toggle-wrap">
        <label class="toggle-switch">
            <input type="checkbox" class="notif-toggle" data-key="${key}"
                   ${checked ? "checked" : ""} ${!user.emailVerified ? "disabled" : ""}>
            <span class="toggle-slider"></span>
        </label>
        <span class="two-factor-status">${checked ? "ON" : "OFF"}</span>
    </div>
</div>`;
    })
    .join("");

  if (!user.emailVerified) {
    container.insertAdjacentHTML(
      "beforeend",
      `<p style="font-size:12px;color:#e74c3c;margin-top:8px;">
             ⚠️ メールアドレスが確認済みでないと通知を受け取れません</p>`,
    );
  }

  // トグルイベント
  container.querySelectorAll(".notif-toggle").forEach((toggle) => {
    toggle.addEventListener("change", async (e) => {
      const key = e.target.dataset.key;
      const val = e.target.checked;
      const label = e.target
        .closest(".two-factor-row")
        .querySelector(".two-factor-status");
      if (label) label.textContent = val ? "ON" : "OFF";
      await setDoc(
        doc(db, "users", user.uid, "settings", "notifications"),
        { [key]: val },
        { merge: true },
      );
    });
  });
}

// ========================================
// ★ 追加: メールアドレス確認メール送信
// ========================================
document
  .getElementById("send-verify-email-btn")
  ?.addEventListener("click", async () => {
    const btn = document.getElementById("send-verify-email-btn");
    const msgEl = document.getElementById("verify-email-msg");

    btn.disabled = true;
    btn.textContent = "送信中...";
    setMsg(msgEl, "", "");

    try {
      await sendEmailVerification(auth.currentUser);
      setMsg(
        msgEl,
        "✅ 確認メールを送信しました。メールをご確認ください。",
        "success",
      );
    } catch (e) {
      const MSG = {
        "auth/too-many-requests":
          "送信が多すぎます。しばらく待ってから再試行してください。",
      };
      setMsg(msgEl, MSG[e.code] || "送信に失敗しました。", "error");
    } finally {
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = "確認メールを再送する";
      }, 60000); // 1分後に再送可能
    }
  });

// ========================================
// プロバイダー連携 (変更なし部分は省略)
// ========================================
function renderProviders(user) {
  const ids = user.providerData.map((p) => p.providerId);
  const totalLinked = ids.length;
  updateProviderRow("google", "google.com", ids, totalLinked, googleProvider);
  updateEmailProviderRow(ids, totalLinked, user);
}

function updateProviderRow(
  key, providerId, providerIds, totalLinked, provider,
) {
  const isLinked = providerIds.includes(providerId);
  const statusEl = document.getElementById(`status-${key}`);
  const btnEl = document.getElementById(`btn-${key}`);
  if (!statusEl || !btnEl) return;

  if (isLinked) {
    statusEl.textContent = "連携済み ✓";
    statusEl.className = "provider-status linked";
    btnEl.textContent = "解除する";
    btnEl.className = "provider-link-btn unlink-btn";
    btnEl.disabled = totalLinked <= 1;
    btnEl.title = totalLinked <= 1 ? "最後のログイン方法は解除できません" : "";
    btnEl.onclick = () => handleUnlink(providerId);
  } else {
    statusEl.textContent = "未連携";
    statusEl.className = "provider-status";
    btnEl.textContent = "連携する";
    btnEl.className = "provider-link-btn link-btn";
    btnEl.disabled = false;
    btnEl.title = "";
    btnEl.onclick = () => handleLinkWithPopup(provider, providerId);
  }
}

function updateEmailProviderRow(providerIds, totalLinked, user) {
  const isLinked = providerIds.includes("password");
  const statusEl = document.getElementById("status-email");
  const btnEl = document.getElementById("btn-email");

  if (isLinked) {
    statusEl.textContent = "設定済み ✓";
    statusEl.className = "provider-status linked";
    btnEl.textContent = "解除する";
    btnEl.className = "provider-link-btn unlink-btn";
    btnEl.disabled = totalLinked <= 1;
    btnEl.title = totalLinked <= 1 ? "最後のログイン方法は解除できません" : "";
    btnEl.onclick = () => handleUnlink("password");
  } else {
    statusEl.textContent = user.email ? "未設定" : "先にメールアドレスを設定";
    statusEl.className = "provider-status";
    btnEl.textContent = user.email ? "設定する" : "先にメールアドレスを設定";
    btnEl.className = "provider-link-btn link-btn";
    btnEl.disabled = !user.email;
    btnEl.title = !user.email ? "先にメールアドレスを設定してください" : "";
    btnEl.onclick = () => showPasswordCard();
  }
}

function renderPasswordCard(user) {
  const hasPassword = user.providerData.some(
    (p) => p.providerId === "password",
  );
  const passwordCard = document.getElementById("password-card");
  const cardTitle = document.getElementById("password-card-title");
  const currentRow = document.getElementById("current-password-row");
  const label = document.getElementById("new-password-label");
  const submitBtn = document.getElementById("password-submit-btn");

  if (hasPassword) {
    passwordCard.classList.remove("hidden");
    cardTitle.textContent = "🔑 パスワードを変更する";
    currentRow.style.display = "block";
    label.textContent = "新しいパスワード";
    submitBtn.textContent = "パスワードを変更する";
  } else {
    passwordCard.classList.add("hidden");
    cardTitle.textContent = "🔑 パスワードを設定する";
    currentRow.style.display = "none";
    label.textContent = "設定するパスワード";
    submitBtn.textContent = "パスワードを設定する";
  }
}

function showPasswordCard() {
  document.getElementById("password-card").classList.remove("hidden");
  document
    .getElementById("password-card")
    .scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderEmailSetupCard(user) {
  const emailCard = document.getElementById("email-setup-card");
  emailCard.classList.toggle("hidden", !!user.email);
}

// ========================================
// 二段階認証トグル
// ========================================
async function renderTwoFactorToggle(user) {
  const enabled = await getTwoFactorEnabled(user.uid);
  const toggle = document.getElementById("two-factor-toggle");
  const label = document.getElementById("two-factor-status-label");
  if (toggle) toggle.checked = enabled;
  if (label) label.textContent = enabled ? "有効" : "無効";
}

document
  .getElementById("two-factor-toggle")
  ?.addEventListener("change", async (e) => {
    const toggle = e.target;
    const user = auth.currentUser;
    const label = document.getElementById("two-factor-status-label");
    const msgEl = document.getElementById("two-factor-msg");

    if (!user.email) {
      setMsg(
        msgEl,
        "二段階認証を使用するにはメールアドレスの設定が必要です",
        "error",
      );
      toggle.checked = !toggle.checked;
      return;
    }

    const newState = toggle.checked;
    const purpose = newState ? "2fa_enable" : "2fa_disable";
    const purposeTxt = newState ? "二段階認証の有効化" : "二段階認証の無効化";

    toggle.checked = !newState;
    toggle.disabled = true;
    setMsg(msgEl, "認証コードを送信中...", "");

    try {
      const code = generateOTP();
      await saveOTP(user.uid, code, purpose);
      await sendOTPEmail(user, code, purposeTxt);
      setMsg(msgEl, `📧 ${user.email} に認証コードを送信しました`, "success");

      showOtpModal(purpose, async () => {
        await setDoc(
          doc(db, "users", user.uid, "security", "twoFactor"),
          { enabled: newState },
          { merge: true },
        );
        toggle.checked = newState;
        label.textContent = newState ? "有効" : "無効";
        setMsg(
          msgEl,
          `✅ 二段階認証を${newState ? "有効" : "無効"}にしました`,
          "success",
        );

        // ★ 通知送信
        await sendActionNotification(
          user,
          "otpChange",
          newState ? "有効化" : "無効化",
        );
      });
    } catch (err) {
      console.error("二段階認証設定失敗:", err);
      setMsg(
        msgEl,
        "送信に失敗しました。メールアドレスをご確認ください",
        "error",
      );
    } finally {
      toggle.disabled = false;
    }
  });

// ========================================
// プロバイダー連携処理
// ========================================
async function handleLinkWithPopup(provider, providerId) {
  const keyMap = { "google.com": "google" };
  const key = keyMap[providerId] || providerId;
  const btn = document.getElementById(`btn-${key}`);
  const msgEl = document.getElementById("provider-msg");

  btn.disabled = true;
  btn.textContent = "処理中...";
  setMsg(msgEl, "", "");

  try {
    await linkWithPopup(auth.currentUser, provider);
    setMsg(msgEl, "✅ 連携しました", "success");
    renderAll(auth.currentUser);
  } catch (e) {
    console.error(`❌ ${providerId} 連携失敗:`, e);
    const MSG = {
      "auth/credential-already-in-use":
        "このアカウントはすでに別のユーザーと連携されています",
      "auth/popup-closed-by-user": "ポップアップが閉じられました",
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
    setMsg(msgEl, "解除に失敗しました", "error");
  }
}

// ========================================
// メールアドレス設定
// ========================================
document.getElementById("set-email-btn").addEventListener("click", async () => {
  const email = document.getElementById("set-email-input").value.trim();
  const msgEl = document.getElementById("set-email-msg");
  const btn = document.getElementById("set-email-btn");

  setMsg(msgEl, "", "");
  if (!email) return setMsg(msgEl, "メールアドレスを入力してください", "error");
  if (!email.includes("@"))
    return setMsg(msgEl, "正しいメールアドレスを入力してください", "error");

  btn.disabled = true;
  btn.textContent = "処理中...";

  try {
    await updateEmail(auth.currentUser, email);
    await sendEmailVerification(auth.currentUser); // ★ 設定後すぐに確認メールを送信
    setMsg(
      msgEl,
      "✅ メールアドレスを設定しました。確認メールをご確認ください。",
      "success",
    );
    document.getElementById("set-email-input").value = "";
    renderAll(auth.currentUser);
  } catch (e) {
    const MSG = {
      "auth/email-already-in-use": "このメールアドレスはすでに使用されています",
      "auth/invalid-email": "メールアドレスの形式が正しくありません",
      "auth/requires-recent-login": "セキュリティのため再ログインが必要です",
    };
    setMsg(msgEl, MSG[e.code] || "設定に失敗しました", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "メールアドレスを設定する";
  }
});

// ========================================
// パスワード変更・設定
// ========================================
async function executePasswordChange(
  user, currentPassword, newPassword, confirmPassword, msgEl, submitBtn,
) {
  setMsg(msgEl, "", "");

  if (!newPassword)
    return setMsg(msgEl, "新しいパスワードを入力してください", "error");
  if (newPassword.length < 6)
    return setMsg(msgEl, "パスワードは6文字以上にしてください", "error");
  if (newPassword !== confirmPassword)
    return setMsg(msgEl, "パスワードが一致しません", "error");

  submitBtn.disabled = true;
  submitBtn.textContent = "処理中...";

  const hasPassword = user.providerData.some(
    (p) => p.providerId === "password",
  );

  try {
    if (hasPassword) {
      if (!currentPassword)
        return setMsg(msgEl, "現在のパスワードを入力してください", "error");
      const cred = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPassword);
      setMsg(msgEl, "✅ パスワードを変更しました", "success");
    } else {
      const cred = EmailAuthProvider.credential(user.email, newPassword);
      await linkWithCredential(user, cred);
      setMsg(msgEl, "✅ パスワードを設定しました", "success");
    }

    document.getElementById("current-password").value = "";
    document.getElementById("new-password").value = "";
    document.getElementById("confirm-password").value = "";
    renderAll(auth.currentUser);

    // ★ 通知
    await sendActionNotification(user, "passwordChange");
    showLogoutOthersDialog(user.uid);
  } catch (e) {
    const MSG = {
      "auth/wrong-password": "現在のパスワードが間違っています",
      "auth/weak-password": "パスワードは6文字以上にしてください",
      "auth/requires-recent-login": "セキュリティのため再ログインが必要です",
    };
    setMsg(msgEl, MSG[e.code] || "エラーが発生しました", "error");
  } finally {
    const hasPass = auth.currentUser?.providerData.some(
      (p) => p.providerId === "password",
    );
    submitBtn.textContent = hasPass
      ? "パスワードを変更する"
      : "パスワードを設定する";
    submitBtn.disabled = false;
  }
}

document
  .getElementById("password-submit-btn")
  .addEventListener("click", async () => {
    const user = auth.currentUser;
    const currentPassword = document.getElementById("current-password").value;
    const newPassword = document.getElementById("new-password").value;
    const confirmPassword = document.getElementById("confirm-password").value;
    const msgEl = document.getElementById("password-msg");
    const submitBtn = document.getElementById("password-submit-btn");

    const twoFactorOn = await getTwoFactorEnabled(user.uid);
    if (twoFactorOn) {
      if (!user.email) {
        return setMsg(
          msgEl,
          "メールアドレスが設定されていないため二段階認証を実行できません",
          "error",
        );
      }
      submitBtn.disabled = true;
      submitBtn.textContent = "認証コード送信中...";

      const code = generateOTP();
      await saveOTP(user.uid, code, "password_change");
      await sendOTPEmail(user, code, "パスワード変更");
      setMsg(msgEl, `📧 ${user.email} に認証コードを送信しました`, "success");

      showOtpModal("password_change", async () => {
        await executePasswordChange(
          user, currentPassword, newPassword, confirmPassword, msgEl, submitBtn,
        );
      });
      return;
    }

    await executePasswordChange(
      user, currentPassword, newPassword, confirmPassword, msgEl, submitBtn,
    );
  });

// ========================================
// ★ 修正: アカウント削除（30日猶予 + チェックリスト）
// ========================================

// 削除ペンディングバナーの表示
function showDeletionPendingBanner(uid, scheduledDate) {
  const banner = document.getElementById("deletion-pending-banner");
  const dateEl = document.getElementById("deletion-scheduled-date");
  const cancelBtn = document.getElementById("cancel-deletion-btn");
  if (!banner) return;

  banner.style.display = "block";
  if (dateEl) {
    dateEl.textContent = scheduledDate.toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
    });
  }

  cancelBtn?.addEventListener("click", async () => {
    if (!confirm("アカウント削除をキャンセルしますか？")) return;
    await setDoc(
      doc(db, "users", uid),
      {
        deletionPending: false,
        scheduledDeletion: null,
      },
      { merge: true },
    );
    banner.style.display = "none";
    alert("✅ アカウント削除をキャンセルしました。");
  });
}

// 削除ボタン → 確認モーダルを開く
document.getElementById("delete-account-btn").addEventListener("click", () => {
  document.getElementById("delete-msg").textContent = "";

  // チェックボックスをリセット
  document.querySelectorAll(".deletion-checkbox").forEach((cb) => {
    cb.checked = false;
  });
  document.getElementById("delete-execute-btn").disabled = true;
  document.getElementById("delete-confirm-overlay").style.display = "flex";
});

// チェックボックスで削除ボタンを活性化
document.querySelectorAll(".deletion-checkbox").forEach((cb) => {
  cb.addEventListener("change", () => {
    const allChecked = [
      ...document.querySelectorAll(".deletion-checkbox"),
    ].every((c) => c.checked);
    document.getElementById("delete-execute-btn").disabled = !allChecked;
  });
});

document.getElementById("delete-cancel-btn").addEventListener("click", () => {
  document.getElementById("delete-confirm-overlay").style.display = "none";
});
document
  .getElementById("delete-confirm-overlay")
  .addEventListener("click", (e) => {
    if (e.target === document.getElementById("delete-confirm-overlay")) {
      document.getElementById("delete-confirm-overlay").style.display = "none";
    }
  });

// ★ 修正: 即時削除 → 30日後削除スケジュール
async function executeScheduleDeletion() {
  const msgEl = document.getElementById("delete-msg");
  const execBtn = document.getElementById("delete-execute-btn");

  execBtn.disabled = true;
  execBtn.textContent = "処理中...";

  try {
    const user = auth.currentUser;
    const scheduledAt = Timestamp.fromMillis(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    ); // 30日後

    // Firestoreにスケジュールを記録
    await setDoc(
      doc(db, "users", user.uid),
      {
        deletionPending: true,
        scheduledDeletion: scheduledAt,
        deletionRequestAt: Timestamp.now(),
      },
      { merge: true },
    );

    // 通知
    await sendActionNotification(user, "deletionRequest");

    document.getElementById("delete-confirm-overlay").style.display = "none";
    showDeletionPendingBanner(user.uid, scheduledAt.toDate());
    alert(
      `アカウント削除を申請しました。\n${scheduledAt.toDate().toLocaleDateString("ja-JP")} に削除されます。\nキャンセルはアカウント設定ページから可能です。`,
    );
  } catch (e) {
    console.error("❌ 削除スケジュール失敗:", e);
    msgEl.textContent = "処理に失敗しました。再試行してください。";
    execBtn.disabled = false;
    execBtn.textContent = "削除を申請する";
  }
}

document
  .getElementById("delete-execute-btn")
  .addEventListener("click", async () => {
    const msgEl = document.getElementById("delete-msg");
    const execBtn = document.getElementById("delete-execute-btn");
    const user = auth.currentUser;

    execBtn.disabled = true;
    execBtn.textContent = "確認中...";
    msgEl.textContent = "";

    try {
      const twoFactorOn = await getTwoFactorEnabled(user.uid);

      if (twoFactorOn) {
        if (!user.email) {
          setMsg(
            msgEl,
            "メールアドレスが設定されていないため二段階認証を実行できません",
            "error",
          );
          execBtn.disabled = false;
          execBtn.textContent = "削除を申請する";
          return;
        }
        execBtn.textContent = "認証コード送信中...";
        const code = generateOTP();
        await saveOTP(user.uid, code, "account_delete");
        await sendOTPEmail(user, code, "アカウント削除申請");
        setMsg(msgEl, `📧 ${user.email} に認証コードを送信しました`, "success");
        execBtn.disabled = false;
        execBtn.textContent = "削除を申請する";

        showOtpModal("account_delete", async () => {
          await executeScheduleDeletion();
        });
        return;
      }

      await executeScheduleDeletion();
    } catch (e) {
      console.error("❌ 削除前処理失敗:", e);
      setMsg(msgEl, "エラーが発生しました。再試行してください", "error");
      execBtn.disabled = false;
      execBtn.textContent = "削除を申請する";
    }
  });

// ========================================
// ★ FIX 2: 最近のアクション（セッション管理）
// ========================================
const SESSION_ID_KEY = "legallife_session_id";

async function renderRecentActivity(user) {
  const listEl = document.getElementById("sessions-list");
  const logoutAllBtn = document.getElementById("logout-all-others-btn");
  if (!listEl) return;

  listEl.innerHTML = '<p class="session-loading">読み込み中...</p>';

  try {
    const sessionsRef = collection(db, "users", user.uid, "sessions");
    const q = query(sessionsRef, orderBy("lastActive", "desc"), limit(10));
    const snap = await getDocs(q);

    if (snap.empty) {
      listEl.innerHTML =
        '<p class="session-empty">セッション情報がありません</p>';
      if (logoutAllBtn) logoutAllBtn.style.display = "none";
      return;
    }

    const currentSessionId = localStorage.getItem(SESSION_ID_KEY);
    let hasOtherSessions = false;

    listEl.innerHTML = snap.docs
      .map((d) => {
        const data = d.data();
        const isCurrent = data.sessionId === currentSessionId;
        if (!isCurrent) hasOtherSessions = true;
        return _buildSessionItemHtml(data, isCurrent, user.uid);
      })
      .join("");

    if (logoutAllBtn) {
      logoutAllBtn.style.display = hasOtherSessions ? "block" : "none";
    }
  } catch (e) {
    console.error("セッション取得失敗:", e);
    listEl.innerHTML =
      '<p class="session-empty" style="color:#e74c3c;">読み込みに失敗しました</p>';
  }
}

// ★ FIX 2: data-session-id 属性を追加（楽観的更新用）
function _buildSessionItemHtml(data, isCurrent, uid) {
  const icon = (data.device || "").includes("スマートフォン") ? "📱" : "💻";
  const loginAt = data.loginAt?.toDate?.() || data.lastActive?.toDate?.();
  const dateStr = loginAt ? _formatRelativeDate(loginAt) : "不明";

  const currentBadge = isCurrent
    ? '<span class="session-badge-current">現在の端末</span>'
    : "";

  /* ★ FIX: data-session-id 属性を付与 */
  const logoutBtn = !isCurrent
    ? `<button class="session-logout-btn"
                   onclick="window.logoutSession('${_esc(uid)}','${_esc(data.sessionId)}')">
               ログアウト
           </button>`
    : "";

  return `
<div class="session-item${isCurrent ? " session-item--current" : ""}"
     data-session-id="${_esc(data.sessionId)}">
    <div class="session-device-icon">${icon}</div>
    <div class="session-info">
        <div class="session-browser">
            ${_esc(data.browser || "不明")} / ${_esc(data.os || "不明")}
            ${currentBadge}
        </div>
        <div class="session-meta">
            <span>📍 ${_esc(data.location || "不明")}</span>
            <span class="session-meta-sep">·</span>
            <span>🕒 ${dateStr}</span>
        </div>
        <div class="session-device-label">${_esc(data.device || "不明")}</div>
    </div>
    ${logoutBtn}
</div>`;
}

// ★ FIX 2: 確認ダイアログ + 楽観的UI更新
async function logoutSession(uid, sessionId) {
  /* ★ FIX: 確認ダイアログ */
  if (!confirm("この端末からログアウトしますか？")) return;

  try {
    await setDoc(
      doc(db, "users", uid, "sessions", sessionId),
      { shouldLogout: true },
      { merge: true },
    );

    /* ★ FIX: Firestoreの伝播を待たず即時UIから削除 */
    const el = document.querySelector(`[data-session-id="${_esc(sessionId)}"]`);
    if (el) el.remove();

    // 他端末がなくなったらボタンを非表示
    const remaining = document.querySelectorAll(
      ".session-item:not(.session-item--current)",
    );
    if (remaining.length === 0) {
      const btn = document.getElementById("logout-all-others-btn");
      if (btn) btn.style.display = "none";
    }
  } catch (e) {
    console.error("セッションログアウト失敗:", e);
    alert("処理に失敗しました。再試行してください。");
  }
}

// ★ FIX 2: 確認ダイアログ + 楽観的UI更新
async function logoutAllOtherSessions(uid) {
  const currentSessionId = localStorage.getItem(SESSION_ID_KEY);
  const otherItems = document.querySelectorAll(
    ".session-item:not(.session-item--current)",
  );

  if (otherItems.length === 0) {
    alert("現在、他のアクティブな端末はありません。");
    return;
  }

  /* ★ FIX: 確認ダイアログ */
  if (
    !confirm(
      `${otherItems.length}台の他の端末からログアウトします。\nよろしいですか？`,
    )
  )
    return;

  const btn = document.getElementById("logout-all-others-btn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "処理中...";
  }

  try {
    const snap = await getDocs(collection(db, "users", uid, "sessions"));
    const targets = snap.docs.filter(
      (d) => d.data().sessionId !== currentSessionId,
    );

    await Promise.allSettled(
      targets.map((d) =>
        setDoc(d.ref, { shouldLogout: true }, { merge: true }),
      ),
    );

    /* ★ FIX: 楽観的更新 - 即時UI削除 */
    otherItems.forEach((el) => el.remove());
    if (btn) btn.style.display = "none";
  } catch (e) {
    console.error("全セッションログアウト失敗:", e);
    if (btn) {
      btn.disabled = false;
      btn.textContent = "他のすべての端末をログアウト";
    }
    alert("処理に失敗しました。再試行してください。");
  }
}

// パスワード変更後の他端末ログアウト提案
function showLogoutOthersDialog(uid) {
  const sessionsRef = collection(db, "users", uid, "sessions");
  getDocs(sessionsRef)
    .then((snap) => {
      const currentSessionId = localStorage.getItem(SESSION_ID_KEY);
      const hasOthers = snap.docs.some(
        (d) => d.data().sessionId !== currentSessionId,
      );
      if (!hasOthers) return;

      const overlay = Object.assign(document.createElement("div"), {
        className: "modal-overlay",
        innerHTML: `
<div class="modal-box" role="dialog" aria-modal="true">
    <div class="modal-icon">🔑</div>
    <p class="modal-message">
        パスワードを変更しました。<br>
        <span style="font-size:0.9rem;color:#666;">他の端末もログアウトしますか？</span>
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

      document.getElementById("_logoutOthersYes").onclick = () => close(true);
      document.getElementById("_logoutOthersNo").onclick = () => close(false);
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close(false);
      });
    })
    .catch(() => {});
}

// ========================================
// ユーティリティ
// ========================================
function _esc(str) {
  return String(str).replace(
    /[<>&"']/g,
    (c) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

function _formatRelativeDate(date) {
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "たった今";
  if (minutes < 60) return `${minutes}分前`;
  if (hours < 24) return `${hours}時間前`;
  if (days < 7) return `${days}日前`;
  return date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function setMsg(el, text, type) {
  el.textContent = text;
  el.className = `settings-msg ${type}`;
}

window.logoutSession = logoutSession;
window.logoutAllOtherSessions = logoutAllOtherSessions;