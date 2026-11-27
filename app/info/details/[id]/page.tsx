import { redirect } from "next/navigation";

// お知らせの詳細の画面は、saka2931.jp(service)に統一した。古いリンクは、そちらへ移す。
export const dynamic = "force-dynamic";

export default async function InfoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`https://saka2931.jp/news/${encodeURIComponent(id)}`);
}
