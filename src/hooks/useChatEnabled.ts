import { useSiteStore } from '@/stores/siteStore';

/**
 * 聊天室开关来自 /api/v1/site 响应（messageWallEnabled / chatEnabled）。
 * 原实现每次挂载都请求 /api/v1/settings/chat，一次页面访问白烧 1 次 Worker 额度。
 */
export function useChatEnabled() {
  return useSiteStore((s) => s.config.chatEnabled === true);
}
