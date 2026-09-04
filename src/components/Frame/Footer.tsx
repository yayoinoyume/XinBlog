import { Box, Typography, Container, alpha, Fade, Divider } from '@mui/material';
import { Link } from 'react-router-dom';
import { useSiteStore } from '@/stores/siteStore';
import { resolveSpacingConfig } from '@/utils/spacingConfig';

export function Footer() {
  const { config } = useSiteStore();
  const spacing = resolveSpacingConfig(config.spacing);

  return (
    <Fade in timeout={400}>
      <Box
        component="footer"
        sx={{
          py: { xs: `${spacing.footerPaddingY.mobile}px`, md: `${spacing.footerPaddingY.desktop}px` },
          mt: 'auto',
          borderTop: '1px solid',
          borderColor: 'divider',
          backgroundColor: (theme) =>
            theme.palette.mode === 'light'
              ? alpha(theme.palette.primary.main, 0.02)
              : alpha(theme.palette.common.black, 0.2),
        }}
      >
        <Container maxWidth="lg">
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
            textAlign: 'center',
          }}
        >
          {config.footerText ? (
            <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'break-word', maxWidth: '100%' }}>
              {config.footerText}
            </Typography>

          ) : null}

          <Divider sx={{ width: '100%', my: 1, opacity: 0.5 }} />
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: { xs: `${spacing.footerLinkGap.mobile}px`, md: `${spacing.footerLinkGap.desktop}px` },
              flexWrap: 'wrap',
            }}
          >
            <Typography
              component={Link}
              to="/agreement"
              variant="caption"
              sx={{
                color: (theme) => alpha(theme.palette.primary.main, 0.7),
                textDecoration: 'none',
                transition: 'color 0.2s ease',
                '&:hover': {
                  color: (theme) => theme.palette.primary.main,
                  textDecoration: 'underline',
                },
              }}
            >
              用户协议
            </Typography>

            <Typography
              component={Link}
              to="/privacy"
              variant="caption"
              sx={{
                color: (theme) => alpha(theme.palette.primary.main, 0.7),
                textDecoration: 'none',
                transition: 'color 0.2s ease',
                '&:hover': {
                  color: (theme) => theme.palette.primary.main,
                  textDecoration: 'underline',
                },
              }}
            >
              隐私政策
            </Typography>

          </Box>

        </Box>

      </Container>

    </Box>

    </Fade>

  );
}
