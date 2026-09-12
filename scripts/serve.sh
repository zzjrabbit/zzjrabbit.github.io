#!/usr/bin/env bash
# 本地预览：构建后用 Calepin 自带的静态服务器打开 _site/
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

"$root/scripts/build.sh"

echo "=== 启动本地预览（Ctrl-C 退出）==="
exec "$calepin" serve "$root/_site" --open "$@"
