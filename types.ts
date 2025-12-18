
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
  lastUpdatedBy: string; // Nome do colaborador
  lastUpdatedByBadge: string; // Matrícula do colaborador
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
  USERS = 'USERS'
}

export type SyncActionType = 'UPDATE_ITEM' | 'DELETE_ITEM' | 'ADD_MOVEMENT' | 'REGISTER_USER';

export interface PendingAction {
  id: string;
  type: SyncActionType;
  payload: any;
  timestamp: number;
}
