#!/usr/bin/env node
/**
 * XinBlog 标准管理接口 · MCP 接入件
 * ---------------------------------
 * 让任何支持 MCP 的 Agent（Codex / Claude Code / Pi / Lody 等）
 * 通过标准工具调用管理博客文章，无需人工操作后台。
 *
 * 运行方式（stdio MCP，由 Agent 宿主自动拉起）：
 *   node mcp/server.mjs
 *
 * 环境变量配置：
 *   XINBLOG_SITE_URL      博客站点地址，默认 https://blog.yayoi.love
 *   XINBLOG_API_KEY       标准管理接口密钥（博客端 MANAGE_API_KEY）
 *   XINBLOG_ENABLE_DELETE 设为 1 时注册 delete_post 工具，缺省不注册
 *
 * 协议：MCP over stdio（newline-delimited JSON-RPC 2.0）
 * 依赖：无（Node >= 18，使用内置 fetch）
 */

import { createInterface } from 'node:readline';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

const SITE_URL = (process.env.XINBLOG_SITE_URL || 'https://blog.yayoi.love').replace(/\/+$/, '');
const API_KEY = process.env.XINBLOG_API_KEY || '';
const ENABLE_DELETE = process.env.XINBLOG_ENABLE_DELETE === '1';
const SERVER_NAME = 'xinblog';
const SERVER_VERSION = '1.0.0';

/* ---------------- HTTP 客户端 ---------------- */

