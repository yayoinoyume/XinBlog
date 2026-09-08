# CF 代理 OG 图：受控图片代理端点 + og:image 改写 实施方案

> 状态：**已评审通过**（2026-09，用户确认并增加「回源限流」），转交给执行子代理严格照做。本文档是 `docs/og-preview-card-plan.md` 的后续演进：前者解决了「文章卡片标题/摘要/封面」，本文档解决「封面为海外不可达的阿里云 OSS 外链时卡片无图」。
> 分支：`feat/og-preview-card`，工作目录 `/home/yayoi/projects/XinBlog`。
> 只改动 **1 个文件**：`public/_worker.js`。**不得**修改本文档以外的任何文件。

---

## 1. 根因与目标

### 1.1 根因
- 博客是 **Cloudflare Pages + 单个 `public/_worker.js` 同源托管**：SPA 静态资源、`/api/v1/*`、`/api/v1/media/*` 全部由同一 worker 在同源服务（生产域 `https://blog.yayoi.love`）。
- 后台允许粘贴任意 `http(s)` 外链作为文章封面（`src/pages/admin/Posts.tsx` L390 `coverBase64: url`），常见就是阿里云 OSS 外链，如：
  `https://oss.yayoi.love/blog/image/20260904190746436.jpg`
- `oss.yayoi.love` 域名 CNAME 指向**中国大陆**阿里云昆仑 CDN。海外社交平台抓取器（X 等）的 IP/UA 常被源站服务器防火墙挡（返回 403）→ 生成的分享卡片**「有卡片无图」**。
- 当前 `injectSiteMeta`（`public/_worker.js` L793）直接把 `og:image` 写成原始绝对 URL，没有任何代理改写。

### 1.2 目标
1. 让 `og:image`（以及 `twitter:image`）指向 **Cloudflare 侧（`blog.yayoi.love`）**，由 worker 在 CF 出站 `fetch` 拉取原始 OSS 图再输出，保证海外爬虫能取到图。
2. 新增**受控**图片代理端点：只代理白名单域名内图片，**不**做成任意 URL 的开放代理。
3. 代理结果命中 CF 边缘缓存（Cache API），减少回源与额度消耗。
4. 顺带：`og:description` 超过 200 字符时安全截断，消除 X/通用预览的警告。

### 1.3 关键前提（必须先验证，否则方案不成立）
> 本方案成立的前提是：**CF 边缘出站 `fetch` 能访问中国大陆阿里云昆仑 CDN**（即被防火墙挡的是「海外平台爬虫 IP/UA」，而非「一切海外出口」）。
> 上线前**务必先用一次真实出站探测验证**（见 §8.2），若 CF 出站也被大陆防火墙挡，则需先落备用方案（OSS 公共读 / OSS 境外 endpoint / 回源到 CF R2 镜像），否则代理端点本身也取不到图。
> 即便代理失败，也要**回退到原始图 URL**（§5.4），保证绝不因代理而让卡片缺图。

---

## 2. 现状关键事实（已核实，供执行对照）

