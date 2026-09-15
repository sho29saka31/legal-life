import { redirect } from "next/navigation";

// アカウント削除は全サービス共通の操作のため、authアプリに一元化した
// (旧実装: 30日間の猶予期間付き削除予約。auth_app.user_profilesへ移設済み)。
export default function AccountDeletePage() {
  redirect("https://auth.saka2931.jp/account/delete");
}
