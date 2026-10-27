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
      "img",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt"],
      section: ["class"],
      span: ["class"],
    },
    // 旧サイトのCSS(app/globals.css の .announcement-body)が当たるクラスだけを通す
    allowedClasses: {
      section: ["update-point", "safety-note", "important-notice-box", "action-box"],
      span: ["img-item", "img-label"],
    },
    // http(s)/mailto以外のスキーム(javascript:等)によるXSSを防止
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
  });
}

// お知らせ本文はadacでMarkdownで書く。旧サイトのCSSが当たる形に寄せる:
// 見出しはすべてh3、引用(>)は囲み(section)、改行はbrにする。
// 引用の先頭に [!IMPORTANT](赤)・[!WARNING](黄)・[!TIP](水色) を書くと囲みの種類が変わる。
// 画像は ![代替テキスト](URL "ラベル") で、ラベル付きで並べて表示される。
const BOX_CLASS = { IMPORTANT: "important-notice-box", WARNING: "safety-note", TIP: "action-box" } as const;
const escapeAttr = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const markdown = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    heading(token) {
      return `<h3>${this.parser.parseInline(token.tokens)}</h3>\n`;
    },
    blockquote(token) {
      let html = this.parser.parse(token.tokens);
      let cls: string = "update-point";
      const m = /^\s*<p>\[!(IMPORTANT|WARNING|TIP)\](<br ?\/?>|<\/p>)?\s*/.exec(html);
      if (m) {
        cls = BOX_CLASS[m[1] as keyof typeof BOX_CLASS];
        html = (m[2] === "</p>" ? "" : "<p>") + html.slice(m[0].length);
      }
      return `<section class="${cls}">${html}</section>\n`;
    },
    image({ href, title, text }) {
      const label = title ? `<span class="img-label">${escapeAttr(title)}</span>` : "";
      return `<span class="img-item">${label}<img src="${escapeAttr(href)}" alt="${escapeAttr(text)}"></span>`;
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
