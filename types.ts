
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
  lastUpdatedBy: string;
  lastUpdatedByBadge: string;
}

export interface MovementLog {
  id: string;
  itemId: string;
  itemName: string;
  type: 'IN' | 'OUT' | 'CREATE' | 'EDIT' | 'DELETE';
  quantity: number;
  userBadgeId: string;
  userName: string;
  timestamp: string;
  reason?: string;
}

export interface UserProfile {
  badgeId: string;
  name: string;
  role: 'admin' | 'staff';
  photoUrl?: string;
  createdAt: string;
}

export interface UserSession {
  badgeId: string;
  name: string;
  role: 'admin' | 'staff';
  photoUrl?: string;
}

export enum AppView {
  DASHBOARD = 'DASHBOARD',
  INVENTORY = 'INVENTORY',
  MOVEMENTS = 'MOVEMENTS',
  USERS = 'CONFIGURAÇÕES'
}

export interface PendingAction {
  id: string;
  type: string;
  payload: any;
  timestamp: number;
}
