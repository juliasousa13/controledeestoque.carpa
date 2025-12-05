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

// Tipos para Sincronização Offline
export type SyncActionType = 'ADD_ITEM' | 'UPDATE_ITEM' | 'DELETE_ITEM' | 'ADD_MOVEMENT' | 'ADD_USER' | 'ADD_DEPT' | 'DELETE_DEPT';

export interface PendingAction {
  id: string; // ID único da ação
  type: SyncActionType;
  payload: any;
  timestamp: number;
}
