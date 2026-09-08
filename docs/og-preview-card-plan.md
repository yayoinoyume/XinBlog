# 文章分享预览卡片（Open Graph）实施方案

> 目标：把博客中任意一篇文章分享到 X / 微信等平台时，生成的预览卡片显示**该文章自己的标题、摘要和封面**，而不是网站 logo 与站点名。
> 本文档由复核子代理与人工交叉验证后定稿，作为执行子代理的落地依据。

---

## 1. 根因

本博客为 **Cloudflare Pages + 一个 `_worker.js` 同时托管**：前端 SPA 静态资源、`/api/v1/*` 接口、`/api/v1/media/*` 图片全由同一个 worker 在同源服务（`.env.example` 中 `VITE_API_BASE_URL` 留空=同源，`dist/` 内含 `_worker.js` + `index.html`）。

- `/post/:slug` 是**客户端路由**（`src/router/index.tsx`）。爬虫（如 X）GET `/post/:slug` 时，worker 把它当作静态 HTML 返回的就是同一份 `index.html` 壳。
- worker 对**所有** HTML 调用 `injectSiteMeta`（`public/_worker.js` 第 787 行）注入 OG 标签，但这些标签是**整站级**的：`og:title`=站点名、`og:description`=`shareDescription`、`og:image`=`shareImage||logo`。
- **没有任何按文章分发的逻辑**，文章标题/摘要/封面从未进入该响应 → 卡片恒显示站点 logo + 站点名。

证据：
- `index.html`：head 无任何 `og:` / `twitter:` 标签，仅 charset/icon/viewport/description/theme-color/manifest/title。
- `public/_worker.js`:
  - L787 `function injectSiteMeta(html, config, requestUrl)`——纯整站级，无 post 参数、无 slug 查询。
  - L8340-8355：`env.ASSETS` HTML 分支唯一调用点 `injectSiteMeta(html, site, request.url)`。
  - L795-796：`if (image.startsWith('data:')) image = '/logo.png';`（站点图兜底）。
- `public/_routes.json`：`include:["/*"]`、排除静态后缀 → `/post/:slug` 未被排除，走 worker → 落到 ASSETS HTML 分支。

---

## 2. 已核实的关键事实（决定写法）

| 事实 | 证据 | 结论 |
|---|---|---|
| `posts.cover_base64` 列名易误导，但**实际存的是 URL 字符串** | 前端 `src/pages/admin/Posts.tsx` L342 `coverBase64: media.url`（= `/api/v1/media/{id}`）；L390 `coverBase64: url`（`http(s)` 外链）；worker `createPost` L1447 / `updatePost` L1505 原样入库 `body.coverBase64` | 封面是真实 URL（相对 `/api/v1/media/{id}` 或绝对 http），**不是 base64 图片数据** |
| `uploadMedia` 返回真实 URL | `_worker.js` L1799 `{ id, url: '/api/v1/media/'+id, size }`；base64 只存在于 `media.base64_data` 表 | 封面可被爬虫直接取图 |
| `/api/v1/media/:id` 匿名可访问 | `_worker.js` L8157-8161：`GET /api/v1/media/` 未包 `requireAuth` | 爬虫能抓封面图 |
| 可行文章的按 slug 查询 | `getPost` L950：`SELECT ... FROM posts WHERE slug=? AND status='published'`，含 `title, excerpt, cover_base64` | 可直接复用 SQL |

> **注意**：一个子代理曾误判"cover_base64 是 base64"，已被上述代码路径证据推翻。执行时**不要**给封面强行加 `data:image/...;base64,` 前缀；仅当字段值确实以 `data:` 开头（极老数据兜底）才降级到站点图。

---

## 3. 改动范围

只改 **1 个文件**：`public/_worker.js`。分两处，均为小改。

### 3.1 修改 `injectSiteMeta`（~L787），新增可选 `post` 参数并支持文章级覆盖

