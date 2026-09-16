import sanitizeHtml from "sanitize-html";

/**
 * お知らせ本文(service_announcements.body)は管理コンソール(adac)からのみ
 * 書き込まれる想定(RLSでanon/authenticatedへの書き込み権限は付与していない)
 * だが、adac側の認可が突破された場合の多層防御として、表示前に必ず
 * サニタイズする(コード監査で発見: 無サニタイズでdangerouslySetInnerHTML
 * していたため、管理コンソール乗っ取り時に*.saka2931.jp上の格納型XSSに
 * つながり得た)。
 *
 * 当初isomorphic-dompurify(内部でjsdomを使用)を使っていたが、jsdomの依存
 * (html-encoding-sniffer→@exodus/bytes)がESMモジュールで、Next.jsの
 * サーバーレス関数上でrequire()/動的import()どちらで読み込んでも
 * "ERR_REQUIRE_ESM"を起こし全ページ500になる本番障害を2度起こしたため、
 * jsdomに依存しないsanitize-html(htmlparser2ベース)に置き換えた。
 */
export function sanitizeAnnouncementHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "em",
      "a",
      "ul",
      "ol",
      "li",
      "h3",
      "section",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "span",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
    },
    // http(s)/mailto以外のスキーム(javascript:等)によるXSSを防止
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
  });
}
