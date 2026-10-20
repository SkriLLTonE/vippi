import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ShellUiState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

/** Client-only UI state (SPEC §3.2: Zustand is not used for server data). */
export const useShellUi = create<ShellUiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    { name: 'vippi.shell' },
  ),
);
