import type { SocialLink } from '@/types';
import { BRAND_ICONS, FALLBACK_ICON, type BrandIcon } from './brandIcons';

/** 平台 → 品牌图标。优先自定义图片（由调用方处理），这里映射 platform，未收录回退通用 Link 图标。 */
export function getSocialPlatformIcon(platform: string): BrandIcon {
  const p = platform.toLowerCase().trim();
  return BRAND_ICONS[p] || BRAND_ICONS[platform.trim()] || FALLBACK_ICON;
}

/** 校验并规范化社交链接 URL。仅允许 http/https，阻止 javascript: 等危险协议注入；无协议时自动补 https://。非法则返回 ''。 */
export function sanitizeSocialUrl(url: string): string {
  const trimmed = (url || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  // 非 http(s) 开头的显式协议一律拒绝（javascript:, data:, vbscript: 等）
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/i.test(trimmed)) return '';
  // 无协议则视为域名，自动补 https://
  return `https://${trimmed.replace(/^\/+/, '')}`;
}

/** 从 URL 提取友好域名，供 title/展示用（如 github.com）。 */
export function getSocialDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** 规范化：过滤掉没有 label 或有效 url 的条目（用于展示前/保存前清洗），保留自定义 icon。 */
export function normalizeSocials(socials?: SocialLink[]): SocialLink[] {
  if (!Array.isArray(socials)) return [];
  return socials
    .map((s) => ({
      platform: (s.platform || '').trim(),
      label: s.label?.trim() || '',
      url: sanitizeSocialUrl(s.url),
      icon: s.icon?.trim() || undefined,
    }))
    .filter((s) => s.label && s.url);
}

/** 判断一个社交项是否需要加载品牌图标（无自定义 icon 时才需要）。 */
export function needsBrandIcon(social: SocialLink): boolean {
  return !social.icon;
}