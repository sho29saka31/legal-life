import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import ChatApp from "./ChatApp";
import { getFeatureFlag } from "@/lib/feature-flags";

export const metadata: Metadata = pageMetadata({
  title: "チャット",
  path: "/content/chat",
  description:
    "法令や法律に関する疑問をAIに質問できるチャット機能のページです(正式公開前)。日本国憲法や主要な法令について気軽に相談できます。回答は参考情報であり、具体的な法律問題は弁護士などの専門家へご相談ください。",
  index: false,
});

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
