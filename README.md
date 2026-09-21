# EazyOPC ComicBoard · 在线漫画分镜画板与连环草稿制作工具

- **生产域名**: `https://comicboard.eazyopc.com`
- **功能定位**: 面向漫画家、分镜师、二次元画师、Webtoon 条漫创作者与 AI Agent 协同者的轻量在线漫画分镜画板（Manga Storyboard / Comic Strip Maker）。内置四格漫画、日漫 B5 出血线原稿、对白气泡框、G 笔与网点喷枪，支持无限多页分镜管理、画板自由平移拖拽与单份多页 PDF / 矢量 SVG 导出。

---

## 🌟 核心特性
- **7 国语言国际化 (i18n)**: 简体中文、English、日本語（ネイティブ漫画用語）、한국어、Deutsch、Español、Français；
- **画板自由平移拖动 (Canvas Drag & Pan)**: 抓手工具 (H)、长按空格键平移、鼠标中键拖拽、触控板双指滑动；
- **经典漫画分镜格模板**: 四格漫画 (4-Koma)、日漫标准 6 格、Webtoon 手机垂直条漫、自由分割分镜框；
- **专业对白气泡框 (Speech Balloons)**: 椭圆对话框、尖角呐喊框、思维云朵框、矩形旁白框，带可拖拽指向尾巴；
- **日漫专属笔刷体系**: 漫画 G 笔 (动态尖锐压感)、丸笔 (细线发丝)、分镜蓝铅笔、水彩软笔、排线笔、网点喷枪；
- **Figma 级变换盒**: 8 方向手柄、360° 旋转连杆、悬浮操作胶囊；
- **无限多页漫画分镜管理**: 一键加页翻页，独立笔画与撤销栈，一键导出完整连贯多页 PDF；
- **AI Agent 协同创作指南**: 完美支持与 Claude、Codex、Antigravity 进行 SVG 漫画分镜代码联动；
- **商业变现与合规**: Google AdSense `ca-pub-6499357447763670`、ads.txt、GSC 验证与 Creem $4.99 终身买断。

---

## 🚀 部署指南 (Cloudflare Pages)

1. 在 GitHub 建立公开仓库并推送：
   ```bash
   cd /Users/huafire777/Desktop/program/comicboard
   git init
   git add .
   git commit -m "feat: initial commit for comicboard"
   gh repo create comicboard --public --source=. --remote=origin --push
   ```
2. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)：
   - **Workers 和 Pages** -> **创建应用程序** -> **Pages** -> **连接到 Git**；
   - 选中 `comicboard` 仓库；
   - **构建预设**: `None`（纯静态项目）；
   - 点击 **保存并部署**。
3. 在自定义域绑定 `comicboard.eazyopc.com`，并在 DNS 控制台加一条 CNAME 记录即可！
