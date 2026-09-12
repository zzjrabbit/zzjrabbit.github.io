#!/usr/bin/env bash
# 只轮询并串行构建；沿用已有预览服务，不启动 HTTP 服务器。
set -euo pipefail

case ${1:-} in
  -h|--help)
    printf '%s\n' '用法：scripts/watch-notes.sh' \
      'NOTES_DIR：源笔记仓库（默认 ../tyle）' \
      'WATCH_INTERVAL：轮询间隔秒数（默认 2，支持正小数）' \
      '启动时构建一次，之后有笔记、site、src、scripts 或 Web 配置变化才构建。Ctrl-C 停止。'
    exit 0 ;;
  '') ;;
  *) printf '错误：不支持参数 %s\n' "$1" >&2; exit 2 ;;
esac
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export NOTES_DIR="${NOTES_DIR:-$root/../tyle}"
interval=${WATCH_INTERVAL:-2}
[[ $interval =~ ^([0-9]+([.][0-9]+)?|[.][0-9]+)$ && $interval =~ [1-9] ]] || {
  printf '错误：WATCH_INTERVAL 必须是正数\n' >&2; exit 2;
}
command -v perl >/dev/null || { printf '错误：需要 perl（可用 nix develop）\n' >&2; exit 1; }
[[ -d $NOTES_DIR/typ ]] || { printf '错误：%s 下缺少 typ/\n' "$NOTES_DIR" >&2; exit 1; }
NOTES_DIR=$(cd "$NOTES_DIR" && pwd -P)
export NOTES_DIR

# 核心 Perl 模块，无 inotify / Python 依赖。按路径和内容哈希，检测删除、
# 新建和保持 mtime 的编辑；不使用目录 mtime，生成文件不会引发重复构建。
# site/typ、models、lean 是 build.sh 写入的副本，仅监控其源目录。
# 桥接器的 .generated/ 与最终 _site/、中间 _calepin/ 均不在监控树中。
snapshot() {
  perl - "$NOTES_DIR" "$root" <<'PERL'
use strict;
use warnings;
use File::Find ();
use Digest::SHA ();
my ($notes, $root) = @ARGV;
my $site = "$root/site";
my $digest = Digest::SHA->new(256);
sub hash_file {
    my ($path) = @_;
    open my $fh, '<:raw', $path or die "读取 $path 失败: $!\n";
    my $file = Digest::SHA->new(256)->addfile($fh)->hexdigest;
    close $fh or die "关闭 $path 失败: $!\n";
    $digest->add($path, "\0", $file, "\0");
}
my %ignored = map { $_ => 1 } qw(.git .lake .calepin .cache .tools .astro .generated _calepin _site target node_modules);
for my $tree ("$notes/typ", "$notes/models", "$notes/lean", $site,
              "$root/src", "$root/scripts", "$root/public") {
    $digest->add($tree, "\0", (-d $tree ? 'present' : 'missing'), "\0");
    next unless -d $tree;
    my @files;
    File::Find::find({ no_chdir => 1, wanted => sub {
        my $path = $File::Find::name;
        return if $path eq $tree;
        (my $rel = $path) =~ s/^\Q$tree\E\///;
        my ($base) = $path =~ m{([^/]+)$};
        if (-d $path) {
            if ($ignored{$base} || ($tree eq $site && $rel =~ m{^(typ|models|lean)$})) {
                $File::Find::prune = 1;
            }
            return;
        }
        # 不跟随链接；PDF 和编辑器临时文件均不是触发源。
        return if -l $path;
        return if $base =~ /(?:\.pdf|\.sw[opx]|\.tmp|\.bak|~)$/i || $base =~ /^\.#|^#.*#$/;
        push @files, $path if -f $path;
    }}, $tree);
    hash_file($_) for sort @files;
}
for my $name (qw(astro.config.mjs package.json package-lock.json tsconfig.json .npmrc)) {
    my $path = "$root/$name";
    my $present = -f $path && !-l $path;
    $digest->add($path, "\0", ($present ? 'present' : 'missing'), "\0");
    hash_file($path) if $present;
}
print $digest->hexdigest, "\n";
PERL
}

child=
stop() {
  trap '' INT TERM
  if [[ -n $child ]]; then
    kill -TERM "$child" 2>/dev/null || true
    wait "$child" 2>/dev/null || true
  fi
  printf '\n已停止监控。\n'
  exit 0
}
trap stop INT TERM

printf '监控 %s 与 %s 下的 site、src、scripts 和 Web 配置；间隔 %s 秒（不启动服务器）。\n' "$NOTES_DIR" "$root" "$interval"
previous=
while :; do
  if current=$(snapshot); then
    if [[ $current != "$previous" ]]; then
      # 记录构建前快照，构建过程中发生的编辑会在下一轮触发，不会丢失。
      # 即便构建失败，也仅在再次编辑时重试，避免错误状态下忙循环。
      previous=$current
      printf '\n=== %s 检测到变化，开始构建 ===\n' "$(date '+%F %T')"
      bash "$root/scripts/build.sh" &
      child=$!
      if wait "$child"; then
        printf '构建成功，继续监控。\n'
      else
        status=$?
        printf '构建失败（退出码 %s），继续监控；修正文件后自动重试。\n' "$status" >&2
      fi
      child=
    fi
  else
    printf '无法读取监控快照（文件可能正在保存），下一轮重试。\n' >&2
  fi
  sleep "$interval" &
  child=$!
  wait "$child" || true
  child=
done
