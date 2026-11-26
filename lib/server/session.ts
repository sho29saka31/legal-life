export type SessionUser = { id: string; email: string; name: string };

const authBase = () => process.env.AUTH_BASE_URL ?? "https://auth.saka2931.jp";

/**
 * ログイン中の利用者を、auth アプリ(Better Auth)に問い合わせて確認する。Cookie をそのまま転送するだけで、
 * この側にはセッションの秘密鍵を持たせない。未ログインは null。
 * 失敗(auth の障害など)も null として扱う(= 未ログイン扱い。書き込みは行われない)。
 */
export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  try {
    const res = await fetch(`${authBase()}/api/auth/get-session`, { headers: { cookie }, cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { user?: { id: string; email: string; name: string } } | null;
    return body?.user ? { id: body.user.id, email: body.user.email, name: body.user.name } : null;
  } catch {
    return null;
  }
}

/** 変更系の要求は、同じオリジンからのものだけ受け付ける(Cookie が .saka2931.jp 全体に届くため) */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
