#!/usr/bin/env bash
# 把 notes 仓库的内容同步到站点源目录根部（typ/ models/ lean/）。
#
# 本地：默认从 ../tyle 同步，可用 NOTES_DIR 覆盖。
# CI：先 git clone notes.git 到某处，再用 NOTES_DIR 指向它。
#
# 注意：Calepin 不跟随符号链接目录做页面扫描，所以这里必须是真实拷贝。
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="${NOTES_DIR:-$root/../tyle}"
dst="$root/site"

if [[ ! -d "$src/typ" ]]; then
  echo "错误：在 $src 下找不到 typ/ 目录（用 NOTES_DIR 指定笔记仓库路径）" >&2
  exit 1
fi

for d in typ models lean; do
  [[ -d "$src/$d" ]] || continue
  mkdir -p "$dst/$d"
  rsync -a --delete \
    --exclude '.git' --exclude '.lake' --exclude 'target' \
    "$src/$d/" "$dst/$d/"
done

echo "已同步笔记：$src → $dst"