| 项 | 位置 | 事实 |
|---|---|---|
| `export default { async fetch(request, env, ctx) }` | 文件尾 | 单 worker 总入口；顶部 `import { connect } from 'cloudflare:sockets'` |
| 路由分发 | ~L8025-8280 | 逐条 `if (method==='GET' && path===...) return await handler(...)`；全局 `OPTIONS` CORS；`checkEnv` 环境校验 |
| `injectSiteMeta(html, config, requestUrl, post)` | L793 | 唯一 OG 注入点；`post` 可选 |
| `resolveAbsoluteImage(image, origin)` | L787 | `data:`→`''`；非 http→`origin` 前缀拼绝对 |
| injectSiteMeta 的 image 解析链 | L800-805 | `post.cover_base64` → `config.shareImage||logo` → `/logo.png` 逐级兜底 |
| 唯一调用点 | ASSETS HTML 分支 ~L8403 | `canonicalUrl = url.origin+url.pathname` 传入；`site` 已取得；`env` 在作用域 |
| HTML 边缘缓存（Cache API） | ~L8383-8420 | 键=`new Request(origin+pathname)`；仅 GET 且 `/post/:slug` 且命中 published && 200 才 put；`Cache-Control: public, s-maxage=300`；put/match 均 try/catch 降级 |
| `purgePostCardCache(request, slug)` | L1447 | delete `/post/:slug` 与 `/post/:slug/`；createPost(发布)/updatePost(新旧 slug)/deletePost 调用 |
| `GET /api/v1/media/:id` `getMedia` | L8157 / ~L1916 | 公开无鉴权；Cache API 键=整个 URL；`Cache-Control: public, max-age=86400`；`X-Content-Type-Options: nosniff` |
| 已有 `/api/v1/proxy-image` `proxyImage` | L7952 | query `?url=`；**硬编码**白名单 hostname（i.ytimg.com 等 5 个，**不含 oss.yayoi.love / *.aliyuncs.com**）；默认 redirect follow；仅设 `Cache-Control` 头、**未显式用 Cache API**；无大小上限、无 IP 校验 |
| `ALLOWED_IMAGE_MIME` | L1811 | `image/jpeg, png, gif, webp, avif, bmp` |
| `wrangler.toml` | 23 行 | 仅 4 个 D1 绑定，**无 `[vars]`** |
| 默认配置 | `defaultSiteConfig` L655 | `shareImage: ''`（站点级图可为空） |
| 封面存储 | `posts.cover_base64` | 实际存 **URL 字符串**（相对 `/api/v1/media/:id` 或 http(s) 外链），非 base64 图片数据（见 og-preview-card-plan §2） |

**关键观察**：已存在 `/api/v1/proxy-image`（受控白名单代理），但白名单不含 OSS、无缓存、无 SSRF 加固。本文档**新增独立端点** `/api/v1/og-img`，抽公共核心函数，不合并既有 `proxy-image`（保持各自用途与白名单，避免扩大开放面）；同时把 OSS 白名单与 SSRF/缓存加固做成可复用核心。

---

## 3. 设计决策总览

| 决策点 | 结论 |
|---|---|
| 端点路径 | `GET /api/v1/og-img?u=<encodeURIComponent(原始图绝对URL)>`（query 式） |
| 白名单 | 代码常量（仅 `oss.yayoi.love` 精确主机；泛后缀已清空）+ 可选 `env.IMG_PROXY_EXTRA_HOSTS` 扩展；需额外域时经 `IMG_PROXY_EXTRA_HOSTS` 加入 |
| SSRF 防护 | protocol 仅 http(s)；hostname 白名单（精确主机 + env 扩展）；重定向**每跳重新校验**；可选 DNS/IP 私网过滤（`IMG_PROXY_ENABLE_IP_CHECK`） |
| 大小上限 | `IMG_PROXY_MAX_BYTES` 默认 5MB，超限 502 |
| 边缘缓存 | Cache API，键=完整请求 URL；仅缓存 200 且 `image/*`；`Cache-Control: public, max-age=86400, s-maxage=604800`；错误不缓存 |
| og:image 改写 | 在 `injectSiteMeta` 内对最终绝对 image 统一改写：非本站域且在可代理白名单 → 代理端点地址；本站域/相对路径/非白名单外链保持不变 |
| 摘要截断 | 新增 `truncateMeta(str, 200)`，按**码点**截断 + `…`，先截断后 `escapeHtmlMeta` |
| 失败回退 | 入口前置校验非法/非白名单 → 400/403 **硬拒不回退**；上游真实抓取失败（非200/508/非图/超大小）→ `302` 到原始图 URL（保证不缺图） |

---

## 4. 端点设计（§1 目标 1）

