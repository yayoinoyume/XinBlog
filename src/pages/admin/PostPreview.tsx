import { useDeferredValue, useState } from 'react';
import { Box, alpha } from '@mui/material';
import type { Post, PostDetailThemeConfig } from '@/types';
import type { AdminTag } from '@/api/admin';
import { transformPost, type BackendPost } from '@/api/posts';
import { PostDetailDefaultLayout, PostDetailGlassLayout } from '@/components/PostDetail';
import type { HeadingItem } from '@/components/Post/TableOfContents';
import { useSiteStore } from '@/stores/siteStore';

/** 已保存文章在详情页会展示的自读端字段（编辑表单不保存这些，需要单独带入） */
export interface PostPreviewMeta {
  createdAt: string;
  updatedAt: string;
  readingTime: number;
  views: number;
}

export interface PostPreviewInput {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  coverBase64: string;
  tagIds: number[];
  allTags: AdminTag[];
  editingId: number | null;
  meta: PostPreviewMeta | null;
}

interface PostPreviewProps {
  input: PostPreviewInput;
}

/** 新建文章后端尚无 reading_time，按每 400 字约 1 分钟粗估 */
function estimateReadingTime(content: string): number {
  return Math.max(1, Math.round(content.trim().length / 400));
}

/**
 * 后台文章编辑器内联预览：按站点当前详情页主题渲染整篇文章，
 * 数据全部来自编辑表单，不发任何请求（避免浏览量自增、评论拉取、草稿 404）。
 */
export default function PostPreview({ input }: PostPreviewProps) {
  const config = useSiteStore((s) => s.config);
  const postDetailTheme: PostDetailThemeConfig = config.postDetailTheme || { variant: 'default' };
  const isGlass = postDetailTheme.variant === 'glass';

  // 长文输入时避免每个按键都同步跑一遍 Markdown 解析
  const deferredContent = useDeferredValue(input.content);

  // 玻璃主题侧栏目录是内联元素（非 fixed），可以真实还原
  const [headings, setHeadings] = useState<HeadingItem[]>([]);

  const selectedTags = input.tagIds
    .map((id) => input.allTags.find((t) => t.id === id))
    .filter((t): t is AdminTag => Boolean(t));

  const pseudoAdminPost: BackendPost = {
    id: input.editingId ?? -1,
    title: input.title,
    slug: input.slug,
    excerpt: input.excerpt,
    content: deferredContent,
    cover_base64: input.coverBase64 || undefined,
    author_id: 0,
    status: 'published',
    views: input.meta?.views ?? 0,
    reading_time: input.meta?.readingTime ?? estimateReadingTime(input.content),
    created_at: input.meta?.createdAt ?? new Date().toISOString(),
    updated_at: input.meta?.updatedAt ?? new Date().toISOString(),
    tags: selectedTags,
  };

  // 复用前台同一套转换逻辑（封面 dataURL 兜底、标签映射）
  const basePost = transformPost(pseudoAdminPost);
  const post: Post = { ...basePost, author: config.author || basePost.author };

  const hasBackground = Boolean(config.backgroundImage);
  const backgroundOpacity = config.backgroundOpacity ?? 1;
  const backgroundBlur = config.backgroundBlur ?? 0;

  return (
    <Box sx={{ flex: 1, height: '100%', minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <Box
        sx={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          overflow: 'auto',
          overscrollBehavior: 'contain',
          borderRadius: 1,
          border: (t) => `1px solid ${alpha(t.palette.divider, 0.5)}`,
          bgcolor: isGlass
            ? (t) => (t.palette.mode === 'light' ? alpha(t.palette.primary.main, 0.06) : '#0b1220')
            : 'background.default',
        }}
      >
        {isGlass && hasBackground && (
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              inset: 0,
              zIndex: 0,
              backgroundImage: `url(${config.backgroundImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              opacity: backgroundOpacity,
              filter: backgroundBlur > 0 ? `blur(${backgroundBlur}px)` : undefined,
              transform: backgroundBlur > 0 ? 'scale(1.05)' : undefined,
            }}
          />
        )}

        <Box sx={{ position: 'relative', zIndex: 1 }}>
          {isGlass ? (
            <PostDetailGlassLayout
              post={post}
              siblings={[]}
              theme={postDetailTheme}
              headings={headings}
              onHeadingsExtracted={setHeadings}
              preview
            />
          ) : (
            <PostDetailDefaultLayout post={post} siblings={[]} theme={postDetailTheme} preview />
          )}

        </Box>

      </Box>

    </Box>

  );
}
