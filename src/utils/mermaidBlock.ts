import { Children, isValidElement } from 'react';
import type { ReactNode } from 'react';

function rawText(children?: ReactNode): string {
  let out = '';
  Children.forEach(children, (child) => {
    if (typeof child === 'string' || typeof child === 'number') out += child;
    else if (isValidElement<{ children?: ReactNode }>(child)) out += rawText(child.props?.children);
  });
  return out;
}

/**
 * 从 <pre> 的子节点里取出 ```mermaid 代码块的源码。
 * 不是 mermaid 代码块时返回 null，交回给普通代码块渲染（带复制按钮）。
 */
export function mermaidSource(children?: ReactNode): string | null {
  const only = Children.toArray(children);
  if (only.length !== 1) return null;
  const child = only[0];
  if (!isValidElement<{ className?: string; children?: ReactNode }>(child)) return null;
  const className = child.props?.className;
  if (typeof className !== 'string' || !className.split(/\s+/).includes('language-mermaid')) return null;
  return rawText(child.props?.children);
}