### 4.1 路由路径与参数编码
- **采用 query 式**：`/api/v1/og-img?u=<encodeURIComponent(upstream)>`。
- 理由：
  - 与既有 `proxy-image` 风格一致（query 式），编码简单（`encodeURIComponent` 一次即可，无需处理路径中的 `%2F`）。
  - 缓存键天然按 `u` 区分（键=完整请求 URL，与 `getMedia` 一致）。
  - 路径式（如 `/api/v1/og-img/<proto>/<host>/...`）会把 `://`、`/`、`?`、`&` 全部塞进 pathname，易被 `_routes.json` 静态后缀规则或 CDN 规范化误伤，且可读性差。**不采用路径式。**
- 只允许 `GET`（路由注册处已限定 `method === 'GET'`）。

### 4.2 白名单机制
放代码常量为主（部署即生效，避免 env 配置遗漏导致生产图失效），`env` 作可选扩展：

```js
// —— 受控图片代理白名单（常量，与 og:image 改写共用）——
const IMG_PROXY_EXACT_HOSTS = new Set(['oss.yayoi.love']);              // 精确主机（唯一白名单）
const IMG_PROXY_HOST_SUFFIXES = [];                                     // 泛后缀白名单已清空：仅允许精确主机 oss.yayoi.love
const IMG_PROXY_MAX_BYTES = 5 * 1024 * 1024;                            // 单图上限 5MB
const IMG_PROXY_MAX_REDIRECTS = 3;                                      // 重定向最多 3 跳
const IMG_PROXY_RATE_LIMIT = 30;                                        // 回源限流：每 IP 每窗口最多回源次数
const IMG_PROXY_RATE_WINDOW_SEC = 60;                                   // 回源限流窗口（秒）
```

> 回源限流说明：执行顺序为 **入口 `assertSafeProxyTarget` 前置校验（非法→400/403 硬拒不计数）→ 缓存读（命中即返回、不计数）→ 限流（仅对确将回源计数）→ fetch**。限流**只作用于「前置校验通过且缓存未命中、必须真正回源拉 OSS」的请求**（即花钱的那类）。缓存命中不计数，因此正常社交爬虫与高频缓存命中都不会被限流；只有确实回源时按 `getClientIp(request)` 计数，超过 `IMG_PROXY_RATE_LIMIT / 窗口` 返回 429。复用既有 `checkRateLimit(env, key, limit, windowSec)`（L1006）与 `getClientIp(request)`。

- 校验函数（**改写与代理端点共用**，保证口径一致）：

```js
function isAllowedProxyHost(host, env) {
  host = String(host || '').toLowerCase().replace(/\.$/, '');
  if (!host) return false;
  if (IMG_PROXY_EXACT_HOSTS.has(host)) return true;
  if (IMG_PROXY_HOST_SUFFIXES.some((s) => host === s || host.endsWith('.' + s))) return true;
  // 可选 env 扩展（逗号分隔）
  const extra = (env && env.IMG_PROXY_EXTRA_HOSTS) || '';
  const extraHosts = extra.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (extraHosts.includes(host)) return true;
  return false;
}
```

> 说明：
> - 泛后缀白名单已清空，**白名单仅 `oss.yayoi.love`**：一是收紧攻击面（不再放行整个 `aliyuncs.com` 泛域，避免泛域子域被劫持后借代理出网），二是与部署现状对齐。需额外域时经 `env.IMG_PROXY_EXTRA_HOSTS` 显式加入（与改写共用同一白名单，见下）。
> - 「本站自有域」图片无需代理（本来就同源可达），改写时按「同源不代理」处理，无需进白名单（§5.2）。
> - 若部署了 `env.IMG_PROXY_EXTRA_HOSTS`，`injectSiteMeta` 改写白名单与代理端点用**同一个** `isAllowedProxyHost`，不会出现「代理放行但没改写」的口径漂移。

### 4.3 安全校验（SSRF 防护）
核心函数对每个「待请求」的 URL 依次校验：

```js
function assertSafeProxyTarget(targetStr, env) {
  let u;
  try { u = new URL(targetStr); } catch { return 'invalid-url'; }
  // 1) 协议：仅 http/https，禁止 file/ftp/data/javascript 等
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'protocol';
  // 2) 主机白名单
  if (!isAllowedProxyHost(u.hostname, env)) return 'host';
  return null; // ok
}
```

