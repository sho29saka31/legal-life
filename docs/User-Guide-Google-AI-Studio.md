# User Guide: Google AI Studio（legal&life）

[User Guide](User-Guide.md) の一部。Gemini API（AIチャット機能、`/api/chat`）のAPIキー取得手順。

## 1. APIキーの取得

1. https://aistudio.google.com/ にアクセスし、Googleアカウントでログイン
2. 左メニューの **Get API key** → **Create API key** を選択
3. 既存のGoogle Cloudプロジェクトを選択するか、新規プロジェクトを作成する（[User Guide Google Cloud Console](User-Guide-Google-Cloud-Console.md) で作成したものと同一でも、別プロジェクトでもよい）
4. 発行されたAPIキーを`GEMINI_API_KEY`としてVercelの環境変数に設定する（[User Guide Vercel](User-Guide-Vercel.md) 参照）。チャット等での共有はしない

## 2. 無料枠について

- 無料枠（Free tier）には分間・日間のリクエスト数上限がある。詳細は https://ai.google.dev/gemini-api/docs/rate-limits を参照
- Sporiveと同じくAI機能の利用が増えた場合、無料枠の上限に注意する

## トラブルシューティング

- **AIチャットが応答しない・エラーになる**：`GEMINI_API_KEY`が正しく設定されRedeploy済みか確認
- **一定時間で応答が返らなくなる**：無料枠のレート制限に達している可能性
