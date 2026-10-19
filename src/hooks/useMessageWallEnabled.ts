import { useSiteStore } from '@/stores/siteStore';

/**
 * 留言墙开关来自 /api/v1/site 响应（messageWallEnabled / chatEnabled）。
 * 原实现每次挂载都请求 /api/v1/settings/message-wall，一次页面访问白烧 1 次 Worker 额度。
 */
export function useMessageWallEnabled() {
  return useSiteStore((s) => s.config.messageWallEnabled === true);
}
