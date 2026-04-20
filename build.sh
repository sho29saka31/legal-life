#!/bin/bash
set -e

echo "🔨 ビルド開始..."

# distフォルダを作成
rm -rf ./dist
mkdir -p ./dist

# srcの内容をdistにコピー
cp -r ./src/. ./dist/

# Gemini APIキーの注入
if [ -n "$GEMINI_API_KEY" ]; then
  sed -i "s|__GEMINI_API_KEY__|${GEMINI_API_KEY}|g" \
    ./dist/assets/js/chat.js
  echo "✅ Gemini APIキー注入完了"
else
  echo "⚠️ GEMINI_API_KEY が設定されていません"
fi

# Firebase設定の注入
if [ -n "$FIREBASE_CONFIG" ]; then
  # Firebaseの設定はJSON形式のため特殊文字をエスケープ
  ESCAPED=$(printf '%s\n' "$FIREBASE_CONFIG" | sed 's/[\/&]/\\&/g')
  sed -i "s|__FIREBASE_CONFIG__|${ESCAPED}|g" \
    ./dist/assets/js/important.js
  echo "✅ Firebase設定注入完了"
else
  echo "⚠️ FIREBASE_CONFIG が設定されていません"
fi

echo "🎉 ビルド完了 → dist/ フォルダに出力されました"