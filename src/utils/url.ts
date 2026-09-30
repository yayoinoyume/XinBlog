/**
 * 友链链接校验：仅接受 http/https 绝对地址，阻止 javascript:/data:/file: 等协议
 * （该地址会被站长后台预览并对外展示，且由普通用户在申请表单里自填）。
 *
 * 为什么不放行相对路径：相对路径既无法确定目标站点，也会在后台按本站
 * 基准地址解析成同源文档，恰好是最需要拦截的情形（见 isSameOriginUrl）。
 * 纯文本、缺少协议头、其它协议一律拒绝。
 */
export function isValidFriendUrl(raw: string): boolean {
  const trimmed = (raw || '').trim();
  if (!trimmed) return false;
  try {
    // 单参数构造：没有 base 的相对路径会直接抛错，因此这里天然只接受绝对地址。
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false; // 相对路径、纯文本、非法地址一律拒绝
  }
}
