import { create } from 'zustand';

type ThemeMode = 'light' | 'dark';

interface ThemeState {
  mode: ThemeMode;
}

// 站点仅支持深色模式：浅色效果不达标，暂不提供切换
export const useThemeStore = create<ThemeState>()(() => ({ mode: 'dark' }));
