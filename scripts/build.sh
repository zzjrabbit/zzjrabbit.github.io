#!/usr/bin/env bash
# 一键构建：同步笔记 → Calepin 编译 → 输出到 _site/
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

calepin="${CALEPIN_BIN:-}"
if [[ -z "$calepin" ]]; then
  calepin=$(find "$root/.tools" -maxdepth 2 -type f -name calepin -perm -u+x 2>/dev/null | head -1)
fi
if [[ -z "$calepin" ]]; then
  echo "找不到 calepin，请先运行 scripts/get-calepin.sh" >&2
  exit 1
fi

if ! command -v typst >/dev/null; then
  echo "错误：PATH 中没有 typst（Calepin 需要 typst >= 0.15）" >&2
  exit 1
fi

"$root/scripts/sync-notes.sh"

echo "=== calepin compile ==="
cd "$root/site"
"$calepin" compile . "$root/_site"
echo "=== 完成：$root/_site/index.html ==="
