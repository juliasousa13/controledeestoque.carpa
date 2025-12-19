
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
  is_active?: boolean;
}

export interface Department {
  id: string;
  name: string;
  created_at?: string;
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
  role: string;
  photo_url?: string;
  created_at: string;
  last_seen?: string;
}

export interface UserSession {
  badgeId: string;
  name: string;
  role: string;
  photoUrl?: string;
}

export enum AppView {
  DASHBOARD = 'PAINEL',
  INVENTORY = 'ESTOQUE',
  MOVEMENTS = 'HISTÓRICO',
  USERS = 'EQUIPE',
  SETTINGS = 'CONFIGURAÇÕES'
}

export interface PendingAction {
  id: string;
  type: 'UPSERT_ITEM' | 'INSERT_MOVEMENT' | 'UPDATE_USER' | 'DELETE_ITEM' | 'UPSERT_DEPT';
  table: 'inventory_items' | 'movements' | 'users' | 'departments';
  data: any;
  timestamp: number;
}
