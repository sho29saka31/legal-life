export type SessionUser = { id: string; email: string; name: string };

const authBase = () => process.env.AUTH_BASE_URL ?? "https://auth.saka2931.jp";

export type SessionState = { user: SessionUser | null; linked: boolean };

/**
 * ログイン中の利用者と、「legal-life との連携を本人が許可しているか」を、auth に問い合わせて確認する。Cookie をそのまま転送するだけで、
 * この側にはセッションの秘密鍵を持たせない。失敗(auth の障害など)は、user: null として扱う(= 未ログイン扱い。書き込みは行われない)。
 */
export async function getSessionState(request: Request): Promise<SessionState> {
  const cookie = request.headers.get("cookie");
  if (!cookie) return { user: null, linked: false };
  try {
    const res = await fetch(`${authBase()}/api/service-session?service=legal_life`, { headers: { cookie }, cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { user: null, linked: false };
    const body = (await res.json()) as { user: SessionUser | null; linked: boolean };
    return body.user ? { user: { id: body.user.id, email: body.user.email, name: body.user.name }, linked: body.linked === true } : { user: null, linked: false };
  } catch {
    return { user: null, linked: false };
  }
}

/** 連携を許可している利用者だけを返す(許可していない人は、ログイン済みでも null) */
export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  const s = await getSessionState(request);
  return s.linked ? s.user : null;
}

/** 変更系の要求は、同じオリジンからのものだけ受け付ける(Cookie が .saka2931.jp 全体に届くため) */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
