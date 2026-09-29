/**
 * mcp/server.mjs 单元测试（node:test，零依赖）
 * 运行：node --test mcp/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SERVER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'server.mjs');

/** 向 server 发送若干行 JSON-RPC，收集全部 stdout 响应 */
function rpc(lines, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER], {
      env: { ...process.env, XINBLOG_API_KEY: 'test-key', ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => {
      out += d.toString();
    });
    child.stderr.resume();
    child.on('close', () => resolve(out));
    child.on('error', reject);
    for (const l of lines) child.stdin.write(l + '\n');
    child.stdin.end();
  });
}

function parse(out) {
  return out
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

const INIT = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2024-11-05' },
});

test('默认工具清单为 6 个且不含 delete_post', async () => {
  const msgs = parse(
    await rpc([INIT, JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })])
  );
  const names = msgs.find((m) => m.id === 2).result.tools.map((t) => t.name);
  assert.equal(names.length, 6);
  assert.ok(!names.includes('delete_post'));
});

test('XINBLOG_ENABLE_DELETE=1 时注册 delete_post', async () => {
  const msgs = parse(
    await rpc([INIT, JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })], {
      XINBLOG_ENABLE_DELETE: '1',
    })
  );
  const names = msgs.find((m) => m.id === 2).result.tools.map((t) => t.name);
  assert.ok(names.includes('delete_post'));
});

test('通知（无 id）不产生任何响应输出', async () => {
  const out = await rpc([
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: {} }),
  ]);
  assert.equal(out.trim(), '');
});

test('未知方法返回 -32601', async () => {
  const msgs = parse(await rpc([JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'bogus/method' })]));
  assert.equal(msgs[0].error.code, -32601);
});

test('工具参数校验失败返回 isError 且说明原因', async () => {
  const msgs = parse(
    await rpc([
      INIT,
      JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'publish_post', arguments: { title: '只有标题' } },
      }),
    ])
  );
  const call = msgs.find((m) => m.id === 2);
  assert.equal(call.result.isError, true);
  assert.match(call.result.content[0].text, /必填/);
});

test('delete_post 未启用时调用被运行时拦截', async () => {
  const msgs = parse(
    await rpc([
      INIT,
      JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'delete_post', arguments: { id: 1 } },
      }),
    ])
  );
  const call = msgs.find((m) => m.id === 2);
  assert.equal(call.result.isError, true);
  assert.match(call.result.content[0].text, /未启用/);
});
