{
  description = "zzjrabbit.github.io —— notes 仓库的 Calepin 站点";

  inputs.nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";

  outputs = {
    self,
    nixpkgs,
  }: let
    systems = ["x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin"];
    forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f (import nixpkgs {inherit system;}));

    # Calepin 只是编排器：真正的渲染由官方 typst CLI 完成，所以两者都要装。
    calepinVersion = "0.0.57";
  in {
    packages = forAllSystems (pkgs:
      if pkgs.stdenv.hostPlatform.system == "x86_64-linux"
      then {
        # 官方预编译二进制（本 flake 只固定了 x86_64-linux；其他平台用 scripts/get-calepin.sh）
        calepin = pkgs.stdenv.mkDerivation {
          pname = "calepin";
          version = calepinVersion;

          src = pkgs.fetchurl {
            url = "https://github.com/vincentarelbundock/calepin/releases/download/v${calepinVersion}/calepin-x86_64-unknown-linux-gnu.tar.xz";
            hash = "sha256-HoztGr1+bgz9VgQAfrHUwnsnkSVlVOpW0uCzTTQAsF4=";
          };

          nativeBuildInputs = [pkgs.autoPatchelfHook];
          buildInputs = [pkgs.stdenv.cc.cc.lib];

          sourceRoot = "calepin-x86_64-unknown-linux-gnu";

          installPhase = ''
            runHook preInstall
            install -Dm755 calepin $out/bin/calepin
            runHook postInstall
          '';
        };

        default = self.packages.${pkgs.stdenv.hostPlatform.system}.calepin;
      }
      else {
        calepin = throw "这个 flake 只固定了 x86_64-linux 的预编译 Calepin；其他平台请用 scripts/get-calepin.sh 安装。";
      });

    devShells = forAllSystems (pkgs: {
      default = pkgs.mkShell {
        packages = with pkgs; [
          typst # nixpkgs 里是 0.15.1，与笔记使用的 @preview 包匹配
          git
          rsync
          curl
        ];

        shellHook = ''
          echo "typst $(typst --version | cut -d' ' -f2)"
          if ! command -v calepin >/dev/null && [ ! -x "$PWD/.tools/calepin"* ]; then
            echo "提示：还没有 Calepin，运行 scripts/get-calepin.sh 安装。"
          fi
        '';
      };
    });
  };
}
