
export interface InventoryItem {
  id: string;
  name: string;
  description?: string;
  unit: string;
  min_stock: number;
  current_stock: number;
  location: string;
  department: string;
  photo_url?: string;
  last_updated: string;
  last_updated_by: string;
}

export interface MovementLog {
  id: string;
  item_id: string;
  item_name: string;
  type: 'IN' | 'OUT' | 'CREATE' | 'EDIT' | 'DELETE';
  quantity: number;
  user_badge_id: string;
  user_name: string;
  timestamp: string;
  reason?: string;
}

export interface UserProfile {
  badge_id: string;
  name: string;
  role: 'admin' | 'staff';
  photo_url?: string;
  created_at: string;
}

export interface UserSession {
  badgeId: string;
  name: string;
  role: 'admin' | 'staff';
  photoUrl?: string;
}

export enum AppView {
  DASHBOARD = 'PAINEL',
  INVENTORY = 'ESTOQUE',
  MOVEMENTS = 'HISTÓRICO',
  USERS = 'EQUIPE'
}

export interface PendingAction {
  id: string;
  type: string;
  payload: any;
  timestamp: number;
}
