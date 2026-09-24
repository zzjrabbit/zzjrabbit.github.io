#!/usr/bin/env bash
# 把 notes 仓库的内容同步到站点源目录根部（typ/ phys/ models/ lean/）。
#
# 本地：默认从 ../tyle 同步，可用 NOTES_DIR 覆盖。
# CI：先 git clone notes.git 到某处，再用 NOTES_DIR 指向它。
#
# 注意：Calepin 不跟随符号链接目录做页面扫描，所以这里必须是真实拷贝。
set -euo pipefail
shopt -s globstar nullglob

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="${NOTES_DIR:-$root/../tyle}"
dst="$root/site"

if [[ ! -d "$src/typ" ]]; then
  echo "错误：在 $src 下找不到 typ/ 目录（用 NOTES_DIR 指定笔记仓库路径）" >&2
  exit 1
fi

for d in typ phys physics models lean; do
  # Optional collections may disappear upstream; do not republish stale copies.
  if [[ ! -d "$src/$d" ]]; then
    rm -rf -- "$dst/$d"
    continue
  fi
  mkdir -p "$dst/$d"
  rsync -a --checksum --delete \
    --exclude '.git' --exclude '.lake' --exclude 'target' \
    "$src/$d/" "$dst/$d/"
done

# Only adapt synchronized copies; never rewrite the authoritative notes repository.
# Insert after imports so a later noteworthy import cannot shadow the adapter.
# --checksum above restores these copies before each pass, making this idempotent.
# phys/ is the physics twin of typ/ and needs the same web adaptation; physics/
# is accepted as an alias for it.
while IFS= read -r -d '' file; do
  perl -0pi -e 's{^(\h*#import\h+"\@preview/noteworthy:[^"\n]+"[^\n]*)(\n|\z)}{$1\n#import "/themes/site/notes.typ": *\n}mg' "$file"
done < <(printf '%s\0' "$dst"/typ/**/*.typ "$dst"/phys/**/*.typ "$dst"/physics/**/*.typ "$dst"/models/**/*.typ | while IFS= read -r -d '' file; do
  [[ -f "$file" ]] && printf '%s\0' "$file"
done)

# CeTZ needs a different treatment: a canvas has to be intercepted where it is
# called, so rewriting the *package path* is what makes every import spelling land
# in themes/site/cetz.typ — bare, aliased, selective or multi-line, all at once.
# A bare path import binds the file stem `cetz`, the same name a bare package
# import binds, so `cetz.canvas(...)` and `import cetz.draw: *` keep resolving.
# Shared libraries are rewritten too: phys/shared.typ draws with CeTZ as well.
adapter="$dst/themes/site/cetz.typ"
cetz_shim="/themes/site/cetz.typ"
synced_typ=()
while IFS= read -r -d '' file; do
  [[ -f "$file" ]] && synced_typ+=("$file")
done < <(printf '%s\0' "$dst"/typ/**/*.typ "$dst"/phys/**/*.typ "$dst"/physics/**/*.typ "$dst"/models/**/*.typ)

if ((${#synced_typ[@]})); then
  # The copies are compiled against the version the adapter pins. A note that
  # moves to another version would otherwise compile against a version it never
  # asked for, which is the hardest kind of failure to read, so stop and name the
  # one edit to make instead of guessing which side is right.
  versions="$(perl -ne 'while (/"\@preview\/cetz:([^"]*)"/g) { print "$1\n" }' "${synced_typ[@]}" | sort -u)"
  if [[ -n "$versions" ]]; then
    pin="$(perl -ne 'if (/^\h*#import\h+"\@preview\/cetz:([^"]+)"/) { print $1; exit }' "$adapter")"
    if [[ -z "$pin" ]]; then
      echo "错误：$adapter 里找不到固定版本的 #import \"@preview/cetz:<版本>\"；CeTZ 适配层无法确定编译版本" >&2
      exit 1
    fi
    while IFS= read -r version; do
      [[ -z "$version" || "$version" == "$pin" ]] && continue
      echo "错误：笔记使用 cetz:$version，而 $adapter 固定了 cetz:$pin。" >&2
      echo "      同步副本一律按适配层固定的版本编译，请把该文件里的 cetz:$pin 改成 cetz:$version（笔记之间版本不一致时先统一）。" >&2
      exit 1
    done <<< "$versions"
  fi

  perl -0pi -e "s{\"\@preview/cetz:[^\"]*\"}{\"$cetz_shim\"}g" "${synced_typ[@]}"

  # Anything left over is an import form the rewrite above did not recognise, and
  # that canvas would silently vanish from the web page.
  if leftovers="$(grep -l '"@preview/cetz:' "${synced_typ[@]}")"; then
    echo "错误：以下副本仍直接导入 CeTZ 包，画布不会出现在网页上：" >&2
    printf '      %s\n' $leftovers >&2
    echo "      请让 scripts/sync-notes.sh 的改写覆盖这种写法，或在源笔记里改用常见写法。" >&2
    exit 1
  fi
fi

echo "已同步笔记并应用网页适配：$src → $dst"