- 函数签名：`function injectSiteMeta(html, config, requestUrl, post)`（`post` 可选，缺省时行为与现状完全一致 → 对首页/标签/关于等所有非文章页零影响）。
- 逻辑：
  - `title`：`post?.title` 优先，否则 `config.siteName`。
  - `description`：`post?.excerpt` 优先，否则 `config.shareDescription`。
  - `og:image` 解析顺序（新增内部小助手 `resolveAbsoluteImage`）：文章封面（若存在且非 `data:`）→ 站点 `shareImage||logo` → `/logo.png`；相对路径用 `origin` 拼成绝对地址；`data:` 一律视为无效降级。
- 其余标签（`og:url`、`og:type`、`twitter:card`、`theme-color`、manifest）维持原样。

建议新增小助手（纯函数，与 `escapeHtmlMeta` 同风格）：

```js
function resolveAbsoluteImage(image, origin) {
  if (!image || image.startsWith('data:')) return '';
  if (!image.startsWith('http')) image = origin + (image.startsWith('/') ? '' : '/') + image;
  return image;
}
```

`injectSiteMeta` 修改要点（关键差异行）：

```js
function injectSiteMeta(html, config, requestUrl, post) {
  const origin = new URL(requestUrl).origin;
  const title = escapeHtmlMeta(post && post.title ? post.title : (config.siteName || 'XinBlog'));
  const description = escapeHtmlMeta(post && post.excerpt ? post.excerpt : (config.shareDescription || ''));
  const themeColor = escapeHtmlMeta(config.pwaThemeColor || '#ffffff');

  let image = '';
  if (post && post.cover_base64) {
    image = resolveAbsoluteImage(post.cover_base64, origin)
      || resolveAbsoluteImage(config.shareImage || config.logo || '/logo.png', origin);
  }
  if (!image) image = resolveAbsoluteImage(config.shareImage || config.logo || '/logo.png', origin);
  if (!image) image = resolveAbsoluteImage('/logo.png', origin);
  image = escapeHtmlMeta(image);
  // ...原有 title/description/theme-color 的 replace 逻辑保持不变，
  //     metaTags 数组原样（og:url、twitter:* 不变），仅 title/description/image 已在上面按文章覆盖
}
```

### 3.2 修改唯一调用点（`env.ASSETS` HTML 分支，~L8343-8349）

在调用前解析路径，若是 `/post/:slug` 则查 D1 得到该文章并传入：

```js
let post = null;
const postMatch = url.pathname.match(/^\/post\/([^/]+)\/?$/);
if (postMatch) {
  const slug = decodeURIComponent(postMatch[1]);   // 注意 URL 解码
  post = await env.DB_POSTS.prepare(
    `SELECT title, excerpt, cover_base64 FROM posts WHERE slug = ? AND status = 'published'`
  ).bind(slug).first().catch(() => null);          // 查不到/异常 → null → 走整站兜底
}
const modifiedHtml = injectSiteMeta(html, site, request.url, post);
```

> 作用域说明：该分支所在 `fetch` 处理函数内已有 `url`、`method`、`path`、`env`、`request` 在作用域（L7971-7973 定义），可直接使用 `url.pathname`。`site` 已在上一行 `const site = await getSiteConfigObject(env)...` 取得。

### 3.3 明确不改的东西

- 不新增/不修改 `GET /api/v1/media/:id` 的鉴权与响应（保持公开）。
- 不新增独立"OG 图"接口：封面若已是 `/api/v1/media/{id}` 或 http(s) 外链，直接用即可。
- 不新增额外的 HTML 返回块；只在既有 HTML 注入点内做文章级覆盖，**避免产生重复的 `og:` 标签**。

---

## 4. 幂等与边界

- 非 `/post/...` 路径（含首页、`/tag/...`、`/about` 等）：`post=null`，`injectSiteMeta` 输出与改动前逐字节一致（保证回归安全）。
- `/post/不存在`:查询返回 null → 整站兜底（现行为）。
- 封面为 `data:`（罕见老数据）：降级站点图（不报错）。
- 封面为空：用站点 `shareImage`/`logo`。
- slug 含路径编码（中文/空格）：`decodeURIComponent` 后查询。
- 单次请求最多多 1 次 D1 读；不新增函数调用 → 免费额度基本无损。

