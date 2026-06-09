// Types for Plecak Ewakuacyjny

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Backpack {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  items?: Item[];
  sharedWith?: SharedBackpack[];
}

export interface Item {
  id: string;
  name: string;
  quantity: number;
  category: ItemCategory;
  expiryDate: Date | null;
  barcode: string | null;
  notes: string | null;
  imageUrl: string | null;
  backpackId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ItemCategory = 
  | 'food'
  | 'water'
  | 'medical'
  | 'tools'
  | 'documents'
  | 'clothes'
  | 'electronics'
  | 'other';

export const ITEM_CATEGORIES: { value: ItemCategory; label: string; icon: string }[] = [
  { value: 'food', label: 'Jedzenie', icon: 'Utensils' },
  { value: 'water', label: 'Woda', icon: 'Droplet' },
  { value: 'medical', label: 'Apteczka', icon: 'Heart' },
  { value: 'tools', label: 'Narzędzia', icon: 'Wrench' },
  { value: 'documents', label: 'Dokumenty', icon: 'FileText' },
  { value: 'clothes', label: 'Ubrania', icon: 'Shirt' },
  { value: 'electronics', label: 'Elektronika', icon: 'Smartphone' },
  { value: 'other', label: 'Inne', icon: 'Package' },
];

export interface SharedBackpack {
  id: string;
  backpackId: string;
  userId: string;
  permission: 'read' | 'edit';
  createdAt: Date;
  user?: User;
  backpack?: Backpack;
}

export interface Notification {
  id: string;
  userId: string;
  type: 'expiry_warning' | 'share_received';
  title: string;
  message: string;
  itemId: string | null;
  isRead: boolean;
  createdAt: Date;
}

export interface ImportantInfo {
  id: string;
  title: string;
  content: string;
  userId: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

// Auth types
export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  email: string;
  password: string;
  name: string;
}

export interface AuthResponse {
  success: boolean;
  user?: User;
  error?: string;
}

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// Offline sync types
export interface SyncData {
  backpacks: Backpack[];
  items: Item[];
  lastSync: string;
}

// OCR Scan result
export interface ScanResult {
  barcode: string | null;
  expiryDate: string | null;
  productName: string | null;
  confidence: number;
}

export interface BarcodeProduct {
  barcode: string;
  found: boolean;
  productName: string | null;
  brand: string | null;
  quantity: string | null;
  imageUrl: string | null;
  source: 'openfoodfacts';
}
