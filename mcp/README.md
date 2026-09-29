# XinBlog 标准管理接口 · MCP 接入件

让任何支持 MCP 的 Agent（Codex / Claude Code / Pi / Lody 等）通过标准工具调用管理博客文章，无需人工操作后台。

## 架构

```
Agent（Codex / Claude Code / Pi / Lody）
  │  stdio MCP（JSON-RPC）
  ▼
mcp/server.mjs（零依赖 Node 单文件，随仓库分发）
  │  HTTPS + X-API-Key
  ▼
博客标准管理接口（/api/v1/admin/*，复用现有后台 API）
```

博客端零新路由：`requireAdmin` / `requireSuperAdmin` 增加 `X-API-Key` 分支，密钥经 Cloudflare 环境变量注入。未配置密钥时该分支完全不生效，行为与原来一模一样。

## 一、博客端配置（上线时需要）

在 Cloudflare 给 Pages 项目 `xinblog` 配两个环境变量（二选一方式）：

**方式 A：Cloudflare 网页后台（推荐）**
Dashboard → Workers & Pages → `xinblog` → 设置 → 环境变量 → 添加：

| 变量 | 值 | 说明 |
|------|-----|------|
| `MANAGE_API_KEY` | 一串长随机字符串 | 标准管理接口密钥，Agent 凭它进门 |
| `MANAGE_API_AUTHOR_ID` | 你的用户 ID | API 发布文章的署名作者，建议用站长账号 ID |

生成密钥示例：`openssl rand -hex 32`

**方式 B：命令行**
```bash
npx wrangler login
npx wrangler pages secret put MANAGE_API_KEY --project-name xinblog
npx wrangler pages secret put MANAGE_API_AUTHOR_ID --project-name xinblog
```

> 密钥只存 Cloudflare 云端和你本地的 Agent 配置里，**严禁写入仓库**。吊销密钥 = 删掉这两个环境变量，全站通道立即关闭。

## 二、MCP server 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `XINBLOG_SITE_URL` | `https://blog.yayoi.love` | 博客站点地址 |
| `XINBLOG_API_KEY` | 无（必填） | 对应博客端 `MANAGE_API_KEY` |
| `XINBLOG_ENABLE_DELETE` | 不设 | 设为 `1` 才注册 `delete_post` 工具 |

## 三、各 Agent 接入配置

以下 `<repo>` 均指 XinBlog 仓库根目录。

### Codex（`~/.codex/config.toml`）

```toml
[mcp_servers.xinblog]
command = "node"
args = ["<repo>/mcp/server.mjs"]
env = { XINBLOG_SITE_URL = "https://blog.yayoi.love", XINBLOG_API_KEY = "你的密钥" }
```

### Claude Code

```bash
claude mcp add xinblog \
  -e XINBLOG_SITE_URL=https://blog.yayoi.love \
  -e XINBLOG_API_KEY=你的密钥 \
  -- node <repo>/mcp/server.mjs
```

### Pi（`mcp.json`）

```json
{
  "mcpServers": {
    "xinblog": {
      "command": "node",
      "args": ["<repo>/mcp/server.mjs"],
      "env": {
        "XINBLOG_SITE_URL": "https://blog.yayoi.love",
        "XINBLOG_API_KEY": "你的密钥"
      }
    }
  }
}
```

### Lody

```bash
npx lody mcp add xinblog -- node <repo>/mcp/server.mjs
# 然后在 Lody 工作区设置中为该 server 补充 XINBLOG_API_KEY 等 env
```

## 四、工具清单

| 工具 | 类型 | 功能 |
|------|------|------|
| `list_posts` | 只读 | 文章列表（分页 / 关键词） |
| `get_post` | 只读 | 单篇完整内容 |
| `publish_post` | **写** | 发布新文章（标题/正文/摘要/英文别名/标签/封面/草稿或直接发布） |
| `update_post` | **写** | 更新已有文章字段 |
| `list_tags` | 只读 | 标签列表 |
| `create_tag` | **写** | 新建标签 |
| `delete_post` | **高危写** | 删除文章（默认不注册，需 `XINBLOG_ENABLE_DELETE=1`） |

安全铁律（已写入每个写工具的 description）：**调用前必须向用户完整展示将写入的内容并获得明确确认；未获确认严禁调用。**

`publish_post` 的 `tags` 参数只匹配已存在标签，匹配不到会跳过并在返回中提示，不会擅自创建；确需新标签时 Agent 应先调用 `create_tag`（同样需用户确认）。

## 五、本地开发 / 自测

```bash
# 1. 初始化本地 D1（首次）
for pair in "config:db/config.sql" "users:db/users.sql" "posts:db/posts.sql" "media:db/media.sql"; do
  npx wrangler d1 execute "myblog-${pair%%:*}" --local --file "${pair##*:}" --y
done

# 2. 起本地 dev（--binding 注入测试密钥）
npx wrangler pages dev --port 8788 \
  --binding MANAGE_API_KEY=dev-test-key \
  --binding MANAGE_API_AUTHOR_ID=1

# 3. curl 自测
curl -X POST http://127.0.0.1:8788/api/v1/admin/posts \
  -H "Content-Type: application/json" -H "X-API-Key: dev-test-key" \
  -d '{"title":"测试","content":"内容"}'

# 4. MCP 端到端自测
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"publish_post","arguments":{"title":"测试","content":"内容"}}}' \
  | XINBLOG_SITE_URL=http://127.0.0.1:8788 XINBLOG_API_KEY=dev-test-key node mcp/server.mjs
```

## 六、已知行为说明

- 文章列表接口有 10 分钟边缘缓存：发布后详情页立即可见，列表页最晚 10 分钟出现（博客原有行为，非本接入件引入）。
- `slug` 留空时中文标题会生成 `post-时间戳` 形式，建议 Agent 生成语义化英文别名。
- `author_id` 来自 `MANAGE_API_AUTHOR_ID`，后台用户界面中文章作者显示为该用户。
