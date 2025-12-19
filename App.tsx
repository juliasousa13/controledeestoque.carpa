
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
// Fix: Importing Gemini service to provide automated product insights
import { generateProductInsights } from './services/geminiService';

declare const XLSX: any;

const USER_ROLES = [
  "Auxiliar de almoxarifado",
  "Ajudante de almoxarifado",
  "Encarregado",
  "Jovem Aprendiz",
  "Engenharia",
  "Gestão"
];

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
  // Fix: Added state for IA loading indicator
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);
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
  
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  
  const [movementType, setMovementType] = useState<'IN' | 'OUT'>('IN');
  const [activeItemId, setActiveItemId] = useState<string>('');
  const [formData, setFormData] = useState<Partial<InventoryItem>>({});
  const [moveData, setMoveData] = useState({ quantity: 1, reason: '' });
  const [userFormData, setUserFormData] = useState<Partial<UserProfile>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const userPhotoInputRef = useRef<HTMLInputElement>(null);

  // --- Theme Toggle ---
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('carpa_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('carpa_theme', 'light');
    }
  }, [darkMode]);

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
        console.error("Sync error:", e);
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
        supabase.from('movements').select('*').order('timestamp', { ascending: false }).limit(300),
        supabase.from('users').select('*').order('name'),
        supabase.from('departments').select('*').order('name')
      ]);

      if (itRes.error || movRes.error || userRes.error || depRes.error) throw new Error("Fetch failed");

      setItems(itRes.data || []);
      setMovements(movRes.data || []);
      setAllUsers(userRes.data || []);
      setDbDepartments(depRes.data || []);
      
      saveOfflineData(itRes.data || [], movRes.data || [], userRes.data || [], (depRes.data || []).map(d => d.name));
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
    const channel = supabase.channel('realtime-ag-v3')
      .on('postgres_changes', { event: '*', table: 'inventory_items', schema: 'public' }, () => fetchData(false))
      .on('postgres_changes', { event: '*', table: 'movements', schema: 'public' }, () => fetchData(false))
      .on('postgres_changes', { event: '*', table: 'users', schema: 'public' }, () => fetchData(false))
      .on('postgres_changes', { event: '*', table: 'departments', schema: 'public' }, () => fetchData(false))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  // --- Computed Stats ---
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
      const matchSearch = !s || i.name.toLowerCase().includes(s) || (i.location && i.location.toLowerCase().includes(s));
      const matchDept = selectedDept === 'TODOS' || i.department === selectedDept;
      return matchSearch && matchDept;
    });
  }, [items, searchTerm, selectedDept]);

  const dailyLogs = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return movements.filter(m => m.timestamp.startsWith(today)).slice(0, 15);
  }, [movements]);

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
    const session = { badgeId: tempBadge, name: tempName.toUpperCase(), role: 'Auxiliar de almoxarifado' };
    setUser(session);
    localStorage.setItem('carpa_user', JSON.stringify(session));
    const newUser: UserProfile = { badge_id: tempBadge, name: tempName.toUpperCase(), role: 'Auxiliar de almoxarifado', created_at: new Date().toISOString() };
    setAllUsers(prev => [...prev, newUser]);
    addToSyncQueue({ type: 'UPDATE_USER', table: 'users', data: newUser });
    processSyncQueue();
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !formData.name) return;

    const isEditing = !!editingItem;
    const now = new Date().toISOString();
    
    const item: InventoryItem = {
      id: isEditing ? editingItem!.id : `IT-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: (formData.name || '').toUpperCase(),
      description: formData.description || '',
      unit: (formData.unit || 'UND').toUpperCase(),
      current_stock: Number(formData.current_stock) || 0,
      min_stock: Number(formData.min_stock) || 0,
      department: (formData.department || 'GERAL').toUpperCase(),
      location: (formData.location || 'N/A').toUpperCase(),
      photo_url: formData.photo_url || undefined,
      last_updated: now,
      last_updated_by: user.name,
      is_active: true
    };

    const mov: MovementLog = {
      id: `MOV-${Date.now()}`,
      item_id: item.id,
      item_name: item.name,
      type: isEditing ? 'EDIT' : 'CREATE',
      quantity: item.current_stock,
      user_badge_id: user.badgeId,
      user_name: user.name,
      timestamp: now,
      reason: isEditing ? 'Alteração cadastral via sistema' : 'Entrada inicial de estoque'
    };

    if (isEditing) {
      setItems(prev => prev.map(i => i.id === item.id ? item : i));
    } else {
      setItems(prev => [item, ...prev]);
    }
    setMovements(prev => [mov, ...prev]);

    addToSyncQueue({ type: 'UPSERT_ITEM', table: 'inventory_items', data: item });
    addToSyncQueue({ type: 'INSERT_MOVEMENT', table: 'movements', data: mov });

    setIsItemModalOpen(false);
    setFormData({});
    setEditingItem(null);
    processSyncQueue();
  };

  const handleIAInsights = async () => {
    if (!formData.name || !formData.department) {
      alert("Informe o nome e o setor para que a IA possa analisar o material.");
      return;
    }
    setIsGeneratingInsights(true);
    try {
      const insights = await generateProductInsights(formData.name, formData.department);
      if (insights) {
        setFormData(prev => ({
          ...prev,
          description: insights.description,
          location: prev.location || insights.storageAdvice
        }));
      }
    } catch (err) {
      console.error("Gemini Insight Error:", err);
    } finally {
      setIsGeneratingInsights(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!window.confirm("Deseja desativar este item do estoque?")) return;
    const item = items.find(i => i.id === id);
    if (!item || !user) return;

    const mov: MovementLog = {
      id: `MOV-${Date.now()}`,
      item_id: item.id,
      item_name: item.name,
      type: 'DELETE',
      quantity: 0,
      user_badge_id: user.badgeId,
      user_name: user.name,
      timestamp: new Date().toISOString(),
      reason: 'Exclusão Auditada'
    };

    setItems(items.filter(i => i.id !== id));
    setMovements([mov, ...movements]);
    setSelectedItemIds(prev => prev.filter(sid => sid !== id));

    addToSyncQueue({ type: 'DELETE_ITEM', table: 'inventory_items', data: { id } });
    addToSyncQueue({ type: 'INSERT_MOVEMENT', table: 'movements', data: mov });
    processSyncQueue();
  };

  const handleDeleteBatch = async () => {
    if (selectedItemIds.length === 0) return;
    if (!window.confirm(`Deseja excluir ${selectedItemIds.length} itens selecionados?`)) return;

    const now = new Date().toISOString();
    for (const id of selectedItemIds) {
      const item = items.find(i => i.id === id);
      if (item && user) {
        const mov: MovementLog = {
          id: `MOV-${Date.now()}-${Math.random()}`,
          item_id: item.id,
          item_name: item.name,
          type: 'DELETE',
          quantity: 0,
          user_badge_id: user.badgeId,
          user_name: user.name,
          timestamp: now,
          reason: 'Exclusão em Lote'
        };
        addToSyncQueue({ type: 'DELETE_ITEM', table: 'inventory_items', data: { id } });
        addToSyncQueue({ type: 'INSERT_MOVEMENT', table: 'movements', data: mov });
      }
    }
    
    setItems(items.filter(i => !selectedItemIds.includes(i.id)));
    setSelectedItemIds([]);
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

  const handleExport = () => {
    const data = items.map(i => ({
      ID: i.id,
      Material: i.name,
      Unidade: i.unit,
      Setor: i.department,
      Local: i.location,
      "Saldo Atual": i.current_stock,
      "Saldo Mínimo": i.min_stock,
      "Responsável": i.last_updated_by,
      "Data": new Date(i.last_updated).toLocaleString()
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventário");
    XLSX.writeFile(wb, `AG_ESTOQUE_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: 'binary' });
        const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        data.forEach((row: any) => {
          const it: InventoryItem = {
            id: row.ID || `IT-${Date.now()}-${Math.random().toString(36).substr(2,4)}`,
            name: (row.Material || row.NOME || '').toUpperCase(),
            unit: (row.Unidade || row.UND || 'UND').toUpperCase(),
            current_stock: Number(row.Saldo || row.QUANTIDADE) || 0,
            min_stock: Number(row.Minimo || row.ESTOQUE_MIN) || 0,
            department: (row.Setor || row.SETOR || 'GERAL').toUpperCase(),
            location: (row.Local || row.LOCAL || 'N/A').toUpperCase(),
            last_updated: new Date().toISOString(),
            last_updated_by: user.name,
            is_active: true
          };
          if (it.name) addToSyncQueue({ type: 'UPSERT_ITEM', table: 'inventory_items', data: it });
        });
        alert("Importação iniciada. Sincronizando...");
        fetchData(true);
      } catch { alert("Erro ao ler o arquivo."); }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userFormData.badge_id || !userFormData.name) return;

    const u: UserProfile = {
      badge_id: userFormData.badge_id,
      name: userFormData.name.toUpperCase(),
      role: userFormData.role || 'Auxiliar de almoxarifado',
      photo_url: userFormData.photo_url || null,
      created_at: editingUser?.created_at || new Date().toISOString()
    };

    setAllUsers(prev => {
      const exists = prev.some(user => user.badge_id === editingUser?.badge_id);
      if (exists) {
        return prev.map(user => user.badge_id === editingUser?.badge_id ? u : user);
      }
      return [...prev, u];
    });

    // If editing self, update active session
    if (user?.badgeId === editingUser?.badge_id) {
       const newSession = { ...user, name: u.name, role: u.role, photoUrl: u.photo_url || undefined };
       setUser(newSession);
       localStorage.setItem('carpa_user', JSON.stringify(newSession));
    }

    addToSyncQueue({ type: 'UPDATE_USER', table: 'users', data: u });
    setIsUserModalOpen(false);
    setEditingUser(null);
    setUserFormData({});
    processSyncQueue();
  };

  // --- Views ---

  if (!user) return (
    <div className="h-screen flex items-center justify-center bg-slate-100 dark:bg-[#020617] p-6 font-sans">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-[3rem] p-12 shadow-2xl border border-slate-200 dark:border-slate-800 text-center animate-in zoom-in duration-300">
        <Logo className="w-20 h-20 mx-auto mb-8" />
        <h1 className="text-3xl font-black tracking-tighter mb-2">AG SYSTEM</h1>
        <p className="text-[10px] font-black text-brand-500 uppercase tracking-widest mb-10">Controle de Produção</p>
        
        {loginStep === 'BADGE' ? (
          <form onSubmit={handleInitialLogin} className="space-y-6">
            <div className="space-y-2 text-left">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Matrícula Profissional</label>
              <input autoFocus required value={tempBadge} onChange={e => setTempBadge(e.target.value)} placeholder="000000" className="w-full py-5 rounded-2xl bg-slate-50 dark:bg-slate-950 text-center font-black outline-none border-2 border-transparent focus:border-brand-500 text-lg shadow-inner dark:text-white" />
            </div>
            <button type="submit" className="w-full py-5 bg-brand-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:scale-[1.02] active:scale-95 transition-all">IDENTIFICAR</button>
          </form>
        ) : (
          <form onSubmit={handleFinalizeLogin} className="space-y-6 animate-in slide-in-from-right duration-300">
              <div className="p-4 bg-brand-50 dark:bg-brand-950/20 rounded-2xl border border-brand-100 dark:border-brand-900/30 mb-2">
                <p className="text-[9px] font-black text-brand-600 uppercase">Novo Registro</p>
              </div>
              <div className="space-y-2 text-left">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Completo</label>
                <input autoFocus required value={tempName} onChange={e => setTempName(e.target.value)} placeholder="SEU NOME" className="w-full py-5 rounded-2xl bg-slate-50 dark:bg-slate-950 text-center font-black outline-none border-2 border-transparent focus:border-brand-500 text-lg shadow-inner uppercase dark:text-white" />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setLoginStep('BADGE')} className="flex-1 py-5 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-2xl font-black uppercase text-xs tracking-widest">VOLTAR</button>
                <button type="submit" className="flex-[2] py-5 bg-emerald-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-all">ENTRAR</button>
              </div>
          </form>
        )}
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
              { id: AppView.DASHBOARD, icon: LayoutDashboard, label: 'Painel Geral' },
              { id: AppView.INVENTORY, icon: Package, label: 'Almoxarifado' },
              { id: AppView.MOVEMENTS, icon: History, label: 'Auditoria' },
              { id: AppView.USERS, icon: Users, label: 'Colaboradores' },
              { id: AppView.SETTINGS, icon: RefreshCw, label: 'Gateway' }
            ].map(v => (
              <button key={v.id} onClick={() => { setCurrentView(v.id); setIsSidebarOpen(false); }}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl font-bold text-[11px] uppercase tracking-wider transition-all ${currentView === v.id ? 'bg-brand-600 text-white shadow-xl translate-x-1' : 'text-slate-400 hover:bg-brand-500/10 hover:text-brand-500'}`}>
                <v.icon size={18} /> {v.label}
              </button>
            ))}
          </nav>

          <div className="mt-auto pt-8 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-4 p-3 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 mb-4 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center text-white font-black text-lg overflow-hidden">
                {user.photoUrl ? <img src={user.photoUrl} className="w-full h-full object-cover" /> : user.name.charAt(0)}
              </div>
              <div className="truncate">
                <p className="text-[11px] font-black uppercase truncate">{user.name}</p>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">ID: {user.badgeId}</p>
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
              <>
                {selectedItemIds.length > 0 && (
                  <button onClick={handleDeleteBatch} className="bg-red-600 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-3 shadow-lg hover:scale-105 transition-all">
                    <Trash2 size={16}/> EXCLUIR SELECIONADOS ({selectedItemIds.length})
                  </button>
                )}
                <button onClick={() => { setEditingItem(null); setFormData({}); setIsItemModalOpen(true); }} className="bg-brand-600 text-white px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-3 shadow-lg hover:scale-105 transition-all">
                  <Plus size={18}/> NOVO ITEM
                </button>
              </>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 lg:p-10 custom-scrollbar">
          <div className="max-w-7xl mx-auto">
            
            {/* VIEW: DASHBOARD */}
            {currentView === AppView.DASHBOARD && (
              <div className="space-y-8 animate-in fade-in duration-500">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="p-10 rounded-[3rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl">
                    <div className="w-14 h-14 rounded-2xl bg-brand-500/10 flex items-center justify-center text-brand-500 mb-6"><Database size={28}/></div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Almoxarifado</p>
                    <h3 className="text-5xl font-black tracking-tighter">{items.length}</h3>
                  </div>
                  <div className="p-10 rounded-[3rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl">
                    <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-500 mb-6 group-hover:animate-bounce"><AlertTriangle size={28}/></div>
                    <p className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-1">Reposição Crítica</p>
                    <h3 className="text-5xl font-black text-red-600 tracking-tighter">{stats.critical}</h3>
                  </div>
                  <div className="p-10 rounded-[3rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl">
                    <div className="w-14 h-14 rounded-2xl bg-brand-500/10 flex items-center justify-center text-brand-500 mb-6"><Activity size={28}/></div>
                    <p className="text-[10px] font-black text-brand-500 uppercase tracking-widest mb-1">Logs do Dia</p>
                    <h3 className="text-5xl font-black text-brand-600 tracking-tighter">{dailyLogs.length}</h3>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="p-12 rounded-[4rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl">
                    <h4 className="text-sm font-black uppercase tracking-widest mb-10 flex items-center gap-3"><PieChart size={20} className="text-brand-500"/> Saúde de Estoque</h4>
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
                          <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Normal</span>
                        </div>
                      </div>
                      <div className="space-y-4 flex-1">
                        <div className="flex justify-between items-center p-4 bg-red-50 dark:bg-red-950/20 rounded-2xl">
                          <span className="text-[10px] font-black text-red-600 uppercase tracking-widest">Abaixo do Mínimo</span>
                          <span className="text-lg font-black text-red-600">{stats.critical}</span>
                        </div>
                        <div className="flex justify-between items-center p-4 bg-brand-50 dark:bg-brand-950/20 rounded-2xl">
                          <span className="text-[10px] font-black text-brand-600 uppercase tracking-widest">Saldo Ideal</span>
                          <span className="text-lg font-black text-brand-600">{stats.ideal}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="p-12 rounded-[4rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl">
                    <h4 className="text-sm font-black uppercase tracking-widest mb-10 flex items-center gap-3"><Zap size={20} className="text-brand-500"/> Logs em Tempo Real</h4>
                    <div className="space-y-4 max-h-[300px] overflow-y-auto pr-4 custom-scrollbar">
                      {dailyLogs.map(m => (
                        <div key={m.id} className="flex items-center gap-5 p-4 rounded-3xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
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
                      {dailyLogs.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 py-10 opacity-30">
                           <Clock size={48} className="mb-4" />
                           <p className="text-[10px] font-black uppercase tracking-widest">Sem atividades hoje</p>
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
                  <div className="flex gap-2">
                    <button onClick={() => {
                      if (selectedItemIds.length === filteredItems.length) setSelectedItemIds([]);
                      else setSelectedItemIds(filteredItems.map(i => i.id));
                    }} className="px-6 py-4 rounded-2xl border border-slate-200 dark:border-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-brand-500">
                      {selectedItemIds.length === filteredItems.length ? "Deselecionar" : "Selecionar Tudo"}
                    </button>
                    <div className="flex gap-1 overflow-x-auto pb-2 custom-scrollbar max-w-sm">
                      {departmentsList.map(d => (
                        <button key={d} onClick={() => setSelectedDept(d)} className={`px-5 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${selectedDept === d ? 'bg-brand-600 text-white shadow-xl' : 'bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-brand-500'}`}>{d}</button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-6">
                  {filteredItems.map(item => (
                    <div 
                      key={item.id} 
                      className={`p-4 bg-white dark:bg-slate-900 rounded-[2.5rem] border-2 transition-all group relative overflow-hidden ${selectedItemIds.includes(item.id) ? 'border-brand-600 shadow-2xl scale-105' : 'border-transparent shadow-md hover:border-slate-200'}`}
                    >
                      <button 
                        onClick={() => setSelectedItemIds(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id])}
                        className="absolute top-6 left-6 z-10 p-2 bg-white/20 backdrop-blur-md rounded-lg text-white border border-white/20"
                      >
                        {selectedItemIds.includes(item.id) ? <CheckSquare size={18} className="text-brand-400"/> : <Square size={18}/>}
                      </button>

                      <div className="aspect-square bg-slate-100 dark:bg-slate-950 rounded-[2rem] mb-4 relative overflow-hidden flex items-center justify-center shadow-inner">
                        {item.photo_url ? <img src={item.photo_url} className="w-full h-full object-cover" /> : <Package className="opacity-10" size={50} />}
                        <div className="absolute top-3 right-3 px-3 py-1 bg-slate-900/80 backdrop-blur-md rounded-lg text-[7px] font-black text-white uppercase tracking-tighter">{item.location}</div>
                      </div>
                      <h4 className="text-[11px] font-black uppercase truncate mb-0.5">{item.name}</h4>
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-4">{item.department}</p>
                      
                      <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                        <div className="flex flex-col">
                          <span className={`text-2xl font-black tracking-tighter ${item.current_stock <= item.min_stock ? 'text-red-500 animate-pulse' : ''}`}>{item.current_stock}</span>
                          <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">{item.unit}</span>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* Fix: Added edit functionality to individual items */}
                          <button onClick={() => { setEditingItem(item); setFormData(item); setIsItemModalOpen(true); }} className="p-2 bg-brand-500/10 text-brand-500 rounded-lg hover:bg-brand-500 hover:text-white transition-all"><Edit3 size={14}/></button>
                          <button onClick={() => { setActiveItemId(item.id); setMovementType('IN'); setIsMovementModalOpen(true); }} className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg hover:bg-emerald-500 hover:text-white transition-all"><Plus size={14}/></button>
                          <button onClick={() => { setActiveItemId(item.id); setMovementType('OUT'); setIsMovementModalOpen(true); }} className="p-2 bg-orange-500/10 text-orange-500 rounded-lg hover:bg-orange-500 hover:text-white transition-all"><TrendingDown size={14}/></button>
                          <button onClick={() => handleDeleteItem(item.id)} className="p-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-all"><Trash2 size={14}/></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* VIEW: AUDITORIA (LOGS) */}
            {currentView === AppView.MOVEMENTS && (
              <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-bottom-10">
                <div className="flex items-center justify-between mb-8">
                   <div>
                    <h3 className="text-xl font-black tracking-tighter uppercase">Histórico Geral de Atividades</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Auditoria permanente do sistema</p>
                   </div>
                   <button onClick={handleExport} className="p-4 bg-brand-600 text-white rounded-2xl flex items-center gap-3 font-black text-[10px] uppercase shadow-xl hover:scale-105 transition-all">
                     <Download size={18} /> Exportar
                   </button>
                </div>
                <div className="space-y-4">
                  {movements.map(m => (
                    <div key={m.id} className="p-6 bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-sm hover:border-brand-500 transition-all">
                      <div className="flex items-center gap-6">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black ${
                          m.type === 'IN' ? 'bg-emerald-500/10 text-emerald-500' : 
                          m.type === 'OUT' ? 'bg-orange-500/10 text-orange-500' : 
                          m.type === 'DELETE' ? 'bg-red-500/10 text-red-500' :
                          'bg-brand-500/10 text-brand-500'
                        }`}>
                          {m.type === 'IN' ? <Plus size={24}/> : m.type === 'OUT' ? <TrendingDown size={24}/> : <Activity size={24}/>}
                        </div>
                        <div>
                          <p className="text-sm font-black uppercase">{m.item_name}</p>
                          <div className="flex items-center gap-4 mt-1 opacity-50">
                            <span className="text-[9px] font-black uppercase flex items-center gap-1"><UserIcon size={12}/> {m.user_name}</span>
                            <span className="text-[9px] font-black uppercase flex items-center gap-1"><Clock size={12}/> {new Date(m.timestamp).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`text-2xl font-black tracking-tighter ${m.type === 'IN' ? 'text-emerald-500' : m.type === 'OUT' ? 'text-orange-500' : 'text-slate-400'}`}>
                          {m.type === 'IN' ? '+' : m.type === 'OUT' ? '-' : ''}{m.quantity || 0}
                        </span>
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{m.type}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* VIEW: EQUIPE (COLABORADORES) */}
            {currentView === AppView.USERS && (
              <div className="space-y-10 animate-in slide-in-from-bottom-10">
                <div className="flex justify-between items-center mb-10">
                   <h3 className="text-xl font-black tracking-tighter uppercase">Corpo Técnico</h3>
                   <button onClick={() => { setEditingUser(null); setUserFormData({}); setIsUserModalOpen(true); }} className="px-6 py-4 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-lg hover:scale-105 transition-all">Novo Colaborador</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                  {allUsers.map(u => (
                    <div 
                      key={u.badge_id} 
                      onClick={() => { setEditingUser(u); setUserFormData(u); setIsUserModalOpen(true); }}
                      className="p-10 bg-white dark:bg-slate-900 rounded-[4rem] border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col items-center text-center group transition-all hover:border-brand-500 cursor-pointer hover:scale-[1.02]"
                    >
                      <div className="w-24 h-24 rounded-[2rem] bg-brand-600 flex items-center justify-center text-white font-black text-4xl shadow-lg mb-6 overflow-hidden relative">
                        {u.photo_url ? <img src={u.photo_url} className="w-full h-full object-cover" /> : u.name.charAt(0)}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <Edit3 className="text-white" size={24} />
                        </div>
                      </div>
                      <h4 className="text-sm font-black uppercase tracking-widest mb-1">{u.name}</h4>
                      <p className="text-[9px] font-bold text-brand-500 uppercase tracking-widest mb-4">{u.role}</p>
                      <div className="px-4 py-2 bg-slate-50 dark:bg-slate-950 rounded-full text-[9px] font-black uppercase text-slate-500">MAT: {u.badge_id}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* VIEW: SETTINGS (GATEWAY) */}
            {currentView === AppView.SETTINGS && (
              <div className="max-w-2xl mx-auto space-y-8 animate-in slide-in-from-bottom-10">
                <div className="p-10 rounded-[3rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl">
                  <h4 className="text-sm font-black uppercase tracking-widest mb-10 flex items-center gap-5"><Globe size={24} className="text-brand-600"/> Sincronismo Central</h4>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center p-6 bg-slate-50 dark:bg-slate-950 rounded-2xl">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Servidor Supabase</span>
                      <span className="text-[10px] font-black uppercase text-emerald-500">ONLINE</span>
                    </div>
                    <div className="flex justify-between items-center p-6 bg-slate-50 dark:bg-slate-950 rounded-2xl">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Última atualização</span>
                      <span className="text-[10px] font-black uppercase">{lastSync?.toLocaleString()}</span>
                    </div>
                    <button onClick={() => fetchData(true)} className="w-full py-6 bg-brand-600 text-white rounded-3xl font-black uppercase text-[11px] tracking-widest shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all">
                      <RefreshCw size={18} className={isSyncing ? 'animate-spin' : ''} /> REFORÇAR SINCRONISMO
                    </button>
                  </div>
                </div>

                <div className="p-10 rounded-[3rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl">
                  <h4 className="text-sm font-black uppercase tracking-widest mb-10 flex items-center gap-5"><FileSpreadsheet size={24} className="text-emerald-600"/> Carga de Dados (Excel)</h4>
                  <div className="grid grid-cols-2 gap-6">
                    <label className="flex flex-col items-center justify-center p-8 bg-emerald-500/5 border-2 border-dashed border-emerald-500/20 rounded-3xl cursor-pointer hover:bg-emerald-500/10 transition-all group">
                      <Upload className="text-emerald-600 mb-4 group-hover:scale-110 transition-transform" size={32}/>
                      <span className="text-[9px] font-black uppercase tracking-widest text-emerald-700 text-center">Importar Almoxarifado</span>
                      <input type="file" className="hidden" accept=".xlsx,.xls" onChange={handleImportExcel} />
                    </label>
                    <button onClick={handleExport} className="flex flex-col items-center justify-center p-8 bg-brand-500/5 border-2 border-dashed border-brand-500/20 rounded-3xl hover:bg-brand-500/10 transition-all group">
                      <Download className="text-brand-600 mb-4 group-hover:scale-110 transition-transform" size={32}/>
                      <span className="text-[9px] font-black uppercase tracking-widest text-brand-700 text-center">Exportar Inventário</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </main>

      {/* MODAL: REGISTRO DE ITEM */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-in zoom-in duration-300">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-[4rem] overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 relative">
            
            <button 
              type="button"
              onClick={handleIAInsights}
              disabled={isGeneratingInsights || !formData.name}
              className="absolute top-8 right-24 p-4 bg-gradient-to-br from-brand-600 to-indigo-700 text-white rounded-2xl shadow-xl hover:scale-105 transition-all disabled:opacity-50 disabled:scale-100 flex items-center gap-3 group z-50 border border-white/20"
            >
              {isGeneratingInsights ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={18} className="group-hover:animate-bounce" />}
              <span className="text-[9px] font-black uppercase tracking-widest">IA Insight</span>
            </button>

            <div className="p-10 bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <h3 className="text-sm font-black uppercase tracking-widest text-brand-600">{editingItem ? 'Editar Registro' : 'Novo Material'}</h3>
              <button onClick={() => setIsItemModalOpen(false)} className="p-2 text-slate-400 hover:text-red-500"><X size={32}/></button>
            </div>
            <form onSubmit={handleSaveItem} className="p-12 space-y-8">
              <div className="flex gap-8 items-center">
                <div onClick={() => fileInputRef.current?.click()} className="w-32 h-32 rounded-[2.5rem] bg-slate-100 dark:bg-slate-950 border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center cursor-pointer relative overflow-hidden shadow-inner">
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
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Descrição / Nome do Material</label>
                  <input required value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="EX: TUBO PVC 50MM" className="w-full p-6 rounded-2xl bg-slate-50 dark:bg-slate-950 font-black text-sm uppercase outline-none shadow-inner dark:text-white border-2 border-transparent focus:border-brand-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Setor / Departamento</label>
                  <input required list="depts" value={formData.department || ''} onChange={e => setFormData({ ...formData, department: e.target.value })} placeholder="EX: CIVIL" className="w-full p-6 rounded-2xl bg-slate-50 dark:bg-slate-950 font-bold text-xs uppercase outline-none shadow-inner dark:text-white border-2 border-transparent focus:border-brand-500" />
                  <datalist id="depts">{dbDepartments.map(d => <option key={d.id} value={d.name} />)}</datalist>
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Localização Física</label>
                  <input required value={formData.location || ''} onChange={e => setFormData({ ...formData, location: e.target.value })} placeholder="EX: ALMOX-A1" className="w-full p-6 rounded-2xl bg-slate-50 dark:bg-slate-950 font-bold text-xs uppercase outline-none shadow-inner dark:text-white border-2 border-transparent focus:border-brand-500" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Saldo Atual</label>
                  <input type="number" required value={formData.current_stock || 0} onChange={e => setFormData({ ...formData, current_stock: Number(e.target.value) })} className="w-full p-6 rounded-2xl bg-slate-50 dark:bg-slate-950 font-black text-center shadow-inner dark:text-white outline-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Estoque Mínimo</label>
                  <input type="number" required value={formData.min_stock || 0} onChange={e => setFormData({ ...formData, min_stock: Number(e.target.value) })} className="w-full p-6 rounded-2xl bg-slate-50 dark:bg-slate-950 font-black text-center shadow-inner dark:text-white outline-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">UNIDADE</label>
                  <input value={formData.unit || 'UND'} onChange={e => setFormData({ ...formData, unit: e.target.value.toUpperCase() })} className="w-full p-6 rounded-2xl bg-slate-50 dark:bg-slate-950 font-black text-center shadow-inner dark:text-white outline-none" />
                </div>
              </div>
              <button type="submit" className="w-full py-7 bg-brand-600 text-white rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-xl shadow-brand-500/20 active:scale-95 transition-all">{editingItem ? 'SALVAR ALTERAÇÕES' : 'CONFIRMAR CADASTRO'}</button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: COLABORADOR (CRIAR E EDITAR) */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-in zoom-in duration-300">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-[4rem] overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="p-10 bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <h3 className="text-sm font-black uppercase tracking-widest text-emerald-600">{editingUser ? 'Editar Perfil' : 'Novo Colaborador'}</h3>
              <button onClick={() => { setIsUserModalOpen(false); setEditingUser(null); setUserFormData({}); }} className="p-2 text-slate-400 hover:text-red-500"><X size={32}/></button>
            </div>
            <form onSubmit={handleSaveUser} className="p-12 space-y-8">
              <div className="flex gap-8 items-center">
                <div onClick={() => userPhotoInputRef.current?.click()} className="w-32 h-32 rounded-[2.5rem] bg-slate-100 dark:bg-slate-950 border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center cursor-pointer relative overflow-hidden shadow-inner group">
                  {userFormData.photo_url ? <img src={userFormData.photo_url} className="w-full h-full object-cover" /> : <><Camera className="text-slate-300 mb-2" size={32} /><span className="text-[8px] font-black uppercase text-slate-400 text-center">Alterar Foto</span></>}
                </div>
                <input type="file" ref={userPhotoInputRef} className="hidden" accept="image/*" capture="user" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onloadend = () => setUserFormData({ ...userFormData, photo_url: reader.result as string });
                    reader.readAsDataURL(file);
                  }
                }} />
                <div className="flex-1 space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Completo</label>
                  <input required value={userFormData.name || ''} onChange={e => setUserFormData({...userFormData, name: e.target.value})} className="w-full p-6 rounded-2xl bg-slate-50 dark:bg-slate-950 font-black text-sm uppercase outline-none shadow-inner dark:text-white" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Matrícula Profissional</label>
                  <input required value={userFormData.badge_id || ''} onChange={e => setUserFormData({...userFormData, badge_id: e.target.value})} className="w-full p-6 rounded-2xl bg-slate-50 dark:bg-slate-950 font-black text-sm uppercase outline-none shadow-inner dark:text-white" />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Cargo / Função</label>
                  <select value={userFormData.role || ''} onChange={e => setUserFormData({...userFormData, role: e.target.value})} className="w-full p-6 rounded-2xl bg-slate-50 dark:bg-slate-950 font-black text-[10px] uppercase outline-none shadow-inner dark:text-white appearance-none">
                    <option value="" disabled>Selecione...</option>
                    {USER_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <button type="submit" className="w-full py-7 bg-emerald-600 text-white rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-all">
                {editingUser ? 'SALVAR ALTERAÇÕES' : 'CADASTRAR COLABORADOR'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: MOVIMENTAÇÃO RÁPIDA */}
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
