import { createInfraReadOnlyClient } from "@/lib/supabase/infra";

export type Announcement = {
  slug: string;
  title: string;
  /** 公開・更新日の表示用テキスト（例: "公開日: 2026/1/1"）。管理画面で未入力の場合は日付から自動生成する */
  dateLabel: string;
  /** 一覧・トップページでの新着順ソート用 */
  publishedAt: string;
  /** リッチHTML本文（管理画面で入力された内容をそのまま描画する） */
  bodyHtml: string;
  level: "info" | "notice" | "warning";
};

/** 一覧の「公開・更新日」列に表示するシンプルな日付表記（例: "2026/1/1"） */
export function formatSimpleDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function formatDateLabel(publishedAt: string): string {
  return `公開日: ${formatSimpleDate(publishedAt)}`;
}

/**
 * saka2931-infra（adacの管理画面が書き込む）から、legal-life向け（'legal_life'
 * または'general'）の有効なお知らせを新しい順に取得する。RLSにより公開済み
 * （is_active=true かつ scheduled_atが未来でない）行のみが返る。
 * slugが未設定（Sporive向けに作成され、こちらでは表示不要な想定外のもの）は除外する。
 */
export async function getAnnouncements(): Promise<Announcement[]> {
  const infra = createInfraReadOnlyClient();
  const { data, error } = await infra
    .from("service_announcements")
    .select("slug, title, body, level, date_label, published_at")
    .in("service", ["legal_life", "general"])
    .not("slug", "is", null)
    .order("published_at", { ascending: false });

  if (error) {
    throw new Error(`お知らせの取得に失敗しました: ${error.message}`);
  }

  return (data ?? []).map((a) => ({
    slug: a.slug as string,
    title: a.title,
    dateLabel: a.date_label || formatDateLabel(a.published_at),
    publishedAt: a.published_at,
    bodyHtml: a.body,
    level: a.level as Announcement["level"],
  }));
}

export async function getAnnouncementBySlug(
  slug: string
): Promise<Announcement | null> {
  const infra = createInfraReadOnlyClient();
  const { data, error } = await infra
    .from("service_announcements")
    .select("slug, title, body, level, date_label, published_at")
    .in("service", ["legal_life", "general"])
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error(`お知らせの取得に失敗しました: ${error.message}`);
  }
  if (!data) return null;

  return {
    slug: data.slug as string,
    title: data.title,
    dateLabel: data.date_label || formatDateLabel(data.published_at),
    publishedAt: data.published_at,
    bodyHtml: data.body,
    level: data.level as Announcement["level"],
  };
}

/**
 * ヘッダー直下に常時表示する重要なお知らせ（警告レベル）を新しい順に取得する。
 * root layoutから全ページで呼ばれるため、取得に失敗してもサイト全体の表示を
 * 止めないよう、ここでは例外を投げずバナー非表示（空配列）として扱う。
 */
export async function getImportantAnnouncements(
  limit: number
): Promise<Announcement[]> {
  try {
    const announcements = await getAnnouncements();
    return announcements.filter((a) => a.level === "warning").slice(0, limit);
  } catch {
    return [];
  }
}
