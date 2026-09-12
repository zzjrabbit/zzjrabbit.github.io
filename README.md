# zzjrabbit.github.io

个人数学笔记的网站入口。内容来自 [zzjrabbit/notes](https://github.com/zzjrabbit/notes)（本地仓库在 `../tyle`），
本仓库只负责**呈现**：导航、分类入口、网页阅读、PDF 下载、订阅源。

## 技术选型

| 环节 | 用的工具 |
| --- | --- |
| 站点生成 | [Calepin](https://vincentarelbundock.github.io/calepin/)（Typst 原生 SSG，Rust 单文件二进制） |
| 排版渲染 | 官方 `typst` CLI（Calepin 只做编排，真正调用 `typst compile`） |
| 部署 | GitHub Actions + GitHub Pages |

笔记本身是标准 Typst 文档，Calepin 通过 `calepin.toml` + 页面内的 `<website-metadata>` 把它们组织成站点。
每篇笔记同时产出 **HTML**（网页阅读，数学用原生 MathML，不需要 MathJax）和 **PDF**
（就是现有的 `noteworthy` 排版，经核对与原文件逐字节一致）。

## 目录结构

```
site/                      # Calepin 的网站源目录
├── calepin.toml           # 站点配置：标题、base-url、主题、导航、feed、搜索
├── index.typ              # 首页：按分类列出所有笔记（纯 Typst 循环 calepin.pages()）
├── 404.typ
├── themes/site/           # 本地主题：继承内置主题，只覆盖 CSS 与 PDF 版式
│   ├── theme.toml
│   ├── css/overrides.css  # CJK 字体回退等
│   └── layouts/pdf.typ    # 只输出 {{ doc.body }}，让笔记自己的排版决定 PDF
├── typ/                   # ← 从 notes 仓库同步进来，不入库
├── models/                # ← 同上
└── lean/                  # ← 同上
scripts/
├── sync-notes.sh          # 把笔记仓库同步到 site/
├── get-calepin.sh         # 安装固定版本的 Calepin（NixOS 会自动修 interpreter）
├── build.sh               # 同步 + 编译 → _site/
└── serve.sh               # 构建 + 本地预览
```

**为什么笔记要同步到 `site/` 根部**：笔记之间存在相对导入（`../shared.typ`）和
根相对导入（`/typ/shared.typ`），只有保持仓库原始结构、并且把该结构放在 Typst 根目录下才能解析。
Calepin 也不会跟随符号链接目录做页面扫描，所以必须真实拷贝，不能 `ln -s`。

## 本地开发

```sh
nix develop                 # 提供 typst / git / rsync / curl
scripts/get-calepin.sh      # 首次：下载固定版本的 Calepin 到 .tools/

scripts/build.sh            # 同步笔记 + 构建到 _site/
scripts/serve.sh            # 构建并打开本地预览
```

笔记仓库默认取 `../tyle`，也可以用环境变量指定：

```sh
NOTES_DIR=/path/to/notes scripts/build.sh
```

## 新增一篇笔记

1. 在笔记仓库里正常写 `typ/<分类>/<名字>.typ`，并在文件里带上站点元数据（见下）。
2. 跑 `scripts/build.sh`。它会自动出现在首页和导航里，无需改本仓库任何配置。

笔记里需要的那一小段元数据（放在 `#show: tylenotes.with(...)` 之前）：

```typ
#set document(title: [Continuity])
#metadata((
  title: "Continuity",
  date: "2026-08-11",
  tags: ("topology", "lean"),
  summary: "一句话摘要，用于首页列表与 feed。",
)) <website-metadata>
#if sys.inputs.at("calepin-target", default: "") == "html" { title() }
```

说明：

- `title` / `date` / `tags` / `summary` 供首页列表、feed 和导航使用；分类由**目录名**自动得出
  （`typ/topology/...` → 拓扑），不需要手写。
- 最后一行是给网页版显示 H1 用的。`sys.inputs` 只在 Calepin 构建时才带 `calepin-target`，
  所以在仓库里直接 `typst compile` 时它什么都不做 —— 笔记仍然可以脱离网站单独编译（已验证）。
- 不需要 `slug`：页面 URL 直接沿用仓库路径（`typ/topology/continuous.html`），
  这样和 `lean/` 下的形式化文件一一对应。

## 已知限制

- **cetz 图形不进网页版**：`typ/lie/cover_linear.typ` 里的 cetz 画布在 HTML 导出中会被丢弃，
  PDF 版正常。修法是把画布包进 `html.frame(...)`，但 `html.frame` 在 PDF 模式下不存在，
  必须配合上面的 `calepin-target` 判断使用。
- **定理框样式**：`noteworthy` 的定理/证明框在 HTML 里会退化成无 class 的 `<div>`，
  内容与编号都在，但边框底色丢失。要还原需在 `typ/shared.typ` 提供 HTML 分支。
- **Calepin 很年轻**（当前 v0.0.57，单一维护者），所以版本在本仓库里是锁定的；
  源文件全是标准 Typst，将来换工具成本很低。
- **上游的 nix flake 目前是坏的**（源码包缺 `calepin-docs/Cargo.toml`，`nix run` 直接失败），
  因此本仓库自己固定预编译二进制。

## 版权

笔记内容 © Zeng Zhenjia，采用 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)；
本仓库的站点代码采用 MIT。
