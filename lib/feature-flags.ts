import { createInfraReadOnlyClient } from "@/lib/supabase/infra";

/**
 * 機能フラグ。saka2931-infra（adacの管理画面が書き込む）の feature_flags
 * テーブルと対応する。フラグの作成・切替はadacの管理画面から行う。
 */
export const FEATURE_FLAG_KEYS = [
  "emergency_maintenance",
  "account_features",
  "mail_sending",
  "ai_chat",
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];

/**
 * 指定したキーの機能フラグをまとめて取得する。
 * 取得に失敗した場合（infra未接続のビルド環境・一時的な障害等）は「有効」を
 * 既定値とする（フラグは一時停止手段のため、取得できないことで機能が誤って
 * 止まらないようフェイルオープンにする）。
 */
export async function getFeatureFlags<K extends string>(
  keys: readonly K[]
): Promise<Record<K, boolean>> {
  const result = Object.fromEntries(keys.map((k) => [k, true])) as Record<
    K,
    boolean
  >;

  try {
    const infra = createInfraReadOnlyClient();
    const { data } = await infra
      .from("feature_flags")
      .select("key, enabled")
      .eq("service", "legal_life")
      .in("key", [...keys]);

    for (const row of data ?? []) {
      if ((keys as readonly string[]).includes(row.key)) {
        result[row.key as K] = row.enabled;
      }
    }
  } catch {
    // フェイルオープン(上のデフォルト値のまま返す)
  }

  return result;
}

/** 単一の機能フラグを取得する */
export async function getFeatureFlag(key: FeatureFlagKey): Promise<boolean> {
  const flags = await getFeatureFlags([key]);
  return flags[key];
}

/**
 * 緊急メンテナンスモードが有効かどうか。
 * 未取得時は「無効」を既定値とする（他フラグと異なり、この値だけは
 * フェイルオープンにすると誤って全サイトを止めてしまうため）。
 * middleware(Edge Runtime)から全リクエストで呼ばれるため、取得失敗時に
 * 例外を投げずサイト全体を止めないようにする。
 */
export async function isEmergencyMaintenanceActive(): Promise<boolean> {
  try {
    const infra = createInfraReadOnlyClient();
    const { data } = await infra
      .from("feature_flags")
      .select("enabled")
      .eq("service", "legal_life")
      .eq("key", "emergency_maintenance")
      .maybeSingle();
    return data?.enabled ?? false;
  } catch {
    return false;
  }
}
