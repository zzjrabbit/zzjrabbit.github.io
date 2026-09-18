# GitHub Pages 首次发布清单

目标：`https://zzjrabbit.github.io/`，网站仓库预期为 `zzjrabbit/zzjrabbit.github.io`，分支 `main`。
本次只完成本地审查、修复与验证，没有配置 remote、提交、推送或触发部署。

## 当前结论

本地版本可进入首次云端发布验收，但还不能称为「已上线」或「云端验证通过」。

已通过：
- 完整 notes 同步 → Calepin/Typst → Astro 构建与数学渲染检查。
- 从待提交源码复制出的独立干净目录执行 `npm ci --ignore-scripts`，再完整构建；没有复用旧站点产物。
- 19 项 Node 测试，涵盖轨道模型（轨道归属的五级判定、空轨道、侧边栏三层结构）、栏目模型（学科识别、排序、学科页 URL、可选 `subject.json`）、元数据解析、数学桥接、资源/锚点/sitemap 发布门禁、同步幂等与删除分类。
- 浏览器检查：320 / 390 / 768 / 1024 / 1440px、长文、手机菜单/Escape、44px 导航点击区域、深浅主题与实际搜索、每条轨道页与轨道侧边栏入口。
- `actionlint` 检查网站 GitHub Actions 配置。
- `npm audit --omit=dev --audit-level=moderate` 当前报告 0 个已知漏洞（不等于完整安全审计）。

干净目录演练仍使用本机已有 Calepin、Typst 工具链和**本地** notes 工作树；并未验证 Ubuntu runner 的首次工具下载或 GitHub 远端笔记版本。

## 发布前必须由维护者确认

- [ ] 网站仓库确实为 `zzjrabbit/zzjrabbit.github.io`，作为根站点发布。如果是项目站点或自定义域名，先调整 Astro site/base、robots、Calepin base-url、发布修订号检查地址，不要直接套用本配置。
- [ ] 先检查并提交 notes 仓库的修改。审查时 `../tyle` 的 shared.typ、5 篇笔记和通知 workflow 有未提交改动；CI 拉的是远端版本，**看不到这些本地修改**。
- [ ] 审阅本网站的所有待提交文件，包括新建的 `src/`、`public/`、`scripts/`、`tests/`、npm 锁文件和 `.github/workflows/deploy.yml`。不要只提交样式，也不要提交 `_site/`、`_calepin/`、`.generated/`、缓存或令牌。
- [ ] 网站本地目前没有 remote。确认仓库归属后再配置 remote、提交与推送；推送 `main` 会触发上线流程。
- [ ] GitHub Settings → Pages → Source 选择 **GitHub Actions**；允许 Actions 运行，检查 `github-pages` 环境保护规则。
- [ ] notes 仓库的 `WEBSITE_DISPATCH_TOKEN` 仅授予目标网站仓库 **Actions: Read and write**，在 GitHub Secrets 中填写，不放进文件或聊天。网站 workflow 必须已存在于目标分支，通知才能成功。
- [ ] 确认数学正文、单篇下载源码、注释与 PDF 都允许公开；闭合源码面板不是保密机制。

## 本次修复与持续发布门禁

- 根 favicon 与持久 `public/` 资源目录；桥接不再公开 Calepin 内部 manifest 和旧首页/404 模板。
- 统一首页 `/`（轨道面板 + 按轨道分组的学科卡片封面）、完整索引 `/notes.html`（轨道 → 学科两级）、自动生成的轨道页 `/tracks/*.html`、自动生成的学科页 `/subjects/*.html`、文章 `.html` canonical 与 sitemap；robots 使用唯一 sitemap-index。
- 数学、物理与计算建模是三条并行轨道：轨道归属由笔记仓库表达（`subject.json` 的 `track`、`phys/` 与 `models/` 目录约定、目录名关键词兜底），新增目录即新增栏目，不再有硬编码分类或兜底分类；暂时没有笔记的轨道照常发布并显示占位说明。
- 栏目（学科）由笔记仓库目录自动生成；笔记的日期/标签来自 Calepin 页面索引，缺失时回退解析笔记源码。
- 404 添加 `noindex, follow`。
- 现有英文文章正文标记 `lang=en`，导航保持中文；下载明确说明只有单文件，完整编译需要笔记仓库。
- 构建校验覆盖首页、完整索引、每条轨道页、每个学科页、404、文章、本地 head 资源、页面及跨页锚点、重复 ID、canonical/sitemap，并要求每篇笔记都有日期、所属轨道与学科，以及唯一的索引/学科页位置。
- CI 增加 Playwright Chromium 浏览器门禁，在上传 Pages 产物之前执行；失败时保留截图 7 天。构建 job 最长 30 分钟，checkout 不持久保存凭据。
- 上游删除整个可选分类后，同步器删除旧副本，防止旧内容继续发布。

## 首次上线验收

1. 在网站仓库 Actions 确认 build 和 deploy 均成功；通知 workflow 成功仅表示请求已接受。
2. 打开真实 `https://zzjrabbit.github.io/`，检查桌面/手机导航、深浅主题和站内搜索。
3. 检查 `/notes.html`、各 `/tracks/*.html` 与各 `/subjects/*.html`：轨道分组、计数、侧边栏的轨道/学科分组与学科页计数是否与笔记仓库目录一致（空的 Physics 轨道应显示占位说明而不是消失）。
4. 检查每篇 `.html`、PDF、单文件 `.typ`、`favicon.svg`、`robots.txt`、`sitemap-index.xml` 及其子 sitemap。
5. 检查随机不存在路径真正返回 HTTP 404，而不是内容为错误页的 HTTP 200；确认 `/404.html` 的 noindex 元标记。
6. 检查 HTTPS、规范 URL 与重定向终点，没有旧缓存/旧主题；核对 `build-revision.txt` 与此次网站和笔记提交 SHA。
7. 在 notes 提交一次有意义的小改动，验证通知 → 网站构建 → 线上内容更新的完整链路。

建议用浏览器 Network 面板或 `curl -I` 核对 HTTP 状态。本地 Playwright 的虚拟请求验证不能替代真实 GitHub Pages HTTP 验收。

## 回退与已知限制

- 构建/浏览器门禁失败时不会进入 deploy，已发布版本保持不变。首次构建失败则尚无可用发布。
- 若需回退，分别检查网站和 notes 两个仓库，撤回引入问题的提交，再触发网站构建；仅重跑旧网站任务仍可能拉到最新 notes。
- 计划任务每两周检查 revision：以 2026-09-14 为基准，隔周一 UTC 04:17（北京时间 12:17）；每周仅运行轻量日期判断，非检查周跳过构建。push 和 workflow_dispatch 不受隔周限制。GitHub 可延迟或暂停定时任务，不保证准点。
- `docs`/`i18n` 空集合警告来自自定义 Starlight 路由，当前不影响构建；其他警告不能一概忽略。依赖安装有 whatwg-encoding 弃用提醒，暂未改动传递依赖。
- 正文语言当前根据已核实的四个英文学科目录映射；新增中文文章或混合语言时需在页面逻辑中复核，后续宜改为权威文章元数据。
- Calepin 版本固定，但下载脚本尚未加入经上游核对的归档校验和；第三方 Actions 当前按主版本 tag 引用。若提高供应链要求，可进一步固定经验证的 SHA/归档摘要，不应伪造校验值。
