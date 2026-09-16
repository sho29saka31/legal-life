import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";

// ログイン・サインアップ・パスワードリセット・MFA等はすべて auth.saka2931.jp
// に一元化されているため、未ログインを検知したらそちらへ return_to 付きで
// リダイレクトする。
const AUTH_APP_URL = "https://auth.saka2931.jp";

export function requireAuth(): Promise<User> {
  return new Promise((resolve) => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      subscription.unsubscribe();
      const user = session?.user;
      if (!user) {
        const returnTo = `${location.origin}${location.pathname}${location.search}`;
        window.location.replace(`${AUTH_APP_URL}/login?return_to=${encodeURIComponent(returnTo)}`);
      } else {
        resolve(user);
      }
    });
  });
}
