import type { ComponentType, CSSProperties } from 'react';
import {
  SiWechat,
  SiBilibili,
  SiZhihu,
  SiDiscord,
  SiGitee,
  SiJuejin,
  SiCsdn,
  SiTiktok,
  SiXiaohongshu,
  SiGithub,
  SiX,
  SiNeteasecloudmusic,
  SiQq,
  SiDouban,
  SiMedium,
  SiSpotify,
  SiSubstack,
  SiYoutube,
  SiFacebook,
  SiInstagram,
  SiTelegram,
  SiReddit,
  SiBluesky,
  SiMastodon,
  SiLine,
  SiWhatsapp,
  SiPinterest,
  SiSinaweibo,
  SiRss,
  SiStackoverflow,
} from 'react-icons/si';
import { FaLinkedin, FaLink, FaGlobe } from 'react-icons/fa6';

interface IconProps {
  size?: number | string;
  className?: string;
  style?: CSSProperties;
  color?: string;
  title?: string;
}

export type BrandIcon = ComponentType<IconProps>;

export const BRAND_ICONS: Record<string, BrandIcon> = {
  github: SiGithub,
  x: SiX,
  wechat: SiWechat,
  weixin: SiWechat,
  bilibili: SiBilibili,
  'b站': SiBilibili,
  zhihu: SiZhihu,
  知乎: SiZhihu,
  discord: SiDiscord,
  gitee: SiGitee,
  掘金: SiJuejin,
  juejin: SiJuejin,
  csdn: SiCsdn,
  tiktok: SiTiktok,
  抖音: SiTiktok,
  小红书: SiXiaohongshu,
  xiaohongshu: SiXiaohongshu,
  网易云音乐: SiNeteasecloudmusic,
  neteasecloudmusic: SiNeteasecloudmusic,
  qq: SiQq,
  douban: SiDouban,
  medium: SiMedium,
  spotify: SiSpotify,
  substack: SiSubstack,
  youtube: SiYoutube,
  facebook: SiFacebook,
  instagram: SiInstagram,
  linkedin: FaLinkedin,
  telegram: SiTelegram,
  reddit: SiReddit,
  bluesky: SiBluesky,
  mastodon: SiMastodon,
  line: SiLine,
  whatsapp: SiWhatsapp,
  pinterest: SiPinterest,
  微博: SiSinaweibo,
  weibo: SiSinaweibo,
  rss: SiRss,
  feed: SiRss,
  website: FaGlobe,
  site: FaGlobe,
  blog: FaGlobe,
  home: FaGlobe,
  stackoverflow: SiStackoverflow,
};

export const FALLBACK_ICON: BrandIcon = FaLink;