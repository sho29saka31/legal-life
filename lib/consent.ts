// Google Analytics 4を直接埋め込む方式から、Google Tag Manager(GTM)経由の方式に移行。
// GTMコンテナ自体は同意状況に関わらずロード可能だが、ここでは既存の設計を踏襲し、
// ユーザーが同意するまでGTM自体を読み込まない(より厳格な)方式を維持する。
// Search Console所有権確認は別途metaタグ方式で行っているため(app/layout.tsx参照)、
// GTMを同意後まで遅延させても確認には影響しない。
const GTM_CONTAINER_ID = process.env.NEXT_PUBLIC_GTM_CONTAINER_ID;
// GTM内で設定するGA4設定タグのMeasurement ID。Cookie削除(拒否時)のみに使用する。
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "";

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
    [key: `ga-disable-${string}`]: boolean;
  }
}

export function initConsentDefaults() {
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer.push(args);
  };
  window.gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
    functionality_storage: "denied",
    personalization_storage: "denied",
    security_storage: "granted",
    wait_for_update: 500,
  });
}

function setCookie(name: string, value: string, days: number) {
  const date = new Date();
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${value};expires=${date.toUTCString()};path=/;SameSite=Lax`;
}

export function getCookie(name: string) {
  const nameEQ = name + "=";
  for (const c of document.cookie.split(";")) {
    const trimmed = c.trimStart();
    if (trimmed.startsWith(nameEQ)) return trimmed.slice(nameEQ.length);
  }
  return null;
}

function deleteGACookies() {
  if (!GA_MEASUREMENT_ID) return;
  const names = ["_ga", "_gid", "_gat", `_ga_${GA_MEASUREMENT_ID.replace("G-", "")}`];
  names.forEach((name) => {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;domain=${location.hostname}`;
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;domain=.${location.hostname}`;
  });
}

let gtmLoaded = false;
function loadGTM() {
  if (gtmLoaded || !GTM_CONTAINER_ID) return;
  gtmLoaded = true;
  // Googleの標準GTMスニペット(gtm.js)を動的に挿入する。
  window.dataLayer.push({ "gtm.start": new Date().getTime(), event: "gtm.js" });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_CONTAINER_ID}`;
  document.head.appendChild(script);
}

export function grantConsent() {
  if (typeof window.gtag !== "function") initConsentDefaults();
  window.gtag("consent", "update", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "granted",
    functionality_storage: "granted",
    personalization_storage: "granted",
  });
  loadGTM();
}

export function denyConsent() {
  if (typeof window.gtag !== "function") initConsentDefaults();
  window.gtag("consent", "update", {
    analytics_storage: "denied",
    functionality_storage: "denied",
    personalization_storage: "denied",
  });
  deleteGACookies();
  if (GA_MEASUREMENT_ID) window[`ga-disable-${GA_MEASUREMENT_ID}`] = true;
}

export function acceptCookies() {
  setCookie("cookie_consent", "accepted", 365);
  grantConsent();
}

export function rejectCookies() {
  setCookie("cookie_consent", "rejected", 365);
  denyConsent();
}
