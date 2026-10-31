#!/bin/bash
# 打包发布 zip：包含运行时依赖（node_modules/yaml），解压即可双击使用。
# 用法：scripts/package-release.sh
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="$(node -p "require('./package.json').version")"
STAGE="dist/stage/squirrel-panel"
OUT="dist/squirrel-panel-v${VERSION}.zip"

if ! command -v node >/dev/null 2>&1; then
  echo "错误：需要 Node.js（读取版本号）" >&2
  exit 1
fi
if [ ! -d node_modules/yaml ]; then
  echo "错误：缺少 node_modules/yaml，请先 npm install" >&2
  exit 1
fi
if ! command -v ditto >/dev/null 2>&1; then
  echo "错误：需要 macOS ditto 打包" >&2
  exit 1
fi

rm -rf dist/stage
mkdir -p "$STAGE"

# 运行时文件
cp -R server.mjs lib tools public package.json package-lock.json "$STAGE/"
cp -R "启动面板.command" "$STAGE/"
cp -R README.md LICENSE "$STAGE/"
# 打包依赖（yaml 无传递依赖）
mkdir -p "$STAGE/node_modules"
cp -R node_modules/yaml "$STAGE/node_modules/"

# 清理开发/系统杂物
find "$STAGE" -name '.DS_Store' -delete

mkdir -p dist
rm -f "$OUT"
ditto -c -k --sequesterRsrc --keepParent "$STAGE" "$OUT"

SIZE="$(du -h "$OUT" | cut -f1)"
echo "已生成 $OUT（$SIZE，版本 v$VERSION）"
echo "内容："
find "$STAGE" -type f | sed "s|^$STAGE/||" | sort
