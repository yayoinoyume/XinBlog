import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const source = await readFile(new URL('./public/_worker.js', import.meta.url), 'utf8');
const getRange = (startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `worker helper source markers not found: ${startMarker}`);
  return source.slice(start, end);
};
const ranges = [
  ['const CONTENT_SECURITY_POLICY_REPORT_ONLY', 'async function serveLlmsTxt('],
  ['function truncateMeta(', 'async function proxyImage('],
  ['function escapeHtmlMeta(', 'async function getManifest('],
];
const snippets = ranges.map(([startMarker, endMarker]) => getRange(startMarker, endMarker));
snippets.push(getRange('function isAllowedProxyHost(', 'function rewriteOgImage('));
snippets.push(getRange('function rewriteOgImage(', 'function truncateMeta('));
const snippet = snippets.join('\n');

function loadHelpers() {
  const context = {
    Headers,
    Response,
    URL,
    console: { error() {} },
    env: { IMG_PROXY_EXTRA_HOSTS: '' },
    defaultSiteConfig: {},
    defaultFriendsConfig: {},
  };
  vm.createContext(context);
  vm.runInContext(`${snippet}\nthis.__test = { injectSiteMeta, withSecurityHeaders, withSecurityHeadersOnResponse, textResponse };`, context);
  return context.__test;
}

const helpers = loadHelpers();
const config = {
  siteName: 'XinBlog',
  shareDescription: '默认描述',
  pwaThemeColor: '#0f111a',
  seoVerifications: [{ name: 'google-site-verification', content: 'verify-123' }],
};

test('injectSiteMeta keeps viewport and verification meta and removes duplicates', () => {
  const html = `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="description" content="old"><meta name="theme-color" content="#fff"><meta name="google-site-verification" content="verify-123"><link rel="manifest" href="/manifest.json?v=2"><link rel="canonical" href="/old"><meta property="og:title" content="old"><meta name="twitter:card" content="old"><title>old</title></head><body></body></html>`;
  const out = helpers.injectSiteMeta(html, config, 'https://example.com/', null, {});
  assert.match(out, /<meta name="viewport" content="width=device-width, initial-scale=1\.0">/);
  assert.equal((out.match(/name="description"/g) || []).length, 1);
  assert.equal((out.match(/name="theme-color"/g) || []).length, 1);
  assert.equal((out.match(/rel="manifest"/g) || []).length, 1);
  assert.equal((out.match(/rel="canonical"/g) || []).length, 1);
  assert.equal((out.match(/property="og:title"/g) || []).length, 1);
  assert.equal((out.match(/name="twitter:card"/g) || []).length, 1);
  assert.equal((out.match(/name="google-site-verification"/g) || []).length, 1);
  assert.ok(out.includes('<meta name="viewport"'));
  assert.ok(out.includes('<meta name="google-site-verification"'));
  assert.ok(out.indexOf('<meta charset="UTF-8">') < out.indexOf('<title>'));
});

test('security headers allow same-origin embedding and protect all responses', () => {
  const headers = helpers.withSecurityHeaders({});
  assert.equal(headers.get('X-Frame-Options'), 'SAMEORIGIN');
  assert.match(headers.get('Content-Security-Policy-Report-Only'), /frame-ancestors 'self'/);
  assert.equal(headers.get('X-Content-Type-Options'), 'nosniff');
});

test('withSecurityHeadersOnResponse preserves existing headers and strips body for 204', async () => {
  const input = new Response('body', { status: 200, headers: { 'X-Test': 'yes' } });
  const out = helpers.withSecurityHeadersOnResponse(input);
  assert.equal(out.headers.get('X-Test'), 'yes');
  assert.equal(out.headers.get('X-Frame-Options'), 'SAMEORIGIN');
  assert.equal(await out.text(), 'body');
  const empty = helpers.withSecurityHeadersOnResponse(new Response(null, { status: 204 }));
  assert.equal(await empty.text(), '');
});

test('textResponse emits correct content type and security headers', async () => {
  const res = helpers.textResponse('hello', 'text/plain; charset=utf-8');
  assert.equal(res.headers.get('Content-Type'), 'text/plain; charset=utf-8');
  assert.equal(res.headers.get('X-Frame-Options'), 'SAMEORIGIN');
  assert.equal(await res.text(), 'hello');
  const head = helpers.textResponse('hello', 'text/plain; charset=utf-8', undefined, true);
  assert.equal(await head.text(), '');
});
