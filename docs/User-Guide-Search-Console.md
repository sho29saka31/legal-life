# User Guide: Search Console（legal&life）

[User Guide](User-Guide.md) の一部。Google Search Consoleへのサイト登録手順。

## 1. プロパティの追加

1. https://search.google.com/search-console/ で新しいプロパティを追加（プロパティタイプ: URLプレフィックス、`https://legal-life.saka2931.jp`）
2. 所有権の確認方法として **「HTMLタグ」** 方式を選択する（Sporiveと同様の理由で、Next.js App RouterではGTM経由の確認方式は使用しない）
3. 発行される`<meta name="google-site-verification" content="...">`のcontent値を、アプリのmetadata設定に反映する（Claudeに依頼してレイアウトファイルに追加する）
4. デプロイ後、Search Console側で「確認」を実行

## 2. サイトマップの送信

1. 左メニュー **サイトマップ** から `sitemap.xml` を送信する
2. `app/sitemap.ts`（Next.jsのMetadata Route機能）で自動生成されるため、追加実装は不要

## トラブルシューティング

- **所有権を確認できない**：metaタグの値が正しく反映されデプロイされているか、ブラウザの「ページのソースを表示」で確認
- **サイトマップが取得できない**：`https://legal-life.saka2931.jp/sitemap.xml`に直接アクセスして正しいXMLが返るか確認
