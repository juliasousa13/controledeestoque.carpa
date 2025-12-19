
import { InventoryItem, MovementLog, UserProfile, PendingAction } from '../types';

const KEYS = {
  ITEMS: 'carpa_offline_items',
  MOVEMENTS: 'carpa_offline_movements',
  USERS: 'carpa_offline_users',
  DEPTS: 'carpa_offline_depts',
  QUEUE: 'carpa_sync_queue'
};

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
    console.error("Erro ao salvar dados offline", e);
  }
};

export const loadOfflineData = () => {
  try {
    return {
      items: JSON.parse(localStorage.getItem(KEYS.ITEMS) || '[]') as InventoryItem[],
      movements: JSON.parse(localStorage.getItem(KEYS.MOVEMENTS) || '[]') as MovementLog[],
      users: JSON.parse(localStorage.getItem(KEYS.USERS) || '[]') as UserProfile[],
      depts: JSON.parse(localStorage.getItem(KEYS.DEPTS) || '[]') as string[],
    };
  } catch (e) {
    return { items: [], movements: [], users: [], depts: [] };
  }
};

export const addToSyncQueue = (action: Omit<PendingAction, 'id' | 'timestamp'>) => {
  const queue: PendingAction[] = JSON.parse(localStorage.getItem(KEYS.QUEUE) || '[]');
  const newAction: PendingAction = {
    ...action,
    id: `AQ-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    timestamp: Date.now()
  };
  queue.push(newAction);
  localStorage.setItem(KEYS.QUEUE, JSON.stringify(queue));
};

export const getSyncQueue = (): PendingAction[] => {
  return JSON.parse(localStorage.getItem(KEYS.QUEUE) || '[]');
};

export const removeFromQueue = (id: string) => {
  const queue: PendingAction[] = JSON.parse(localStorage.getItem(KEYS.QUEUE) || '[]');
  localStorage.setItem(KEYS.QUEUE, JSON.stringify(queue.filter(item => item.id !== id)));
};

export const clearSyncQueue = () => {
  localStorage.setItem(KEYS.QUEUE, '[]');
};
