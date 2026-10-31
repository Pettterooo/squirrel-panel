#!/bin/zsh
# 双击启动鼠须管外观面板
set -u
cd "$(dirname "$0")"

export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 || true
fi

NODE_BIN="$(command -v node 2>/dev/null || true)"
if [ -z "$NODE_BIN" ]; then
  for candidate in "$NVM_DIR"/versions/node/*/bin/node(N); do
    [ -x "$candidate" ] && NODE_BIN="$candidate"
  done
fi
if [ -z "$NODE_BIN" ]; then
  echo "未找到 Node.js，请先安装 Node.js 18 或更高版本（nodejs.org 或 Homebrew）。"
  read -k 1 "?按任意键退出…"
  exit 1
fi

NODE_MAJOR="$("$NODE_BIN" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Node.js 版本过低（当前 $("$NODE_BIN" -v)），需要 18 或更高版本。"
  echo "请到 nodejs.org 或 Homebrew 安装新版后再运行。"
  read -k 1 "?按任意键退出…"
  exit 1
fi

if [ ! -d node_modules/yaml ]; then
  NPM_BIN="$(dirname "$NODE_BIN")/npm"
  echo "首次运行，正在安装依赖…"
  "$NPM_BIN" install --no-audit --no-fund || {
    echo "依赖安装失败。"
    read -k 1 "?按任意键退出…"
    exit 1
  }
fi

exec "$NODE_BIN" server.mjs
