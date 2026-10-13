import { create } from 'zustand';

interface AppState {
  user: { name: string; role: string } | null;
  theme: 'light' | 'dark';
  setUser: (user: any) => void;
  setTheme: (theme: 'light' | 'dark') => void;
}

export const useAppStore = create<AppState>((set) => ({
  user: { name: '管理员', role: 'admin' },
  theme: 'light',
  setUser: (user) => set({ user }),
  setTheme: (theme) => set({ theme }),
}));
