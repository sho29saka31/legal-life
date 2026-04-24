#!/bin/bash
set -e

echo "🔨 ビルド開始..."

# distフォルダを作成
rm -rf ./dist
mkdir -p ./dist

# srcの内容をdistにコピー
cp -r ./src/. ./dist/

# ========================================
# Gemini APIキーの注入
# ----------------------------------------
# sed を使用（文字列はシンプルなので問題なし）
# ========================================
if [ -n "$GEMINI_API_KEY" ]; then
    sed -i "s|__GEMINI_API_KEY__|${GEMINI_API_KEY}|g" \
        ./dist/assets/js/chat.js
    echo "✅ Gemini APIキー注入完了"
else
    echo "⚠️ GEMINI_API_KEY が設定されていません"
fi

# ========================================
# Firebase設定の注入
# ----------------------------------------
# 理由: Firebase Config は JSON 形式で `/`, `&`, `{`, `}`, `"` などの
#       sed で問題になる特殊文字を多数含むため、Python を使って
#       単純な文字列置換を行う（エスケープ不要で確実）
# ========================================
if [ -n "$FIREBASE_CONFIG" ]; then
    python3 - "$FIREBASE_CONFIG" << 'PYEOF'
import sys

raw_config = sys.argv[1]
target_file = './dist/assets/js/important.js'

with open(target_file, 'r', encoding='utf-8') as f:
    content = f.read()

if '__FIREBASE_CONFIG__' not in content:
    print("⚠️ important.js にプレースホルダー __FIREBASE_CONFIG__ が見つかりません")
    sys.exit(0)

content = content.replace('__FIREBASE_CONFIG__', raw_config)

with open(target_file, 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ Firebase設定注入完了")
PYEOF
else
    echo "⚠️ FIREBASE_CONFIG が設定されていません"
fi

echo "🎉 ビルド完了 → dist/ フォルダに出力されました"