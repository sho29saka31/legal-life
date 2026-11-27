export type AuthUser = { id: string; email: string; name: string };

// ログイン・サインアップ・パスワードリセット・MFA等はすべて auth.saka2931.jp
// に一元化されているため、未ログインを検知したらそちらへ return_to 付きで
// リダイレクトする。
const AUTH_APP_URL = "https://auth.saka2931.jp";

/** ログイン中の利用者を返す。未ログインなら auth のログイン画面へ移動し、解決しない */
export async function requireAuth(): Promise<AuthUser> {
  const res = await fetch("/api/me", { credentials: "include", cache: "no-store" }).catch(() => null);
  if (res?.ok) return ((await res.json()) as { user: AuthUser }).user;
  const returnTo = `${location.origin}${location.pathname}${location.search}`;
  window.location.replace(`${AUTH_APP_URL}/login?return_to=${encodeURIComponent(returnTo)}`);
  return new Promise<AuthUser>(() => {});
}
