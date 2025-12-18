
export interface InventoryItem {
  id: string;
  name: string;
  description?: string;
  unit: string;
  minStock: number;
  currentStock: number;
  price: number; // Preço unitário para cálculo de valor de estoque
  location: string;
  department: string;
  category: string; // Categoria do item (Ex: Consumível, Ativo, Ferramenta)
  photoUrl?: string;
  lastUpdated: string;
  lastUpdatedBy?: string;
}

export interface MovementLog {
  id: string;
  itemId: string;
  itemName: string;
  type: 'IN' | 'OUT';
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
  SETTINGS = 'SETTINGS',
}

export type SyncActionType = 'ADD_ITEM' | 'UPDATE_ITEM' | 'DELETE_ITEM' | 'ADD_MOVEMENT' | 'ADD_USER' | 'ADD_DEPT' | 'DELETE_DEPT';

export interface PendingAction {
  id: string;
  type: SyncActionType;
  payload: any;
  timestamp: number;
}
