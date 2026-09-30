export function getToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    const raw = localStorage.getItem('auth-state');
    if (!raw) return '';
    const state = JSON.parse(raw);
    return state?.state?.token || '';
  } catch {
    return '';
  }
}

export interface JwtPayload {
  exp?: number;
  iat?: number;
  [claim: string]: unknown;
}

/** base64url → 标准 base64：还原字母表差异并补齐 `=` padding。 */
function base64UrlToBase64(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (normalized.length % 4)) % 4;
  return normalized + '='.repeat(padding);
}

/**
/**
 * 解析 JWT 的 payload 段（不解签名，仅读 exp/iat 等非敏感声明）。
 *
 * 不用 `atob(token.split('.')[1])` 的原因：payload 是 base64url（含 - / _），
 * atob 只认标准 base64，遇这两字符抛 InvalidCharacterError，被上层 catch 吞掉后误判
 * 「token 非法」；且 atob 产出 latin1 字节串，中文用户名须按 UTF-8 重解码，否则
 * JSON.parse 前已乱码（用户名允许中文）。
 *
 * 任何异常都返回 null 且不抛：解析失败只说明「本地读不到 exp」，不代表 token 无效，
 * 应交给服务端的 401 → 刷新流程判定。
 */
export function decodeJwtPayload(token: string): JwtPayload | null {
  if (!token) return null;
  try {
    const segments = token.split('.');
    if (segments.length < 2) return null;
    const segment = segments[1];
    if (!segment) return null;

    const binary = atob(base64UrlToBase64(segment));
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    const json = new TextDecoder('utf-8').decode(bytes);

    const payload: unknown = JSON.parse(json);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    return payload as JwtPayload;
  } catch {
    return null;
  }
}
