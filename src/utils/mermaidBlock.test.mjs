/**
 * mermaidBlock 单元测试（node:test，零依赖）
 * 运行：node --test src/utils/mermaidBlock.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, Fragment } from 'react';
import { mermaidSource } from './mermaidBlock.ts';

const code = (className, children) => h('code', { className }, children);
const pre = (...children) => h('pre', null, ...children);

test('识别 ```mermaid 代码块并原样返回源码', () => {
  const src = 'flowchart LR\n  A[草稿] --> B{审核}\n  B -- 通过 --> C[发布]';
  assert.equal(mermaidSource([code('language-mermaid', src)]), src);
});

test('保留 < > & 等特殊字符，不做二次转义', () => {
  const src = 'flowchart LR\n  A["<b>&x"] --> B';
  assert.equal(mermaidSource([code('language-mermaid', src)]), src);
});

test('多个 className 时仍能识别', () => {
  assert.equal(mermaidSource([code('hljs language-mermaid', 'graph TD;A-->B')]), 'graph TD;A-->B');
});

test('子节点是嵌套 span（高亮后的普通代码块）时返回 null', () => {
  const highlighted = code('hljs language-js', [h('span', { key: 'k', className: 'hljs-keyword' }, 'const'), ' a = 1;']);
  assert.equal(mermaidSource([highlighted]), null);
});

test('普通代码块 / 无 className 的缩进代码块返回 null', () => {
  assert.equal(mermaidSource([code('language-js', 'const a = 1;')]), null);
  assert.equal(mermaidSource([code(undefined, 'indented')]), null);
});

test('子节点数量不是 1 时返回 null', () => {
  assert.equal(mermaidSource([code('language-mermaid', 'graph TD;A-->B'), code('language-js', 'x')]), null);
  assert.equal(mermaidSource([]), null);
  assert.equal(mermaidSource(undefined), null);
});

test('源码是空字符串时仍返回空串（交由 pele 报错回退）', () => {
  assert.equal(mermaidSource([code('language-mermaid', '')]), '');
});

test('Fragment 包裹的源码能正确拼接', () => {
  const wrapped = code('language-mermaid', h(Fragment, null, 'graph TD;', 'A-->B'));
  assert.equal(mermaidSource([wrapped]), 'graph TD;A-->B');
});