- **DNS/IP 私网过滤（可选加固，生产建议开启）**：默认依赖白名单（allowlist 本身即强约束），提供开关 `IMG_PROXY_ENABLE_IP_CHECK`。开启后对目标 hostname 做解析，拒绝命中私网/环回/链路本地/保留网段（含 `169.254.169.254` metadata、`10/8`、`172.16/12`、`192.168/16`、`127/8`、`0/8`、`100.64/10`、`::1`、`fc00::/7` 等）：

```js
function isPrivateIp(ip) {
  if (!ip) return true;
  if (ip.includes(':')) { // IPv6
    return /^::$|^::1$|^fc|^fd|^fe[89ab]/i.test(ip);
  }
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return true;
  const [a, b] = parts;
  if (a === 0 || a === 127 || a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true; // 169.254.169.254 metadata
  return false;
}

// 可选：用 DoH 解析（cloudflare-dns.com 或 1.1.1.1）。仅当 IMG_PROXY_ENABLE_IP_CHECK 开启时调用。
async function resolveHostToIPs(host) {
  try {
    const resp = await fetch(
      'https://cloudflare-dns.com/dns-query?name=' + encodeURIComponent(host) + '&type=A',
      { headers: { accept: 'application/dns-json' } }
    );
    const data = await resp.json();
    return (data.Answer || []).filter((r) => r.type === 1).map((r) => r.data);
  } catch { return []; }
}
```

> DoH 会增加一次外部请求与延迟；因白名单已收紧，**默认关闭 IP 校验**，作为可选项。实现时若开启，对**目标主机与重定向后的每一跳主机**都解析并过滤。

### 4.4 重定向处理
OSS/CDN 常对原图 URL 302 到签名地址。**手动循环、每跳重新校验**，不用 `redirect: 'follow'`（避免跳出白名单）：

```js
async function fetchImageThroughProxy(targetStr, env, ctx) {
  let current = targetStr;
  for (let hop = 0; hop <= IMG_PROXY_MAX_REDIRECTS; hop++) {
    const err = assertSafeProxyTarget(current, env);
    if (err) return { status: err === 'protocol' ? 400 : 403, body: null }; // 非法/非白名单
    if (env && env.IMG_PROXY_ENABLE_IP_CHECK) {
      const ips = await resolveHostToIPs(new URL(current).hostname);
      if (ips.length && ips.every(isPrivateIp)) return { status: 403, body: null }; // 全私网，拒
    }
    const resp = await fetch(current, { method: 'GET', redirect: 'manual', headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; XinBlog-ImgProxy/1.0)',
      Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
    }});
    if (resp.status >= 300 && resp.status < 400 && resp.headers.get('location')) {
      current = new URL(resp.headers.get('location'), current).href; // 相对/绝对都兼容
      continue; // 下一跳重新校验
    }
    return { status: resp.status, resp };
  }
  return { status: 508, body: null }; // 重定向过多
}
```

### 4.5 大小上限
- 优先看响应头 `content-length`，超 `IMG_PROXY_MAX_BYTES` 直接 502。
- 无长度头（chunked）时边读边数，累计超限即中止并 502（骨架）：

```js
async function enforceSizeLimit(resp, limit) {
  const len = Number(resp.headers.get('content-length') || 0);
  if (len > limit) return null;                       // 头即超限 → 拒
  if (len > 0) return resp;                           // 已知长度且未超 → 直接透传
  // 无长度头：手动读取计数截断（简化实现：读入内存累计）
  const buf = await readLimited(resp.body, limit);    // 见下方实现说明
  return buf === null ? null : new Response(buf, { status: resp.status, headers: resp.headers });
}
```
> 实现提示：`readLimited(stream, limit)` 用 `reader.read()` 循环累加，超过 `limit` 即 `return null` 并 `reader.cancel()`；未超则 `new Response(new Blob(parts))` 重建。OSS 图基本都带 `content-length`，该分支是兜底。

