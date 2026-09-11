import type { Metadata } from "next";
import ChatApp from "./ChatApp";
import { getFeatureFlag } from "@/lib/feature-flags";

export const metadata: Metadata = {
  title: "チャット",
  description:
    "このページはlegal&lifeのチャットページです。当ページでは法令や法律問題についてAIにチャットで質問できます。あなたの疑問にリアルタイムで回答します。当サイトは法令知識の普及と法知識不足による不利益を生まないことを目指しているサイトです。",
  // 正式公開前の機能のためサイト内ナビゲーションからは意図的にブロックしており、検索エンジンにも公開しない。
  robots: { index: false, follow: true },
};

export default async function ChatPage() {
  const aiChatEnabled = await getFeatureFlag("ai_chat");

  if (!aiChatEnabled) {
    return (
      <div className="max-w-[600px] mx-auto px-5 py-20 text-center">
        <p className="text-sm text-[#555] leading-relaxed">
          現在、AIチャット機能は一時的にご利用いただけません。
          <br />
          時間をおいて再度お試しください。
        </p>
      </div>
    );
  }

  return <ChatApp />;
}
