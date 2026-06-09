import type { User, Backpack, Item, Notification, ImportantInfo, ScanResult, ApiResponse, AuthResponse } from '@/types';

const API_BASE = '/api';

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  
  return response.json();
}

// Auth API
export const authApi = {
  async register(email: string, password: string, name: string): Promise<AuthResponse> {
    return fetchApi('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
  },
  
  async login(email: string, password: string): Promise<AuthResponse> {
    return fetchApi('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },
  
  async logout(): Promise<ApiResponse> {
    return fetchApi('/auth/logout', { method: 'POST' });
  },
  
  async me(): Promise<AuthResponse> {
    return fetchApi('/auth/me');
  },
};

// Backpacks API
export const backpacksApi = {
  async getAll(): Promise<ApiResponse<{ own: Backpack[]; shared: (Backpack & { permission: string })[] }>> {
    return fetchApi('/backpacks');
  },
  
  async getById(id: string): Promise<ApiResponse<Backpack & { isOwner: boolean; permission: string }>> {
    return fetchApi(`/backpacks/${id}`);
  },
  
  async create(data: { name: string; description?: string; color?: string; icon?: string }): Promise<ApiResponse<Backpack>> {
    return fetchApi('/backpacks', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  
  async update(id: string, data: Partial<Backpack>): Promise<ApiResponse<Backpack>> {
    return fetchApi(`/backpacks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
  
  async delete(id: string): Promise<ApiResponse> {
    return fetchApi(`/backpacks/${id}`, { method: 'DELETE' });
  },
  
  async share(backpackId: string, email: string, permission: 'read' | 'edit'): Promise<ApiResponse> {
    return fetchApi(`/backpacks/${backpackId}/share`, {
      method: 'POST',
      body: JSON.stringify({ email, permission }),
    });
  },
  
  async getShares(backpackId: string): Promise<ApiResponse> {
    return fetchApi(`/backpacks/${backpackId}/share`);
  },
  
  async removeShare(backpackId: string, userId: string): Promise<ApiResponse> {
    return fetchApi(`/backpacks/${backpackId}/share?userId=${userId}`, { method: 'DELETE' });
  },
};

// Items API
export const itemsApi = {
  async getByBackpack(backpackId: string): Promise<ApiResponse<Item[]>> {
    return fetchApi(`/items?backpackId=${backpackId}`);
  },
  
  async getExpiring(days: number): Promise<ApiResponse<(Item & { backpack: { id: string; name: string; color: string } })[]>> {
    return fetchApi(`/items?expiringWithin=${days}`);
  },
  
  async create(data: Partial<Item> & { backpackId: string }): Promise<ApiResponse<Item>> {
    return fetchApi('/items', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  
  async update(id: string, data: Partial<Item>): Promise<ApiResponse<Item>> {
    return fetchApi(`/items/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
  
  async delete(id: string): Promise<ApiResponse> {
    return fetchApi(`/items/${id}`, { method: 'DELETE' });
  },
};

// Scan API
export const scanApi = {
  async scanImage(imageBase64: string): Promise<ApiResponse<ScanResult>> {
    return fetchApi('/scan', {
      method: 'POST',
      body: JSON.stringify({ image: imageBase64 }),
    });
  },
};

// Export API
export const exportApi = {
  async exportPdf(backpackId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/export/pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backpackId }),
    });
    
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plecak.pdf';
    a.click();
    URL.revokeObjectURL(url);
  },
  
  async exportCsv(backpackId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/export/excel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backpackId }),
    });
    
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plecak.csv';
    a.click();
    URL.revokeObjectURL(url);
  },
};

// Notifications API
export const notificationsApi = {
  async getAll(): Promise<ApiResponse<{ notifications: Notification[]; unreadCount: number }>> {
    return fetchApi('/notifications');
  },
  
  async markRead(notificationId?: string): Promise<ApiResponse> {
    return fetchApi('/notifications', {
      method: 'POST',
      body: JSON.stringify(notificationId ? { notificationId } : { markAllRead: true }),
    });
  },
};

// Important info API
export const importantInfoApi = {
  async getAll(): Promise<ApiResponse<ImportantInfo[]>> {
    return fetchApi('/important-info');
  },

  async create(data: { title: string; content: string }): Promise<ApiResponse<ImportantInfo>> {
    return fetchApi('/important-info', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async delete(id: string): Promise<ApiResponse> {
    return fetchApi(`/important-info/${id}`, { method: 'DELETE' });
  },
};

// Sync API
export const syncApi = {
  async get(): Promise<ApiResponse> {
    return fetchApi('/sync');
  },
  
  async sync(changes: unknown[]): Promise<ApiResponse> {
    return fetchApi('/sync', {
      method: 'POST',
      body: JSON.stringify({ changes }),
    });
  },
};