---

## 5. 端点 handler 与边缘缓存（§1 目标 2/3）

### 5.1 handler `proxyOgImage(request, env, ctx)`

```js
async function proxyOgImage(request, env, ctx) {
  const url = new URL(request.url);
  const target = url.searchParams.get('u');
  if (!target) return jsonResponse(400, null, '缺少 u 参数');

  // ① 入口前置校验（P2-1）：非法 URL/协议 → 400；非白名单主机 → 403（硬拒：不回退、不计数、不缓存）
  const verr = assertSafeProxyTarget(target, env);
  if (verr === 'invalid-url' || verr === 'protocol') return jsonResponse(400, null, '图片 URL 非法（协议仅支持 http/https）');
  if (verr === 'host') return jsonResponse(403, null, '图片域名不在代理白名单内');

  // ② 边缘缓存：读 ——（键 = 完整请求 URL；命中在限流之前返回、不计数）
  let cacheKey = null;
  try { cacheKey = new Request(request.url); } catch {}
  if (cacheKey) {
    try {
      const hit = await caches.default.match(cacheKey);
      if (hit) return hit;
    } catch {} // Cache API 异常降级（同 P2-3）
  }

  // ③ 回源限流（P2-2）：仅对“前置校验通过且缓存未命中、确将回源”的请求计数
  if (!(await checkRateLimit(env, 'ogip:' + getClientIp(request), IMG_PROXY_RATE_LIMIT, IMG_PROXY_RATE_WINDOW_SEC))) {
    return jsonResponse(429, null, '图片代理请求过于频繁，请稍后再试', 429);
  }

  const result = await fetchImageThroughProxy(target, env, ctx); // §4.4
  if (result.status !== 200 || !result.resp) {
    // —— 失败回退：302 到原始图 URL，绝不缺图 ——
    return new Response(null, { status: 302, headers: { Location: target } });
  }
  const resp = result.resp;
  const ctype = (resp.headers.get('content-type') || '').toLowerCase();

  // 仅透传图片；非图 / 非 200 一律不缓存
  if (!ctype.startsWith('image/')) return new Response(null, { status: 302, headers: { Location: target } });

  // —— 大小上限 ——
  const bounded = await enforceSizeLimit(resp, IMG_PROXY_MAX_BYTES);
  if (!bounded) return new Response(null, { status: 302, headers: { Location: target } });

  const headers = new Headers(bounded.headers);
  headers.set('Content-Type', ctype);
  headers.set('Cache-Control', 'public, max-age=86400, s-maxage=604800'); // 浏览器1天/边缘7天
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('X-Content-Type-Options', 'nosniff');

  const out = new Response(bounded.body, { status: 200, headers });

  // —— 边缘缓存：写 ——（仅成功 + image，put 包 catch，同 P2-2）
  if (cacheKey) {
    ctx.waitUntil(caches.default.put(cacheKey, out.clone()).catch(() => {}));
  }
  return out;
}
```

- **入口校验先行**：非法 URL/协议 → 400、非白名单主机 → 403，均硬拒（不回退、不计数、不缓存），不会产出 `Location: data:...` 这类怪头。
- **只缓存成功(200)且 `image/*` 的响应**；上游真实失败（4xx/5xx/508/非图/超大小）一律 `302` 回原始 URL 且**不写缓存**（错误不缓存）。
- **TTL 协调**：文章 HTML 卡片缓存 `s-maxage=300`（保证标题/封面更新即时）；图片代理缓存 `s-maxage=604800`（图相对稳定，降回源/额度）。两者缓存键独立、互不干扰。
- 封面替换时：`purgePostCardCache` 只清 HTML 键，图片代理键不变（同一 OSS URL 对应同一内容）。若存在「同 URL 换图」场景，可选在 `purgePostCardCache` 或更新封面处顺带 `caches.default.delete(new Request(origin + '/api/v1/og-img?u=' + encodeURIComponent(oldCover)))`（可选，非必需）。

