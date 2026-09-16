// ログイン・サインアップ・アカウント設定はauth.saka2931.jpに一元化され、
// legal-life自身は/account配下のページを持たなくなったため、
// パスに応じてヘッダー・フッター等を隠す分岐は不要になった。
export default function SiteChrome({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
