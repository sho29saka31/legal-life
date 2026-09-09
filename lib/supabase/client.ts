import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

// Falls back to a syntactically valid placeholder so a missing env var
// (e.g. during a build without secrets configured) can't crash every
// page's prerender — createClient() throws immediately on an empty URL.
// Requests just fail at call time instead, same as the old Firebase
// client's lazy-init behavior when its config was unset.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

// セッションをlocalStorageではなくCookie（domain=.saka2931.jp）で保持することで、
// sporive.saka2931.jpとのログイン状態共有（SSO）を可能にする。
export const supabase = createBrowserClient<Database>(url, anonKey, {
  db: { schema: "legal_life" },
  cookieOptions: {
    domain: ".saka2931.jp",
    path: "/",
    sameSite: "lax",
    secure: true,
  },
  auth: {
    // パスキー(WebAuthn)関連API(signInWithPasskey/registerPasskey/passkey.*)を有効化する。
    // @supabase/supabase-js v2.105.0以降で提供されるExperimental機能。
    experimental: { passkey: true },
  },
});
