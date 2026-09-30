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
import { decodeJwtPayload } from '@/utils/token';

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
    
    useSiteStore
      .getState()
      .loadConfig()
      .then(() => {
        // theme/ui 的 loadConfig 内部无 I/O（同步读 siteStore.config 后 set），
        // 必须保持 site → theme → ui 顺序，禁止改成 Promise.all
        void useThemeConfigStore.getState().loadConfig();
        void useUIStore.getState().loadConfig();
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
    let timer: number | undefined;
    let cancelled = false;
    // 降级刷新最多只做一次：若换来的新 token 仍解析不出 exp，就不再递归刷新
    let fellBackOnce = false;

    const scheduleRefresh = () => {
      if (cancelled) return;
      window.clearTimeout(timer);
      const { isAuthenticated, token, refresh } = useAuthStore.getState();
      if (!isAuthenticated || !token) return;

      // payload 用 base64url（含 - / _），裸 atob 会抛 InvalidCharacterError；统一交给
      // decodeJwtPayload，失败返回 null 而不抛。
      const payload = decodeJwtPayload(token);
      const exp = payload?.exp;

      if (typeof exp !== 'number') {
        // 降级路径：读不到 exp 就排不了程，旧代码的空 catch 会让 access token 48h 后
        // 真的过期且无人续期。退化为立即 refresh() 一次，用新 token 的 exp 重新排程。
        console.warn(
          '[auth] 解析 token 失败，自动续期未排程 → 退化为立即刷新',
          payload === null ? 'payload 解析失败' : 'payload 缺少 exp 声明'
        );
        if (fellBackOnce) return; // 刷新后仍解析不出 exp：不再刷新，避免死循环，交由 401 流程兜底
        fellBackOnce = true;
        void refresh().then((ok) => {
          if (ok && !cancelled) scheduleRefresh();
        });
        return;
      }
      fellBackOnce = false;

      const expiresAt = exp * 1000;
      const refreshAt = expiresAt - 5 * 60 * 1000;
      const delay = refreshAt - Date.now();

      // 触发续期后必须用新 token 的 exp 重排，否则定时器只响一次，之后只能等 401 兜底。
      // 仅在 refresh() 返回 true（确实换到新 token）时才重排：失败也重排会读到旧 token、
      // delay 仍为负，立刻再次触发 refresh，形成无限刷新循环打服务端。
      if (delay <= 0) {
        void refresh().then((ok) => {
          if (ok && !cancelled) scheduleRefresh();
        });
      } else {
        timer = window.setTimeout(() => {
          void refresh().then((ok) => {
            if (ok && !cancelled) scheduleRefresh();
          });
        }, delay);
      }
    };

    scheduleRefresh();
    const unsubscribe = useAuthStore.subscribe((state, prevState) => {
      if (state.isAuthenticated && !prevState.isAuthenticated) {
        scheduleRefresh();
      }
      if (!state.isAuthenticated && prevState.isAuthenticated) {
        window.clearTimeout(timer);
      }
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      unsubscribe();
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
