import { Box, Toolbar, keyframes } from '@mui/material';
import { useRef, useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { NavBar } from './NavBar';
import { SideBar, drawerWidth, miniDrawerWidth, mobileDrawerWidth } from './SideBar';
import { Footer } from './Footer';
import { useUIStore } from '@/stores/uiStore';
import { useSiteStore } from '@/stores/siteStore';
import { useSmoothScroll } from '@/hooks/useSmoothScroll';
import { useSafeMediaQuery } from '@/hooks/useSafeMediaQuery';
import { resolveSpacingConfig } from '@/utils/spacingConfig';

interface MainLayoutProps {
  children: React.ReactNode;
}

const pageFadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

export function MainLayout({ children }: MainLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { sidebarCollapsed } = useUIStore();
  const { config } = useSiteStore();
  const mainRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const { scrollToTop } = useSmoothScroll(mainRef, {
    lerp: 0.08,
    wheelMultiplier: 1,
    touchMultiplier: 1,
    disableOnTouch: true,
    enabled: !config.disableSmoothScroll,
  });

  const hasBackground = Boolean(config.backgroundImage);
  const backgroundOpacity = config.backgroundOpacity ?? 1;
  const backgroundBlur = config.backgroundBlur ?? 0;
  const spacing = resolveSpacingConfig(config.spacing);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  useEffect(() => {
    scrollToTop(true);
  }, [location.pathname, scrollToTop]);

  
  
  const isImmersive = location.pathname.startsWith('/chat/') || location.pathname.startsWith('/agent/');

  
  
  const isFullscreenHero = location.pathname === '/' && config.hero?.mode === 'fullscreen';

  
  
  const useTopNav = config.nav?.layout === 'top';
  const isDesktop = useSafeMediaQuery((t) => t.breakpoints.up('md'), true);
  const currentDrawerWidth = useTopNav
    ? 0
    : isDesktop
      ? (sidebarCollapsed ? miniDrawerWidth : drawerWidth)
      : mobileDrawerWidth;

  
  const backgroundLayer = hasBackground ? (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        zIndex: -1,
        backgroundImage: `url(${config.backgroundImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        opacity: backgroundOpacity,
        filter: backgroundBlur > 0 ? `blur(${backgroundBlur}px)` : undefined,
        transform: backgroundBlur > 0 ? 'scale(1.05)' : undefined,
      }}
    />
  ) : null;

  return (
    <Box
      sx={{
        position: 'relative',
        zIndex: 0,
        display: 'flex',
        minHeight: '100dvh',
        height: '100dvh',
        width: '100%',
        overflow: 'hidden',
        bgcolor: 'transparent',
      }}
    >
      {backgroundLayer}
      {!isImmersive && (
        <NavBar
          onMenuClick={handleDrawerToggle}
          drawerOpen={!useTopNav}
          drawerWidth={currentDrawerWidth}
          scrollTargetRef={mainRef}
          layout={useTopNav ? 'top' : 'sidebar'}
          transparent={isFullscreenHero}
        />
      )}
      {}
      {!useTopNav && (
        <SideBar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      )}
      <Box
        ref={mainRef}
        component="main"
        sx={{
          position: 'relative',
          zIndex: 0,
          width: `calc(100% - ${currentDrawerWidth}px)`,
          flexGrow: 1,
          minWidth: 0,
          height: '100dvh',
          overflow: isImmersive ? 'hidden' : 'auto',
          bgcolor: isImmersive || hasBackground ? 'transparent' : 'background.default',
          transition: (theme) =>
            theme.transitions.create('width', {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.enteringScreen,
            }),
          willChange: 'width',
        }}
      >
        <Box
          sx={{
            minHeight: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            px: isImmersive
              ? 0
              : { xs: `${spacing.mainPaddingX.mobile}px`, md: `${spacing.mainPaddingX.desktop}px` },
          }}
        >
          {!isImmersive && !isFullscreenHero && <Toolbar />}
          <Box sx={isImmersive ? { flex: 1, height: '100dvh', minHeight: 0 } : { flexGrow: 1 }}>
            {/* 原实现用 MUI <Fade>，每次路由切换都要走 Emotion 运行时插桩 + 400ms JS 动画，
                实测首屏占 173ms CPU。换成纯 CSS keyframes：视觉一致，零 JS 开销。 */}
            <Box
              key={location.pathname}
              sx={{
                height: isImmersive ? '100dvh' : 'auto',
                minHeight: isImmersive ? undefined : '100%',
                animation: `${pageFadeIn} 400ms ease-out both`,
                '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
              }}
            >
              {children}
            </Box>

          </Box>

          {!isImmersive && <Footer />}
        </Box>

      </Box>
    </Box>

  );
}
