# XinBlog 标准管理接口（AI / 自动化通道）

面向 Agent 与自动化工具的文章管理接口契约。复用现有后台 API，新增 `X-API-Key` 鉴权通道，不改变任何原有行为。

配套接入件见 [`mcp/README.md`](../mcp/README.md)（MCP server，开箱即用）。

## 1. 鉴权

两种方式互斥存在，按请求头自动区分：

| 方式 | 请求头 | 适用场景 |
|------|--------|---------|
| 浏览器 JWT（原有） | `Authorization: Bearer <accessToken>` | 后台人工操作 |
| **标准管理接口（本文件）** | `X-API-Key: <MANAGE_API_KEY>` | Agent / 脚本 / MCP |

- 密钥通过 Cloudflare Pages 环境变量 `MANAGE_API_KEY` 注入，不进仓库、不进前端。
- 比对使用常量时间算法（防时序侧信道）。
- `MANAGE_API_KEY` 未配置时，本通道完全关闭，接口行为与接入前完全一致。
- `X-API-Key` 通过后以虚拟管理员身份执行，角色等同于 `super_admin`（含删除权限；是否需要暴露删除能力由接入件侧控制）。
- API 发布文章的署名作者为 `MANAGE_API_AUTHOR_ID` 指定的用户（缺省 1）。

## 2. 端点

基础路径：`https://<站点域名>/api/v1`

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/admin/posts` | X-API-Key / admin | 文章列表，query：`page`(默认1)、`limit`(默认10,最大100)、`keyword`(标题/摘要模糊) |
| GET | `/admin/posts/:id` | X-API-Key / admin | 单篇完整内容 |
| POST | `/admin/posts` | X-API-Key / admin | 创建文章 |
| PATCH | `/admin/posts/:id` | X-API-Key / admin | 更新文章 |
| DELETE | `/admin/posts/:id` | X-API-Key / super_admin | 删除文章 |
| GET | `/tags` | 公开 | 标签列表 |
| POST | `/admin/tags` | X-API-Key / admin | 创建标签，body：`{name, slug?, color?}` |
| GET | `/posts` | 公开 | 公开文章列表（仅 `published`） |

### 创建/更新文章请求体

```json
{
  "title": "文章标题（必填）",
  "content": "Markdown 正文（必填）",
  "slug": "英文 URL 别名，留空自动生成",
  "excerpt": "摘要，留空取正文前 160 字",
  "coverBase64": "封面图 base64，可留空",
  "tagIds": [1, 3],
  "status": "draft | published（默认 published）"
}
```

更新（PATCH）时只传需要修改的字段；`tagIds` 一旦传入即**整体重建**该文章的标签关联。

### 统一响应包

```json
{ "code": 0, "data": { "id": 12, "slug": "my-post" }, "msg": "创建成功" }
```

`code === 0` 为成功；非 0 为业务错误，`msg` 为可读原因。

### 错误码

| HTTP | code | 场景 |
|------|------|------|
| 400 | 400 | `title`/`content` 为空等参数错误 |
| 401 | 401 | 密钥缺失 / 错误 / 过期 |
| 403 | 403 | 角色不足 |
| 409 | 409 | `slug` 冲突（文章或标签 slug 已存在） |

## 3. 行为说明（对接入方重要）

- **slug 生成**：留空时按标题 slugify（仅保留单词字符与连字符），中文标题会退化为 `post-<时间戳>`，建议调用方显式提供英文别名。
- **缓存副作用**：创建/更新已发布文章时，服务端会自动清除该文章的 HTML 卡片边缘缓存；但公开列表 API 有 10 分钟 CDN 缓存，新文章在列表页最晚 10 分钟可见（平台既有行为）。
- **浏览量**：公开的 `GET /posts/:slug` 会无条件 `views + 1`；后台接口不增加浏览量。
- **封面存储**：`coverBase64` 直接存入 D1（建议 ≤ 1MB），大图请先经媒体库上传。
- **删除**：物理删除，不可恢复；接入件默认不暴露删除工具。

## 4. 安全设计

- 密钥仅存于 Cloudflare 环境变量与本地 Agent 配置，严禁入库；仓库 `.gitignore` 已覆盖 `.dev.vars`。
- 删除通道默认关闭（MCP 侧 `XINBLOG_ENABLE_DELETE=1` 才注册删除工具）。
- 所有写操作在接入件侧强制要求"先向用户展示内容并获得明确确认再执行"。
- 吊销：删除 Cloudflare 环境变量即全站关闭本通道，无需改代码。

## 5. 变更记录

- 2026-09-29：`feat/ai-manage-api` 分支新增 `X-API-Key` 通道（`requireAdmin` / `requireSuperAdmin` 分支）与 `mcp/server.mjs` 接入件。
