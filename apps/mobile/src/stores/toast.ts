import { create } from 'zustand';

export type ToastTone = 'info' | 'success' | 'error';

interface ToastState {
  id: number;
  message: string | null;
  tone: ToastTone;
  show: (message: string, tone?: ToastTone) => void;
  hide: () => void;
}

export const useToast = create<ToastState>((set) => ({
  id: 0,
  message: null,
  tone: 'info',
  show: (message, tone = 'info') => set((s) => ({ id: s.id + 1, message, tone })),
  hide: () => set({ message: null }),
}));

export const toast = {
  info: (m: string) => useToast.getState().show(m, 'info'),
  success: (m: string) => useToast.getState().show(m, 'success'),
  error: (m: string) => useToast.getState().show(m, 'error'),
};