async function api(method, path, body) {
  if (!API_KEY) {
    throw new Error('XINBLOG_API_KEY 未配置：请在启动环境变量中提供博客标准管理接口密钥');
  }
  let res;
  try {
    res = await fetch(`${SITE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(`无法连接博客站点 ${SITE_URL}：${e.message}`);
  }
  let json = null;
  try {
    json = await res.json();
  } catch {
    throw new Error(`博客返回了非 JSON 响应（HTTP ${res.status}）`);
  }
  if (!json || json.code !== 0) {
    throw new Error(`博客接口错误（HTTP ${res.status}）：${(json && json.msg) || '未知错误'}`);
  }
  return json.data;
}

/* ---------------- 参数辅助 ---------------- */

function str(v) {
  return v === undefined || v === null ? '' : String(v).trim();
}

function int(v, dft) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : dft;
}

// 标签名称 → ID 映射：只匹配已存在标签，匹配不到的跳过并回传 missing，绝不擅自创建。
// 打 admin/tags（实时无缓存）而非公开 /api/v1/tags（600s 边缘缓存，会导致刚创建的标签匹配不上）
async function resolveTagIds(names) {
  if (!Array.isArray(names) || names.length === 0) return { tagIds: [], missing: [] };
  const data = await api('GET', '/api/v1/admin/tags?limit=100');
  const list = (data && data.list) || [];
  const byName = new Map(list.map((t) => [t.name, t.id]));
  const tagIds = [];
  const missing = [];
  for (const raw of names) {
    const name = str(raw);
    if (!name) continue;
    const id = byName.get(name);
    if (id === undefined) missing.push(name);
    else tagIds.push(id);
  }
  return { tagIds, missing };
}

// 封面图允许读取的根目录：默认当前工作目录，可用 XINBLOG_COVER_DIR 调整。
// 约束目的：防止 Agent 被诱导读取任意本地文件（如 ~/.ssh、.env）并随文章外传
const COVER_ROOT = resolve(process.env.XINBLOG_COVER_DIR || process.cwd()) + sep;

// 封面：coverBase64 直接传；或 coverFile 读取【COVER_ROOT 内的图片文件】转 base64（限 1MB）
async function resolveCover(args) {
  if (str(args.coverBase64)) {
    const s = str(args.coverBase64);
    if (s.length * 0.75 > 1024 * 1024) {
      throw new Error('封面图超过 1MB 上限，请压缩后重试');
    }
    return s;
  }
  if (str(args.coverFile)) {
    const p = resolve(args.coverFile);
    if (!p.startsWith(COVER_ROOT)) {
      throw new Error(`封面图必须位于 ${COVER_ROOT} 目录内（可用 XINBLOG_COVER_DIR 环境变量调整）`);
    }
    if (!/\.(png|jpe?g|gif|webp|avif)$/i.test(p)) {
      throw new Error('封面图仅支持 png/jpg/gif/webp/avif 格式');
    }
    const st = await stat(p);
    if (st.size > 1024 * 1024) {
      throw new Error(`封面图 ${args.coverFile} 为 ${st.size} 字节，超过 1MB 上限，请压缩后重试`);
    }
    const buf = await readFile(p);
    return buf.toString('base64');
  }
  return '';
}

/* ---------------- 工具定义 ---------------- */

const WRITE_RULE = '安全铁律：这是写操作，调用前必须向用户完整展示将写入的内容并获得用户明确确认；未获确认严禁调用。';

const TOOLS = [
  {
    name: 'list_posts',
    description: '列出博客文章（按创建时间倒序，分页，支持关键词搜索标题/摘要）。只读操作，可放心调用。',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'integer', minimum: 1, description: '页码，默认 1' },
        limit: { type: 'integer', minimum: 1, maximum: 100, description: '每页数量，默认 10' },
        keyword: { type: 'string', description: '关键词，匹配标题或摘要，可留空' },
      },
      additionalProperties: false,
    },
    handler: async (a) => {
      const q = new URLSearchParams({
        page: String(int(a.page, 1)),
        limit: String(Math.min(100, Math.max(1, int(a.limit, 10)))),
      });
      if (str(a.keyword)) q.set('keyword', str(a.keyword));
      return api('GET', `/api/v1/admin/posts?${q.toString()}`);
    },
  },
  {
    name: 'get_post',
    description: '读取单篇文章完整内容（含 Markdown 正文、摘要、封面、标签、状态、浏览量）。只读操作。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'integer', description: '文章 ID（来自 list_posts 返回的 id 字段）' },
      },
      required: ['id'],
      additionalProperties: false,
    },
    handler: async (a) => {
      const id = int(a.id);
      if (!id) throw new Error('id 必填');
      return api('GET', `/api/v1/admin/posts/${id}`);
    },
  },
  {
    name: 'publish_post',
    description:
      '【写操作·需用户确认】发布一篇新博客文章。' + WRITE_RULE +
      ' 默认直接上线（status=published）；用户要求存草稿时传 status="draft"。slug 留空由博客自动生成（中文标题会生成 post-时间戳，建议传语义化英文别名）。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '文章标题（必填）' },
        content: { type: 'string', description: 'Markdown 正文（必填）' },
        slug: { type: 'string', description: 'URL 英文别名，留空自动生成' },
        excerpt: { type: 'string', description: '摘要，留空取正文前 160 字' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: '标签名称数组；只匹配已存在标签，匹配不到会跳过并在结果中提示，不会擅自新建',
        },
        coverBase64: { type: 'string', description: '封面图 base64（与 coverFile 二选一）' },
        coverFile: { type: 'string', description: '封面图本地文件路径，自动转 base64（限 1MB，与 coverBase64 二选一）' },
        status: { type: 'string', enum: ['draft', 'published'], description: 'draft=存草稿，published=直接发布（默认）' },
      },
      required: ['title', 'content'],
      additionalProperties: false,
    },
    handler: async (a) => {
      const title = str(a.title);
      const content = String(a.content || '');
      if (!title || !content) throw new Error('title 和 content 必填');
      const { tagIds, missing } = await resolveTagIds(a.tags);
      const cover = await resolveCover(a);
      const body = { title, content };
      if (str(a.slug)) body.slug = str(a.slug);
      if (str(a.excerpt)) body.excerpt = str(a.excerpt);
      if (cover) body.coverBase64 = cover;
      if (tagIds.length) body.tagIds = tagIds;
      if (str(a.status)) body.status = str(a.status);
      const data = await api('POST', '/api/v1/admin/posts', body);
      const out = { ...data, status: str(a.status) || 'published' };
      if (missing.length) {
        out.tagWarnings = `这些标签在博客中不存在，已跳过未关联：${missing.join('、')}。如需新建请先调用 create_tag。`;
      }
      return out;
    },
  },
  {
    name: 'update_post',
    description:
      '【写操作·需用户确认】更新已有文章的字段（标题/正文/摘要/别名/标签/封面/状态）。' + WRITE_RULE +
      ' 只传需要修改的字段；传了 tags 会整体重建该文章的标签关联。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'integer', description: '文章 ID（必填）' },
        title: { type: 'string' },
        content: { type: 'string', description: '新的 Markdown 正文' },
        slug: { type: 'string' },
        excerpt: { type: 'string' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: '标签名称数组，传了即整体重建标签关联',
        },
        coverBase64: { type: 'string' },
        coverFile: { type: 'string' },
        status: { type: 'string', enum: ['draft', 'published'], description: '改为草稿或重新发布' },
      },
      required: ['id'],
      additionalProperties: false,
    },
    handler: async (a) => {
      const id = int(a.id);
      if (!id) throw new Error('id 必填');
      const body = {};
      if (str(a.title)) body.title = str(a.title);
      if (a.content !== undefined && String(a.content)) body.content = String(a.content);
      if (str(a.slug)) body.slug = str(a.slug);
      if (str(a.excerpt)) body.excerpt = str(a.excerpt);
      if (a.tags !== undefined) {
        const { tagIds, missing } = await resolveTagIds(a.tags);
        body.tagIds = tagIds;
        if (missing.length) {
          body.tagWarnings = `这些标签在博客中不存在，已跳过未关联：${missing.join('、')}`;
        }
      }
      const cover = await resolveCover(a);
      if (cover) body.coverBase64 = cover;
      if (str(a.status)) body.status = str(a.status);
      // 服务端要求至少一个普通字段才执行 UPDATE；仅更新标签时先回填当前值
      const hasField = ['title', 'content', 'slug', 'excerpt', 'coverBase64', 'status'].some(
        (k) => body[k] !== undefined
      );
      if (!hasField) {
        const cur = await api('GET', `/api/v1/admin/posts/${id}`);
        body.title = cur.title;
        body.content = cur.content;
        body.slug = cur.slug;
        body.excerpt = cur.excerpt || '';
        body.status = cur.status;
        if (cur.cover_base64) body.coverBase64 = cur.cover_base64;
      }
      await api('PATCH', `/api/v1/admin/posts/${id}`, body);
      return { id, updated: true, ...body };
    },
  },
  {
    name: 'list_tags',
    description: '列出博客全部标签（ID、名称、别名、颜色、文章数，最多 100 条）。只读操作，实时数据。',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    handler: async () => {
      const data = await api('GET', '/api/v1/admin/tags?limit=100');
      return (data && data.list) || [];
    },
  },
  {
    name: 'create_tag',
    description:
      '【写操作·需用户确认】新建标签。' + WRITE_RULE +
      ' 仅在用户同意创建新标签时调用；已存在同名标签时会直接报错，不会重复创建。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '标签名称（必填）' },
        color: { type: 'string', description: '标签颜色，如 #10b981，可留空' },
      },
      required: ['name'],
      additionalProperties: false,
    },
    handler: async (a) => {
      const name = str(a.name);
      if (!name) throw new Error('name 必填');
      // 服务端唯一约束在 slug 上，中文名 slug 为空串会静默重复创建，故先按名称查重
      const data = await api('GET', '/api/v1/admin/tags?limit=100');
      const list = (data && data.list) || [];
      if (list.some((t) => t.name === name)) {
        throw new Error(`标签「${name}」已存在，无需重复创建`);
      }
      const body = { name };
      if (str(a.color)) body.color = str(a.color);
      return api('POST', '/api/v1/admin/tags', body);
    },
  },
  {
    name: 'delete_post',
    description:
      '【高危写操作·需用户确认】删除文章，不可恢复。' + WRITE_RULE +
      ' 仅在用户明确要求删除某一篇具体文章时调用，且必须展示文章标题与 ID 并获得明确确认。本工具默认未启用（需 XINBLOG_ENABLE_DELETE=1 启动）。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'integer', description: '要删除的文章 ID' },
      },
      required: ['id'],
      additionalProperties: false,
    },
    handler: async (a) => {
      const id = int(a.id);
      if (!id) throw new Error('id 必填');
      await api('DELETE', `/api/v1/admin/posts/${id}`);
      return { id, deleted: true };
    },
  },
];

function visibleTools() {
  return TOOLS.filter((t) => t.name !== 'delete_post' || ENABLE_DELETE).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
}

/* ---------------- MCP stdio 协议（newline-delimited JSON-RPC 2.0） ---------------- */

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

async function handleMessage(msg) {
  const { id, method, params } = msg;
  const hasId = id !== undefined && id !== null;

  try {
    switch (method) {
      case 'initialize': {
        // MCP 规范：客户端请求的版本服务端不支持时，必须回服务端支持的版本而非原样回显
        const SUPPORTED = ['2025-06-18', '2025-03-26', '2024-11-05'];
        const want = params && params.protocolVersion;
        const ver = SUPPORTED.includes(want) ? want : '2024-11-05';
        if (hasId) {
          send({
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: ver,
              capabilities: { tools: {} },
              serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
            },
          });
        }
        return;
      }
      case 'notifications/initialized':
      case 'initialized':
      case 'notifications/cancelled':
        return; // 通知无需响应
      case 'ping':
        if (hasId) send({ jsonrpc: '2.0', id, result: {} });
        return;
      case 'tools/list':
        if (hasId) send({ jsonrpc: '2.0', id, result: { tools: visibleTools() } });
        return;
      case 'tools/call': {
        if (!hasId) return;
        const name = params && params.name;
        const args = (params && params.arguments) || {};
        const tool = TOOLS.find((t) => t.name === name);
        if (!tool) {
          send({ jsonrpc: '2.0', id, error: { code: -32602, message: `未知工具：${name}` } });
          return;
        }
        if (tool.name === 'delete_post' && !ENABLE_DELETE) {
          send({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: '删除工具未启用：需要以 XINBLOG_ENABLE_DELETE=1 启动本 MCP server。' }],
              isError: true,
            },
          });
          return;
        }
        try {
          const data = await tool.handler(args);
          send({
            jsonrpc: '2.0',
            id,
            result: { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] },
          });
        } catch (e) {
          send({
            jsonrpc: '2.0',
            id,
            result: { content: [{ type: 'text', text: `错误：${e.message}` }], isError: true },
          });
        }
        return;
      }
      default:
        if (hasId) {
          send({ jsonrpc: '2.0', id, error: { code: -32601, message: `不支持的方法：${method}` } });
        }
    }
  } catch (e) {
    if (hasId) {
      send({
        jsonrpc: '2.0',
        id,
        result: { content: [{ type: 'text', text: `内部错误：${e.message}` }], isError: true },
      });
    }
  }
}

const rl = createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return; // 忽略无法解析的行
  }
  void handleMessage(msg);
});

// 日志只走 stderr，绝不污染 stdout 的 JSON-RPC 通道
process.stderr.write(
  `[${SERVER_NAME}] MCP server v${SERVER_VERSION} 已启动 | 站点=${SITE_URL} | 删除工具=${ENABLE_DELETE ? '已启用' : '未启用'}\n`
);
