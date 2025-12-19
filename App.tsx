
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  LayoutDashboard, Package, Plus, Search, Trash2, Moon, Sun, Menu, X, 
  Camera, AlertTriangle, Loader2, RefreshCw, TrendingDown, Box, 
  History, Activity, Edit3, Users as UsersIcon, FileSpreadsheet, 
  Upload, CheckCircle2, User as UserIcon, LogOut, ChevronRight,
  Info, Check, Database, ShieldCheck, Settings, Download, Filter,
  Sparkles, BrainCircuit, ListChecks, UserPlus, Zap, Globe, Signal, 
  PieChart, BarChart3, DatabaseZap, Clock, ShieldAlert, CheckSquare, Square, 
  Image as ImageIcon, MoreVertical
} from 'lucide-react';
import { InventoryItem, MovementLog, UserSession, AppView, UserProfile, PendingAction, Department } from './types';
import { Logo } from './components/Logo';
import { supabase } from './services/supabaseClient';
import { saveOfflineData, loadOfflineData, addToSyncQueue, getSyncQueue, removeFromQueue } from './services/offlineStorage';
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
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<MovementLog[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [dbDepartments, setDbDepartments] = useState<Department[]>([]);
  
  // App Logic States
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
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

  // Fix: Added missing login state variables
  const [loginStep, setLoginStep] = useState<'BADGE' | 'NAME'>('BADGE');
  const [tempBadge, setTempBadge] = useState('');
  const [tempName, setTempName] = useState('');

  // Modals
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
      // Forçar atualização do banco sem depender apenas do cache inicial
      const [itRes, movRes, userRes, depRes] = await Promise.all([
        supabase.from('inventory_items').select('*').eq('is_active', true).order('name'),
        supabase.from('movements').select('*').order('timestamp', { ascending: false }).limit(300),
        supabase.from('users').select('*').order('name'),
        supabase.from('departments').select('*').order('name')
      ]);

      if (itRes.error) throw itRes.error;
      if (movRes.error) throw movRes.error;
      if (userRes.error) throw userRes.error;
      if (depRes.error) throw depRes.error;

      setItems(itRes.data || []);
      setMovements(movRes.data || []);
      setAllUsers(userRes.data || []);
      setDbDepartments(depRes.data || []);
      
      saveOfflineData(itRes.data || [], movRes.data || [], userRes.data || [], (depRes.data || []).map(d => d.name));
      const syncDate = new Date();
      setLastSync(syncDate);
      localStorage.setItem('carpa_last_sync', syncDate.toISOString());
      setConnStatus('online');
      await processSyncQueue();
    } catch (e) {
      console.error("Fetch Error:", e);
      setConnStatus('offline');
      // Tenta carregar do cache se o fetch falhar
      const cached = loadOfflineData();
      if (items.length === 0 && cached.items.length > 0) {
        setItems(cached.items);
        setMovements(cached.movements);
        setAllUsers(cached.users);
      }
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  }, [processSyncQueue]);

  useEffect(() => {
    fetchData();
    const channel = supabase.channel('realtime-ag-system')
      .on('postgres_changes', { event: '*', table: 'inventory_items', schema: 'public' }, () => fetchData(false))
      .on('postgres_changes', { event: '*', table: 'movements', schema: 'public' }, () => fetchData(false))
      .on('postgres_changes', { event: '*', table: 'users', schema: 'public' }, () => fetchData(false))
      .on('postgres_changes', { event: '*', table: 'departments', schema: 'public' }, () => fetchData(false))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  // --- Handlers ---
  const handleInitialLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // Busca direta no banco para garantir sincronia no login
    const { data: dbUsers } = await supabase.from('users').select('*').eq('badge_id', tempBadge.trim());
    const existingUser = dbUsers?.[0];

    if (existingUser) {
      const session = { badgeId: existingUser.badge_id, name: existingUser.name, role: existingUser.role, photoUrl: existingUser.photo_url };
      setUser(session);
      localStorage.setItem('carpa_user', JSON.stringify(session));
      fetchData();
    } else {
      setLoginStep('NAME');
      setIsLoading(false);
    }
  };

  const handleFinalizeLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanBadge = tempBadge.trim();
    const cleanName = tempName.trim().toUpperCase();
    const session = { badgeId: cleanBadge, name: cleanName, role: 'Auxiliar de almoxarifado' };
    
    setUser(session);
    localStorage.setItem('carpa_user', JSON.stringify(session));
    
    const newUser: UserProfile = { badge_id: cleanBadge, name: cleanName, role: 'Auxiliar de almoxarifado', created_at: new Date().toISOString() };
    setAllUsers(prev => [...prev, newUser]);
    
    // Tenta salvar imediatamente
    const { error } = await supabase.from('users').upsert(newUser);
    if (error) {
      addToSyncQueue({ type: 'UPDATE_USER', table: 'users', data: newUser });
    }
    fetchData();
  };

  const handleDeleteItem = async (id: string) => {
    if (!window.confirm("Deseja realmente excluir este item?")) return;
    const item = items.find(i => i.id === id);
    if (!item || !user) return;

    setIsSyncing(true);
    const { error } = await supabase.from('inventory_items').update({ is_active: false }).eq('id', id);
    
    if (error) {
      addToSyncQueue({ type: 'DELETE_ITEM', table: 'inventory_items', data: { id } });
    }

    const mov: MovementLog = {
      id: `MOV-${Date.now()}`,
      item_id: item.id,
      item_name: item.name,
      type: 'DELETE',
      quantity: 0,
      user_badge_id: user.badgeId,
      user_name: user.name,
      timestamp: new Date().toISOString(),
      reason: 'Exclusão Manual'
    };
    await supabase.from('movements').insert(mov);

    setItems(prev => prev.filter(i => i.id !== id));
    setSelectedItemIds(prev => prev.filter(sid => sid !== id));
    setIsSyncing(false);
  };

  const handleDeleteBatch = async () => {
    if (selectedItemIds.length === 0) return;
    if (!window.confirm(`Deseja excluir permanentemente os ${selectedItemIds.length} itens selecionados?`)) return;

    setIsSyncing(true);
    const now = new Date().toISOString();
    
    try {
      // Atualização no banco
      const { error } = await supabase.from('inventory_items').update({ is_active: false }).in('id', selectedItemIds);
      
      if (error) throw error;

      // Log de auditoria para cada um
      for (const id of selectedItemIds) {
        const item = items.find(i => i.id === id);
        if (item) {
          await supabase.from('movements').insert({
            id: `MOV-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            item_id: item.id,
            item_name: item.name,
            type: 'DELETE',
            quantity: 0,
            user_badge_id: user?.badgeId,
            user_name: user?.name,
            timestamp: now,
            reason: 'Exclusão em Lote'
          });
        }
      }

      setItems(prev => prev.filter(i => !selectedItemIds.includes(i.id)));
      setSelectedItemIds([]);
      fetchData(false);
    } catch (err) {
      alert("Erro ao excluir itens. Tente sincronizar novamente.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !formData.name) return;

    setIsSyncing(true);
    const isEditing = !!editingItem;
    const now = new Date().toISOString();
    
    const item: InventoryItem = {
      id: isEditing ? editingItem!.id : `IT-${Date.now()}`,
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

    const { error } = await supabase.from('inventory_items').upsert(item);
    
    if (error) {
      addToSyncQueue({ type: 'UPSERT_ITEM', table: 'inventory_items', data: item });
    }

    // Fix: Added missing 'id' property to MovementLog
    const mov: MovementLog = {
      id: `MOV-${Date.now()}`,
      item_id: item.id,
      item_name: item.name,
      type: isEditing ? 'EDIT' : 'CREATE',
      quantity: item.current_stock,
      user_badge_id: user.badgeId,
      user_name: user.name,
      timestamp: now,
      reason: isEditing ? 'Alteração via sistema' : 'Cadastro inicial'
    };
    await supabase.from('movements').insert(mov);

    setIsItemModalOpen(false);
    setFormData({});
    setEditingItem(null);
    fetchData(false);
  };

  const handleStockAction = async (e: React.FormEvent) => {
    e.preventDefault();
    const item = items.find(i => i.id === activeItemId);
    if (!item || !user) return;

    const qty = Number(moveData.quantity);
    const newStock = movementType === 'IN' ? item.current_stock + qty : item.current_stock - qty;

    if (newStock < 0) {
      alert("Operação negada: Estoque ficaria negativo.");
      return;
    }

    setIsSyncing(true);
    const now = new Date().toISOString();
    const { error } = await supabase.from('inventory_items').update({ current_stock: newStock, last_updated: now, last_updated_by: user.name }).eq('id', item.id);
    
    if (!error) {
      await supabase.from('movements').insert({
        id: `MOV-${Date.now()}`,
        item_id: item.id,
        item_name: item.name,
        type: movementType,
        quantity: qty,
        user_badge_id: user.badgeId,
        user_name: user.name,
        timestamp: now,
        reason: moveData.reason || (movementType === 'IN' ? 'Entrada Avulsa' : 'Saída Avulsa')
      });
    }

    setIsMovementModalOpen(false);
    setMoveData({ quantity: 1, reason: '' });
    fetchData(false);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userFormData.badge_id || !userFormData.name) return;

    setIsSyncing(true);
    const u: UserProfile = {
      badge_id: userFormData.badge_id,
      name: userFormData.name.toUpperCase(),
      role: userFormData.role || 'Auxiliar de almoxarifado',
      photo_url: userFormData.photo_url || null,
      created_at: editingUser?.created_at || new Date().toISOString()
    };

    const { error } = await supabase.from('users').upsert(u);
    if (error) {
      addToSyncQueue({ type: 'UPDATE_USER', table: 'users', data: u });
    }

    setIsUserModalOpen(false);
    setEditingUser(null);
    setUserFormData({});
    fetchData(false);
  };

  // --- IA and Export Handlers ---
  // Fix: Implemented missing handleIAInsights
  const handleIAInsights = async () => {
    if (!formData.name) return;
    setIsGeneratingInsights(true);
    const insights = await generateProductInsights(formData.name, formData.department || 'GERAL');
    if (insights) {
      setFormData(prev => ({
        ...prev,
        description: `${insights.description} (Dica: ${insights.storageAdvice})`
      }));
    }
    setIsGeneratingInsights(false);
  };

  // Fix: Implemented missing handleExport
  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(movements.map(m => ({
      ID: m.id,
      Item: m.item_name,
      Tipo: m.type === 'IN' ? 'Entrada' : m.type === 'OUT' ? 'Saída' : 'Outro',
      Quantidade: m.quantity,
      Usuário: m.user_name,
      Data: new Date(m.timestamp).toLocaleString(),
      Motivo: m.reason || ''
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Histórico");
    XLSX.writeFile(wb, `auditoria_estoque_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

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

  if (isLoading && items.length === 0) return (
    <div className="h-screen flex flex-col items-center justify-center bg-slate-100 dark:bg-[#020617] p-6">
      <Logo className="w-20 h-20 mb-6 animate-pulse" />
      <div className="flex items-center gap-3 text-brand-600 font-black tracking-widest text-xs uppercase">
        <Loader2 className="animate-spin" size={24} /> Conectando Servidores...
      </div>
    </div>
  );

  if (!user) return (
    <div className="h-screen flex items-center justify-center bg-slate-100 dark:bg-[#020617] p-6 font-sans">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-[3rem] p-10 shadow-2xl border border-slate-200 dark:border-slate-800 text-center animate-in zoom-in duration-300">
        <Logo className="w-20 h-20 mx-auto mb-8 shadow-xl" />
        <h1 className="text-3xl font-black tracking-tighter mb-2 dark:text-white">AG SYSTEM</h1>
        <p className="text-[10px] font-black text-brand-500 uppercase tracking-widest mb-10">Acesso Corporativo</p>
        
        {loginStep === 'BADGE' ? (
          <form onSubmit={handleInitialLogin} className="space-y-6">
            <div className="space-y-2 text-left">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Matrícula</label>
              <input autoFocus required value={tempBadge} onChange={e => setTempBadge(e.target.value)} placeholder="0000" className="w-full py-5 rounded-2xl bg-slate-50 dark:bg-slate-950 text-center font-black outline-none border-2 border-transparent focus:border-brand-500 text-xl shadow-inner dark:text-white" />
            </div>
            <button type="submit" className="w-full py-5 bg-brand-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:scale-[1.02] active:scale-95 transition-all">IDENTIFICAR</button>
          </form>
        ) : (
          <form onSubmit={handleFinalizeLogin} className="space-y-6 animate-in slide-in-from-right duration-300">
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-2xl border border-emerald-100 dark:border-emerald-900/30">
                <p className="text-[9px] font-black text-emerald-600 uppercase">Novo Colaborador</p>
              </div>
              <div className="space-y-2 text-left">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Completo</label>
                <input autoFocus required value={tempName} onChange={e => setTempName(e.target.value)} placeholder="SEU NOME" className="w-full py-5 rounded-2xl bg-slate-50 dark:bg-slate-950 text-center font-black outline-none border-2 border-transparent focus:border-brand-500 text-lg shadow-inner uppercase dark:text-white" />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setLoginStep('BADGE')} className="flex-1 py-5 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-2xl font-black uppercase text-xs tracking-widest">VOLTAR</button>
                <button type="submit" className="flex-[2] py-5 bg-emerald-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-all">CADASTRAR</button>
              </div>
          </form>
        )}
      </div>
    </div>
  );

  return (
    <div className="h-screen flex flex-col lg:flex-row bg-slate-50 dark:bg-[#020617] text-slate-900 dark:text-white overflow-hidden font-sans">
      
      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 w-72 z-50 transform transition-transform duration-300 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex flex-col h-full p-8">
          <div className="flex items-center justify-between mb-12">
            <div className="flex items-center gap-4">
              <Logo className={`w-12 h-12 ${isSyncing ? 'animate-pulse shadow-brand-500/50 shadow-lg' : ''}`} />
              <span className="font-black text-2xl tracking-tighter">AG SYSTEM</span>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2 text-slate-400"><X /></button>
          </div>

          <nav className="flex-1 space-y-2">
            {[
              { id: AppView.DASHBOARD, icon: LayoutDashboard, label: 'Painel Geral' },
              { id: AppView.INVENTORY, icon: Package, label: 'Almoxarifado' },
              { id: AppView.MOVEMENTS, icon: History, label: 'Auditoria' },
              { id: AppView.USERS, icon: UsersIcon, label: 'Equipe' },
              { id: AppView.SETTINGS, icon: RefreshCw, label: 'Sincronia' }
            ].map(v => (
              <button key={v.id} onClick={() => { setCurrentView(v.id); setIsSidebarOpen(false); }}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl font-bold text-[11px] uppercase tracking-wider transition-all ${currentView === v.id ? 'bg-brand-600 text-white shadow-xl shadow-brand-600/30' : 'text-slate-400 hover:bg-brand-500/10 hover:text-brand-500'}`}>
                <v.icon size={20} /> {v.label}
              </button>
            ))}
          </nav>

          <div className="mt-auto pt-8 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-800 mb-4 shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-brand-600 flex items-center justify-center text-white font-black text-xl overflow-hidden shadow-inner">
                {user.photoUrl ? <img src={user.photoUrl} className="w-full h-full object-cover" /> : user.name.charAt(0)}
              </div>
              <div className="truncate">
                <p className="text-[11px] font-black uppercase truncate">{user.name}</p>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Matrícula: {user.badgeId}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDarkMode(!darkMode)} className="p-4 bg-slate-100 dark:bg-slate-800 rounded-2xl text-slate-400 hover:text-brand-500 transition-all flex-1 flex justify-center">{darkMode ? <Sun size={20}/> : <Moon size={20}/>}</button>
              <button onClick={() => { setUser(null); localStorage.removeItem('carpa_user'); }} className="p-4 bg-red-500/10 text-red-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all flex-[2]">Sair</button>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="h-20 flex items-center justify-between px-8 border-b border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-[#020617]/60 backdrop-blur-xl sticky top-0 z-30">
          <div className="flex items-center gap-6">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-3 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-500"><Menu size={24}/></button>
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-brand-600">{currentView}</h2>
          </div>
          
          <div className="flex gap-3">
            {selectedItemIds.length > 0 && (
              <button onClick={handleDeleteBatch} className="bg-red-600 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-3 shadow-lg hover:scale-105 transition-all">
                <Trash2 size={18}/> EXCLUIR EM LOTE ({selectedItemIds.length})
              </button>
            )}
            {currentView === AppView.INVENTORY && selectedItemIds.length === 0 && (
              <button onClick={() => { setEditingItem(null); setFormData({}); setIsItemModalOpen(true); }} className="bg-brand-600 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-3 shadow-lg hover:scale-105 transition-all">
                <Plus size={20}/> ADICIONAR ITEM
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 lg:p-10 custom-scrollbar">
          <div className="max-w-7xl mx-auto">
            
            {currentView === AppView.DASHBOARD && (
              <div className="space-y-8 animate-in fade-in duration-500">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="p-8 rounded-[3rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Almoxarifado</p>
                    <h3 className="text-6xl font-black tracking-tighter">{items.length}</h3>
                  </div>
                  <div className="p-8 rounded-[3rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl">
                    <p className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-1">Abaixo do Mínimo</p>
                    <h3 className="text-6xl font-black text-red-600 tracking-tighter">{stats.critical}</h3>
                  </div>
                  <div className="p-8 rounded-[3rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl">
                    <p className="text-[10px] font-black text-brand-500 uppercase tracking-widest mb-1">Ações Hoje</p>
                    <h3 className="text-6xl font-black text-brand-600 tracking-tighter">{dailyLogs.length}</h3>
                  </div>
                </div>

                {items.length === 0 && (
                  <div className="bg-brand-50 dark:bg-brand-950/20 p-16 rounded-[4rem] border-4 border-dashed border-brand-200 dark:border-brand-900/50 text-center animate-in zoom-in">
                    <DatabaseZap size={60} className="mx-auto mb-6 text-brand-400" />
                    <h3 className="text-3xl font-black mb-4 dark:text-white tracking-tighter">Estoque Vazio?</h3>
                    <p className="text-slate-500 font-bold mb-10 max-w-md mx-auto leading-relaxed uppercase text-xs tracking-widest">Se o seu aparelho está mostrando estoque zerado enquanto outros estão sincronizados, force o recarregamento dos dados.</p>
                    <button onClick={() => fetchData(true)} className="bg-brand-600 text-white px-10 py-5 rounded-3xl font-black shadow-2xl flex items-center gap-4 mx-auto hover:scale-110 active:scale-95 transition-all text-xs tracking-[0.2em]">
                      <RefreshCw className={isSyncing ? 'animate-spin' : ''} size={24} /> FORÇAR SINCRONIA COMPLETA
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="p-10 rounded-[3rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl">
                    <h4 className="text-xs font-black uppercase tracking-widest mb-10 text-slate-400">Distribuição de Estoque</h4>
                    <div className="space-y-6">
                      <div className="flex justify-between items-center text-xs font-black uppercase">
                        <span>Estado Crítico</span>
                        <span className="text-red-600">{stats.critical} ({Math.round(stats.critPct)}%)</span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 h-6 rounded-full overflow-hidden flex">
                        <div style={{ width: `${stats.critPct}%` }} className="bg-red-500 h-full transition-all duration-1000" />
                        <div style={{ width: `${stats.idealPct}%` }} className="bg-emerald-500 h-full transition-all duration-1000" />
                        <div style={{ width: `${stats.surpPct}%` }} className="bg-brand-500 h-full transition-all duration-1000" />
                      </div>
                      <div className="flex gap-4">
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-500"/> <span className="text-[9px] font-black uppercase text-slate-400">Crítico</span></div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500"/> <span className="text-[9px] font-black uppercase text-slate-400">Ideal</span></div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-brand-500"/> <span className="text-[9px] font-black uppercase text-slate-400">Excesso</span></div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-10 rounded-[3rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl">
                    <h4 className="text-xs font-black uppercase tracking-widest mb-8 text-slate-400">Logs do Dia</h4>
                    <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                      {dailyLogs.map(m => (
                        <div key={m.id} className="flex items-center gap-4 p-4 rounded-3xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black ${m.type === 'IN' ? 'bg-emerald-100 text-emerald-600' : m.type === 'OUT' ? 'bg-orange-100 text-orange-600' : 'bg-brand-100 text-brand-600'}`}>
                            {m.type === 'IN' ? '+' : m.type === 'OUT' ? '-' : '•'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-black uppercase truncate">{m.item_name}</p>
                            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{m.user_name} • {new Date(m.timestamp).toLocaleTimeString()}</p>
                          </div>
                          <span className={`text-xl font-black tracking-tighter ${m.type === 'IN' ? 'text-emerald-500' : m.type === 'OUT' ? 'text-orange-500' : 'text-slate-400'}`}>
                            {m.quantity || 0}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {currentView === AppView.INVENTORY && (
              <div className="space-y-8 animate-in slide-in-from-bottom-10 duration-500 pb-20">
                <div className="bg-white dark:bg-slate-900 p-6 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col md:flex-row gap-6 sticky top-0 z-20">
                  <div className="flex-1 flex items-center gap-4 bg-slate-50 dark:bg-slate-950 px-6 py-4 rounded-3xl border border-slate-200 dark:border-slate-800">
                    <Search className="text-slate-400" size={24}/>
                    <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="PESQUISAR MATERIAL OU LOCAL..." className="w-full bg-transparent outline-none font-black text-xs uppercase tracking-widest dark:text-white" />
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1 max-w-md">
                      {departmentsList.map(d => (
                        <button key={d} onClick={() => setSelectedDept(d)} className={`px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${selectedDept === d ? 'bg-brand-600 text-white shadow-xl' : 'bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-brand-500'}`}>{d}</button>
                      ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-6">
                  {filteredItems.map(item => (
                    <div 
                      key={item.id} 
                      className={`p-4 bg-white dark:bg-slate-900 rounded-[2.5rem] border-4 transition-all group relative overflow-hidden flex flex-col ${selectedItemIds.includes(item.id) ? 'border-brand-600 shadow-2xl scale-[1.03]' : 'border-transparent shadow-md hover:border-slate-200'}`}
                    >
                      <button 
                        onClick={() => setSelectedItemIds(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id])}
                        className="absolute top-4 left-4 z-10 p-2 bg-white/30 backdrop-blur-md rounded-xl text-white border border-white/20 hover:scale-110 transition-transform"
                      >
                        {selectedItemIds.includes(item.id) ? <CheckSquare size={20} className="text-brand-400 fill-white"/> : <Square size={20}/>}
                      </button>

                      <div className="aspect-square bg-slate-100 dark:bg-slate-950 rounded-[2rem] mb-4 relative overflow-hidden flex items-center justify-center shadow-inner">
                        {item.photo_url ? <img src={item.photo_url} className="w-full h-full object-cover" /> : <Package className="opacity-10" size={60} />}
                        <div className="absolute top-3 right-3 px-3 py-1 bg-slate-900/80 backdrop-blur-md rounded-xl text-[7px] font-black text-white uppercase tracking-tighter shadow-lg">{item.location}</div>
                      </div>
                      
                      <div className="px-2 flex-1 flex flex-col">
                        <h4 className="text-[11px] font-black uppercase truncate mb-0.5 dark:text-white">{item.name}</h4>
                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-4">{item.department}</p>
                        
                        <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800 mt-auto">
                          <div className="flex flex-col">
                            <span className={`text-3xl font-black tracking-tighter ${item.current_stock <= item.min_stock ? 'text-red-500 animate-pulse' : 'text-brand-600'}`}>{item.current_stock}</span>
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{item.unit}</span>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setEditingItem(item); setFormData(item); setIsItemModalOpen(true); }} className="p-2 bg-brand-500/10 text-brand-500 rounded-lg hover:bg-brand-500 hover:text-white transition-all"><Edit3 size={16}/></button>
                            <button onClick={() => { setActiveItemId(item.id); setMovementType('IN'); setIsMovementModalOpen(true); }} className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg hover:bg-emerald-500 hover:text-white transition-all"><Plus size={16}/></button>
                            <button onClick={() => { setActiveItemId(item.id); setMovementType('OUT'); setIsMovementModalOpen(true); }} className="p-2 bg-orange-500/10 text-orange-500 rounded-lg hover:bg-orange-500 hover:text-white transition-all"><TrendingDown size={16}/></button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {currentView === AppView.MOVEMENTS && (
              <div className="animate-in slide-in-from-bottom-10 max-w-5xl mx-auto space-y-6">
                <div className="flex items-center justify-between p-6">
                  <h3 className="text-2xl font-black uppercase tracking-tighter">Auditoria de Fluxo</h3>
                  <button onClick={handleExport} className="p-4 bg-brand-600 text-white rounded-2xl flex items-center gap-3 font-black text-xs uppercase shadow-xl hover:scale-105 transition-all">
                     <Download size={20} /> Relatório Completo
                   </button>
                </div>
                <div className="space-y-4">
                  {movements.map(m => (
                    <div key={m.id} className="p-6 bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-sm hover:border-brand-500 transition-all">
                      <div className="flex items-center gap-6">
                        <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center font-black ${
                          m.type === 'IN' ? 'bg-emerald-100 text-emerald-600' : 
                          m.type === 'OUT' ? 'bg-orange-100 text-orange-600' : 
                          'bg-brand-100 text-brand-600'
                        }`}>
                          {m.type === 'IN' ? <Plus size={28}/> : m.type === 'OUT' ? <TrendingDown size={28}/> : <Activity size={28}/>}
                        </div>
                        <div>
                          <p className="text-sm font-black uppercase dark:text-white">{m.item_name}</p>
                          <div className="flex items-center gap-6 mt-2 opacity-60">
                            <span className="text-[10px] font-black uppercase flex items-center gap-2"><UserIcon size={14}/> {m.user_name}</span>
                            <span className="text-[10px] font-black uppercase flex items-center gap-2"><Clock size={14}/> {new Date(m.timestamp).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`text-3xl font-black tracking-tighter ${m.type === 'IN' ? 'text-emerald-500' : m.type === 'OUT' ? 'text-orange-500' : 'text-slate-400'}`}>
                          {m.quantity || 0}
                        </span>
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">{m.type === 'IN' ? 'ENTRADA' : m.type === 'OUT' ? 'SAÍDA' : 'ALTERAÇÃO'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {currentView === AppView.USERS && (
              <div className="animate-in slide-in-from-bottom-10 space-y-10">
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8">
                  {allUsers.map(u => (
                    <div 
                      key={u.badge_id} 
                      onClick={() => { setEditingUser(u); setUserFormData(u); setIsUserModalOpen(true); }}
                      className="p-10 bg-white dark:bg-slate-900 rounded-[3rem] border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col items-center text-center group transition-all hover:border-emerald-500 cursor-pointer hover:scale-[1.03] relative"
                    >
                      <div className="w-32 h-32 rounded-[2.5rem] bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-emerald-600 font-black text-5xl shadow-lg mb-6 overflow-hidden relative border-4 border-white dark:border-slate-700">
                        {u.photo_url ? (
                          <img src={u.photo_url} className="w-full h-full object-cover" />
                        ) : (
                          <span className="opacity-30">{u.name.charAt(0)}</span>
                        )}
                        <div className="absolute inset-0 bg-emerald-600/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity backdrop-blur-[2px]">
                          <Edit3 className="text-white" size={32} />
                        </div>
                      </div>
                      <h4 className="text-sm font-black uppercase tracking-widest mb-1 truncate w-full dark:text-white">{u.name}</h4>
                      <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest mb-6">{u.role}</p>
                      <div className="px-6 py-3 bg-slate-50 dark:bg-slate-950 rounded-2xl text-[10px] font-black uppercase text-slate-400 shadow-inner">MAT: {u.badge_id}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {currentView === AppView.SETTINGS && (
              <div className="max-w-2xl mx-auto space-y-8 animate-in slide-in-from-bottom-10">
                <div className="p-10 rounded-[3rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl">
                  <h4 className="text-sm font-black uppercase tracking-widest mb-10 flex items-center gap-5"><Globe size={28} className="text-brand-600"/> Gateway de Sincronismo</h4>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center p-6 bg-slate-50 dark:bg-slate-950 rounded-3xl border dark:border-slate-800">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Servidor Supabase</span>
                      <span className={`text-[10px] font-black uppercase ${connStatus === 'online' ? 'text-emerald-500' : 'text-orange-500'}`}>
                        {connStatus === 'online' ? '● ESTÁVEL' : '● DESCONECTADO'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-6 bg-slate-50 dark:bg-slate-950 rounded-3xl border dark:border-slate-800">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Data da Última Sincronia</span>
                      <span className="text-[10px] font-black uppercase dark:text-white">{lastSync?.toLocaleString() || 'NUNCA'}</span>
                    </div>
                    <button onClick={() => fetchData(true)} className="w-full py-6 bg-brand-600 text-white rounded-3xl font-black uppercase text-[12px] tracking-[0.2em] shadow-2xl shadow-brand-500/30 flex items-center justify-center gap-4 active:scale-95 transition-all">
                      <RefreshCw size={24} className={isSyncing ? 'animate-spin' : ''} /> REFORÇAR SINCRONIA AGORA
                    </button>
                    <p className="text-center text-[9px] text-slate-400 font-bold uppercase tracking-widest px-10">Use este botão caso existam diferenças entre aparelhos.</p>
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
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-[4rem] overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 relative">
            <button 
              type="button"
              onClick={handleIAInsights}
              disabled={isGeneratingInsights || !formData.name}
              className="absolute top-10 right-28 p-4 bg-gradient-to-br from-brand-600 to-indigo-700 text-white rounded-2xl shadow-xl hover:scale-105 transition-all disabled:opacity-50 disabled:scale-100 flex items-center gap-3 group z-50 border border-white/20"
            >
              {isGeneratingInsights ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={18} className="group-hover:animate-bounce" />}
              <span className="text-[9px] font-black uppercase tracking-widest">IA Insight</span>
            </button>
            <div className="p-10 bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <h3 className="text-sm font-black uppercase tracking-widest text-brand-600">{editingItem ? 'Ficha de Material' : 'Novo Cadastro'}</h3>
              <button onClick={() => { setIsItemModalOpen(false); setEditingItem(null); setFormData({}); }} className="p-3 text-slate-400 hover:text-red-500 bg-white dark:bg-slate-800 rounded-xl shadow-sm"><X size={28}/></button>
            </div>
            <form onSubmit={handleSaveItem} className="p-12 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <div className="flex gap-8 items-center">
                <div onClick={() => fileInputRef.current?.click()} className="w-40 h-40 rounded-[3rem] bg-slate-100 dark:bg-slate-950 border-4 border-white dark:border-slate-800 flex flex-col items-center justify-center cursor-pointer relative overflow-hidden shadow-2xl transition-transform hover:scale-105">
                  {formData.photo_url ? <img src={formData.photo_url} className="w-full h-full object-cover" /> : <><Camera className="text-slate-300 mb-2" size={40} /><span className="text-[9px] font-black uppercase text-slate-400">Capturar</span></>}
                </div>
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" capture="environment" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onloadend = () => setFormData({ ...formData, photo_url: reader.result as string });
                    reader.readAsDataURL(file);
                  }
                }} />
                <div className="flex-1 space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome do Material</label>
                  <input required value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="EX: MARRETA 2KG" className="w-full p-6 rounded-3xl bg-slate-50 dark:bg-slate-950 font-black text-lg uppercase outline-none shadow-inner dark:text-white border-2 border-transparent focus:border-brand-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Unidade</label>
                  <input required value={formData.unit || 'UND'} onChange={e => setFormData({ ...formData, unit: e.target.value.toUpperCase() })} placeholder="UND" className="w-full p-5 rounded-2xl bg-slate-50 dark:bg-slate-950 font-black text-sm uppercase shadow-inner dark:text-white text-center" />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Setor</label>
                  <input required value={formData.department || ''} onChange={e => setFormData({ ...formData, department: e.target.value.toUpperCase() })} placeholder="EX: CIVIL" className="w-full p-5 rounded-2xl bg-slate-50 dark:bg-slate-950 font-black text-sm uppercase shadow-inner dark:text-white text-center" />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Localização</label>
                  <input required value={formData.location || ''} onChange={e => setFormData({ ...formData, location: e.target.value.toUpperCase() })} placeholder="EX: PRATELEIRA A1" className="w-full p-5 rounded-2xl bg-slate-50 dark:bg-slate-950 font-black text-sm uppercase shadow-inner dark:text-white text-center" />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Saldo Mínimo</label>
                  <input type="number" required value={formData.min_stock || 0} onChange={e => setFormData({ ...formData, min_stock: Number(e.target.value) })} className="w-full p-5 rounded-2xl bg-slate-50 dark:bg-slate-950 font-black text-lg text-center shadow-inner dark:text-white" />
                </div>
              </div>
              {!editingItem && (
                 <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Saldo Inicial</label>
                  <input type="number" required value={formData.current_stock || 0} onChange={e => setFormData({ ...formData, current_stock: Number(e.target.value) })} className="w-full p-5 rounded-2xl bg-brand-500/10 dark:bg-brand-500/20 font-black text-2xl text-center shadow-inner text-brand-600 dark:text-brand-400 outline-none" />
                </div>
              )}
              <div className="flex gap-4">
                {editingItem && (
                  <button type="button" onClick={() => handleDeleteItem(editingItem.id)} className="flex-1 py-6 bg-red-500/10 text-red-500 rounded-[2rem] font-black uppercase text-[10px] tracking-widest border border-red-500/20">Excluir</button>
                )}
                <button type="submit" className="flex-[3] py-7 bg-brand-600 text-white rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-2xl active:scale-95 transition-all">SALVAR REGISTRO</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: MOVIMENTAÇÃO */}
      {isMovementModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/90 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-[4rem] overflow-hidden shadow-2xl border border-white/10">
            <div className={`p-12 text-center text-white ${movementType === 'IN' ? 'bg-emerald-600' : 'bg-orange-600'}`}>
              <h3 className="text-4xl font-black uppercase tracking-widest">{movementType === 'IN' ? 'Entrada' : 'Saída'}</h3>
              <p className="text-[9px] font-black uppercase mt-3 opacity-70 truncate px-6">{items.find(i => i.id === activeItemId)?.name}</p>
            </div>
            <form onSubmit={handleStockAction} className="p-12 space-y-8">
              <input type="number" min="1" required autoFocus value={moveData.quantity} onChange={e => setMoveData({ ...moveData, quantity: Number(e.target.value) })} className="w-full text-7xl font-black text-center p-8 rounded-3xl bg-slate-50 dark:bg-slate-950 outline-none shadow-inner dark:text-white border-none" />
              <input value={moveData.reason} onChange={e => setMoveData({ ...moveData, reason: e.target.value.toUpperCase() })} placeholder="MOTIVO (OPCIONAL)" className="w-full p-5 rounded-2xl bg-slate-50 dark:bg-slate-950 text-center text-[10px] font-black uppercase outline-none shadow-inner dark:text-white" />
              <button type="submit" className={`w-full py-7 text-white rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-all ${movementType === 'IN' ? 'bg-emerald-600 shadow-emerald-600/30' : 'bg-orange-600 shadow-orange-600/30'}`}>CONFIRMAR OPERAÇÃO</button>
              <button type="button" onClick={() => setIsMovementModalOpen(false)} className="w-full text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-red-500">CANCELAR</button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EQUIPE */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-in zoom-in duration-300">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-[4rem] overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="p-10 bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <h3 className="text-sm font-black uppercase tracking-widest text-emerald-600">{editingUser ? 'Ficha Colaborador' : 'Novo Membro'}</h3>
              <button onClick={() => { setIsUserModalOpen(false); setEditingUser(null); setUserFormData({}); }} className="p-3 text-slate-400 hover:text-red-500 bg-white dark:bg-slate-800 rounded-xl shadow-sm"><X size={28}/></button>
            </div>
            <form onSubmit={handleSaveUser} className="p-12 space-y-8">
              <div className="flex gap-10 items-center">
                <div onClick={() => userPhotoInputRef.current?.click()} className="w-40 h-40 rounded-[3rem] bg-slate-100 dark:bg-slate-950 border-4 border-white dark:border-slate-800 flex flex-col items-center justify-center cursor-pointer relative overflow-hidden shadow-2xl transition-all hover:scale-105">
                  {userFormData.photo_url ? <img src={userFormData.photo_url} className="w-full h-full object-cover" /> : <><Camera className="text-slate-300 mb-2" size={40} /><span className="text-[9px] font-black uppercase text-slate-400 text-center px-4">Identidade</span></>}
                </div>
                <input type="file" ref={userPhotoInputRef} className="hidden" accept="image/*" capture="user" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onloadend = () => setUserFormData({ ...userFormData, photo_url: reader.result as string });
                    reader.readAsDataURL(file);
                  }
                }} />
                <div className="flex-1 space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome</label>
                    <input required value={userFormData.name || ''} onChange={e => setUserFormData({...userFormData, name: e.target.value})} placeholder="NOME COMPLETO" className="w-full p-6 rounded-3xl bg-slate-50 dark:bg-slate-950 font-black text-sm uppercase outline-none shadow-inner dark:text-white border-2 border-transparent focus:border-emerald-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Matrícula</label>
                  <input required value={userFormData.badge_id || ''} onChange={e => setUserFormData({...userFormData, badge_id: e.target.value})} placeholder="ID" className="w-full p-5 rounded-2xl bg-slate-50 dark:bg-slate-950 font-black text-sm text-center shadow-inner dark:text-white" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Cargo</label>
                  <select value={userFormData.role || ''} onChange={e => setUserFormData({...userFormData, role: e.target.value})} className="w-full p-5 rounded-2xl bg-slate-50 dark:bg-slate-950 font-black text-[10px] uppercase outline-none shadow-inner dark:text-white appearance-none text-center">
                    {USER_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <button type="submit" className="w-full py-8 bg-emerald-600 text-white rounded-[2.5rem] font-black uppercase text-[11px] tracking-widest shadow-xl shadow-emerald-500/30 active:scale-95 transition-all">
                {editingUser ? 'SALVAR ALTERAÇÕES' : 'CADASTRAR EQUIPE'}
              </button>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; height: 5px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #3b82f6; border-radius: 20px; }
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        * { -webkit-tap-highlight-color: transparent; outline: none !important; }
      `}</style>
    </div>
  );
}
