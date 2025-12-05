
import { InventoryItem, MovementLog, UserProfile, PendingAction } from '../types';

const KEYS = {
  ITEMS: 'carpa_offline_items',
  MOVEMENTS: 'carpa_offline_movements',
  USERS: 'carpa_offline_users',
  DEPTS: 'carpa_offline_depts',
  QUEUE: 'carpa_sync_queue'
};

// --- Data Persistence ---

export const saveOfflineData = (
  items: InventoryItem[],
  movements: MovementLog[],
  users: UserProfile[],
  depts: string[]
) => {
  try {
    localStorage.setItem(KEYS.ITEMS, JSON.stringify(items));
    localStorage.setItem(KEYS.MOVEMENTS, JSON.stringify(movements));
    localStorage.setItem(KEYS.USERS, JSON.stringify(users));
    localStorage.setItem(KEYS.DEPTS, JSON.stringify(depts));
  } catch (e) {
    console.error("Erro ao salvar dados offline (Storage Full?)", e);
  }
};

export const loadOfflineData = () => {
  try {
    return {
      items: JSON.parse(localStorage.getItem(KEYS.ITEMS) || '[]'),
      movements: JSON.parse(localStorage.getItem(KEYS.MOVEMENTS) || '[]'),
      users: JSON.parse(localStorage.getItem(KEYS.USERS) || '[]'),
      depts: JSON.parse(localStorage.getItem(KEYS.DEPTS) || '[]'),
    };
  } catch (e) {
    return { items: [], movements: [], users: [], depts: [] };
  }
};

// --- Sync Queue Management ---

export const addToSyncQueue = (action: Omit<PendingAction, 'id' | 'timestamp'>) => {
  const queue: PendingAction[] = JSON.parse(localStorage.getItem(KEYS.QUEUE) || '[]');
  const newAction: PendingAction = {
    ...action,
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    timestamp: Date.now()
  };
  queue.push(newAction);
  localStorage.setItem(KEYS.QUEUE, JSON.stringify(queue));
};

export const getSyncQueue = (): PendingAction[] => {
  return JSON.parse(localStorage.getItem(KEYS.QUEUE) || '[]');
};

export const clearSyncQueue = () => {
  localStorage.setItem(KEYS.QUEUE, '[]');
};

export const removeFromQueue = (id: string) => {
  const queue: PendingAction[] = JSON.parse(localStorage.getItem(KEYS.QUEUE) || '[]');
  const newQueue = queue.filter(item => item.id !== id);
  localStorage.setItem(KEYS.QUEUE, JSON.stringify(newQueue));
};
