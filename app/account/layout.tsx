import { getFeatureFlag } from "@/lib/feature-flags";
import AccountLayoutClient from "./AccountLayoutClient";

/**
 * ログイン・新規登録・プロフィール編集・セキュリティ設定・端末管理・アカウント削除等、
 * account配下の全ページを対象にした「アカウント機能」フラグ(adacの管理画面で切替)。
 * 無効時は各ページの認証チェックより先にここで一律に利用不可を案内する。
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const accountFeaturesEnabled = await getFeatureFlag("account_features");

  if (!accountFeaturesEnabled) {
    return (
      <div className="min-h-[calc(100vh-200px)] bg-md-surface flex items-center justify-center px-4 py-10 sm:py-16">
        <div className="max-w-sm text-center">
          <p className="text-sm text-[#555] leading-relaxed">
            現在、アカウント機能(ログイン・新規登録・設定変更等)は一時的にご利用いただけません。
            <br />
            時間をおいて再度お試しください。
          </p>
        </div>
      </div>
    );
  }

  return <AccountLayoutClient>{children}</AccountLayoutClient>;
}
