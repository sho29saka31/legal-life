import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Route Handler等のサーバー側で、Authorizationヘッダーで渡されたJWTを
// supabase.auth.getUser(token)で検証するためだけに使う軽量クライアント。
// lib/supabase/client.tsのcreateBrowserClientはブラウザ専用のCookieストレージを
// 前提としており、Node.jsランタイム上でセッションを書き込もうとするとエラーに
// なりうるため、サーバー側のトークン検証用にはこちらを使う（Cookie/セッション
// ストレージには一切依存しない）。
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

export const supabaseServer = createClient<Database>(url, anonKey, {
  db: { schema: "legal_life" },
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});
