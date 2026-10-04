import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import SearchApp from "./SearchApp";

export const metadata: Metadata = pageMetadata({
  title: "法令検索",
  path: "/content/search",
  description:
    "政府が提供するe-Gov法令APIを利用して、日本の法律・政令・規則などの法令をキーワードで検索し、条文を確認できます。信頼できる公開情報をもとにしているため、最新の法令を調べたいときにご利用いただけます。",
});

export default function SearchPage() {
  return <SearchApp />;
}
