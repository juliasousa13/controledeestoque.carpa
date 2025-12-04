export interface InventoryItem {
  id: string;
  name: string;
  description?: string;
  unit: string;
  minStock: number;
  currentStock: number;
  location: string;
  department: string;
  photoUrl?: string;
  lastUpdated: string;
  lastUpdatedBy?: string; // Nome do colaborador que alterou por último
}

export interface MovementLog {
  id: string;
  itemId: string;
  itemName: string;
  type: 'IN' | 'OUT';
  quantity: number;
  userBadgeId: string;
  userName: string; // Nome do colaborador
  timestamp: string;
  reason?: string;
}

export interface UserProfile {
  badgeId: string;
  name: string;
  role: 'admin' | 'staff';
  createdAt: string;
}

export interface UserSession {
  badgeId: string;
  name: string;
  role: 'admin' | 'staff';
}

export enum AppView {
  DASHBOARD = 'DASHBOARD',
  INVENTORY = 'INVENTORY',
  MOVEMENTS = 'MOVEMENTS',
  SETTINGS = 'SETTINGS',
}