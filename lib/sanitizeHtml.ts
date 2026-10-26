import sanitizeHtml from "sanitize-html";
import { Marked } from "marked";

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

// お知らせ本文はadacでMarkdownで書く。詳細ページのCSSが当たるタグに寄せる:
// 見出しはすべてh3、引用(>)は灰色の囲み(section)、改行はbrにする。
const markdown = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    heading(token) {
      return `<h3>${this.parser.parseInline(token.tokens)}</h3>\n`;
    },
    blockquote(token) {
      return `<section>${this.parser.parse(token.tokens)}</section>\n`;
    },
  },
});

/**
 * 本文を表示用のHTMLにする。Markdownを変換してからサニタイズする。
 * 移行前に保存されたHTML本文(先頭がタグ)は、変換せずサニタイズだけして表示する。
 */
export function renderAnnouncementBody(body: string): string {
  const isLegacyHtml = /^\s*<[a-z]/i.test(body);
  return sanitizeAnnouncementHtml(isLegacyHtml ? body : (markdown.parse(body, { async: false }) as string));
}
