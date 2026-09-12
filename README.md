# zzjrabbit.github.io

个人数学笔记的网站入口。内容来自 [zzjrabbit/notes](https://github.com/zzjrabbit/notes)（本地仓库在 `../tyle`），
本仓库负责**编译与呈现**：保留 Calepin + Typst 作为笔记编译器，由 Astro 7.3.2 + Starlight 0.42.0 提供站点外壳、导航、搜索、网页阅读与下载入口；订阅源沿用编译产物。

## 日常只维护 notes 仓库

在 `zzjrabbit/notes`（本地 `../tyle`）新增或修改笔记后，正常提交并推送到 `main` 即可。
notes 中的 `.github/workflows/publish-website.yml` 会通知网站的 `deploy.yml`；网站拉取 notes 默认分支的最新内容，自动同步、构建 HTML/PDF、更新首页/导航并发布 GitHub Pages。
**不需要在网站仓库新建文件、运行同步脚本或提交生成产物。** 多次推送可能合并为最新内容的一次发布。

### 一次性上线配置

正式发布前先逐项完成 [首次发布清单](DEPLOYMENT.md)，包括两个仓库的未提交内容、GitHub 设置、云端验收与回退方式。本地通过不代表已部署。

1. 将本网站代码（含 `.github/workflows/deploy.yml`）推送到 `zzjrabbit/zzjrabbit.github.io` 的 `main`；在 Settings → Pages → Source 选择 **GitHub Actions**。
2. 创建一个 fine-grained PAT：只选择网站仓库，Repository permissions 仅需 **Actions: Read and write**（Metadata 的只读权限自动附带）。
3. 在 **notes 仓库**的 Settings → Secrets and variables → Actions 中添加 secret `WEBSITE_DISPATCH_TOKEN`，值为上述令牌。不要提交令牌到源码。
4. 将 notes 中的 `.github/workflows/publish-website.yml` 提交并推送到 `main`。之后日常只推送 notes 即可。

如果实际网站仓库或分支不同，在 notes 的 Actions variables 设置 `WEBSITE_REPOSITORY`（默认 `zzjrabbit/zzjrabbit.github.io`）和 `WEBSITE_REF`（默认 `main`）；网站 `deploy.yml` 的 push 分支、站点 base-url 与版本检查 URL 也应相应调整。
网站仓库本地目前没有配置 remote，因此这些是按项目名称给出的默认值，并非已确认的远程部署。

没有令牌或令牌过期时，notes 的通知任务会明确失败；网站仍计划每 30 分钟检查一次公开 notes 仓库作为兜底，只有源码版本变化才重新发布。GitHub 定时任务可能延迟，也可能因仓库长期无活动而暂停，并非实时保证。
网站也支持在 Actions 手动运行。构建失败不会进入发布任务，已上线版本保持不变；notes 的通知成功只表示请求已接受，最终发布结果查看网站仓库的 Actions。
首次运行需验证 GitHub 环境中的构建和 Pages 配置；本地检查不能替代云端部署验证。

## 技术选型

| 环节 | 用的工具 |
| --- | --- |
| 站点外壳 | Astro **7.3.2** + Starlight **0.42.0**：导航、目录、浅/深色、移动菜单与 Pagefind 搜索 |
| 笔记编译 | [Calepin](https://vincentarelbundock.github.io/calepin/)：组织 Typst 页面并生成 HTML、PDF、源码与订阅源 |
| 排版渲染 | 官方 `typst` CLI（Calepin 只做编排，真正调用 `typst compile`） |
| 桥接 | `scripts/prepare-starlight.mjs`：提取正文、标题、目录与数学 CSS，复制静态资源 |
| 构建环境 | Node.js **>= 22.12**、npm；依赖版本由 `package-lock.json` 锁定 |
| 部署 | GitHub Actions + GitHub Pages |

笔记本身仍是标准 Typst 文档，Calepin 读取 `site/calepin.toml` 与页面内的 `<website-metadata>`。
它负责数学内容编译，不再负责最终网站的界面。构建流水线为：

```text
notes → site/ 同步副本 → Calepin + Typst → _calepin/
     → prepare-starlight.mjs → .generated/notes.json + .generated/public/
     → Astro + Starlight → _site/ → check-starlight.mjs
```

桥接器把 HTML 正文、标题、描述、目录锚点、源码与数学 CSS 写入 `notes.json`，
将 PDF、文章 `.typ`、订阅源等非 HTML 静态产物复制到 `.generated/public/`，补齐 Atom 作者并合并手写 `public/` 资源；排除 Calepin 内部元数据、旧首页/404 模板、旧 sitemap/robots 和 Pagefind 索引。最终 sitemap 由 Astro 统一生成。
正文以 HTML 片段交给 Astro，**不经过 Markdown/MDX 转换**，保留原生 MathML、SVG 和定理语义标记，不引入 MathJax。
Astro 重新生成首页、笔记外壳、404 与搜索索引，PDF 直接复制、不重新排版；构建后的校验器检查其与 `_calepin/` 中的 PDF 逐字节一致。
已有 `typ/topology/continuous.html` 及对应 `.pdf`、`.typ` URL 保持不变。

## 目录结构

```
astro.config.mjs           # 最终站点配置、分组导航、Starlight 集成与输出路径
package.json / package-lock.json  # Node 依赖与构建/检查命令
src/
├── pages/index.astro      # 首页、分类卡片
├── pages/[...note].astro  # 笔记页面：Starlight 外壳 + Typst HTML + PDF/源码入口
├── components/Footer.astro # 版权页脚
└── styles/notes.css       # 当前网站的配色、布局、正文与数学环境样式
site/                      # Calepin 编译源目录，不是最终界面源目录
├── calepin.toml           # 笔记编译、PDF/源码与订阅源配置
├── index.typ / 404.typ    # Calepin 中间页；不作为最终首页/404 发布
├── themes/site/           # 保留编译适配；旧 CSS/导航脚本不再控制最终界面
│   ├── notes.typ          # 定理环境与 CeTZ 网页适配，PDF 保留原样
│   ├── js/math.js         # 由 Astro 页面导入的 MathML 滚动增强
│   └── layouts/pdf.typ    # 让笔记自己的排版决定 PDF
├── typ/                   # ← 从 notes 仓库同步进来，不入库
├── models/                # ← 同上
└── lean/                  # ← 同上
scripts/
├── sync-notes.sh          # 把笔记仓库同步到 site/ 并注入网页适配
├── get-calepin.sh         # 安装固定版本的 Calepin（NixOS 会自动修 interpreter）
├── build.sh               # 同步 → _calepin/ → npm run build:web → _site/
├── prepare-starlight.mjs  # 桥接 Calepin 正文与静态资源
├── check-starlight.mjs    # 构建后校验 URL、链接、MathML/SVG、PDF 与搜索产物
├── check-rendering.sh     # 定理/证明、MathML 与 CeTZ SVG 静态抽查
├── browser-check.mjs     # Playwright 浏览器回归，不启动服务器
├── watch-notes.sh         # 轮询源笔记与网站源码，串行构建
└── serve.sh               # 构建后用 Calepin 静态服务器预览 _site/
public/                    # 手写 favicon/robots，桥接时合并到 .generated/public
DEPLOYMENT.md              # 首次上线确认、验收和回退清单
scripts/validate-release.mjs # 全站资源、锚点、canonical/sitemap/Atom 发布检查
tests/                     # npm run check 执行的 Node 测试（同步测试需 bash/rsync/perl）
_calepin/                  # Calepin 中间编译产物，不入库
.generated/
├── notes.json             # 提取出的笔记元数据与正文，不入库
└── public/                # 交给 Astro 原样发布的静态文件，不入库
_site/                     # 唯一最终发布目录，不入库
```

**为什么笔记要同步到 `site/` 根部**：笔记之间存在相对导入（`../shared.typ`）和
根相对导入（`/typ/shared.typ`），只有保持仓库原始结构、并且把该结构放在 Typst 根目录下才能解析。
Calepin 也不会跟随符号链接目录做页面扫描，所以必须真实拷贝，不能 `ln -s`。

## 本地开发

```sh
nix develop                 # 提供 typst / Node.js 22 / npm / git / rsync / curl / Perl
scripts/get-calepin.sh      # 首次：下载固定版本的 Calepin 到 .tools/
npm ci                      # 首次或锁文件更新后安装依赖；在仓库根目录运行

scripts/build.sh            # 同步 + Calepin 编译 + Astro 构建与校验 → _site/
scripts/serve.sh            # 构建并用现有 Calepin 静态服务器打开本地预览
```

不用 Nix 时需自行安装 **Node.js >= 22.12**、npm、Typst >= 0.15 以及上述命令行依赖。
`build.sh` 不会每次执行 `npm ci`；CI 使用 Node 22 和 npm 缓存，在构建前单独安装锁定依赖。
`.npmrc` 将 npm 缓存放在 `.cache/npm`。
已有完整 `_calepin/` 时，修改 Astro 界面后可运行 `npm run build:web`，只重新桥接、构建网站并校验；
改动笔记或 Typst 适配层后应运行完整的 `scripts/build.sh`。
`.generated/` 会在桥接时重建，不能放手写文件。

笔记仓库默认取 `../tyle`，也可以用环境变量指定：

```sh
NOTES_DIR=/path/to/notes scripts/build.sh
```

## 新增一篇笔记

1. 在笔记仓库里正常写 `typ/<分类>/<名字>.typ`，标题/日期之外再给 `tylenotes` 传 `tags` 和 `summary`。
2. 在 notes 仓库提交并推送到 `main`。自动发布完成后，它会出现在首页和导航里，无需操作本网站仓库。

笔记里**没有任何网站相关的判断**，全部包在 `typ/shared.typ` 的 `tylenotes` 里，笔记只写一次调用：

```typ
#show: tylenotes.with(
  title: "Continuity",
  date: "2026-08-11",
  tags: ("topology", "lean"),
  summary: "一句话摘要，用于首页列表与 feed。",
)
```

`typ/shared.typ` 负责所有分支逻辑：

| 它做的事 | 为什么需要判断 |
| --- | --- |
| 产出 `<website-metadata>`（title/date/tags/summary） | 只有 Calepin 构建时会读它；普通编译时只是个不可见元素 |
| 网页版调用内置 `title()` 排 H1 | noteworthy 的标题只存在于分页输出，HTML 导出会丢掉它 |
| 分页版**不**调用 `title()` | 否则 PDF 会多出一整页标题页（实测过） |
| `set document(title: ...)` | 内置 `title()` 需要它；顺带让 PDF 的 Title 元数据正确 |

判断依据是 `sys.inputs` 里的 `calepin-target`，`shared.typ` 把它导出成 `is-web()`；
网站专用的 CeTZ 适配也只作用于 HTML 分支。**直接用 `typst` 编译时该键不存在**，
于是所有网站相关分支都不触发，笔记仍可脱离网站单独编译。

分类由**目录名**自动得出（`typ/topology/...` → 拓扑），不需要手写。
不需要 `slug`：页面 URL 直接沿用仓库路径（`typ/topology/continuous.html`），
这样和 `lean/` 下的形式化文件一一对应。

## 网页阅读主题

最终界面由 **Starlight** 提供导航、响应式菜单、本页目录、主题切换与搜索；
`src/pages/` 负责首页与笔记页面，`src/styles/notes.css` 负责「暖纸 / 赤陶 / 墨色」手札主题、正文衬线字体及数学环境样式。首页提供学科锚点索引、笔记计数和整卡阅读入口；深色模式使用暖墨底色，并支持键盘焦点与减少动态效果偏好。
分组导航在 `astro.config.mjs` 中生成，页脚提供 `/atom.xml` 订阅入口。旧的 Calepin 主题 CSS、导航脚本及 `site/index.typ` 不再控制最终网站外观。

数学继续使用 Typst 原生 MathML，**不重写公式内容、不引入 MathJax、不改笔记 PDF**。
`site/themes/site/js/math.js` 作为保留的数学增强，由 Astro 笔记页面导入；它为行间公式与超宽行内矩阵添加滚动容器，
只有确实溢出的容器才进入 Tab 顺序，字体加载或窗口变化后重新检测。禁用 JavaScript 时保留基础行间公式滚动样式。
笔记顶部提供 **PDF 阅读/下载** 与 **Typst 源码下载**链接，正文下方用原生 `<details>` 展开源码；
不再使用旧主题的 HTML / Source / PDF 三向选择器。源码展示与下载来自同步编译副本，权威原文仍在 notes 仓库。

### 检查与回归

在仓库根目录运行：

```sh
npm run check                        # Node 测试（桥接逻辑等），无需浏览器
scripts/build.sh                     # 完整构建；build:web 已包含 check-starlight.mjs
scripts/check-rendering.sh            # 对 _site/ 抽查定理/证明、MathML 与 CeTZ SVG
node scripts/browser-check.mjs       # 对已构建的 _site/ 运行浏览器回归
# 找不到系统 Chromium 时指定可执行文件：
CHROMIUM_BIN=/path/to/chromium node scripts/browser-check.mjs
```

浏览器脚本需要已安装的 Chromium（默认查找 `chromium` 或 `chromium-browser`）及 `npm ci` 安装的 Playwright 依赖。
它拦截 `https://notes.test/` 的**虚拟请求**，直接返回本地 `_site/` 文件，**不启动 HTTP 服务器**，也不替换已有预览服务。
脚本覆盖五种视口宽度（320/390/768/1024/1440px）、首页与代表性长文、移动菜单/Escape、浅深色、搜索及页面错误，
截图写入 `.generated/screenshots/`（下次桥接会清理）。
本次迁移已完成完整 `scripts/build.sh`、`npm run check`、`scripts/check-rendering.sh` 与浏览器回归：
五种宽度下的首页、李群与实分析长文，以及移动菜单/Escape、主题切换、实际搜索均已通过。
这不替代后续改动的重新检查，也不代表 GitHub Pages 云端部署已验证。

人工回归还应覆盖全部笔记、目录锚点、键盘 Tab、源码展开/下载与 PDF 链接；
长公式应在自己的区域滚动而不是撑宽整页。
不要直接修改 `_site/`、`_calepin/` 或 `.generated/`：持久的 UI 修改应放在 `src/` 与 `astro.config.mjs`，数学编译适配才修改 `site/themes/site/notes.typ` 等对应文件。

## 数学环境与日常更新

`site/themes/site/notes.typ` 是网站专用适配层：同步时自动注入到笔记副本，**不修改 `NOTES_DIR` 中的原文**。
定理、引理、命题保留绿色强调，定义/例题使用蓝色，注记使用赭色，证明使用低对比侧线。
编号、交叉引用和 QED 仍由 theoretic 管理；PDF 分支使用原来的渲染器。
CeTZ 画布仅在 HTML 分支包进 `html.frame`，以 SVG 保留，PDF 不受影响。
公式仍是可访问的原生 MathML；`src/styles/notes.css` 提供公式滚动、留白与数学环境样式，溢出检测和焦点增强由数学脚本负责。
表格、代码等阅读样式也由 Astro/Starlight 与 `src/styles/notes.css` 统一管理。这些源码文件不会被笔记同步覆盖。

以下脚本只是**可选的本地开发工具，不是日常发布的必要步骤**。直接在 notes 仓库使用编辑器新增 `.typ` 并推送即可。

可选：用模板脚本新建笔记（写入源仓库，而不是下次会被覆盖的 `site/typ/`）：

```sh
scripts/new-note.sh topology/compactness "紧致性" \
  --tags topology --summary "紧致性的定义与基本性质"
# 可用 NOTES_DIR=/path/to/notes 指定源仓库；已有文件不会被覆盖。
```

保存后持续构建：

```sh
scripts/watch-notes.sh
# 监控源笔记、site/、src/、scripts/ 与 Astro/npm 配置，变化后串行执行 build.sh；Ctrl-C 退出。
# 不监控同步副本、_calepin/、.generated/、_site/，避免生成文件触发循环。
# 此命令不启动服务器。在已有网站预览地址刷新查看结果。
```

只需构建一次时仍运行 `scripts/build.sh`。新文章的分类、首页和导航继续自动生成。
不要直接编辑同步目录；网站外观改 `src/`，导航和站点配置改 `astro.config.mjs`，数学内容改源仓库，编译适配改 `site/themes/site/notes.typ`。
同步需要 Perl（由 `nix develop` 提供），并使用内容校验恢复上轮已注入的副本，避免重复适配。

## 已知限制

- 构建可能提示 `docs` / `i18n` 内容集合为空：本站通过自定义 Astro 路由调用 `StarlightPage`，正文来自 `.generated/notes.json`，而不是这两个内容集合。这是当前架构下已知且无害的警告，不影响页面生成与搜索；不要将其他构建警告或错误也视为可忽略。
- 网页适配当前针对 `noteworthy:0.4.0` / `theoretic:0.3.1` 与 `cetz:0.5.2`；升级笔记依赖时需同步检查 `site/themes/site/notes.typ`。
- 同步器识别单行的 noteworthy / CeTZ 导入，并在其后注入适配导入；改用别名调用（如 `cetz.canvas`）或多行导入时，需要扩展适配机制。发布的源码展开区与 `.typ` 下载展示同步副本，原始可独立编译源码仍以 notes 仓库为准。
- **Calepin 很年轻**（当前 v0.0.57，单一维护者），所以版本在本仓库里是锁定的；
  源文件全是标准 Typst，将来换工具成本很低。
- **上游的 nix flake 目前是坏的**（源码包缺 `calepin-docs/Cargo.toml`，`nix run` 直接失败），
  因此本仓库自己固定预编译二进制。

## 版权

笔记内容 © zzj，采用 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)；
本仓库的站点代码采用 MIT。
