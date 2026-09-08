import { Avatar, Box, Chip, Stack, Typography, IconButton, Tooltip, alpha } from '@mui/material';
import { useSiteStore } from '@/stores/siteStore';
import type { HeroWidgetConfig } from '@/types';
import { getSocialPlatformIcon } from '@/utils/socialLinks';
import { getSocialDomain, normalizeSocials } from '@/utils/socialLinks';

interface ProfileWidgetPropsFromConfig {
  showAvatar?: boolean;
  showTags?: boolean;
  showSocial?: boolean;
  greeting?: string;
}

export function ProfileWidget({ config }: { config: HeroWidgetConfig }) {
  const { config: siteConfig } = useSiteStore();
  const about = siteConfig.about || {};
  const props = (config.props || {}) as ProfileWidgetPropsFromConfig;
  const showAvatar = props.showAvatar !== false;
  const showTags = props.showTags !== false;
  const showSocial = props.showSocial !== false;
  const greeting = props.greeting || '你好，我是';

  
  const { w, h } = config;
  const isTiny = w === 1 && h === 1;
  const isTall = w === 1 && h >= 2;
  const isWide = h === 1 && w >= 2;
  const isCompact = (w === 2 && h === 2) || isWide;
  const isLarge = w >= 3 && h >= 2;
  const avatarSize = isTiny ? 36 : isCompact ? 44 : isLarge ? 64 : 52;
  const titleVariant = isTiny ? 'subtitle1' : isCompact ? 'h6' : 'h5';
  const displayGreeting = !isTiny;
  const displayBio = (isTall && h >= 3) || isLarge || (isCompact && !isWide && about.bio);
  const displayTags = showTags && ((isTall && h >= 3) || isLarge || (isCompact && !isWide)) && about.tags && about.tags.length > 0;
  const displaySocial = showSocial && ((isTall && h >= 3) || isLarge);

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: isCompact ? 1 : 1.5,
        overflow: 'hidden',
      }}
    >
      <Stack
        direction={isTall ? 'column' : 'row'}
        spacing={isCompact ? 1.5 : 2}
        alignItems={isTall ? 'flex-start' : 'center'}
      >
        {showAvatar && (
          <Avatar
            src={about.avatar || siteConfig.logo || undefined}
            sx={{
              width: avatarSize,
              height: avatarSize,
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              fontSize: isTiny ? 14 : isCompact ? 18 : 22,
              fontWeight: 800,
              boxShadow: (theme) => `0 4px 16px ${alpha(theme.palette.primary.main, 0.3)}`,
              flexShrink: 0,
            }}
          >
            {(siteConfig.siteName || 'X').charAt(0).toUpperCase()}
          </Avatar>

        )}
        <Box sx={{ minWidth: 0, flex: 1 }}>
          {displayGreeting && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>
              {greeting}
            </Typography>

          )}
          <Typography
            variant={titleVariant as 'subtitle1' | 'h6' | 'h5'}
            sx={{ fontWeight: 800, overflowWrap: 'break-word' }}
          >
            {siteConfig.author || siteConfig.siteName || 'Xin'}
          </Typography>

        </Box>

      </Stack>


      {displayBio && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: isCompact ? 2 : 3,
            WebkitBoxOrient: 'vertical',
            overflowWrap: 'break-word',
          }}
        >
          {about.bio}
        </Typography>

      )}

      {displayTags && about.tags && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
          {about.tags.slice(0, isCompact ? 3 : 4).map((tag) => (
            <Chip
              key={tag}
              label={tag}
              size="small"
              sx={{
                borderRadius: 1,
                bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                color: 'primary.main',
                fontWeight: 600,
              }}
            />
          ))}
        </Box>

      )}

      {displaySocial && normalizeSocials(about.socials).length > 0 && (
        <Stack
          direction="row"
          spacing={0.75}
          sx={{ mt: 1, flexWrap: 'wrap' }}
          justifyContent="center"
          alignItems="center"
        >
          {normalizeSocials(about.socials).map((social) => {
            const Icon = getSocialPlatformIcon(social.platform);
            return (
              <Tooltip key={social.url} title={social.label} placement="top">
                <IconButton
                  component="a"
                  href={social.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.label || getSocialDomain(social.url)}
                  size="small"
                  sx={{
                    width: isTiny ? 26 : 32,
                    height: isTiny ? 26 : 32,
                    color: 'primary.main',
                    border: (theme) =>
                      `1px solid ${alpha(theme.palette.primary.main, theme.palette.mode === 'light' ? 0.2 : 0.35)}`,
                    backgroundColor: (theme) =>
                      alpha(theme.palette.primary.main, theme.palette.mode === 'light' ? 0.08 : 0.18),
                    '&:hover': {
                      backgroundColor: 'primary.main',
                      color: (theme) => theme.palette.getContrastText(theme.palette.primary.main),
                    },
                  }}
                >
                  {social.icon ? (
                    <Box
                      component="img"
                      src={social.icon}
                      alt=""
                      sx={{ width: 16, height: 16, objectFit: 'contain' }}
                    />
                  ) : (
                    <Icon size={isTiny ? 15 : 17} />
                  )}
                </IconButton>
              </Tooltip>
            );
          })}
        </Stack>

      )}
    </Box>

  );
}
