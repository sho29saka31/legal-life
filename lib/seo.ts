import type { Metadata } from "next";

const SITE_NAME = "legal&life";

// share.png は 325x300 の正方形に近い画像のため、大判カード(summary_large_image)ではなく
// summaryカードを使い、実寸をOGPにも明示する。
const SHARE_IMAGE = {
  url: "/assets/images/share.png",
  width: 325,
  height: 300,
  alt: "legal&life ロゴ",
};

/**
 * 各ページのmetadataを共通形式で組み立てる。
 * Next.jsのmetadataはopenGraph等がページ単位で丸ごと置き換わる(深いマージはされない)ため、
 * ページ側でopenGraphを指定すると親layoutのimagesが失われる。ここで毎回imagesを含めて防ぐ。
 * index:falseのページ(正式公開前の機能等)はcanonicalを付けず、noindexのみ明示する。
 */
export function pageMetadata({
  title,
  description,
  path,
  index = true,
}: {
  title: string;
  description: string;
  path: string;
  index?: boolean;
}): Metadata {
  const socialTitle = `${title} | ${SITE_NAME}`;
  return {
    title,
    description,
    ...(index
      ? { alternates: { canonical: path } }
      : { robots: { index: false, follow: true } }),
    openGraph: {
      title: socialTitle,
      description,
      url: path,
      siteName: SITE_NAME,
      locale: "ja_JP",
      type: "website",
      images: [SHARE_IMAGE],
    },
    twitter: {
      card: "summary",
      title: socialTitle,
      description,
      images: [SHARE_IMAGE.url],
    },
  };
}
