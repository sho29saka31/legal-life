import DOMPurify from "isomorphic-dompurify";

/**
 * お知らせ本文(service_announcements.body)は管理コンソール(adac)からのみ
 * 書き込まれる想定(RLSでanon/authenticatedへの書き込み権限は付与していない)
 * だが、adac側の認可が突破された場合の多層防御として、表示前に必ず
 * サニタイズする(コード監査で発見: 無サニタイズでdangerouslySetInnerHTML
 * していたため、管理コンソール乗っ取り時に*.saka2931.jp上の格納型XSSに
 * つながり得た)。
 */
export function sanitizeAnnouncementHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
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
    ALLOWED_ATTR: ["href", "target", "rel"],
  });
}
