#!/usr/bin/env bash
# 只在源笔记仓库创建文件；不构建、不启动服务器，也不改站点同步副本。
set -euo pipefail

usage() {
  printf '%s\n' \
    '用法：scripts/new-note.sh <分类/名称[.typ]> <标题> [选项]' \
    '  --date YYYY-MM-DD  日期（默认今天）' \
    '  --tags tag1,tag2   逗号分隔标签（默认首级分类）' \
    '  --summary 文本    摘要（默认空字符串）' \
    '路径相对 NOTES_DIR/typ；物理笔记用 phys/（或 physics/）前缀。NOTES_DIR 默认 ../tyle。' \
    '路径段仅允许字母、数字、下划线和连字符；拒绝符号链接及覆盖。'
}
die() { printf '错误：%s\n' "$*" >&2; exit 1; }
[[ ${1:-} != -h && ${1:-} != --help ]] || { usage; exit 0; }
[[ $# -ge 2 ]] || { usage >&2; exit 2; }
path=$1
title=$2
shift 2
note_date=$(date +%F)
tags=
summary=
tags_set=false
while (( $# )); do
  case $1 in
    --date|--tags|--summary)
      [[ $# -ge 2 ]] || die "$1 缺少参数"
      case $1 in
        --date) note_date=$2 ;;
        --tags) tags=$2; tags_set=true ;;
        --summary) summary=$2 ;;
      esac
      shift 2 ;;
    *) die "未知选项：$1" ;;
  esac
done
[[ -n $title ]] || die '标题不能为空'
[[ $note_date =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || die '日期必须为 YYYY-MM-DD'
# GNU date 由开发环境的 coreutils 提供；同时拒绝不存在的日历日期。
valid_date=$(date -d "$note_date" +%F 2>/dev/null) || die '无效的日期'
[[ $valid_date == "$note_date" ]] || die '无效的日期'
# 顶层集合：typ/ 是数学，phys/（别名 physics/）是物理，与网站的双轨结构一致。
# 省略前缀时按数学笔记处理，沿用原来的行为。
collection=typ
case $path in
  typ/*|phys/*|physics/*) collection=${path%%/*}; path=${path#*/} ;;
esac
path=${path%.typ}
[[ $path =~ ^[a-zA-Z0-9_-]+(/[a-zA-Z0-9_-]+)*$ ]] || die '不安全的笔记路径'
[[ $path != shared ]] || die 'shared.typ 是共用模板，不能作为笔记'
if ! $tags_set; then
  [[ $path != */* ]] || tags=${path%%/*}
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src=${NOTES_DIR:-$root/../tyle}
[[ -d $src ]] || die "笔记仓库不存在：$src（用 NOTES_DIR 指定）"
src=$(cd "$src" && pwd -P)
[[ ! -L $src/$collection ]] || die "$collection/ 不能是符号链接"
if [[ ! -d $src/$collection ]]; then
  # typ/ 必须已存在（共用模板在里面）；物理集合可以在写第一篇物理笔记时建立。
  if [[ $collection == typ ]]; then die "源仓库缺少 $collection/"; fi
  mkdir -- "$src/$collection" || die "无法创建目录：$src/$collection"
fi
[[ -f $src/typ/shared.typ ]] || die '源仓库缺少 typ/shared.typ'
parent=$src/$collection
# 共用模板始终在 typ/ 下：数学笔记就在同一集合里，物理笔记要从 phys/ 回到 typ/。
import=shared.typ
[[ $collection == typ ]] || import=../typ/shared.typ
IFS=/ read -r -a parts <<< "$path"
for ((i=0; i<${#parts[@]}-1; i++)); do
  parent+=/${parts[i]}
  [[ ! -L $parent ]] || die "拒绝符号链接目录：$parent"
  if [[ ! -e $parent ]]; then
    mkdir -- "$parent" || die "无法创建目录：$parent"
  fi
  [[ -d $parent && ! -L $parent ]] || die "不是安全的目录：$parent"
  import=../$import
done
target=$parent/${parts[${#parts[@]}-1]}.typ
[[ ! -e $target && ! -L $target ]] || die "拒绝覆盖已有路径：$target"

# 所有用户文本都作为 Typst 字符串输出，不能注入 Typst 表达式。
quote_typst() {
  local value=$1
  value=${value//\\/\\\\}
  value=${value//\"/\\\"}
  value=${value//$'\n'/\\n}
  value=${value//$'\r'/\\r}
  value=${value//$'\t'/\\t}
  printf '"%s"' "$value"
}
render() {
  printf '#import "%s": *\n' "$import"
  printf '#import "@preview/noteworthy:0.4.0": *\n\n'
  printf '#show: tylenotes.with(\n  title: '
  quote_typst "$title"
  printf ',\n  date: '
  quote_typst "$note_date"
  printf ',\n  tags: ('
  local tag
  local -a tag_list=()
  IFS=, read -r -a tag_list <<< "$tags"
  for tag in "${tag_list[@]}"; do
    # 去掉标签两侧空格；空标签忽略，单标签保留元组末尾逗号。
    tag="${tag#"${tag%%[![:space:]]*}"}"
    tag="${tag%"${tag##*[![:space:]]}"}"
    [[ -n $tag ]] || continue
    quote_typst "$tag"
    printf ', '
  done
  printf '),\n  summary: '
  quote_typst "$summary"
  printf ',\n)\n\n= 正文\n\n'
}
# noclobber 使最终创建具备排他性：即便检查后同名文件出现也不覆盖。
if ! (set -o noclobber; render > "$target"); then
  die "创建失败，未覆盖已有文件：$target"
fi
printf '已创建笔记：%s\n' "$target"