---

## 5. 备份 / 自检 / 回滚

- **备份（先于修改）**：见执行清单。本项目为 git 仓库，且系统提示要求修改前备份。
  1. 优先 git：`git add public/_worker.js && git commit -m "backup: 修改前快照"`（仅目标文件）。
  2. 若非 git 或额外保险：复制到 `public/.backups/_worker.js.YYYYMMDD-HHMM.bak`。
  3. 执行后确认备份文件存在。
- **自检**：
  - `node --check public/_worker.js`（语法校验，必须通过）。
  - 若无 `node`，用项目内 Node（见 `package.json`）校验。
  - 回归 grep：确认 `injectSiteMeta` 签名与调用点两处一致、未引入第二个注入点。
- **回滚**：改坏时用备份文件覆盖还原 `public/_worker.js`。

---

## 6. 变更后部署与验证（后续步骤，非本文件改动范围）

- 重新构建并部署到 Cloudflare Pages（`npm run build` 后 `wrangler pages deploy dist` 或 CI）。**`dist/_worker.js` 由构建从 `public/_worker.js` 拷贝生成，需重新构建部署才能生效。**
- 验证（任选其一）：
  - `curl -s https://<你的域名>/post/<某已发布slug> | grep -o 'og:image[^>]*'`，确认输出该文章封面绝对 URL。
  - 用 X Card Validator / 微信"复制链接"预览，或第三方 OG 检查工具（如 opengraph.xyz）查看 `/post/:slug`。
- 确认非文章页 `curl .../ | grep og:title` 仍是站点名（未回归）。

---

## 7. 验收标准

1. `public/_worker.js` 通过 `node --check`。
2. `/post/:slug` 响应含该文章的 `og:title`（文章标题）、`og:description`（摘要）、`og:image`（封面绝对 URL，指向 `/api/v1/media/{id}` 或 http 外链）。
3. 非文章页 og 标签与改动前一致（站点级）。
4. `/post/不存在` 回退站点级，不报错。
5. 备份存在、可回滚。

---

## 8. 已追加实现：HTML 边缘缓存 + 四项 P2 加固（分支 feat/og-preview-card，d34b372 之后的改动）

- **缓存（方案 B / Cache API）**：`/post/:slug` 且 GET 时 `caches.default.match/put`，命中直接返回（0 次 D1、不重渲染）；仅“查到 published 文章且 200”才写入，`Cache-Control: public, s-maxage=300`；缓存键 = `origin + pathname`（去 query）。非文章页/404/回退/非 GET 一律不读不写。
- **P2-1 og:url 规范化**：向 `injectSiteMeta` 传 `canonicalUrl = url.origin + url.pathname`（去 query），与缓存键一致，避免固化首个请求的 query。
- **P2-2 put 接拒**：`ctx.waitUntil(caches.default.put(...).catch(() => {}))`。
- **P2-3 match 降级**：`caches.default.match` 包 try/catch，Cache API 异常时回退正常渲染，避免整页 500。
- **P2-4 主动清缓存**：新增 `purgePostCardCache(request, slug)`（对 `/post/<slug>` 与 `/post/<slug>/` 做 `caches.default.delete`）；在 createPost(发布时)、updatePost(清新旧 slug)、deletePost 调用，实现标题/封面/上下架即时生效与下架即清。

> 实测（mock env 驱动真实 worker.fetch）：缓存命中/未命中回退/非文章页不缓存/404 不缓存/方法约束 全部符合方案 B。待办仅剩生产环境的 real-dev 输出验证（需 wrangler）与真实 CF Cache 过期行为确认。

## 9. 待办/开放项（记录，不阻塞）

- 部署后若分享平台对旧 URL 有缓存，需等缓存过期或用调试工具强制刷新（非代码问题）。
- 若发现个别历史文章的 `cover_base64` 实为纯 base64（理论兜底存在），则该篇会降级为站点图；如需恢复需另行迁移为媒体 URL（不在本次范围）。
