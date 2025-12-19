
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  LayoutDashboard, Package, Plus, Search, Trash2, Moon, Sun, Menu, X, 
  Camera, AlertTriangle, Loader2, RefreshCw, TrendingDown, Box, 
  History, Activity, Edit3, Users, FileSpreadsheet, 
  Upload, CheckCircle2, User as UserIcon, LogOut, ChevronRight,
  Info, Check, Database, ShieldCheck, Settings, Download, Filter,
  Sparkles, BrainCircuit, ListChecks, UserPlus, Zap, Globe, Signal, SignalLow,
  PieChart, BarChart3, DatabaseZap, Clock, ShieldAlert, CheckSquare, Square, Image as ImageIcon,
  Wifi, WifiOff
} from 'lucide-react';
import { InventoryItem, MovementLog, UserSession, AppView, UserProfile, PendingAction } from './types';
import { Logo } from './components/Logo';
import { supabase } from './services/supabaseClient';
import { saveOfflineData, loadOfflineData, addToSyncQueue, getSyncQueue, removeFromQueue } from './services/offlineStorage';

declare const XLSX: any;

export default function App() {
  // Theme & Session
  const [darkMode, setDarkMode] = useState<boolean>(() => localStorage.getItem('carpa_theme') === 'dark');
  const [user, setUser] = useState<UserSession | null>(() => {
    const saved = localStorage.getItem('carpa_user');
    return saved ? JSON.parse(saved) : null;
  });

  // Main Data States
  const offline = loadOfflineData();
  const [items, setItems] = useState<InventoryItem[]>(offline.items || []);
  const [movements, setMovements] = useState<MovementLog[]>(offline.movements || []);
  const [allUsers, setAllUsers] = useState<UserProfile[]>(offline.users || []);
  
  // App Logic States
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(() => {
    const saved = localStorage.getItem('carpa_last_sync');
    return saved ? new Date(saved) : null;
  });
  const [connStatus, setConnStatus] = useState<'online' | 'offline' | 'syncing'>(navigator.onLine ? 'online' : 'offline');
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('TODOS');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

  // Login Form States
  const [loginStep, setLoginStep] = useState<'BADGE' | 'NAME'>('BADGE');
  const [tempBadge, setTempBadge] = useState('');
  const [tempName, setTempName] = useState('');

  // UI States
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isUserEditModalOpen, setIsUserEditModalOpen] = useState(false);
  
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  
  const [movementType, setMovementType] = useState<'IN' | 'OUT'>('IN');
  const [activeItemId, setActiveItemId] = useState<string>('');
  const [formData, setFormData] = useState<Partial<InventoryItem>>({});
  const [moveData, setMoveData] = useState({ quantity: 1, reason: '' });
  const [userFormData, setUserFormData] = useState<Partial<UserProfile>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const userPhotoInputRef = useRef<HTMLInputElement>(null);

  // --- Sync Logic ---

  const processSyncQueue = useCallback(async () => {
    if (!navigator.onLine) {
      setConnStatus('offline');
      return;
    }
    
    const queue = getSyncQueue();
    if (queue.length === 0) {
      setConnStatus('online');
      return;
    }
    
    setConnStatus('syncing');
    for (const action of queue) {
      try {
        let error = null;
        if (action.type === 'UPSERT_ITEM') {
          const { error: err } = await supabase.from('inventory_items').upsert(action.data);
          error = err;
        } else if (action.type === 'INSERT_MOVEMENT') {
          const { error: err } = await supabase.from('movements').insert(action.data);
          error = err;
        } else if (action.type === 'DELETE_ITEM') {
          const { error: err } = await supabase.from('inventory_items').update({ is_active: false }).eq('id', action.data.id);
          error = err;
        } else if (action.type === 'UPDATE_USER') {
          const { error: err } = await supabase.from('users').upsert(action.data);
          error = err;
        }
        
        if (error) throw error;
        removeFromQueue(action.id);
      } catch (e) {
        console.error("Sync failed for action:", action.id, e);
        setConnStatus('offline');
        return; // Stop processing and retry later
      }
    }
    setConnStatus('online');
    setLastSync(new Date());
    localStorage.setItem('carpa_last_sync', new Date().toISOString());
  }, []);

  const fetchData = useCallback(async (showLoader = true) => {
    if (showLoader) setIsSyncing(true);
    if (!navigator.onLine) {
      setConnStatus('offline');
      setIsLoading(false);
      setIsSyncing(false);
      return;
    }

    try {
      const [itRes, movRes, userRes] = await Promise.all([
        supabase.from('inventory_items').select('*').eq('is_active', true).order('name'),
        supabase.from('movements').select('*').order('timestamp', { ascending: false }).limit(200),
        supabase.from('users').select('*').order('name')
      ]);

      if (itRes.error || movRes.error || userRes.error) throw new Error("Erro ao buscar dados do Supabase");

      const newItems = itRes.data || [];
      const newMovs = movRes.data || [];
      const newUsers = userRes.data || [];

      setItems(newItems);
      setMovements(newMovs);
      setAllUsers(newUsers);
      
      saveOfflineData(newItems, newMovs, newUsers, Array.from(new Set(newItems.map(i => i.department))));
      setLastSync(new Date());
      localStorage.setItem('carpa_last_sync', new Date().toISOString());
      setConnStatus('online');
      
      // Tentar processar fila após sucesso na busca
      await processSyncQueue();
    } catch (err) {
      console.error("Fetch data error:", err);
      setConnStatus('offline');
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  }, [processSyncQueue]);

  // --- Listeners & Lifecycles ---

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('carpa_theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    const handleOnline = () => {
      setConnStatus('online');
      fetchData(false);
    };
    const handleOffline = () => setConnStatus('offline');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Initial fetch
    fetchData(true);

    const channel = supabase.channel('carpa-realtime')
      .on('postgres_changes', { event: '*', table: 'inventory_items', schema: 'public' }, () => fetchData(false))
      .on('postgres_changes', { event: '*', table: 'movements', schema: 'public' }, () => fetchData(false))
      .on('postgres_changes', { event: '*', table: 'users', schema: 'public' }, () => fetchData(false))
      .subscribe();

    const interval = setInterval(() => {
      if (navigator.onLine) processSyncQueue();
    }, 60000); // 1 minute auto-sync

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [fetchData, processSyncQueue]);

  // --- Computed States ---

  const stats = useMemo(() => {
    if (items.length === 0) return { critical: 0, ideal: 0, surplus: 0, critPct: 0, idealPct: 0, surpPct: 0 };
    let critical = 0, ideal = 0, surplus = 0;
    items.forEach(i => {
      if (i.current_stock <= i.min_stock) critical++;
      else if (i.current_stock <= i.min_stock * 2) ideal++;
      else surplus++;
    });
    const total = items.length;
    return { 
      critical, ideal, surplus,
      critPct: (critical / total) * 100,
      idealPct: (ideal / total) * 100,
      surpPct: (surplus / total) * 100
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    const s = searchTerm.toLowerCase();
    return items.filter(i => {
      const matchSearch = !s || i.name.toLowerCase().includes(s) || i.location.toLowerCase().includes(s);
      const matchDept = selectedDept === 'TODOS' || i.department === selectedDept;
      return matchSearch && matchDept;
    });
  }, [items, searchTerm, selectedDept]);

  const departments = useMemo(() => ['TODOS', ...Array.from(new Set(items.map(i => i.department))).sort()], [items]);

  // --- Handlers ---

  const handleInitialLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loginStep === 'BADGE') {
      const existingUser = allUsers.find(u => u.badge_id === tempBadge);
      if (existingUser) {
        const session = { badgeId: existingUser.badge_id, name: existingUser.name, role: existingUser.role, photoUrl: existingUser.photo_url };
        setUser(session);
        localStorage.setItem('carpa_user', JSON.stringify(session));
      } else {
        setLoginStep('NAME');
      }
    } else {
      const session = { badgeId: tempBadge, name: tempName.toUpperCase(), role: 'Colaborador' };
      setUser(session);
      localStorage.setItem('carpa_user', JSON.stringify(session));
      
      const newUser: UserProfile = {
        badge_id: tempBadge,
        name: tempName.toUpperCase(),
        role: 'Colaborador',
        created_at: new Date().toISOString()
      };
      
      setAllUsers(prev => [...prev, newUser]);
      addToSyncQueue({ type: 'UPDATE_USER', table: 'users', data: newUser });
      processSyncQueue();
    }
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !user) return;

    const isNew = !editingItem;
    const itemData: InventoryItem = {
      id: editingItem?.id || `IT-${Date.now()}`,
      name: formData.name.toUpperCase(),
      unit: (formData.unit || 'UND').toUpperCase(),
      min_stock: Number(formData.min_stock) || 0,
      current_stock: Number(formData.current_stock) || 0,
      location: (formData.location || 'N/A').toUpperCase(),
      department: (formData.department || 'GERAL').toUpperCase(),
      photo_url: formData.photo_url || null,
      last_updated: new Date().toISOString(),
      last_updated_by: user.name,
      is_active: true
    };

    const movData: MovementLog = {
      id: `MOV-${Date.now()}`,
      item_id: itemData.id,
      item_name: itemData.name,
      type: isNew ? 'CREATE' : 'EDIT',
      quantity: isNew ? itemData.current_stock : 0,
      user_badge_id: user.badgeId,
      user_name: user.name,
      timestamp: itemData.last_updated,
      reason: isNew ? 'Cadastro Inicial' : 'Alteração de Dados'
    };

    setItems(isNew ? [itemData, ...items] : items.map(i => i.id === itemData.id ? itemData : i));
    setMovements([movData, ...movements]);

    addToSyncQueue({ type: 'UPSERT_ITEM', table: 'inventory_items', data: itemData });
    addToSyncQueue({ type: 'INSERT_MOVEMENT', table: 'movements', data: movData });

    setIsItemModalOpen(false);
    setEditingItem(null);
    setFormData({});
    processSyncQueue();
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userFormData.badge_id || !userFormData.name) return;

    const uData: UserProfile = {
      badge_id: userFormData.badge_id,
      name: userFormData.name.toUpperCase(),
      role: userFormData.role || 'Colaborador',
      photo_url: userFormData.photo_url || null,
      created_at: editingUser?.created_at || new Date().toISOString()
    };

    setAllUsers(prev => {
      const exists = prev.some(u => u.badge_id === uData.badge_id);
      if (exists) return prev.map(u => u.badge_id === uData.badge_id ? uData : u);
      return [...prev, uData];
    });

    if (user?.badgeId === uData.badge_id) {
      const session = { badgeId: uData.badge_id, name: uData.name, role: uData.role, photoUrl: uData.photo_url };
      setUser(session);
      localStorage.setItem('carpa_user', JSON.stringify(session));
    }

    addToSyncQueue({ type: 'UPDATE_USER', table: 'users', data: uData });
    setIsUserModalOpen(false);
    setIsUserEditModalOpen(false);
    setEditingUser(null);
    setUserFormData({});
    processSyncQueue();
  };

  const handleStockAction = async (e: React.FormEvent) => {
    e.preventDefault();
    const item = items.find(i => i.id === activeItemId);
    if (!item || !user) return;

    const qty = Number(moveData.quantity);
    const newStock = movementType === 'IN' ? item.current_stock + qty : item.current_stock - qty;

    if (newStock < 0) {
      alert("Operação bloqueada: Saldo insuficiente.");
      return;
    }

    const now = new Date().toISOString();
    const updatedItem = { ...item, current_stock: newStock, last_updated: now, last_updated_by: user.name };
    const movRecord: MovementLog = {
      id: `MOV-${Date.now()}`,
      item_id: item.id,
      item_name: item.name,
      type: movementType,
      quantity: qty,
      user_badge_id: user.badgeId,
      user_name: user.name,
      timestamp: now,
      reason: moveData.reason || (movementType === 'IN' ? 'Entrada Operacional' : 'Saída Operacional')
    };

    setItems(items.map(i => i.id === item.id ? updatedItem : i));
    setMovements([movRecord, ...movements]);

    addToSyncQueue({ type: 'UPSERT_ITEM', table: 'inventory_items', data: updatedItem });
    addToSyncQueue({ type: 'INSERT_MOVEMENT', table: 'movements', data: movRecord });

    setIsMovementModalOpen(false);
    setMoveData({ quantity: 1, reason: '' });
    processSyncQueue();
  };

  const handleToggleSelectAll = () => {
    if (selectedItemIds.length === filteredItems.length && filteredItems.length > 0) {
      setSelectedItemIds([]);
    } else {
      setSelectedItemIds(filteredItems.map(i => i.id));
    }
  };

  const handleDeleteItem = async (id: string) => {
    const item = items.find(i => i.id === id);
    if (!item || !user) return;
    if (!confirm(`Auditoria: Deseja desativar permanentemente o material "${item.name}"?`)) return;

    const now = new Date().toISOString();
    
    // Atualização Otimista
    setItems(prev => prev.filter(i => i.id !== id));
    setSelectedItemIds(prev => prev.filter(selectedId => selectedId !== id));

    const mov: MovementLog = {
      id: `MOV-DEL-${Date.now()}`,
      item_id: item.id,
      item_name: item.name,
      type: 'DELETE',
      quantity: 0,
      user_badge_id: user.badgeId,
      user_name: user.name,
      timestamp: now,
      reason: 'Exclusão Individual via Auditoria'
    };
    
    addToSyncQueue({ type: 'DELETE_ITEM', table: 'inventory_items', data: { id: item.id } });
    addToSyncQueue({ type: 'INSERT_MOVEMENT', table: 'movements', data: mov });
    
    setIsItemModalOpen(false);
    setEditingItem(null);
    processSyncQueue();
  };

  const handleDeleteBatch = async () => {
    if (!user || selectedItemIds.length === 0) return;
    if (!confirm(`Auditoria Crítica: Deseja desativar ${selectedItemIds.length} itens selecionados permanentemente? (Os logs de histórico serão mantidos)`)) return;

    const now = new Date().toISOString();
    const toDelete = items.filter(i => selectedItemIds.includes(i.id));
    
    setItems(prev => prev.filter(i => !selectedItemIds.includes(i.id)));
    setSelectedItemIds([]);

    for (const item of toDelete) {
      const mov: MovementLog = {
        id: `MOV-BATCH-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        item_id: item.id,
        item_name: item.name,
        type: 'DELETE',
        quantity: 0,
        user_badge_id: user.badgeId,
        user_name: user.name,
        timestamp: now,
        reason: 'Exclusão em Lote via Auditoria'
      };
      addToSyncQueue({ type: 'DELETE_ITEM', table: 'inventory_items', data: { id: item.id } });
      addToSyncQueue({ type: 'INSERT_MOVEMENT', table: 'movements', data: mov });
    }
    processSyncQueue();
  };

  const handleExport = () => {
    if (items.length === 0) return;
    const data = items.map(i => ({
      "Material": i.name, 
      "Setor": i.department, 
      "Local": i.location,
      "Saldo Atual": i.current_stock, 
      "Unidade": i.unit, 
      "Mínimo": i.min_stock,
      "Data Atualização": new Date(i.last_updated).toLocaleString(),
      "Responsável": i.last_updated_by
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Relatorio_Estoque_AG");
    XLSX.writeFile(wb, `RELATORIO_ESTOQUE_AG_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws);
        
        setIsSyncing(true);
        for (const row of data as any[]) {
          const itemToSave: InventoryItem = {
            id: `IT-IMP-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            name: (row.Material || row.Nome || row.item || '').toUpperCase(),
            department: (row.Setor || row.Departamento || 'GERAL').toUpperCase(),
            location: (row.Local || row.Localizacao || 'N/A').toUpperCase(),
            current_stock: Number(row.Saldo || row.Quantidade || row.SaldoAtual) || 0,
            min_stock: Number(row.Minimo || row.EstoqueMin) || 0,
            unit: (row.Unidade || row.UND || 'UND').toUpperCase(),
            last_updated: new Date().toISOString(),
            last_updated_by: user.name,
            is_active: true
          };

          if (itemToSave.name) {
            addToSyncQueue({ type: 'UPSERT_ITEM', table: 'inventory_items', data: itemToSave });
            addToSyncQueue({ type: 'INSERT_MOVEMENT', table: 'movements', data: {
              id: `MOV-IMP-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
              item_id: itemToSave.id,
              item_name: itemToSave.name,
              type: 'CREATE',
              quantity: itemToSave.current_stock,
              user_badge_id: user.badgeId,
              user_name: user.name,
              timestamp: itemToSave.last_updated,
              reason: 'Importação via Planilha'
            }});
          }
        }
        alert("Sincronização iniciada. Os dados aparecerão conforme o banco for atualizado.");
        fetchData(false);
      } catch (err) {
        alert("Erro no arquivo. Use colunas: Material, Setor, Local, Saldo, Minimo, Unidade.");
      } finally {
        setIsSyncing(false);
        e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  // --- Render Sections ---

  if (!user) return (
    <div className="h-screen flex items-center justify-center bg-slate-100 dark:bg-[#020617] p-6 font-sans">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-[3rem] p-12 shadow-2xl border border-slate-200 dark:border-slate-800 text-center animate-in zoom-in duration-300">
        <Logo className="w-20 h-20 mx-auto mb-8" />
        <h1 className="text-3xl font-black tracking-tighter mb-2">AG SYSTEM</h1>
        <p className="text-[10px] font-black text-brand-500 uppercase tracking-widest mb-10">Gestão Profissional de Estoque</p>
        
        <form onSubmit={handleInitialLogin} className="space-y-6">
          {loginStep === 'BADGE' ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nº Matrícula / ID</label>
                <input 
                  autoFocus
                  required
                  value={tempBadge}
                  onChange={e => setTempBadge(e.target.value)}
                  placeholder="DIGITE SEU ID" 
                  className="w-full py-5 rounded-2xl bg-slate-50 dark:bg-slate-950 text-center font-black outline-none border-2 border-transparent focus:border-brand-500 text-lg shadow-inner dark:text-white" 
                />
              </div>
              <button type="submit" className="w-full py-5 bg-brand-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-all">AVANÇAR</button>
            </div>
          ) : (
            <div className="space-y-4 animate-in slide-in-from-right duration-300">
              <div className="p-4 bg-brand-50 dark:bg-brand-950/20 rounded-2xl border border-brand-100 dark:border-brand-900/30 mb-2">
                <p className="text-[9px] font-black text-brand-600 uppercase">Novo Acesso Detectado</p>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome Completo</label>
                <input 
                  autoFocus
                  required
                  value={tempName}
                  onChange={e => setTempName(e.target.value)}
                  placeholder="COMO VOCÊ SE CHAMA?" 
                  className="w-full py-5 rounded-2xl bg-slate-50 dark:bg-slate-950 text-center font-black outline-none border-2 border-transparent focus:border-brand-500 text-lg shadow-inner uppercase dark:text-white" 
                />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setLoginStep('BADGE')} className="flex-1 py-5 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-2xl font-black uppercase text-xs tracking-widest">VOLTAR</button>
                <button type="submit" className="flex-[2] py-5 bg-emerald-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-all">FINALIZAR</button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );

  if (isLoading && items.length === 0) return (
    <div className="h-screen flex flex-col items-center justify-center bg-white dark:bg-[#020617] font-sans">
      <Logo className="w-16 h-16 animate-pulse" />
      <div className="mt-8 flex flex-col items-center gap-2">
        <Loader2 className="animate-spin text-brand-600" size={32} />
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sincronizando Banco Central...</span>
      </div>
    </div>
  );

  return (
    <div className="h-screen flex flex-col lg:flex-row bg-slate-50 dark:bg-[#020617] text-slate-900 dark:text-white overflow-hidden font-sans">
      
      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 w-64 z-50 transform transition-transform duration-300 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex flex-col h-full p-6">
          <div className="flex items-center justify-between mb-12">
            <div className="flex items-center gap-4">
              <Logo className={`w-10 h-10 ${isSyncing ? 'animate-pulse' : ''}`} />
              <span className="font-black text-xl tracking-tighter">AG SYSTEM</span>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2 text-slate-400"><X /></button>
          </div>

          <nav className="flex-1 space-y-2">
            {[
              { id: AppView.DASHBOARD, icon: LayoutDashboard, label: 'Dashboard' },
              { id: AppView.INVENTORY, icon: Package, label: 'Inventário' },
              { id: AppView.MOVEMENTS, icon: History, label: 'Auditoria' },
              { id: AppView.USERS, icon: Users, label: 'Colaboradores' },
              { id: AppView.SETTINGS, icon: Globe, label: 'Sincronismo' }
            ].map(v => (
              <button key={v.id} onClick={() => { setCurrentView(v.id); setIsSidebarOpen(false); }}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl font-bold text-[11px] uppercase tracking-wider transition-all ${currentView === v.id ? 'bg-brand-600 text-white shadow-xl translate-x-1' : 'text-slate-400 hover:bg-brand-500/10 hover:text-brand-500'}`}>
                <v.icon size={18} /> {v.label}
              </button>
            ))}
          </nav>

          <div className="mt-auto pt-8 border-t border-slate-200 dark:border-slate-800">
            <div className="mb-6 p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                   <div className={`w-2.5 h-2.5 rounded-full ${connStatus === 'online' ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : connStatus === 'syncing' ? 'bg-brand-500 animate-pulse' : 'bg-red-500'}`} />
                   <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">{connStatus === 'online' ? 'Conectado' : connStatus === 'syncing' ? 'Sincronizando' : 'Modo Offline'}</span>
                </div>
                {connStatus === 'online' ? <Wifi size={14} className="text-emerald-500"/> : <WifiOff size={14} className="text-red-500"/>}
              </div>
              {lastSync && (
                <p className="text-[7px] font-black uppercase text-slate-400 mt-2 tracking-tighter">Última atualização: {lastSync.toLocaleTimeString()}</p>
              )}
            </div>
            
            <div className="flex items-center gap-4 p-3 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 mb-4 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center text-white font-black text-lg shadow-lg overflow-hidden">
                {user.photoUrl ? <img src={user.photoUrl} className="w-full h-full object-cover" /> : user.name.charAt(0)}
              </div>
              <div className="truncate">
                <p className="text-[11px] font-black uppercase truncate">{user.name}</p>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">ID: {user.badgeId}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDarkMode(!darkMode)} className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-400 hover:text-brand-500 transition-all flex-1 flex justify-center">{darkMode ? <Sun size={18}/> : <Moon size={18}/>}</button>
              <button onClick={() => { setUser(null); localStorage.removeItem('carpa_user'); setLoginStep('BADGE'); }} className="p-3 bg-red-500/10 text-red-500 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all flex-[2]">Sair</button>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Banner de Offline se necessário */}
        {connStatus === 'offline' && (
          <div className="bg-red-500 text-white text-[9px] font-black uppercase py-1 text-center tracking-[0.2em] animate-pulse z-[60]">
            Você está operando offline. As alterações serão salvas localmente e sincronizadas ao reconectar.
          </div>
        )}

        <header className="h-16 flex items-center justify-between px-8 border-b border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-[#020617]/60 backdrop-blur-xl sticky top-0 z-30">
          <div className="flex items-center gap-6">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 text-slate-500"><Menu/></button>
            <h2 className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">{currentView}</h2>
          </div>
          <div className="flex gap-4">
            {currentView === AppView.INVENTORY && (
              <>
                {selectedItemIds.length > 0 && (
                  <button onClick={handleDeleteBatch} className="bg-red-600 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-3 shadow-lg shadow-red-500/20 hover:scale-105 active:scale-95 transition-all">
                    <Trash2 size={16}/> Excluir Selecionados ({selectedItemIds.length})
                  </button>
                )}
                <button onClick={() => { setEditingItem(null); setFormData({}); setIsItemModalOpen(true); }} className="bg-brand-600 text-white px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-3 shadow-lg shadow-brand-500/20 hover:scale-105 active:scale-95 transition-all">
                  <Plus size={18}/> Novo Registro
                </button>
              </>
            )}
            {currentView === AppView.USERS && (
              <button onClick={() => { setEditingUser(null); setUserFormData({}); setIsUserModalOpen(true); }} className="bg-brand-600 text-white px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-3 shadow-lg shadow-brand-500/20 hover:scale-105 active:scale-95 transition-all">
                <UserPlus size={18}/> Novo Colaborador
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 lg:p-10 custom-scrollbar">
          <div className="max-w-7xl mx-auto">
            
            {/* VIEW: DASHBOARD */}
            {currentView === AppView.DASHBOARD && (
              <div className="space-y-8 animate-in fade-in duration-700">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="p-10 rounded-[3rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl group hover:border-brand-500 transition-all">
                    <div className="w-14 h-14 rounded-2xl bg-brand-500/10 flex items-center justify-center text-brand-500 mb-6 group-hover:scale-110 transition-transform"><Box size={28}/></div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Materiais Ativos</p>
                    <h3 className="text-5xl font-black tracking-tighter">{items.length}</h3>
                  </div>
                  <div className="p-10 rounded-[3rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl group hover:border-red-500 transition-all">
                    <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-500 mb-6 group-hover:animate-bounce"><AlertTriangle size={28}/></div>
                    <p className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-1">Reposição Crítica</p>
                    <h3 className="text-5xl font-black text-red-600 tracking-tighter">{stats.critical}</h3>
                  </div>
                  <div className="p-10 rounded-[3rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl group hover:border-emerald-500 transition-all">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 mb-6"><Activity size={28}/></div>
                    <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Logs do Dia</p>
                    <h3 className="text-5xl font-black text-emerald-600 tracking-tighter">{movements.filter(m => new Date(m.timestamp).toDateString() === new Date().toDateString()).length}</h3>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="p-12 rounded-[4rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl">
                    <h4 className="text-sm font-black uppercase tracking-widest mb-10 flex items-center gap-3"><PieChart size={20} className="text-brand-500"/> Visão de Saúde</h4>
                    <div className="flex flex-col md:flex-row items-center gap-12">
                      <div className="relative w-48 h-48">
                        <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                          <circle cx="50" cy="50" r="40" fill="transparent" stroke="#f1f5f9" strokeWidth="12" className="dark:stroke-slate-800" />
                          <circle cx="50" cy="50" r="40" fill="transparent" stroke="#ef4444" strokeWidth="12" strokeDasharray={`${stats.critPct * 2.51} 251.2`} />
                          <circle cx="50" cy="50" r="40" fill="transparent" stroke="#10b981" strokeWidth="12" strokeDasharray={`${stats.idealPct * 2.51} 251.2`} strokeDashoffset={`-${stats.critPct * 2.51}`} />
                          <circle cx="50" cy="50" r="40" fill="transparent" stroke="#3b82f6" strokeWidth="12" strokeDasharray={`${stats.surpPct * 2.51} 251.2`} strokeDashoffset={`-${(stats.critPct + stats.idealPct) * 2.51}`} />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center transform rotate-90">
                          <span className="text-2xl font-black tracking-tighter">{items.length > 0 ? Math.round((stats.ideal + stats.surplus) / items.length * 100) : 0}%</span>
                          <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Saudável</span>
                        </div>
                      </div>
                      <div className="space-y-4 flex-1">
                        <div className="flex justify-between items-center p-4 bg-red-50 dark:bg-red-950/20 rounded-2xl border border-red-100 dark:border-red-900/30">
                          <span className="text-[10px] font-black text-red-600 uppercase tracking-widest">Crítico</span>
                          <span className="text-lg font-black text-red-600">{stats.critical}</span>
                        </div>
                        <div className="flex justify-between items-center p-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-2xl border border-emerald-100 dark:border-emerald-900/30">
                          <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Ideal</span>
                          <span className="text-lg font-black text-emerald-600">{stats.ideal}</span>
                        </div>
                        <div className="flex justify-between items-center p-4 bg-brand-50 dark:bg-brand-950/20 rounded-2xl border border-brand-100 dark:border-brand-900/30">
                          <span className="text-[10px] font-black text-brand-600 uppercase tracking-widest">Surplus</span>
                          <span className="text-lg font-black text-brand-600">{stats.surplus}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="p-12 rounded-[4rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
                    <h4 className="text-sm font-black uppercase tracking-widest mb-10 flex items-center gap-3"><BarChart3 size={20} className="text-brand-500"/> Últimos Registros</h4>
                    <div className="space-y-4 max-h-[300px] overflow-y-auto pr-4 custom-scrollbar">
                      {movements.slice(0, 8).map(m => (
                        <div key={m.id} className="flex items-center gap-5 p-4 rounded-3xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 hover:border-brand-500 transition-all group">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-[10px] shadow-sm ${
                            m.type === 'IN' ? 'bg-emerald-500/10 text-emerald-500' : 
                            m.type === 'OUT' ? 'bg-orange-500/10 text-orange-500' : 
                            'bg-brand-500/10 text-brand-500'
                          }`}>
                            {m.type === 'IN' ? '+' : m.type === 'OUT' ? '-' : '•'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-black uppercase truncate">{m.item_name}</p>
                            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{m.user_name} • {new Date(m.timestamp).toLocaleTimeString()}</p>
                          </div>
                          <span className={`text-lg font-black tracking-tighter ${m.type === 'IN' ? 'text-emerald-500' : m.type === 'OUT' ? 'text-orange-500' : 'text-slate-400'}`}>
                            {m.type === 'IN' ? '+' : m.type === 'OUT' ? '-' : ''}{m.quantity || 0}
                          </span>
                        </div>
                      ))}
                      {movements.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-20 opacity-20">
                          <History size={48} />
                          <p className="text-[9px] font-black uppercase mt-4">Nenhum registro</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* VIEW: INVENTORY */}
            {currentView === AppView.INVENTORY && (
              <div className="space-y-8 animate-in slide-in-from-bottom-10 duration-500">
                <div className="bg-white dark:bg-slate-900 p-6 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col md:flex-row gap-6">
                  <div className="flex-1 flex items-center gap-4 bg-slate-50 dark:bg-slate-950 px-6 py-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-inner">
                    <Search className="text-slate-400" size={20}/>
                    <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="PESQUISAR MATERIAL OU LOCAL..." className="w-full bg-transparent outline-none font-black text-xs uppercase tracking-widest dark:text-white" />
                  </div>
                  <div className="flex gap-2 items-center">
                    <div className="flex gap-1 overflow-x-auto pb-2 md:pb-0 custom-scrollbar max-w-md">
                      {departments.map(d => (
                        <button key={d} onClick={() => setSelectedDept(d)} className={`px-5 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${selectedDept === d ? 'bg-brand-600 text-white shadow-xl scale-105' : 'bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-brand-500'}`}>{d}</button>
                      ))}
                    </div>
                    <button onClick={handleToggleSelectAll} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-brand-600 transition-all flex items-center gap-2" title="Selecionar Tudo">
                      {selectedItemIds.length === filteredItems.length && filteredItems.length > 0 ? <CheckSquare className="text-brand-600" size={24}/> : <Square size={24}/>}
                      <span className="text-[10px] font-black uppercase tracking-widest">Tudo</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-6">
                  {filteredItems.map(item => (
                    <div 
                      key={item.id} 
                      className={`p-4 bg-white dark:bg-slate-900 rounded-[2.5rem] border-2 transition-all group relative overflow-hidden ${selectedItemIds.includes(item.id) ? 'border-brand-600 shadow-2xl scale-105' : 'border-transparent shadow-md hover:shadow-xl hover:border-slate-200 dark:hover:border-slate-800'}`}
                    >
                      <div className="aspect-square bg-slate-100 dark:bg-slate-950 rounded-[2rem] mb-4 relative overflow-hidden flex items-center justify-center shadow-inner">
                        {item.photo_url ? <img src={item.photo_url} className="w-full h-full object-cover" /> : <Package className="opacity-10" size={50} />}
                        <div className="absolute top-3 left-3 px-3 py-1 bg-slate-900/80 backdrop-blur-md rounded-lg text-[7px] font-black text-white uppercase tracking-tighter">{item.location}</div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setSelectedItemIds(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id]); }} 
                          className="absolute top-3 right-3 p-2 bg-white/10 backdrop-blur-md rounded-xl text-white border border-white/20 transition-all hover:scale-110"
                        >
                          {selectedItemIds.includes(item.id) ? <CheckSquare className="text-brand-400" size={18}/> : <Square size={18}/>}
                        </button>
                      </div>
                      <h4 className="text-[11px] font-black uppercase truncate mb-0.5">{item.name}</h4>
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-4">{item.department}</p>
                      
                      <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                        <div className="flex flex-col">
                          <span className={`text-2xl font-black tracking-tighter ${item.current_stock <= item.min_stock ? 'text-red-500 animate-pulse' : ''}`}>{item.current_stock}</span>
                          <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">{item.unit}</span>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setActiveItemId(item.id); setMovementType('IN'); setIsMovementModalOpen(true); }} title="Entrada" className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg hover:bg-emerald-500 hover:text-white transition-all"><Plus size={14}/></button>
                          <button onClick={() => { setActiveItemId(item.id); setMovementType('OUT'); setIsMovementModalOpen(true); }} title="Saída" className="p-2 bg-orange-500/10 text-orange-500 rounded-lg hover:bg-orange-500 hover:text-white transition-all"><TrendingDown size={14}/></button>
                          <button onClick={() => { setEditingItem(item); setFormData(item); setIsItemModalOpen(true); }} title="Editar" className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-lg hover:bg-brand-600 hover:text-white transition-all"><Edit3 size={14}/></button>
                          <button onClick={() => handleDeleteItem(item.id)} title="Excluir Permanentemente" className="p-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-all"><Trash2 size={14}/></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* VIEW: AUDITORIA */}
            {currentView === AppView.MOVEMENTS && (
              <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-bottom-10">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className="p-4 bg-brand-600 rounded-3xl text-white shadow-xl shadow-brand-500/20"><History size={24}/></div>
                    <div>
                      <h3 className="text-lg font-black tracking-tighter">Histórico de Auditoria</h3>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Logs Imutáveis para Auditoria Profissional</p>
                    </div>
                  </div>
                  <button onClick={handleExport} className="flex items-center gap-3 px-6 py-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-black text-[10px] uppercase tracking-widest hover:border-brand-500 transition-all shadow-sm">
                    <Download size={18}/> Exportar Log (.xlsx)
                  </button>
                </div>
                <div className="space-y-4">
                  {movements.map(m => (
                    <div key={m.id} className="p-6 bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-sm group hover:border-brand-500/50 transition-all">
                      <div className="flex items-center gap-6 min-w-0">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner ${
                          m.type === 'IN' ? 'bg-emerald-500/10 text-emerald-500' : 
                          m.type === 'OUT' ? 'bg-orange-500/10 text-orange-500' : 
                          m.type === 'DELETE' ? 'bg-red-500/10 text-red-500' :
                          'bg-brand-500/10 text-brand-500'
                        }`}>
                          {m.type === 'IN' ? <Plus size={24}/> : m.type === 'OUT' ? <TrendingDown size={24}/> : m.type === 'DELETE' ? <Trash2 size={24}/> : <Edit3 size={24}/>}
                        </div>
                        <div className="truncate">
                          <p className="text-sm font-black uppercase truncate">{m.item_name}</p>
                          <div className="flex items-center gap-4 mt-2">
                            <span className="flex items-center gap-1 text-[8px] font-black text-brand-500 uppercase tracking-widest"><UserIcon size={12}/> {m.user_name}</span>
                            <span className="flex items-center gap-1 text-[8px] font-bold text-slate-400 uppercase tracking-widest"><Clock size={12}/> {new Date(m.timestamp).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right pl-6">
                        <h5 className={`text-3xl font-black tracking-tighter ${m.type === 'IN' ? 'text-emerald-500' : m.type === 'OUT' ? 'text-orange-500' : 'text-slate-300'}`}>
                          {m.type === 'IN' ? '+' : m.type === 'OUT' ? '-' : ''}{m.quantity || 0}
                        </h5>
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{m.type}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* VIEW: EQUIPE */}
            {currentView === AppView.USERS && (
              <div className="space-y-10 animate-in slide-in-from-bottom-10">
                <div className="flex items-center gap-5">
                  <div className="p-4 bg-brand-600 rounded-3xl text-white shadow-xl shadow-brand-500/20"><Users size={24}/></div>
                  <div>
                    <h3 className="text-lg font-black tracking-tighter">Equipe de Auditoria</h3>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Colaboradores ativos no sistema AG</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                  {allUsers.map(u => (
                    <div 
                      key={u.badge_id} 
                      onClick={() => { setEditingUser(u); setUserFormData(u); setIsUserEditModalOpen(true); }}
                      className="p-10 bg-white dark:bg-slate-900 rounded-[4rem] border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col items-center text-center group cursor-pointer transition-all hover:border-brand-500 hover:scale-105"
                    >
                      <div className="w-24 h-24 rounded-[2rem] bg-brand-600 flex items-center justify-center text-white font-black text-4xl shadow-lg mb-6 group-hover:rotate-6 transition-transform overflow-hidden shadow-inner">
                        {u.photo_url ? <img src={u.photo_url} className="w-full h-full object-cover" /> : u.name.charAt(0)}
                      </div>
                      <h4 className="text-sm font-black uppercase tracking-widest mb-1">{u.name}</h4>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">{u.role}</p>
                      <span className="px-3 py-1 bg-slate-50 dark:bg-slate-950 rounded-full text-[8px] font-black text-brand-600 uppercase">MAT: {u.badge_id}</span>
                    </div>
                  ))}
                  <button onClick={() => { setEditingUser(null); setUserFormData({}); setIsUserModalOpen(true); }} className="p-10 rounded-[4rem] border-4 border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center text-slate-300 hover:text-brand-500 hover:border-brand-500/50 transition-all group">
                    <UserPlus size={48} className="mb-4 group-hover:scale-110 transition-transform"/>
                    <span className="text-[10px] font-black uppercase tracking-widest">Adicionar Membro</span>
                  </button>
                </div>
              </div>
            )}

            {/* VIEW: CONFIGS / SINCRONISMO */}
            {currentView === AppView.SETTINGS && (
              <div className="max-w-2xl mx-auto space-y-8 animate-in slide-in-from-bottom-10">
                <div className="p-10 rounded-[3rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl">
                  <h4 className="text-sm font-black uppercase tracking-widest mb-10 flex items-center gap-5"><Globe size={24} className="text-brand-600"/> Gateway & Sincronismo</h4>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center p-6 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Status da Rede</span>
                      <span className={`text-[10px] font-black uppercase ${connStatus === 'online' ? 'text-emerald-500' : connStatus === 'syncing' ? 'text-brand-500' : 'text-red-500'}`}>{connStatus}</span>
                    </div>
                    <div className="flex justify-between items-center p-6 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Última Escuta Central</span>
                      <span className="text-[10px] font-black uppercase">{lastSync ? lastSync.toLocaleString() : 'Não sincronizado'}</span>
                    </div>
                    <button onClick={() => fetchData(true)} className="w-full py-6 bg-brand-600 text-white rounded-3xl font-black uppercase text-[11px] tracking-widest shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all">
                      <RefreshCw size={18} className={isSyncing ? 'animate-spin' : ''} /> FORÇAR SINCRONISMO AGORA
                    </button>
                  </div>
                </div>

                <div className="p-10 rounded-[3rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl">
                  <h4 className="text-sm font-black uppercase tracking-widest mb-10 flex items-center gap-5"><FileSpreadsheet size={24} className="text-emerald-600"/> Gestão de Dados (Lote)</h4>
                  <div className="grid grid-cols-2 gap-6">
                    <label className="flex flex-col items-center justify-center p-8 bg-emerald-500/5 border-2 border-dashed border-emerald-500/20 rounded-3xl cursor-pointer hover:bg-emerald-500/10 transition-all group">
                      <Upload className="text-emerald-600 mb-4 group-hover:scale-110 transition-transform" size={32}/>
                      <span className="text-[9px] font-black uppercase tracking-widest text-emerald-700">Importar Excel</span>
                      <input type="file" className="hidden" accept=".xlsx,.xls" onChange={handleImportExcel} />
                    </label>
                    <button onClick={handleExport} className="flex flex-col items-center justify-center p-8 bg-brand-500/5 border-2 border-dashed border-brand-500/20 rounded-3xl hover:bg-brand-500/10 transition-all group">
                      <Download className="text-brand-600 mb-4 group-hover:scale-110 transition-transform" size={32}/>
                      <span className="text-[9px] font-black uppercase tracking-widest text-brand-700">Exportar Atual</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </main>

      {/* MODAL: ITEM */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-in zoom-in duration-300">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-[4rem] overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="p-10 bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <h3 className="text-sm font-black uppercase tracking-widest text-brand-600">Ficha Técnica</h3>
              <div className="flex gap-2">
                {editingItem && (
                   <button 
                    type="button"
                    onClick={() => handleDeleteItem(editingItem.id)}
                    className="p-2 text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                    title="Remover Registro"
                  >
                    <Trash2 size={24}/>
                  </button>
                )}
                <button onClick={() => setIsItemModalOpen(false)} className="p-2 text-slate-400 hover:text-red-500"><X size={32}/></button>
              </div>
            </div>
            <form onSubmit={handleSaveItem} className="p-12 space-y-8">
              <div className="flex gap-8 items-center">
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-32 h-32 rounded-[2.5rem] bg-slate-100 dark:bg-slate-950 border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center cursor-pointer relative overflow-hidden group hover:border-brand-500 transition-all shadow-inner"
                >
                  {formData.photo_url ? (
                    <img src={formData.photo_url} className="w-full h-full object-cover" />
                  ) : (
                    <>
                      <Camera className="text-slate-300 mb-2" size={32} />
                      <span className="text-[8px] font-black uppercase text-slate-400">Capturar</span>
                    </>
                  )}
                  <div className="absolute inset-0 bg-brand-600/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <ImageIcon className="text-white" size={24}/>
                  </div>
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/*" 
                  capture="environment"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () => setFormData({ ...formData, photo_url: reader.result as string });
                      reader.readAsDataURL(file);
                    }
                  }} 
                />
                <div className="flex-1 space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Descrição do Material</label>
                  <input required value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="EX: CIMENTO CP II" className="w-full p-6 rounded-2xl bg-slate-50 dark:bg-slate-950 font-black text-sm uppercase outline-none shadow-inner dark:text-white border-2 border-transparent focus:border-brand-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Centro de Custo / Setor</label>
                  <input required value={formData.department || ''} onChange={e => setFormData({ ...formData, department: e.target.value })} placeholder="EX: CIVIL" className="w-full p-6 rounded-2xl bg-slate-50 dark:bg-slate-950 font-bold text-xs uppercase outline-none shadow-inner dark:text-white border-2 border-transparent focus:border-brand-500" />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Endereçamento (Local)</label>
                  <input required value={formData.location || ''} onChange={e => setFormData({ ...formData, location: e.target.value })} placeholder="EX: ALMOX-01" className="w-full p-6 rounded-2xl bg-slate-50 dark:bg-slate-950 font-bold text-xs uppercase outline-none shadow-inner dark:text-white border-2 border-transparent focus:border-brand-500" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Saldo</label>
                  <input type="number" required value={formData.current_stock || 0} onChange={e => setFormData({ ...formData, current_stock: Number(e.target.value) })} className="w-full p-6 rounded-2xl bg-slate-50 dark:bg-slate-950 font-black text-center shadow-inner dark:text-white outline-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Estoque Mín.</label>
                  <input type="number" required value={formData.min_stock || 0} onChange={e => setFormData({ ...formData, min_stock: Number(e.target.value) })} className="w-full p-6 rounded-2xl bg-slate-50 dark:bg-slate-950 font-black text-center shadow-inner dark:text-white outline-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">UND</label>
                  <input value={formData.unit || 'UND'} onChange={e => setFormData({ ...formData, unit: e.target.value.toUpperCase() })} className="w-full p-6 rounded-2xl bg-slate-50 dark:bg-slate-950 font-black text-center shadow-inner dark:text-white outline-none" />
                </div>
              </div>
              <button type="submit" className="w-full py-7 bg-brand-600 text-white rounded-[2rem] font-black uppercase text-xs tracking-widest hover:scale-105 transition-all shadow-xl shadow-brand-500/20">SALVAR REGISTRO</button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: MOVIMENTAÇÃO */}
      {isMovementModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/90 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="w-full max-sm bg-white dark:bg-slate-900 rounded-[4rem] overflow-hidden shadow-2xl border border-white/10">
            <div className={`p-12 text-center text-white ${movementType === 'IN' ? 'bg-emerald-600 shadow-lg shadow-emerald-500/20' : 'bg-orange-600 shadow-lg shadow-orange-500/20'}`}>
              <h3 className="text-4xl font-black uppercase tracking-widest">{movementType === 'IN' ? 'Entrada' : 'Saída'}</h3>
              <p className="text-[9px] font-black uppercase mt-3 opacity-70 truncate px-6">{items.find(i => i.id === activeItemId)?.name}</p>
            </div>
            <form onSubmit={handleStockAction} className="p-12 space-y-8">
              <input type="number" min="1" required autoFocus value={moveData.quantity} onChange={e => setMoveData({ ...moveData, quantity: Number(e.target.value) })} className="w-full text-7xl font-black text-center p-8 rounded-3xl bg-slate-50 dark:bg-slate-950 outline-none shadow-inner dark:text-white" />
              <input value={moveData.reason} onChange={e => setMoveData({ ...moveData, reason: e.target.value.toUpperCase() })} placeholder="MOTIVO OU NF (OPCIONAL)" className="w-full p-5 rounded-2xl bg-slate-50 dark:bg-slate-950 text-center text-[10px] font-black uppercase outline-none shadow-inner dark:text-white" />
              <button type="submit" className={`w-full py-7 text-white rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-all ${movementType === 'IN' ? 'bg-emerald-600' : 'bg-orange-600'}`}>CONFIRMAR OPERAÇÃO</button>
              <button type="button" onClick={() => setIsMovementModalOpen(false)} className="w-full text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-red-500">CANCELAR</button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EQUIPE (EDITAR / NOVO) */}
      {(isUserModalOpen || isUserEditModalOpen) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-in zoom-in duration-300">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-[3rem] p-12 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex justify-between items-center mb-10">
              <h3 className="text-xl font-black tracking-tighter uppercase">{editingUser ? 'Editar Perfil' : 'Novo Membro'}</h3>
              <button onClick={() => { setIsUserModalOpen(false); setIsUserEditModalOpen(false); setEditingUser(null); }} className="text-slate-400 hover:text-red-500"><X /></button>
            </div>
            <form onSubmit={handleSaveUser} className="space-y-6">
              <div className="flex flex-col items-center gap-4 mb-4">
                <div 
                  onClick={() => userPhotoInputRef.current?.click()}
                  className="w-24 h-24 rounded-[2rem] bg-slate-100 dark:bg-slate-950 border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center cursor-pointer overflow-hidden relative group shadow-inner"
                >
                  {userFormData.photo_url ? (
                    <img src={userFormData.photo_url} className="w-full h-full object-cover" />
                  ) : (
                    <Camera className="text-slate-300" size={32} />
                  )}
                  <div className="absolute inset-0 bg-brand-600/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <ImageIcon className="text-white" size={24}/>
                  </div>
                </div>
                <input 
                  type="file" 
                  ref={userPhotoInputRef} 
                  className="hidden" 
                  accept="image/*" 
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () => setUserFormData({ ...userFormData, photo_url: reader.result as string });
                      reader.readAsDataURL(file);
                    }
                  }} 
                />
              </div>
              <input 
                required 
                disabled={!!editingUser}
                value={userFormData.badge_id || ''} 
                onChange={e => setUserFormData({ ...userFormData, badge_id: e.target.value })}
                placeholder="ID / MATRÍCULA" 
                className="w-full p-5 rounded-2xl bg-slate-50 dark:bg-slate-950 font-black outline-none border-2 border-transparent focus:border-brand-500 shadow-inner dark:text-white disabled:opacity-50" 
              />
              <input 
                required 
                value={userFormData.name || ''} 
                onChange={e => setUserFormData({ ...userFormData, name: e.target.value })}
                placeholder="NOME DO COLABORADOR" 
                className="w-full p-5 rounded-2xl bg-slate-50 dark:bg-slate-950 font-black outline-none border-2 border-transparent focus:border-brand-500 shadow-inner uppercase dark:text-white" 
              />
              <select 
                value={userFormData.role || 'Colaborador'} 
                onChange={e => setUserFormData({ ...userFormData, role: e.target.value })}
                className="w-full p-5 rounded-2xl bg-slate-50 dark:bg-slate-950 font-black outline-none border-2 border-transparent focus:border-brand-500 shadow-inner uppercase dark:text-white"
              >
                <option value="Colaborador">Colaborador</option>
                <option value="Estoquista">Estoquista</option>
                <option value="Supervisor">Supervisor</option>
                <option value="Gerente">Gerente</option>
                <option value="Técnico">Técnico</option>
              </select>
              <button className="w-full py-5 bg-brand-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl mt-4 active:scale-95 transition-all">SALVAR ALTERAÇÕES</button>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #3b82f6; border-radius: 10px; }
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        * { -webkit-tap-highlight-color: transparent; }
      `}</style>
    </div>
  );
}