### 5.2 og:image 改写（§1 目标 1）
在 `injectSiteMeta` 内，对**最终解析出的绝对 image** 统一改写（站点级 `shareImage` 与文章级 `cover_base64` 一并覆盖）：

```js
function rewriteOgImage(image, origin, env) {
  if (!image || !/^https?:/i.test(image)) return image;   // data: 已在上游降级；相对路径走本站，不改
  let u;
  try { u = new URL(image); } catch { return image; }
  if (u.origin === origin) return image;                  // 本站同源图（含 /api/v1/media/:id）→ 不改
  if (isAllowedProxyHost(u.hostname, env)) {              // 白名单外链（OSS 等）→ 改写为代理端点
    return new URL('/api/v1/og-img?u=' + encodeURIComponent(image), origin).href;
  }
  return image;                                           // 其它外链域（不在白名单）→ 保持原样
}
```

`injectSiteMeta` 改动（新增第 5 参 `env`，**可选**；缺省/未传时白名单用常量，行为一致）：

```js
function injectSiteMeta(html, config, requestUrl, post, env) {
  // …… title 不变 ……
  const descriptionRaw = post && post.excerpt ? post.excerpt : (config.shareDescription || '');
  const description = escapeHtmlMeta(truncateMeta(descriptionRaw, 200)); // §5.3，先截断后转义
  // …… image 解析链不变（post.cover → shareImage||logo → /logo.png）……
  image = escapeHtmlMeta(rewriteOgImage(image, origin, env)); // 改写后再整体转义
  // …… metaTags 数组原样（og:title/description/image、twitter:image 都用改写后的 image）……
}
```

- **改写规则汇总**：
  - `data:` → 上游已降级为站点图（不改）。
  - 相对路径（`/logo.png`、`/api/v1/media/:id`）→ `resolveAbsoluteImage` 拼成同源绝对 URL → `u.origin === origin` → **不改**。
  - 本站域绝对 URL → 同源 → **不改**。
  - OSS 等白名单外链绝对 URL → **改写**为 `/api/v1/og-img?u=<encoded>`。
  - 其它非白名单外链（如 `i.imgur.com`）→ **不改**（保持原始 URL）。
- 调用点（ASSETS HTML 分支 ~L8403）改为传入 `env`：
  `const modifiedHtml = injectSiteMeta(html, site, canonicalUrl, post, env);`

### 5.3 摘要截断（§1 目标 4）
按**码点**截断（`[...str]` 正确按 Unicode 码点迭代，避免切坏代理对/增补平面字符），加 `…`（U+2026，单码点）：

```js
function truncateMeta(str, max = 200) {
  if (!str) return '';
  const s = String(str);
  if ([...s].length <= max) return s;
  return [...s].slice(0, max - 1).join('') + '…';   // 保留 max-1 码点 + 省略号 = max 码点
}
```
- **顺序**：先 `truncateMeta` 后 `escapeHtmlMeta`（避免 `&`→`&amp;` 等转义使字符数虚高而误伤、或把截断点算在转义序列里）。
- `title` 不截断（平台对 og:title 无限长强制）。

---

## 6. 路由注册

在 `proxy-image` 注册附近（`~L8160`，即 `if (method === 'GET' && path === '/api/v1/proxy-image') ...` 之后）加一行：

```js
if (method === 'GET' && path === '/api/v1/og-img') return await proxyOgImage(request, env, ctx);
```
> 顺序无冲突：`og-img` 是精确路径，不与 `media/:id` 等重叠。`_routes.json` 的 `exclude` 只排除静态资源后缀，`/api/v1/og-img` 走 worker，无需改 `_routes.json`。

---

