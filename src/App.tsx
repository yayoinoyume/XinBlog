import { useEffect } from 'react';
import { ThemeProvider, CssBaseline, GlobalStyles, alpha } from '@mui/material';
import { RouterProvider } from 'react-router-dom';
import { useAppTheme } from '@/theme';
import { router } from '@/router';
import { useThemeConfigStore } from '@/stores/themeConfigStore';
import { useSiteStore } from '@/stores/siteStore';
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { SceneThemeEffects } from '@/themes/scene';
import { ClickEffect } from '@/components/ClickEffect';
import { GlobalMusicPlayer } from '@/components/MusicPlayer/GlobalMusicPlayer';
import { MusicPlayerProvider } from '@/components/MusicPlayer/MusicPlayerContext';
import { DISABLE_CONTEXT_MENU } from '@/config';

function GlobalScrollbarStyles() {
  return (
    <GlobalStyles
      styles={(theme) => ({
        '*': {
          scrollbarWidth: 'thin',
          scrollbarColor: `${
            theme.palette.mode === 'light'
              ? alpha(theme.palette.primary.main, 0.3)
              : alpha(theme.palette.common.white, 0.2)
          } transparent`,
        },
        html: {
          scrollBehavior: 'smooth',
        },
        '@media (hover: hover) and (pointer: fine)': {
          '*::-webkit-scrollbar': {
            width: '8px',
            height: '8px',
          },
          '*::-webkit-scrollbar-track': {
            background: 'transparent',
          },
          '*::-webkit-scrollbar-thumb': {
            backgroundColor:
              theme.palette.mode === 'light'
                ? alpha(theme.palette.primary.main, 0.3)
                : alpha(theme.palette.common.white, 0.2),
            borderRadius: `${Math.max(4, theme.shape.borderRadius / 2)}px`,
          },
          '*::-webkit-scrollbar-thumb:hover': {
            backgroundColor:
              theme.palette.mode === 'light'
                ? alpha(theme.palette.primary.main, 0.5)
                : alpha(theme.palette.common.white, 0.3),
          },
        },
        '@keyframes post-card-enter': {
          from: { opacity: 0, transform: 'translateY(6px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
        '.post-card-enter-motion': {
          animation: 'post-card-enter 300ms ease both',
        },
        '@media (prefers-reduced-motion: reduce)': {
          '.post-card-enter-motion': {
            animation: 'none !important',
          },
        },
      })}
    />
  );
}

function App() {
  const theme = useAppTheme();
  const music = useSiteStore((s) => s.config.music);

  useEffect(() => {
    const state = useThemeConfigStore.getState();
    if (state.borderRadius > 16) {
      useThemeConfigStore.setState({ borderRadius: 16 });
    }
    
    // 站点、主题、布局配置都有本地持久化/默认值。首屏不应等待网络才渲染：
    // 先用当前状态立即开门，配置回来后由各 store 的订阅自动更新。
    void useSiteStore
      .getState()
      .loadConfig()
      .then(() => {
        // theme/ui 的 loadConfig 只读取 siteStore，无网络 I/O；保持顺序即可。
        void useThemeConfigStore.getState().loadConfig();
        void useUIStore.getState().loadConfig();
      })
      .catch(() => {
        // 站点配置失败时仍保留本地缓存/默认配置，页面不要被异常状态挂住。
      });
  }, []);

  useEffect(() => {
    if (!DISABLE_CONTEXT_MENU) return;
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    document.addEventListener('contextmenu', handleContextMenu);
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  
  useEffect(() => {
    const tick = () => {
      void useAuthStore.getState().ensureSession();
    };
    tick();
    const interval = window.setInterval(tick, 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <GlobalScrollbarStyles />
      <SceneThemeEffects />
      <ClickEffect />
      <MusicPlayerProvider config={music}>
        <RouterProvider router={router} />
        <GlobalMusicPlayer />
      </MusicPlayerProvider>
    </ThemeProvider>

  );
}

export default App;
