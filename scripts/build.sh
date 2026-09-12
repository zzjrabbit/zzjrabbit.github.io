#!/usr/bin/env bash
# 一键构建：同步笔记 → Calepin 编译到 _calepin/ → Astro 构建到 _site/
# 首次使用或 package-lock.json 更新后，先在仓库根目录运行 npm ci。
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

calepin="${CALEPIN_BIN:-}"
if [[ -z "$calepin" ]]; then
  for candidate in "$root"/.tools/*/calepin; do
    if [[ -x "$candidate" ]]; then calepin="$candidate"; break; fi
  done
fi
if [[ -z "$calepin" ]]; then
  echo "找不到 calepin，请先运行 scripts/get-calepin.sh" >&2
  exit 1
fi

if ! command -v typst >/dev/null; then
  echo "错误：PATH 中没有 typst（Calepin 需要 typst >= 0.15）" >&2
  exit 1
fi

if ! command -v npm >/dev/null || ! command -v node >/dev/null; then
  echo "错误：PATH 中缺少 node 或 npm；请安装 Node.js >= 22.12（或运行 nix develop），再在 $root 运行 npm ci" >&2
  exit 1
fi
if ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1)'; then
  echo "错误：Astro / Starlight 需要 Node.js >= 22.12；请升级 Node.js 或运行 nix develop" >&2
  exit 1
fi

"$root/scripts/sync-notes.sh"

echo "=== calepin compile ==="
cd "$root/site"
"$calepin" compile . "$root/_calepin"

echo "=== Astro / Starlight build ==="
cd "$root"
npm run build:web
echo "=== 完成：$root/_site/index.html ==="
