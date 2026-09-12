{
  description = "zzjrabbit.github.io —— notes 仓库的 Calepin 站点";

  inputs.nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";

  outputs = {
    self,
    nixpkgs,
  }: let
    systems = ["x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin"];
    forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f (import nixpkgs {inherit system;}));
  in {
    # 开发环境：typst 是必需的（Calepin 只做编排，真正的渲染由官方 typst CLI 完成）。
    # Calepin 本身不在 nixpkgs 里，用 scripts/get-calepin.sh 安装固定版本。
    #
    # 曾经想在这里把官方预编译的 Calepin 二进制包成一个 derivation，
    # 但 GitHub 在这台机器的 nix 构建沙箱里连不上（fetchurl 超时失败），
    # 所以没有保留一条无法验证的安装路径。
    devShells = forAllSystems (pkgs: {
      default = pkgs.mkShell {
        packages = with pkgs; [
          typst # nixpkgs 当前为 0.15.1，与笔记使用的 @preview 包匹配
          git
          rsync
          curl
        ];

        shellHook = ''
          echo "typst $(typst --version | cut -d' ' -f2)"
          if ! ls .tools/*/calepin >/dev/null 2>&1; then
            echo "提示：还没装 Calepin，先运行 scripts/get-calepin.sh"
          fi
        '';
      };
    });
  };
}