## 7. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 变成**开放代理** | 白名单（精确 + env 扩展；泛后缀已清空），非白名单入口一律 `403` 硬拒不回退；只 `GET`；协议仅 http(s) |
| **SSRF**（借代理访问内网/私网/metadata） | hostname 白名单强约束 + 重定向**每跳重新校验** + 可选 DNS/IP 私网过滤（`IMG_PROXY_ENABLE_IP_CHECK`），拒绝 `169.254.169.254`/RFC1918 等 |
| 泛域后缀放开（旧 `*.aliyuncs.com`） | 已清空：白名单仅 `oss.yayoi.love`；确需其它域时经 `env.IMG_PROXY_EXTRA_HOSTS` 显式加入，不做泛后缀放开 |
| 重定向跳出白名单 | 手动循环 `redirect:'manual'`，每跳 `assertSafeProxyTarget`；超 `IMG_PROXY_MAX_REDIRECTS` 报错 |
| 额度/流量滥用（大文件反复刷） | 大小上限 5MB；**边缘缓存**（Cache API）大幅降回源；**回源限流**：仅前置校验通过且缓存 miss 时按 `getClientIp` 计数（`ogip:<ip>`，30 次/60s，超限 429），非法/非白名单请求在限流前已被 400/403 硬拒不计数，缓存命中不计，不影响正常爬虫 |
| 代理把 HTML/JS 当图透传 | 仅透传 `image/*`，非图回退 302 |
| **代理端点本身取不到大陆 OSS 图**（CF 出站也被墙） | 见 §1.3 关键前提：上线前先出站探测；失败回退 302 到原始 URL，保证不因代理缺图 |
| 卡片缺图 | 所有失败路径一律回退原始图 URL（302），绝不返回 404/5xx 占位 |

---

## 8. 落地步骤（执行清单，严格照做）

### 8.1 改动文件与函数点（全部在 `public/_worker.js`）
1. **备份**（先于任何修改，见 §8.3）。
2. **常量**：在文件顶部（`ALLOWED_IMAGE_MIME` L1811 之前即可）新增 §4.2 的 4 个常量。
3. **新增函数**（放在 `proxyImage` 附近，便于集中）：
   - `function isAllowedProxyHost(host, env)`（§4.2）
   - `function isPrivateIp(ip)`、`async function resolveHostToIPs(host)`（§4.3，可选）
   - `function assertSafeProxyTarget(targetStr, env)`（§4.3）
   - `async function fetchImageThroughProxy(targetStr, env, ctx)`（§4.4）
   - `async function enforceSizeLimit(resp, limit)`（§4.5）
   - `async function proxyOgImage(request, env, ctx)`（§5.1）
   - `function rewriteOgImage(image, origin, env)`（§5.2）
   - `function truncateMeta(str, max = 200)`（§5.3）
4. **修改** `injectSiteMeta`（L793）：
   - 签名加可选 `env`：`function injectSiteMeta(html, config, requestUrl, post, env)`。
   - description：`escapeHtmlMeta(truncateMeta(descriptionRaw, 200))`。
   - image：最后一行 `image = escapeHtmlMeta(rewriteOgImage(image, origin, env));`。
5. **修改调用点**（ASSETS HTML 分支 ~L8403）：`injectSiteMeta(html, site, canonicalUrl, post, env)`。
6. **路由注册**（~L8160）：加 `/api/v1/og-img` 一行（§6）。

### 8.2 验证
- **语法**：`node --check public/_worker.js`（必须通过）。
- **本地 mock 自检**（沿用既有「沙盒 mock env 驱动真实 worker.fetch」方式，如 `/tmp/xinblog-verify/` 里的 harness）：
  - mock `env.ASSETS` 返回一份含 `<head>` 的 HTML、mock D1 `getSiteConfigObject` 与 post 查询、`globalThis.fetch` 拦截上游 OSS 返回 `200 image/jpeg`；
  - 断言：
    1. 封面为 OSS 外链时，`/post/:slug` 响应 `og:image` 含 `/api/v1/og-img?u=...`；
    2. 封面为相对 `/api/v1/media/:id` 时，`og:image` 不被改写；
    3. GET `/api/v1/og-img?u=<oss>` 返回 200 且 `content-type: image/jpeg`，第二次命中缓存；
    4. `u` 指向 `*.aliyuncs.com`（非 `oss.yayoi.love`）或任意外域 → `403` 硬拒（**不是** 302）；
    5. `u` 为 `file:`/`data:`/非法 URL → `400` 硬拒（**不是** 302，无 `Location:` 怪头）；
    6. 上游返回 404 → `302` 回原始 URL 且不写缓存；
    7. 描述 >200 码点 → 被截断到 ≤200 且带 `…`，代理对 emoji 不被切坏；
    8. 缓存**命中**不计数、同一 IP 高频回源超过 `IMG_PROXY_RATE_LIMIT` → 返回 429。（mock 中可用固定 IP 头模拟多 IP 计数。）
