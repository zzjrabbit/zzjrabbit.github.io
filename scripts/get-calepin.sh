#!/usr/bin/env bash
# 安装固定版本的 Calepin（站点生成器）到 .tools/。
#
# Calepin 只做编排，真正的渲染仍由官方 typst CLI 完成，所以本机还需要 typst >= 0.15。
set -euo pipefail

CALEPIN_VERSION="${CALEPIN_VERSION:-0.0.57}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tools="$root/.tools"

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64)   target="x86_64-unknown-linux-gnu" ;;
  Linux-aarch64)  target="aarch64-unknown-linux-gnu" ;;
  Darwin-arm64)   target="aarch64-apple-darwin" ;;
  Darwin-x86_64)  target="x86_64-apple-darwin" ;;
  *) echo "不支持的平台：$(uname -s)-$(uname -m)" >&2; exit 1 ;;
esac

mkdir -p "$tools"
url="https://github.com/vincentarelbundock/calepin/releases/download/v${CALEPIN_VERSION}/calepin-${target}.tar.xz"
echo "下载 $url"
curl -fSL --proto '=https' -o "$tools/calepin.tar.xz" "$url"
tar -xf "$tools/calepin.tar.xz" -C "$tools"
chmod +x "$tools/calepin-${target}/calepin"

bin="$tools/calepin-${target}/calepin"

# NixOS 无法直接运行通用 Linux 动态链接的可执行文件，需要改 interpreter。
if [[ -e /etc/NIXOS ]]; then
  echo "检测到 NixOS，修正动态链接 interpreter ..."
  nix shell nixpkgs#patchelf nixpkgs#glibc nixpkgs#gcc-unwrapped.lib -c bash -c '
    set -e
    bin="$1"
    glibc=$(nix eval --raw nixpkgs#glibc.outPath)
    gcclib=$(nix eval --raw nixpkgs#gcc-unwrapped.lib.outPath)
    patchelf --set-interpreter "$glibc/lib/ld-linux-x86-64.so.2" "$bin" 2>/dev/null || true
    patchelf --set-rpath "$glibc/lib:$gcclib/lib" "$bin"
  ' _ "$bin"
fi

"$bin" --version
echo "已安装：$bin"
