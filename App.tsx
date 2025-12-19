
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  LayoutDashboard, Package, Plus, Search, Trash2, Moon, Sun, Menu, X, 
  Camera, AlertTriangle, Loader2, RefreshCw, TrendingDown, Box, 
  History, Activity, Edit3, Users, FileSpreadsheet, 
  Upload, CheckCircle2, User as UserIcon, LogOut, ChevronRight,
  Info, Check, Database, ShieldCheck, Settings, Download, Filter,
  Sparkles, BrainCircuit, ListChecks, UserPlus, Zap, Globe, Signal, SignalLow,
  PieChart, BarChart3, DatabaseZap, Clock, ShieldAlert, CheckSquare, Square, Image as ImageIcon,
  Wifi, WifiOff, Tags, Layers
} from 'lucide-react';
import { InventoryItem, MovementLog, UserSession, AppView, UserProfile, PendingAction, Department } from './types';
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
  const [dbDepartments, setDbDepartments] = useState<Department[]>([]);
  
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

  // Login States
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
    if (!navigator.onLine) return;
    const queue = getSyncQueue();
    if (queue.length === 0) return;
    
    setConnStatus('syncing');
    for (const action of queue) {
      try {
        let error = null;
        if (action.type === 'UPSERT_ITEM') error = (await supabase.from('inventory_items').upsert(action.data)).error;
        if (action.type === 'INSERT_MOVEMENT') error = (await supabase.from('movements').insert(action.data)).error;
        if (action.type === 'DELETE_ITEM') error = (await supabase.from('inventory_items').update({ is_active: false }).eq('id', action.data.id)).error;
        if (action.type === 'UPDATE_USER') error = (await supabase.from('users').upsert(action.data)).error;
        if (action.type === 'UPSERT_DEPT') error = (await supabase.from('departments').upsert(action.data)).error;
        
        if (error) throw error;
        removeFromQueue(action.id);
      } catch (e) {
        console.error("Erro no sincronismo da fila:", e);
        break; 
      }
    }
    setConnStatus('online');
  }, []);

  const fetchData = useCallback(async (showLoader = true) => {
    if (showLoader) setIsSyncing(true);
    try {
      const [itRes, movRes, userRes, depRes] = await Promise.all([
        supabase.from('inventory_items').select('*').eq('is_active', true).order('name'),
        supabase.from('movements').select('*').order('timestamp', { ascending: false }).limit(200),
        supabase.from('users').select('*').order('name'),
        supabase.from('departments').select('*').order('name')
      ]);

      if (itRes.error || movRes.error || userRes.error || depRes.error) throw new Error("Falha na busca");

      const newItems = itRes.data || [];
      const newMovs = movRes.data || [];
      const newUsers = userRes.data || [];
      const newDepts = depRes.data || [];

      setItems(newItems);
      setMovements(newMovs);
      setAllUsers(newUsers);
      setDbDepartments(newDepts);
      
      saveOfflineData(newItems, newMovs, newUsers, newDepts.map(d => d.name));
      setLastSync(new Date());
      setConnStatus('online');
      await processSyncQueue();
    } catch {
      setConnStatus('offline');
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  }, [processSyncQueue]);

  useEffect(() => {
    fetchData();
    const channel = supabase.channel('realtime-sync-ag')
      .on('postgres_changes', { event: '*', table: 'inventory_items', schema: 'public' }, () => fetchData(false))
      .on('postgres_changes', { event: '*', table: 'movements', schema: 'public' }, () => fetchData(false))
      .on('postgres_changes', { event: '*', table: 'users', schema: 'public' }, () => fetchData(false))
      .on('postgres_changes', { event: '*', table: 'departments', schema: 'public' }, () => fetchData(false))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

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
    return { critical, ideal, surplus, critPct: (critical / total) * 100, idealPct: (ideal / total) * 100, surpPct: (surplus / total) * 100 };
  }, [items]);

  const filteredItems = useMemo(() => {
    const s = searchTerm.toLowerCase();
    return items.filter(i => {
      const matchSearch = !s || i.name.toLowerCase().includes(s) || i.location.toLowerCase().includes(s);
      const matchDept = selectedDept === 'TODOS' || i.department === selectedDept;
      return matchSearch && matchDept;
    });
  }, [items, searchTerm, selectedDept]);

  const departmentsList = useMemo(() => ['TODOS', ...dbDepartments.map(d => d.name).sort()], [dbDepartments]);

  // --- Handlers ---

  const handleInitialLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const existingUser = allUsers.find(u => u.badge_id === tempBadge);
    if (existingUser) {
      const session = { badgeId: existingUser.badge_id, name: existingUser.name, role: existingUser.role, photoUrl: existingUser.photo_url };
      setUser(session);
      localStorage.setItem('carpa_user', JSON.stringify(session));
    } else {
      setLoginStep('NAME');
    }
  };

  const handleFinalizeLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const session = { badgeId: tempBadge, name: tempName.toUpperCase(), role: 'Colaborador' };
    setUser(session);
    localStorage.setItem('carpa_user', JSON.stringify(session));
    const newUser: UserProfile = { badge_id: tempBadge, name: tempName.toUpperCase(), role: 'Colaborador', created_at: new Date().toISOString() };
    setAllUsers(prev => [...prev, newUser]);
    addToSyncQueue({ type: 'UPDATE_USER', table: 'users', data: newUser });
    processSyncQueue();
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

    if (!dbDepartments.some(d => d.name === itemData.department)) {
      const newDept = { id: `DEP-${Date.now()}`, name: itemData.department };
      addToSyncQueue({ type: 'UPSERT_DEPT', table: 'departments', data: newDept });
      setDbDepartments(prev => [...prev, newDept]);
    }

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

  const handleStockAction = async (e: React.FormEvent) => {
    e.preventDefault();
    const item = items.find(i => i.id === activeItemId);
    if (!item || !user) return;

    const qty = Number(moveData.quantity);
    const newStock = movementType === 'IN' ? item.current_stock + qty : item.current_stock - qty;

    if (newStock < 0) {
      alert("Operação cancelada: Saldo insuficiente.");
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
      reason: moveData.reason || (movementType === 'IN' ? 'Entrada Direta' : 'Saída Direta')
    };

    setItems(items.map(i => i.id === item.id ? updatedItem : i));
    setMovements([movRecord, ...movements]);

    addToSyncQueue({ type: 'UPSERT_ITEM', table: 'inventory_items', data: updatedItem });
    addToSyncQueue({ type: 'INSERT_MOVEMENT', table: 'movements', data: movRecord });

    setIsMovementModalOpen(false);
    setMoveData({ quantity: 1, reason: '' });
    processSyncQueue();
  };

  // Add missing handlers
  const handleDeleteItem = async (id: string) => {
    if (!window.confirm("Deseja realmente excluir este item?")) return;
    
    const now = new Date().toISOString();
    const deletedItem = items.find(i => i.id === id);
    
    if (deletedItem && user) {
        const movData: MovementLog = {
            id: `MOV-${Date.now()}`,
            item_id: deletedItem.id,
            item_name: deletedItem.name,
            type: 'DELETE',
            quantity: 0,
            user_badge_id: user.badgeId,
            user_name: user.name,
            timestamp: now,
            reason: 'Item excluído do sistema'
        };
        setMovements([movData, ...movements]);
        addToSyncQueue({ type: 'INSERT_MOVEMENT', table: 'movements', data: movData });
    }

    setItems(items.filter(i => i.id !== id));
    addToSyncQueue({ type: 'DELETE_ITEM', table: 'inventory_items', data: { id } });
    setIsItemModalOpen(false);
    setEditingItem(null);
    processSyncQueue();
  };

  const handleExport = () => {
    const data = items.map(i => ({
      ID: i.id,
      NOME: i.name,
      UNIDADE: i.unit,
      ESTOQUE_MINIMO: i.min_stock,
      ESTOQUE_ATUAL: i.current_stock,
      LOCALIZACAO: i.location,
      SETOR: i.department,
      ATUALIZADO_EM: i.last_updated,
      ATUALIZADO_POR: i.last_updated_by
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Estoque");
    XLSX.writeFile(wb, `ESTOQUE_AG_SYSTEM_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        data.forEach((row: any) => {
          const newItem: InventoryItem = {
            id: row.ID || `IT-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            name: (row.NOME || 'SEM NOME').toString().toUpperCase(),
            unit: (row.UNIDADE || 'UND').toString().toUpperCase(),
            min_stock: Number(row.ESTOQUE_MINIMO) || 0,
            current_stock: Number(row.ESTOQUE_ATUAL) || 0,
            location: (row.LOCALIZACAO || 'N/A').toString().toUpperCase(),
            department: (row.SETOR || 'GERAL').toString().toUpperCase(),
            last_updated: new Date().toISOString(),
            last_updated_by: user.name,
            is_active: true
          };
          
          addToSyncQueue({ type: 'UPSERT_ITEM', table: 'inventory_items', data: newItem });
        });
        
        fetchData(true);
        alert("Importação concluída. Sincronizando com o banco central...");
      } catch (err) {
        console.error("Erro na importação:", err);
        alert("Erro ao processar arquivo Excel.");
      }
    };
    reader.readAsBinaryString(file);
    if (e.target) e.target.value = ''; // Reset input
  };

  // --- Views ---

  if (isLoading && items.length === 0) return (
    <div className="h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-[#020617]">
      <Logo className="w-16 h-16 animate-pulse" />
      <div className="mt-8 flex flex-col items-center gap-2">
        <Loader2 className="animate-spin text-brand-600" size={32} />
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sincronizando com Supabase...</span>
      </div>
    </div>
  );

  return (
    <div className="h-screen flex flex-col lg:flex-row bg-slate-50 dark:bg-[#020617] text-slate-900 dark:text-white overflow-hidden font-sans">
      
      {/* Sidebar - Mobile Header Incluído */}
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
              { id: AppView.DASHBOARD, icon: LayoutDashboard, label: 'Painel Geral' },
              { id: AppView.INVENTORY, icon: Package, label: 'Almoxarifado' },
              { id: AppView.MOVEMENTS, icon: History, label: 'Auditoria' },
              { id: AppView.USERS, icon: Users, label: 'Colaboradores' },
              { id: AppView.SETTINGS, icon: RefreshCw, label: 'Cloud Sync' }
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
                   <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">{connStatus === 'online' ? 'Cloud OK' : connStatus === 'syncing' ? 'Salvando...' : 'Offline'}</span>
                </div>
                {connStatus === 'online' ? <Wifi size={14} className="text-emerald-500"/> : <WifiOff size={14} className="text-red-500"/>}
              </div>
            </div>
            <div className="flex items-center gap-4 p-3 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 mb-4 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center text-white font-black text-lg overflow-hidden">
                {user?.photoUrl ? <img src={user.photoUrl} className="w-full h-full object-cover" /> : user?.name.charAt(0)}
              </div>
              <div className="truncate">
                <p className="text-[11px] font-black uppercase truncate">{user?.name}</p>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">ID: {user?.badgeId}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDarkMode(!darkMode)} className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-400 hover:text-brand-500 transition-all flex-1 flex justify-center">{darkMode ? <Sun size={18}/> : <Moon size={18}/>}</button>
              <button onClick={() => { setUser(null); localStorage.removeItem('carpa_user'); }} className="p-3 bg-red-500/10 text-red-500 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all flex-[2]">Sair</button>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="h-16 flex items-center justify-between px-8 border-b border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-[#020617]/60 backdrop-blur-xl sticky top-0 z-30">
          <div className="flex items-center gap-6">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 text-slate-500"><Menu/></button>
            <h2 className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">{currentView}</h2>
          </div>
          <div className="flex gap-4">
            {currentView === AppView.INVENTORY && (
              <button onClick={() => { setEditingItem(null); setFormData({}); setIsItemModalOpen(true); }} className="bg-brand-600 text-white px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-3 shadow-lg shadow-brand-500/20 hover:scale-105 active:scale-95 transition-all">
                <Plus size={18}/> CADASTRAR ITEM
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 lg:p-10 custom-scrollbar">
          <div className="max-w-7xl mx-auto">
            
            {/* PAINEL (DASHBOARD) */}
            {currentView === AppView.DASHBOARD && (
              <div className="space-y-8 animate-in fade-in duration-500">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="p-10 rounded-[3rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl">
                    <div className="w-14 h-14 rounded-2xl bg-brand-500/10 flex items-center justify-center text-brand-500 mb-6"><Database size={28}/></div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total no Banco</p>
                    <h3 className="text-5xl font-black tracking-tighter">{items.length} <span className="text-sm text-slate-400 font-bold ml-2">SKUs</span></h3>
                  </div>
                  <div className="p-10 rounded-[3rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 mb-6"><Layers size={28}/></div>
                    <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Setores Ativos</p>
                    <h3 className="text-5xl font-black text-emerald-600 tracking-tighter">{dbDepartments.length}</h3>
                  </div>
                  <div className="p-10 rounded-[3rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl">
                    <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-500 mb-6 group-hover:animate-bounce"><AlertTriangle size={28}/></div>
                    <p className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-1">Reposição Urgente</p>
                    <h3 className="text-5xl font-black text-red-600 tracking-tighter">{stats.critical}</h3>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="p-12 rounded-[4rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl">
                    <h4 className="text-sm font-black uppercase tracking-widest mb-10 flex items-center gap-3"><PieChart size={20} className="text-brand-500"/> Balanço de Saúde</h4>
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
                          <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Sincronizado</span>
                        </div>
                      </div>
                      <div className="space-y-4 flex-1">
                        <div className="flex justify-between items-center p-4 bg-red-50 dark:bg-red-950/20 rounded-2xl">
                          <span className="text-[10px] font-black text-red-600 uppercase tracking-widest">Abaixo do Mínimo</span>
                          <span className="text-lg font-black text-red-600">{stats.critical}</span>
                        </div>
                        <div className="flex justify-between items-center p-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-2xl">
                          <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Nível Ideal</span>
                          <span className="text-lg font-black text-emerald-600">{stats.ideal}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="p-12 rounded-[4rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
                    <h4 className="text-sm font-black uppercase tracking-widest mb-10 flex items-center gap-3"><History size={20} className="text-brand-500"/> Logs em Tempo Real</h4>
                    <div className="space-y-4 max-h-[300px] overflow-y-auto pr-4 custom-scrollbar">
                      {movements.slice(0, 10).map(m => (
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
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ESTOQUE (INVENTORY) */}
            {currentView === AppView.INVENTORY && (
              <div className="space-y-8 animate-in slide-in-from-bottom-10 duration-500">
                <div className="bg-white dark:bg-slate-900 p-6 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col md:flex-row gap-6">
                  <div className="flex-1 flex items-center gap-4 bg-slate-50 dark:bg-slate-950 px-6 py-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-inner">
                    <Search className="text-slate-400" size={20}/>
                    <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="PESQUISAR MATERIAL OU LOCAL NO BANCO..." className="w-full bg-transparent outline-none font-black text-xs uppercase tracking-widest dark:text-white" />
                  </div>
                  <div className="flex gap-2 items-center overflow-x-auto pb-2 md:pb-0 custom-scrollbar max-w-md">
                      {departmentsList.map(d => (
                        <button key={d} onClick={() => setSelectedDept(d)} className={`px-5 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${selectedDept === d ? 'bg-brand-600 text-white shadow-xl scale-105' : 'bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-brand-500'}`}>{d}</button>
                      ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-6">
                  {filteredItems.map(item => (
                    <div 
                      key={item.id} 
                      className="p-4 bg-white dark:bg-slate-900 rounded-[2.5rem] border-2 border-transparent shadow-md hover:shadow-xl hover:border-brand-500/50 transition-all group relative overflow-hidden"
                    >
                      <div className="aspect-square bg-slate-100 dark:bg-slate-950 rounded-[2rem] mb-4 relative overflow-hidden flex items-center justify-center shadow-inner">
                        {item.photo_url ? <img src={item.photo_url} className="w-full h-full object-cover" /> : <Package className="opacity-10" size={50} />}
                        <div className="absolute top-3 left-3 px-3 py-1 bg-slate-900/80 backdrop-blur-md rounded-lg text-[7px] font-black text-white uppercase tracking-tighter">{item.location}</div>
                      </div>
                      <h4 className="text-[11px] font-black uppercase truncate mb-0.5">{item.name}</h4>
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-4">{item.department}</p>
                      
                      <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                        <div className="flex flex-col">
                          <span className={`text-2xl font-black tracking-tighter ${item.current_stock <= item.min_stock ? 'text-red-500 animate-pulse' : ''}`}>{item.current_stock}</span>
                          <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">{item.unit}</span>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setActiveItemId(item.id); setMovementType('IN'); setIsMovementModalOpen(true); }} className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg hover:bg-emerald-500 hover:text-white transition-all"><Plus size={14}/></button>
                          <button onClick={() => { setActiveItemId(item.id); setMovementType('OUT'); setIsMovementModalOpen(true); }} className="p-2 bg-orange-500/10 text-orange-500 rounded-lg hover:bg-orange-500 hover:text-white transition-all"><TrendingDown size={14}/></button>
                          <button onClick={() => { setEditingItem(item); setFormData(item); setIsItemModalOpen(true); }} className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-lg hover:bg-brand-600 hover:text-white transition-all"><Edit3 size={14}/></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SETTINGS (SINCRONISMO) */}
            {currentView === AppView.SETTINGS && (
              <div className="max-w-2xl mx-auto space-y-8 animate-in slide-in-from-bottom-10">
                <div className="p-10 rounded-[3rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl">
                  <h4 className="text-sm font-black uppercase tracking-widest mb-10 flex items-center gap-5"><DatabaseZap size={24} className="text-brand-600"/> Gateway AG System</h4>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center p-6 bg-slate-50 dark:bg-slate-950 rounded-2xl">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tabelas Conectadas</span>
                      <div className="flex gap-2">
                        <span className="px-3 py-1 bg-emerald-500/10 text-emerald-500 rounded-full text-[8px] font-black uppercase">Inventory</span>
                        <span className="px-3 py-1 bg-emerald-500/10 text-emerald-500 rounded-full text-[8px] font-black uppercase">Movements</span>
                        <span className="px-3 py-1 bg-emerald-500/10 text-emerald-500 rounded-full text-[8px] font-black uppercase">Users</span>
                        <span className="px-3 py-1 bg-emerald-500/10 text-emerald-500 rounded-full text-[8px] font-black uppercase">Depts</span>
                      </div>
                    </div>
                    <button onClick={() => fetchData(true)} className="w-full py-6 bg-brand-600 text-white rounded-3xl font-black uppercase text-[11px] tracking-widest shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all">
                      <RefreshCw size={18} className={isSyncing ? 'animate-spin' : ''} /> ATUALIZAR BANCO CENTRAL
                    </button>
                  </div>
                </div>

                <div className="p-10 rounded-[3rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl">
                  <h4 className="text-sm font-black uppercase tracking-widest mb-10 flex items-center gap-5"><FileSpreadsheet size={24} className="text-emerald-600"/> Gestão em Lote</h4>
                  <div className="grid grid-cols-2 gap-6">
                    <label className="flex flex-col items-center justify-center p-8 bg-emerald-500/5 border-2 border-dashed border-emerald-500/20 rounded-3xl cursor-pointer hover:bg-emerald-500/10 transition-all">
                      <Upload className="text-emerald-600 mb-4" size={32}/>
                      <span className="text-[9px] font-black uppercase tracking-widest text-emerald-700">Importar Excel</span>
                      <input type="file" className="hidden" accept=".xlsx,.xls" onChange={handleImportExcel} />
                    </label>
                    <button onClick={handleExport} className="flex flex-col items-center justify-center p-8 bg-brand-500/5 border-2 border-dashed border-brand-500/20 rounded-3xl hover:bg-brand-500/10 transition-all">
                      <Download className="text-brand-600 mb-4" size={32}/>
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
              <h3 className="text-sm font-black uppercase tracking-widest text-brand-600">Registro de Ativo</h3>
              <div className="flex gap-2">
                {editingItem && (
                   <button type="button" onClick={() => handleDeleteItem(editingItem.id)} className="p-2 text-red-500 hover:bg-red-500/10 rounded-xl transition-all"><Trash2 size={24}/></button>
                )}
                <button onClick={() => setIsItemModalOpen(false)} className="p-2 text-slate-400 hover:text-red-500"><X size={32}/></button>
              </div>
            </div>
            <form onSubmit={handleSaveItem} className="p-12 space-y-8">
              <div className="flex gap-8 items-center">
                <div onClick={() => fileInputRef.current?.click()} className="w-32 h-32 rounded-[2.5rem] bg-slate-100 dark:bg-slate-950 border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center cursor-pointer relative overflow-hidden group shadow-inner">
                  {formData.photo_url ? <img src={formData.photo_url} className="w-full h-full object-cover" /> : <><Camera className="text-slate-300 mb-2" size={32} /><span className="text-[8px] font-black uppercase text-slate-400">Capturar</span></>}
                </div>
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" capture="environment" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onloadend = () => setFormData({ ...formData, photo_url: reader.result as string });
                    reader.readAsDataURL(file);
                  }
                }} />
                <div className="flex-1 space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Descrição Comercial</label>
                  <input required value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="EX: CIMENTO CP II" className="w-full p-6 rounded-2xl bg-slate-50 dark:bg-slate-950 font-black text-sm uppercase outline-none shadow-inner dark:text-white border-2 border-transparent focus:border-brand-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Centro de Custo / Setor</label>
                  <input required list="depts" value={formData.department || ''} onChange={e => setFormData({ ...formData, department: e.target.value })} placeholder="EX: CIVIL" className="w-full p-6 rounded-2xl bg-slate-50 dark:bg-slate-950 font-bold text-xs uppercase outline-none shadow-inner dark:text-white border-2 border-transparent focus:border-brand-500" />
                  <datalist id="depts">{dbDepartments.map(d => <option key={d.id} value={d.name} />)}</datalist>
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Localização (Box/Prateleira)</label>
                  <input required value={formData.location || ''} onChange={e => setFormData({ ...formData, location: e.target.value })} placeholder="EX: ALMOX-01" className="w-full p-6 rounded-2xl bg-slate-50 dark:bg-slate-950 font-bold text-xs uppercase outline-none shadow-inner dark:text-white border-2 border-transparent focus:border-brand-500" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Saldo Atual</label>
                  <input type="number" required value={formData.current_stock || 0} onChange={e => setFormData({ ...formData, current_stock: Number(e.target.value) })} className="w-full p-6 rounded-2xl bg-slate-50 dark:bg-slate-950 font-black text-center shadow-inner dark:text-white outline-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Estoque Crítico</label>
                  <input type="number" required value={formData.min_stock || 0} onChange={e => setFormData({ ...formData, min_stock: Number(e.target.value) })} className="w-full p-6 rounded-2xl bg-slate-50 dark:bg-slate-950 font-black text-center shadow-inner dark:text-white outline-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Unidade</label>
                  <input value={formData.unit || 'UND'} onChange={e => setFormData({ ...formData, unit: e.target.value.toUpperCase() })} className="w-full p-6 rounded-2xl bg-slate-50 dark:bg-slate-950 font-black text-center shadow-inner dark:text-white outline-none" />
                </div>
              </div>
              <button type="submit" className="w-full py-7 bg-brand-600 text-white rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-xl shadow-brand-500/20">CONFIRMAR REGISTRO</button>
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

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #3b82f6; border-radius: 10px; }
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        * { -webkit-tap-highlight-color: transparent; }
      `}</style>
    </div>
  );
}