- **生产探测（上线前必做，P2-4）**：部署后执行以下命令，应返回 `200` 且 `content-type: image/jpeg`（验证 §1.3 前提）：
  ```
  curl -sI "https://blog.yayoi.love/api/v1/og-img?u=<encodeURIComponent(oss图绝对URL)>"
  # 例：curl -sI "https://blog.yayoi.love/api/v1/og-img?u=https%3A%2F%2Foss.yayoi.love%2Fblog%2Fcover.jpg"
  ```
  父侧已完成 Cloudflare 网络取到 OSS 图 200 的强证据（fetch_content 抓取验证），正式 curl 探测属部署期验证，**在部署后进行**；实现环境不发起生产线上调用。
- **生产回归**：`curl -s https://blog.yayoi.love/post/<slug> | grep -o 'og:image[^>]*'` 确认改写；`curl -s .../ | grep og:title` 非文章页仍为站点名（未回归）。
- 注意：`dist/_worker.js` 由构建从 `public/_worker.js` 拷贝，需重新构建部署才生效（同 og-preview-card-plan §6）。

### 8.3 备份 / 回滚
- **备份（先于修改）**：`git add public/_worker.js && git commit -m "backup: 修改前快照"`（仅目标文件）；或复制到 `public/.backups/_worker.js.YYYYMMDD-HHMM.bak`。确认备份存在后再动手。
- **回滚**：改坏时用备份覆盖还原 `public/_worker.js`。

### 8.4 验收标准
1. `node --check public/_worker.js` 通过。
2. OSS 外链封面 → `/post/:slug` 的 `og:image`/`twitter:image` 指向 `/api/v1/og-img?u=...`。
3. 同源图（`/api/v1/media/:id`）/相对路径 → 不改写。
4. `/api/v1/og-img`：入口前置校验（非法协议→400、非白名单→403 硬拒不回退）；白名单 200 且 `image/*` 缓存；上游真实失败（非200/508/非图/超大小）→ 302 回原始 URL。
5. 描述 >200 → 安全截断 + `…`。
6. 非文章页 OG 与改动前一致（`post`/`env` 缺省路径零回归）。
7. 备份存在、可回滚。

---

## 9. 待办 / 开放项（记录，不阻塞）
- 上线前确认 CF 出站到大陆昆仑 CDN 可达（§1.3 / §8.2 生产探测），必要时先落备用源（OSS 公共读 / OSS 境外 endpoint / CF R2 镜像）。**P2-4 状态**：父侧已用 fetch_content 拿到 CF 网络取 OSS 图 200 的强证据（非代码问题、不线上调），正式 curl 探测在部署后进行，实现环境内未发起生产线上调用。
- `IMG_PROXY_ENABLE_IP_CHECK` 与 `env.IMG_PROXY_EXTRA_HOSTS` 是否启用：默认关/空；如需开启，在 `wrangler.toml` 增 `[vars]`（示例见下），并在方案评审时确认。
- 是否对缓存 miss 加限流：默认不开，留作后续。

```toml
# wrangler.toml（可选，启用扩展时新增）
[vars]
IMG_PROXY_EXTRA_HOSTS = ""            # 额外白名单主机，逗号分隔
IMG_PROXY_ENABLE_IP_CHECK = "false"   # "true" 开启 DNS/IP 私网过滤
```
