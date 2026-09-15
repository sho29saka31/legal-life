// ブラウザ/OS/位置情報の判定ロジック。以前は lib/auth/utils.ts・lib/deviceInfo.ts・
// components/AccessLogger.tsx の3箇所にほぼ同一の実装が重複しており、ラベル表記が
// 微妙に食い違っていた(例: "Chrome" vs "Google Chrome")。ここに一本化する。

export type UAInfo = { browser: string; os: string; device: string };

export function parseUA(): UAInfo {
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

  const device = /Mobi|Android|iPhone|iPad/i.test(ua) ? "スマートフォン/タブレット" : "PC";
  return { browser, os, device };
}

export type LocationInfo = { country: string; region: string; city: string; ip: string };

const UNKNOWN_LOCATION: LocationInfo = { country: "不明", region: "不明", city: "不明", ip: "不明" };

// 以前はipapi.co（失敗時はCloudflareのtraceエンドポイント）へブラウザから直接
// IPアドレスを送信し、ログイン地域・アクセス地域を取得していたが、この外部送信は
// プライバシーポリシーへの開示漏れが監査で発覚し、利用を停止することになった。
// 呼び出し元（AccessLogger.tsx・lib/auth/session.ts）の変更を避けるため、
// 関数自体は残しつつ、常に「不明」を返すだけにする。
export async function fetchLocation(): Promise<LocationInfo> {
  return UNKNOWN_LOCATION;
}
