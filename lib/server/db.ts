import postgres from "postgres";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Neon(Postgres)への接続。Cloudflare Hyperdrive 経由。各クエリは「set local role …」を付けた
 * トランザクションの中でだけ実行し、DB 側の RLS と最小権限がそのまま効くようにする。
 *  - authenticated: ログイン中の本人として(request.jwt.claims の sub = 利用者 ID)
 *  - anon         : 未ログイン(アクセスログの書き込みなど、RLS が許す範囲だけ)
 * HYPERDRIVE は利用者ごとのデータを扱うため、キャッシュを無効にした設定を使う(古い情報を返さないため)。
 * INFRA は infra(お知らせ・機能フラグ)の読み取り専用(anon)。
 */
type Role = "authenticated" | "anon";

function binding(name: "HYPERDRIVE" | "INFRA", localEnv: string): string {
  try {
    const hd = (getCloudflareContext().env as Record<string, { connectionString: string } | undefined>)[name];
    if (hd?.connectionString) return hd.connectionString;
  } catch {
    // next dev など Cloudflare のコンテキストが無い場合は下のローカル用へ
  }
  const local = process.env[localEnv];
  if (local) return local;
  throw new Error(`DB接続が設定されていません(${name} バインディング)。`);
}

async function run<T>(cs: string, role: Role | "infra_anon", userId: string | null, readOnly: boolean, fn: (sql: postgres.TransactionSql) => Promise<T>): Promise<T> {
  const sql = postgres(cs, { max: 1, fetch_types: false, idle_timeout: 5, connect_timeout: 10 });
  try {
    const exec = async (tx: postgres.TransactionSql) => {
      const claims = userId ? JSON.stringify({ sub: userId, role }) : "";
      await tx`select set_config('request.jwt.claims', ${claims}, true)`;
      await tx.unsafe(`set local role ${role === "infra_anon" ? "anon" : role}`);
      return fn(tx);
    };
    return (readOnly ? await sql.begin("read only", exec) : await sql.begin(exec)) as T;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export const asUser = <T>(userId: string, fn: (sql: postgres.TransactionSql) => Promise<T>) =>
  run(binding("HYPERDRIVE", "LOCAL_DATABASE_URL"), "authenticated", userId, false, fn);
export const asAnon = <T>(fn: (sql: postgres.TransactionSql) => Promise<T>) =>
  run(binding("HYPERDRIVE", "LOCAL_DATABASE_URL"), "anon", null, false, fn);
export const asInfraAnon = <T>(fn: (sql: postgres.TransactionSql) => Promise<T>) =>
  run(binding("INFRA", "LOCAL_INFRA_DATABASE_URL"), "infra_anon", null, true, fn);
