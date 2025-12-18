
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  LayoutDashboard, Package, Plus, Search, Trash2, Moon, Sun, Menu, X, 
  Camera, AlertTriangle, Loader2, RefreshCw, TrendingDown, Box, 
  History, Activity, Edit3, Users as UsersIcon, FileSpreadsheet, 
  Upload, CheckCircle2, User as UserIcon, LogOut, ChevronRight,
  Info, Check, CloudCheck, Settings as SettingsIcon, Database, ShieldCheck
} from 'lucide-react';
import { InventoryItem, MovementLog, UserSession, AppView, UserProfile } from './types';
import { Logo } from './components/Logo';
import { supabase } from './services/supabaseClient';

declare const XLSX: any;

export default function App() {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('carpa_theme');
    return saved ? saved === 'dark' : true;
  });
  
  const [user, setUser] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [connStatus, setConnStatus] = useState<'online' | 'offline'>('online');
  
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<MovementLog[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [isUserEditModalOpen, setIsUserEditModalOpen] = useState(false);
  const [isImportHelpOpen, setIsImportHelpOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [movementType, setMovementType] = useState<'IN' | 'OUT'>('IN');
  const [movementItemId, setMovementItemId] = useState<string>('');
  
  const [formData, setFormData] = useState<Partial<InventoryItem>>({});
  const [userFormData, setUserFormData] = useState<Partial<UserProfile>>({});
  const [moveData, setMoveData] = useState({ quantity: 1, reason: '' });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const userFileInputRef = useRef<HTMLInputElement>(null);

  // Theme management
  useEffect(()