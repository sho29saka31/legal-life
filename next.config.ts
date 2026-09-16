import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // isomorphic-dompurify(内部でjsdomを使用)をturbopack/webpackでバンドルすると、
  // jsdomの依存(html-encoding-sniffer→@exodus/bytes)がESMのため
  // "ERR_REQUIRE_ESM"で本番実行時に全ページ500エラーになる(本番障害で発覚)。
  // サーバー専用パッケージとしてバンドル対象から除外し、実行時にNode本来の
  // require/importで解決させることで回避する。
  serverExternalPackages: ["isomorphic-dompurify", "jsdom"],
  images: {
    // Googleアカウントのプロフィール画像(next/imageの最適化対象として許可)
    remotePatterns: [{ protocol: "https", hostname: "*.googleusercontent.com" }],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
