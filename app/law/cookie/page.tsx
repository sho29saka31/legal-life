import { permanentRedirect } from "next/navigation";

// クッキーポリシーはsaka2931.jp共通の窓口(saka2931.jp)に統合したため、
// このパスへの既存のリンク・ブックマーク・検索エンジンのインデックスを
// 生かす形で新しいページへリダイレクトする。
export default function CookiePolicyPage() {
  permanentRedirect("https://saka2931.jp/cookie");
}
