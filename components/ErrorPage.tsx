import Link from "next/link";

export default function ErrorPage({
  code,
  title,
  desc,
  onRetry,
  showStatusLink = false,
}: {
  code: string;
  title: string;
  desc: string;
  /** 指定時、「再読み込みする」ボタンを追加表示する(error.tsx等の実行時エラー用) */
  onRetry?: () => void;
  /** サーバー側の障害(500系・メンテナンス)の時だけ、稼働状況ページへの導線を出す */
  showStatusLink?: boolean;
}) {
  return (
    <div className="text-center px-5 py-12 sm:py-20 text-[#333]">
      <div className="max-w-3xl min-h-[250px] mx-auto bg-white px-6 sm:px-8 py-8 sm:py-10 rounded-xl shadow-[0_10px_25px_rgba(0,0,0,0.08)] border-t-[5px] border-[#cc0000]">
        <h1 className="text-3xl sm:text-5xl text-[#cc0000] tracking-wide mb-2">{code}</h1>
        <h2 className="text-xl sm:text-2xl font-bold mb-5">{title}</h2>
        <p
          className="leading-loose text-[#444] mb-6 text-left inline-block max-w-[90%]"
          style={{ whiteSpace: "pre-line" }}
        >
          {desc}
        </p>
        <div>
          <Link
            href="/"
            className="inline-block m-1 bg-primary text-white font-bold rounded-full px-8 py-4 shadow-[0_4px_15px_rgba(0,200,233,0.2)] transition-all duration-300 hover:bg-primary-dark hover:-translate-y-0.5"
          >
            ホームページに戻る
          </Link>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-block m-1 bg-white text-primary font-bold rounded-full px-8 py-4 border-2 border-primary transition-all duration-300 hover:bg-primary/5 hover:-translate-y-0.5"
            >
              再読み込みする
            </button>
          )}
        </div>
        {showStatusLink && (
          <p className="mt-6 text-sm">
            <a href="https://status.saka2931.jp" className="text-[#666] underline hover:text-primary-dark">
              サービスの稼働状況を確認する
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
