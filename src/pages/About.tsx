import { Container, Box, Typography, Paper, alpha, Fade, IconButton, Tooltip, Stack } from '@mui/material';
import { LazyImage } from '@/components/Common/LazyImage';
import { useSiteStore } from '@/stores/siteStore';
import { getSocialPlatformIcon, getSocialDomain, normalizeSocials } from '@/utils/socialLinks';

export function About() {
  const { config } = useSiteStore();

  return (
    <Fade in timeout={400}>
      <Container maxWidth="lg" sx={{ py: { xs: 4, md: 8 }, pb: { xs: 8, md: 12 } }}>
        <Paper
          elevation={0}
          sx={{
            p: { xs: 3, md: 6 },
            borderRadius: 1,
            textAlign: 'center',
            background: (theme) =>
              `linear-gradient(135deg, ${theme.palette.background.paper} 0%, ${theme.palette.background.default} 100%)`,
            boxShadow: (theme) =>
              theme.palette.mode === 'light'
                ? `0 8px 40px ${alpha(theme.palette.primary.main, 0.1)}`
                : `0 8px 40px ${alpha(theme.palette.common.black, 0.3)}`,
          }}
        >
          {config.logo ? (
            <Box
              sx={{
                width: { xs: 96, sm: 120 },
                height: { xs: 96, sm: 120 },
                mx: 'auto',
                mb: 3,
                borderRadius: '50%',
                overflow: 'hidden',
                boxShadow: (theme) => `0 8px 32px ${alpha(theme.palette.primary.main, 0.3)}`,
              }}
            >
              <LazyImage
                src={config.logo}
                alt={config.author}
                objectFit="cover"
                placeholder="color"
                style={{ borderRadius: '50%' }}
              />
            </Box>

          ) : null}
          <Typography variant="h3" component="h1" sx={{ fontWeight: 800, mb: 2, fontSize: { xs: '1.75rem', sm: '2.5rem', md: '3rem' }, overflowWrap: 'break-word' }}>
            {config.author}
          </Typography>

          {config.about?.subtitle && (
            <Typography variant="h6" color="primary.main" sx={{ mb: 3, fontWeight: 500, fontSize: { xs: '1rem', sm: '1.25rem' }, overflowWrap: 'break-word' }}>
              {config.about.subtitle}
            </Typography>

          )}
          {config.about?.bio && (
            <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.8, maxWidth: { xs: '100%', sm: 600 }, mx: 'auto', fontSize: { xs: '0.875rem', sm: '1rem' }, overflowWrap: 'break-word' }}>
              {config.about.bio}
            </Typography>

          )}

          {(() => {
            const socials = normalizeSocials(config.about?.socials);
            return socials.length > 0 ? (
            <Stack
              direction="row"
              justifyContent="center"
              spacing={{ xs: 1, sm: 1.5 }}
              sx={{ mt: 4, flexWrap: 'wrap', gap: { xs: 1, sm: 1.5 } }}
            >
              {socials.map((social) => {
                const Icon = getSocialPlatformIcon(social.platform);
                return (
                  <Tooltip key={social.url} title={social.label} placement="top">
                    <IconButton
                      component="a"
                      href={social.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={social.label || getSocialDomain(social.url)}
                      sx={{
                        width: 44,
                        height: 44,
                        border: (theme) =>
                          `1px solid ${alpha(theme.palette.primary.main, theme.palette.mode === 'light' ? 0.2 : 0.35)}`,
                        color: 'primary.main',
                        backgroundColor: (theme) =>
                          alpha(theme.palette.primary.main, theme.palette.mode === 'light' ? 0.08 : 0.18),
                        transition: 'all 0.2s',
                        '&:hover': {
                          backgroundColor: 'primary.main',
                          color: (theme) =>
                            theme.palette.getContrastText(theme.palette.primary.main),
                          transform: 'translateY(-2px)',
                        },
                      }}
                    >
                      {social.icon ? (
                        <Box
                          component="img"
                          src={social.icon}
                          alt=""
                          sx={{ width: 24, height: 24, objectFit: 'contain' }}
                        />
                      ) : (
                        <Icon size={22} />
                      )}
                    </IconButton>
                  </Tooltip>
                );
              })}
            </Stack>
            ) : null;
          })()}

          {config.about?.tags && config.about.tags.length > 0 && (
            <Box sx={{ mt: 4, display: 'flex', justifyContent: 'center', gap: { xs: 1, sm: 2 }, flexWrap: 'wrap' }}>
              {config.about.tags.map((tag) => (
                <Typography
                  key={tag}
                  variant="body2"
                  sx={{
                    px: { xs: 1.5, sm: 2 },
                    py: 0.75,
                    borderRadius: 1,
                    backgroundColor: (theme) =>
                      alpha(theme.palette.primary.main, theme.palette.mode === 'light' ? 0.1 : 0.2),
                    color: 'primary.main',
                    fontWeight: 500,
                    overflowWrap: 'break-word',
                    maxWidth: '100%',
                  }}
                >
                  {tag}
                </Typography>

              ))}
            </Box>

          )}
        </Paper>

      </Container>

    </Fade>

  );
}
