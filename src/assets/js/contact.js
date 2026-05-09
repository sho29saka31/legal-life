// contact.js — カスタムお問い合わせフォーム（EmailJS送信 + 端末情報収集）

(function () {
  "use strict";

  const SERVICE_ID = "service_glirsis";
  const TEMPLATE_ID = "template_85b3ffx";
  const PUBLIC_KEY = "eG7KMS7F3Fh0PziYy";

  const SECTION_MAP = {
    コメント: "section-comment",
    質問: "section-question",
    バグや不具合の報告: "section-bug",
    機能のリクエスト: "section-feature",
    その他のお問い合わせ: "section-other",
  };

  // UA パーサー（access-log.js と同じロジック）
  function parseUA() {
    const ua = navigator.userAgent;
    let browser = "その他";
    if (ua.includes("Edg/")) browser = "Microsoft Edge";
    else if (ua.includes("OPR/") || ua.includes("Opera")) browser = "Opera";
    else if (ua.includes("Chrome/")) browser = "Google Chrome";
    else if (ua.includes("Firefox/")) browser = "Mozilla Firefox";
    else if (ua.includes("Safari/")) browser = "Safari";

    let os = "その他";
    if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
    else if (ua.includes("Android")) os = "Android";
    else if (ua.includes("Windows")) os = "Windows";
    else if (ua.includes("Mac OS X")) os = "macOS";
    else if (ua.includes("Linux")) os = "Linux";

    const device = /Mobi|Android|iPhone|iPad/i.test(ua)
      ? "スマートフォン/タブレット"
      : "PC";
    return { browser, os, device };
  }

  // IPジオロケーション（access-log.js と同じロジック）
  async function fetchLocation() {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch("https://ipapi.co/json", {
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const d = await res.json();
        if (d?.country_name) {
          return {
            country: d.country_name || "不明",
            region: d.region || "不明",
            city: d.city || "不明",
            ip: d.ip || "不明",
          };
        }
      }
    } catch (_) {}

    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2000);
      const res = await fetch("https://cloudflare.com/cdn-cgi/trace", {
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const text = await res.text();
        const loc = text.match(/loc=([A-Z]{2})/)?.[1];
        const ip = text.match(/ip=([^\n]+)/)?.[1];
        if (loc)
          return {
            country: loc,
            region: "不明",
            city: "不明",
            ip: ip || "不明",
          };
      }
    } catch (_) {}

    return { country: "不明", region: "不明", city: "不明", ip: "不明" };
  }

  // 端末情報収集（collect-data.js + access-log.js の統合）
  async function collectDeviceInfo() {
    const ua = parseUA();
    const loc = await fetchLocation();

    const conn = navigator.connection;
    const networkType = conn
      ? `${conn.effectiveType ?? "不明"}${conn.downlink ? ` (${conn.downlink}Mbps)` : ""}`
      : "取得不可";

    let storageUsage = "取得不可";
    try {
      storageUsage = `${(encodeURI(JSON.stringify(localStorage)).length / 1024).toFixed(2)} KB`;
    } catch (_) {}

    let memoryUsage = "取得不可 (Chrome以外)";
    if (performance.memory) {
      memoryUsage = `${Math.round(performance.memory.usedJSHeapSize / 1024 / 1024)} MB`;
    }

    return {
      device_browser: ua.browser,
      device_os: ua.os,
      device_type: ua.device,
      device_ua: navigator.userAgent,
      device_screen: `${window.screen.width}x${window.screen.height}`,
      device_viewport: `${window.innerWidth}x${window.innerHeight}`,
      device_theme: window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "ダークモード"
        : "ライトモード",
      device_language: navigator.language,
      device_timezone:
        Intl.DateTimeFormat().resolvedOptions().timeZone || "不明",
      device_network: networkType,
      device_country: loc.country,
      device_region: loc.region,
      device_city: loc.city,
      device_ip: loc.ip,
      device_storage: storageUsage,
      device_memory: memoryUsage,
      page_url: location.href,
      page_referrer: document.referrer || "直接アクセス / ブックマーク",
      sent_at: new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }),
    };
  }

  function init() {
    if (typeof emailjs === "undefined") {
      console.error("❌ EmailJSが読み込まれていません");
      return;
    }
    emailjs.init(PUBLIC_KEY);
    document
      .querySelectorAll('input[name="inquiry_type"]')
      .forEach((r) => r.addEventListener("change", handleTypeChange));
    document
      .getElementById("contact-submit")
      ?.addEventListener("click", handleSubmit);
  }

  function handleTypeChange(e) {
    document.querySelectorAll(".conditional-section").forEach((s) => {
      s.classList.add("hidden");
      s.classList.remove("visible");
    });
    const target = document.getElementById(SECTION_MAP[e.target.value]);
    if (!target) return;
    target.classList.remove("hidden");
    requestAnimationFrame(() => {
      target.classList.add("visible");
      setTimeout(
        () => target.scrollIntoView({ behavior: "smooth", block: "start" }),
        80,
      );
    });
  }

  function validateForm() {
    let isValid = true;
    document
      .querySelectorAll(".field-error")
      .forEach((el) => (el.textContent = ""));
    document
      .querySelectorAll(".form-field.has-error")
      .forEach((el) => el.classList.remove("has-error"));

    if (!getVal("field-name")) {
      setError("field-name", "お名前を入力してください");
      isValid = false;
    }
    if (!document.querySelector('input[name="gender"]:checked')) {
      setError("gender-group", "性別を選択してください");
      isValid = false;
    }
    if (!getVal("field-age")) {
      setError("field-age", "年代を選択してください");
      isValid = false;
    }

    const email = getVal("field-email");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("field-email", "正しいメールアドレスの形式で入力してください");
      isValid = false;
    }
    if (!document.querySelector('input[name="inquiry_type"]:checked')) {
      setError("inquiry-type-group", "お問い合わせの種類を選択してください");
      isValid = false;
    }

    const visibleSection = document.querySelector(
      ".conditional-section.visible",
    );
    if (visibleSection) {
      visibleSection.querySelectorAll("select[required]").forEach((sel) => {
        if (!sel.value) {
          setError(sel.id, "分野を選択してください");
          isValid = false;
        }
      });
      visibleSection.querySelectorAll("textarea[required]").forEach((ta) => {
        if (!ta.value.trim()) {
          setError(ta.id, "お問い合わせ内容を入力してください");
          isValid = false;
        }
      });
    }
    return isValid;
  }

  function getVal(id) {
    return document.getElementById(id)?.value.trim() || "";
  }

  function setError(id, message) {
    document
      .getElementById(id)
      ?.closest(".form-field")
      ?.classList.add("has-error");
    const el = document.getElementById(id + "-error");
    if (el) el.textContent = message;
  }

  async function handleSubmit() {
    if (!validateForm()) {
      document
        .querySelector(".form-field.has-error")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const submitBtn = document.getElementById("contact-submit");
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="btn-spinner"></span>送信中...';
    document.getElementById("submit-error")?.setAttribute("hidden", "");

    const inquiryType =
      document.querySelector('input[name="inquiry_type"]:checked')?.value || "";
    const visibleSection = document.querySelector(
      ".conditional-section.visible",
    );
    const category = visibleSection?.querySelector("select")?.value || "";
    const content =
      visibleSection?.querySelector("textarea")?.value.trim() || "";

    const deviceInfo = await collectDeviceInfo();

    const params = {
      from_name: getVal("field-name"),
      gender:
        document.querySelector('input[name="gender"]:checked')?.value || "",
      age_group: getVal("field-age"),
      reply_email: getVal("field-email") || "（未入力）",
      inquiry_type: inquiryType,
      category: category || "（なし）",
      content: content,
      ...deviceInfo,
    };

    console.groupCollapsed("📤 [Contact] 送信データ");
    console.table(params);
    console.groupEnd();

    try {
      await emailjs.send(SERVICE_ID, TEMPLATE_ID, params);
      showSuccess();
    } catch (err) {
      console.error("❌ 送信失敗:", err);
      const errBanner = document.getElementById("submit-error");
      if (errBanner) {
        errBanner.removeAttribute("hidden");
        errBanner.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      submitBtn.disabled = false;
      submitBtn.innerHTML = "送信する";
    }
  }

  function showSuccess() {
    document.getElementById("contact-form-wrapper").style.display = "none";
    const success = document.getElementById("contact-success");
    success.removeAttribute("hidden");
    success.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
