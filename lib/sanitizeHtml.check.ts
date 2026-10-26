// 実行: node --experimental-strip-types lib/sanitizeHtml.check.ts
import assert from "node:assert/strict";
import { renderAnnouncementBody } from "./sanitizeHtml.ts";

// 段落・見出し(全レベルh3)・改行・強調・リスト・自動リンク
const html = renderAnnouncementBody("# 大見出し\n\n本文1行目\n2行目 **強調**\n\n- A\n- B\n\nhttps://example.com");
assert.match(html, /<h3>大見出し<\/h3>/);
assert.match(html, /<p>本文1行目<br ?\/?>2行目 <strong>強調<\/strong><\/p>/);
assert.match(html, /<ul>\s*<li>A<\/li>\s*<li>B<\/li>\s*<\/ul>/);
assert.match(html, /<a href="https:\/\/example.com">/);

// 引用は囲み(section)、表はtable
assert.match(renderAnnouncementBody("> 注意"), /<section><p>注意<\/p>\s*<\/section>/);
assert.match(renderAnnouncementBody("|項目|内容|\n|-|-|\n|日時|未定|"), /<table>[\s\S]*<th>項目<\/th>[\s\S]*<td>未定<\/td>/);

// 本文中の生HTML・危険なリンクは無効化される(リンクにならず、href属性が残らない)
assert.doesNotMatch(renderAnnouncementBody("<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>"), /script|onerror|<img/);
assert.doesNotMatch(renderAnnouncementBody("[x](javascript:alert(1))"), /href/);

// 移行前のHTML本文は変換せず、サニタイズだけして表示する
assert.equal(
  renderAnnouncementBody('<p>旧<strong>本文</strong></p><div class="x">箱</div>'),
  "<p>旧<strong>本文</strong></p>箱"
);

console.log("sanitizeHtml: OK");
