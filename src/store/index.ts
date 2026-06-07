import { create } from 'zustand';
import type { User, Backpack, Item, Notification } from '@/types';

type View = 
  | 'login' 
  | 'register' 
  | 'dashboard' 
  | 'backpack' 
  | 'settings';

interface AppState {
  // Auth
  user: User | null;
  isLoading: boolean;
  isInitialized: boolean;
  
  // View state
  currentView: View;
  selectedBackpackId: string | null;
  
  // Data
  backpacks: Backpack[];
  sharedBackpacks: (Backpack & { permission: string })[];
  items: Item[];
  notifications: Notification[];
  unreadNotifications: number;
  
  // UI state
  isOffline: boolean;
  sidebarOpen: boolean;
  
  // Actions
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  setInitialized: (initialized: boolean) => void;
  setCurrentView: (view: View) => void;
  setSelectedBackpackId: (id: string | null) => void;
  setBackpacks: (backpacks: Backpack[]) => void;
  setSharedBackpacks: (backpacks: (Backpack & { permission: string })[]) => void;
  setItems: (items: Item[]) => void;
  setNotifications: (notifications: Notification[]) => void;
  setUnreadNotifications: (count: number) => void;
  setIsOffline: (offline: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  
  // Convenience actions
  addBackpack: (backpack: Backpack) => void;
  updateBackpack: (id: string, data: Partial<Backpack>) => void;
  removeBackpack: (id: string) => void;
  
  addItem: (item: Item) => void;
  updateItem: (id: string, data: Partial<Item>) => void;
  removeItem: (id: string) => void;
  
  logout: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Initial state
  user: null,
  isLoading: true,
  isInitialized: false,
  
  currentView: 'login',
  selectedBackpackId: null,
  
  backpacks: [],
  sharedBackpacks: [],
  items: [],
  notifications: [],
  unreadNotifications: 0,
  
  isOffline: false,
  sidebarOpen: false,
  
  // Setters
  setUser: (user) => set({ user, currentView: user ? 'dashboard' : 'login' }),
  setLoading: (isLoading) => set({ isLoading }),
  setInitialized: (isInitialized) => set({ isInitialized }),
  setCurrentView: (currentView) => set({ currentView }),
  setSelectedBackpackId: (selectedBackpackId) => set({ selectedBackpackId }),
  setBackpacks: (backpacks) => set({ backpacks }),
  setSharedBackpacks: (sharedBackpacks) => set({ sharedBackpacks }),
  setItems: (items) => set({ items }),
  setNotifications: (notifications) => set({ notifications }),
  setUnreadNotifications: (unreadNotifications) => set({ unreadNotifications }),
  setIsOffline: (isOffline) => set({ isOffline }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  
  // Convenience actions
  addBackpack: (backpack) => set((state) => ({
    backpacks: [backpack, ...state.backpacks],
  })),
  
  updateBackpack: (id, data) => set((state) => ({
    backpacks: state.backpacks.map((b) => 
      b.id === id ? { ...b, ...data } : b
    ),
  })),
  
  removeBackpack: (id) => set((state) => ({
    backpacks: state.backpacks.filter((b) => b.id !== id),
    selectedBackpackId: state.selectedBackpackId === id ? null : state.selectedBackpackId,
  })),
  
  addItem: (item) => set((state) => ({
    items: [...state.items, item],
  })),
  
  updateItem: (id, data) => set((state) => ({
    items: state.items.map((i) => 
      i.id === id ? { ...i, ...data } : i
    ),
  })),
  
  removeItem: (id) => set((state) => ({
    items: state.items.filter((i) => i.id !== id),
  })),
  
  logout: () => set({
    user: null,
    currentView: 'login',
    selectedBackpackId: null,
    backpacks: [],
    sharedBackpacks: [],
    items: [],
    notifications: [],
    unreadNotifications: 0,
  }),
}));
