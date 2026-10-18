import { Box } from '@mui/material';
import { useEffect, useRef } from 'react';
import type { Mounted } from 'pele/core';

interface MermaidDiagramProps {
  source: string;
}

/**
 * 用 pele 把 ```mermaid 代码块渲染成 SVG。
 * pele 按图表类型分包，只有文章里真的出现 mermaid 时才加载对应解析器。
 * 配色通过 CSS 变量交给 MUI 主题，切换明暗模式无需重新渲染。
 */
export function MermaidDiagram({ source }: MermaidDiagramProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let mounted: Mounted | undefined;
    let cancelled = false;

    import('pele/lazy')
      .then(({ mountAsync }) =>
        mountAsync(el, source, {
          zoom: { labels: { zoomIn: '放大', zoomOut: '缩小', reset: '还原' } },
          linkRel: 'noopener noreferrer',
          // 图表里的图片会发起真实外链请求（可用于追踪），博客用不到就关掉
          images: false,
        })
      )
      .then((m) => {
        if (cancelled) m.destroy();
        else mounted = m;
      })
      .catch((error: unknown) => {
        // 加载失败时保留原始源码，避免整篇文章白屏
        console.warn('[mermaid] 渲染失败，已回退为源码：', error);
        if (!cancelled) el.textContent = source;
      });

    return () => {
      cancelled = true;
      mounted?.destroy();
    };
  }, [source]);

  return (
    <Box
      ref={ref}
      className="mermaid-diagram"
      sx={{
        my: 3,
        textAlign: 'center',
        overflow: 'hidden',
        '--pele-bg': (t) => t.palette.background.paper,
        '--pele-fg': (t) => t.palette.text.primary,
        '--pele-muted': (t) => t.palette.text.secondary,
        '--pele-line': (t) => t.palette.text.primary,
        '--pele-surface': (t) => t.palette.action.hover,
        '--pele-surface-alt': (t) => t.palette.action.selected,
        '--pele-border': (t) => t.palette.divider,
        '--pele-accent': (t) => t.palette.primary.main,
        '--pele-critical': (t) => t.palette.error.main,
        '--pele-error': (t) => t.palette.error.main,
        '--pele-radius': '6px',
        // 图表系列色（饼图、雷达、git 分支等）用主题调色板，随明暗模式变化。
        // 8 个位置取 6 个色相 + 2 个变体，避免 7/8 与 1/2 同色。
        ...Object.fromEntries(
          (
            [
              ['primary', 'main'],
              ['secondary', 'main'],
              ['error', 'main'],
              ['warning', 'main'],
              ['info', 'main'],
              ['success', 'main'],
              ['primary', 'light'],
              ['secondary', 'dark'],
            ] as const
          ).map(([name, tone], i) => [`--pele-series-${i + 1}`, (t) => t.palette[name][tone]])
        ),
        '& svg': { margin: '0 auto' },
      }}
    />
  );
}
