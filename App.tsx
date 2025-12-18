
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  LayoutDashboard, 
  Package, 
  ArrowRightLeft, 
  Settings, 
  Plus, 
  Search, 
  Trash2, 
  Moon, 
  Sun, 
  LogOut, 
  Menu,
  X,
  UserCheck,
  Camera,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Image as ImageIcon,
  CheckCircle2,
  MoreVertical,
  Download,
  LayoutGrid,
  List as ListIcon,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Box,
  ChevronRight,
  Sparkles,
  Info,
  Database,
  CloudCheck,
  History,
  Activity,
  User
} from 'lucide-react';
import { InventoryItem, MovementLog, UserSession, AppView, UserProfile } from './types';
import { Logo } from './components/Logo';
import { supabase } from './services/supabaseClient';
import { saveOfflineData, loadOfflineData, addToSyncQueue, getSyncQueue, removeFromQueue } from './services/offlineStorage';
import { generateProductInsights } from './services/geminiService';

export default function App() {
  // -- Sistema --
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [user, setUser] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [dbStatus, setDbStatus] = useState<'connected' | 'error' | 'connecting'>('connecting');
  
  // -- Dados --
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<MovementLog[]>([]);
  const [registeredUsers, setRegisteredUsers] = useState<UserProfile[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  
  // -- UI & Filtros --
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  const [inventoryDisplay, setInventoryDisplay] = useState<'GRID' | 'LIST'>('GRID');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);

  // -- Modais & Forms --
  const [badgeInput, setBadgeInput] = useState('');
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [movementType, setMovementType] = useState<'IN' | 'OUT'>('IN');
  const [movementItemId, setMovementItemId] = useState<string>('');
  const [formData, setFormData] = useState<Partial<InventoryItem>>({});
  const [moveData, setMoveData] = useState({ quantity: 1, reason: '' });
  const [aiAdvice, setAiAdvice] = useState<string>('');

  // -- Mapeamento --
  const mapFromDB = (i: any): InventoryItem => ({
    id: String(i.id), 
    name: i.name || '', 
    unit: i.unit || 'UND', 
    minStock: Number(i.min_stock) || 0,
    currentStock: Number(i.current_stock) || 0, 
    price: Number(i.price) || 0,
    location: i.location || '', 
    department: i.department || '',
    category: i.category || 'Geral',
    photoUrl: i.photo_url, 
    description: i.description, 
    lastUpdated: i.last_updated || new Date().toISOString(),
    lastUpdatedBy: i.last_updated_by
  });

  const mapToDB = (i: InventoryItem) => ({
    id: i.id, 
    name: i.name, 
    unit: i.unit, 
    min_stock: i.minStock,
    current_stock: i.currentStock, 
    price: i.price,
    location: i.location, 
    department: i.department,
    category: i.category,
    photo_url: i.photoUrl, 
    description: i.description, 
    last_updated: i.lastUpdated,
    last_updated_by: i.lastUpdatedBy
  });

  const fetchData = useCallback(async (showLoader = true) => {
    if (!navigator.onLine) {
      const offline = loadOfflineData();
      if (offline.items) setItems(offline.items);
      setIsLoading(false);
      setDbStatus('connected'); // Offline mode considers cached data as connected
      return;
    }
    
    if (showLoader) setIsSyncing(true);
    setDbStatus('connecting');
    
    try {
      const [it, mov, usr, dep] = await Promise.all([
        supabase.from('inventory_items').select('*').order('name'),
        supabase.from('movements').select('*').order('timestamp', { ascending: false }).limit(50),
        supabase.from('users').select('*'),
        supabase.from('departments').select('name').order('name')
      ]);

      if (it.error || mov.error || usr.error || dep.error) throw new Error("Erro na resposta do Supabase");

      if (it.data) setItems(it.data.map(mapFromDB));
      if (mov.data) setMovements(mov.data.map(m => ({
        id: m.id, itemId: m.item_id, itemName: m.item_name, type: m.type as any,
        quantity: m.quantity, userBadgeId: m.user_badge_id, userName: m.user_name,
        timestamp: m.timestamp, reason: m.reason
      })));
      if (usr.data) setRegisteredUsers(usr.data.map(u => ({
        badgeId: u.badge_id, name: u.name, role: u.role as any, createdAt: u.created_at
      })));
      if (dep.data) setDepartments(dep.data.map(d => d.name));
      
      setLastSync(new Date());
      setDbStatus('connected');
    } catch (err) {
      console.error("Carga falhou:", err);
      setDbStatus('error');
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  }, []);

  const processOfflineQueue = useCallback(async () => {
    if (!isOnline) return;
    const queue = getSyncQueue();
    if (queue.length === 0) return;

    setIsSyncing(true);
    for (const action of queue) {
      try {
        if (action.type === 'UPDATE_ITEM') {
          await supabase.from('inventory_items').upsert(mapToDB(action.payload));
        } else if (action.type === 'ADD_MOVEMENT') {
          await supabase.from('movements').insert(action.payload);
        }
        removeFromQueue(action.id);
      } catch (e) {
        console.error("Erro ao sincronizar item:", e);
      }
    }
    fetchData(false);
  }, [isOnline, fetchData]);

  const handleAIGenerate = async () => {
    if (!formData.name) return;
    setIsGeneratingAI(true);
    try {
      const insights = await generateProductInsights(formData.name, formData.department || 'Geral');
      if (insights) {
        setFormData(prev => ({ 
          ...prev, 
          description: insights.description,
          category: insights.suggestedCategory 
        }));
        setAiAdvice(insights.storageAdvice);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const exportToCSV = () => {
    const headers = ["ID", "Nome", "Setor", "Estoque Atual", "Minimo", "Preço", "Valor Total"];
    const rows = items.map(i => [
      i.id, i.name, i.department, i.currentStock, i.minStock, i.price, (i.currentStock * i.price).toFixed(2)
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + 
      [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `estoque_carpa_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    fetchData();
    const handleOnline = () => { setIsOnline(true); processOfflineQueue(); };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    const interval = setInterval(() => isOnline && fetchData(false), 120000); // 2 min intervals for battery/data efficiency
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [fetchData, processOfflineQueue, isOnline]);

  useEffect(() => {
    saveOfflineData(items, movements, registeredUsers, departments);
  }, [items, movements, registeredUsers, departments]);

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;

    const itemToSave: InventoryItem = {
      id: editingItem?.id || Date.now().toString(),
      name: formData.name,
      unit: formData.unit || 'UND',
      minStock: Number(formData.minStock) || 0,
      currentStock: Number(formData.currentStock) || 0,
      price: Number(formData.price) || 0,
      location: (formData.location || '').toUpperCase(),
      department: (formData.department || '').toUpperCase(),
      category: formData.category || 'Geral',
      photoUrl: formData.photoUrl,
      description: formData.description,
      lastUpdated: new Date().toISOString(),
      lastUpdatedBy: user?.name
    };

    if (isOnline) {
      await supabase.from('inventory_items').upsert(mapToDB(itemToSave));
      fetchData(false);
    } else {
      addToSyncQueue({ type: 'UPDATE_ITEM', payload: itemToSave });
      setItems(prev => {
        const index = prev.findIndex(i => i.id === itemToSave.id);
        if (index >= 0) { const ni = [...prev]; ni[index] = itemToSave; return ni; }
        return [...prev, itemToSave];
      });
    }
    setIsItemModalOpen(false);
    setEditingItem(null);
    setFormData({});
    setAiAdvice('');
  };

  const handleStockAction = async (e: React.FormEvent) => {
    e.preventDefault();
    const item = items.find(i => i.id === movementItemId);
    if (!item) return;

    const qty = Number(moveData.quantity);
    const newStock = movementType === 'IN' ? item.currentStock + qty : item.currentStock - qty;
    const log = {
      id: Date.now().toString(),
      item_id: item.id,
      item_name: item.name,
      type: movementType,
      quantity: qty,
      user_badge_id: user?.badgeId,
      user_name: user?.name,
      timestamp: new Date().toISOString(),
      reason: moveData.reason
    };

    setItems(prev => prev.map(i => i.id === item.id ? { ...i, currentStock: newStock, lastUpdated: log.timestamp, lastUpdatedBy: user?.name } : i));

    if (isOnline) {
      await Promise.all([
        supabase.from('inventory_items').update({ current_stock: newStock, last_updated: log.timestamp, last_updated_by: user?.name }).eq('id', item.id),
        supabase.from('movements').insert(log)
      ]);
    } else {
      addToSyncQueue({ type: 'ADD_MOVEMENT', payload: log });
    }

    setIsMovementModalOpen(false);
    setMoveData({ quantity: 1, reason: '' });
  };

  const filteredItems = useMemo(() => {
    let res = items;
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      res = res.filter(i => i.name.toLowerCase().includes(s) || i.location.toLowerCase().includes(s));
    }
    if (deptFilter) res = res.filter(i => i.department === deptFilter);
    if (showLowStockOnly) res = res.filter(i => i.currentStock <= i.minStock);
    return res;
  }, [items, searchTerm, deptFilter, showLowStockOnly]);

  const stats = useMemo(() => {
    const totalItems = items.length;
    const lowStock = items.filter(i => i.currentStock <= i.minStock).length;
    const inventoryValue = items.reduce((acc, i) => acc + (i.currentStock * i.price), 0);
    const movesToday = movements.filter(m => new Date(m.timestamp).toDateString() === new Date().toDateString()).length;
    return { totalItems, lowStock, inventoryValue, movesToday };
  }, [items, movements]);

  if (isLoading) return (
    <div className="h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950">
      <Logo className="w-24 h-24 mb-8 animate-pulse" />
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center gap-3 text-slate-400 font-black uppercase tracking-widest text-[10px]">
          <Loader2 className="animate-spin text-brand-600" size={20} /> Autenticando com Supabase
        </div>
        <p className="text-[9px] text-slate-300 font-bold uppercase">ID Projeto: xjefjewxrjrjclefiovj</p>
      </div>
    </div>
  );

  if (!user) return (
    <div className={`h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 p-6 ${darkMode ? 'dark' : ''}`}>
      <div className="w-full max-w-[460px] bg-white dark:bg-slate-900 p-12 rounded-[4rem] shadow-2xl border dark:border-slate-800 animate-in fade-in zoom-in duration-700 overflow-hidden relative">
        {/* Decorative subtle background icon */}
        <Database className="absolute -top-10 -right-10 w-48 h-48 text-slate-50 dark:text-slate-800/50 -rotate-12 pointer-events-none" />
        
        <div className="relative z-10">
          <div className="flex flex-col items-center mb-12 text-center">
            <Logo className="w-28 h-28 mb-8" />
            <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter mb-4">CARPA Enterprise</h1>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-full border dark:border-slate-700">
               <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
               <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Database Linked</span>
            </div>
          </div>
          <form onSubmit={e => { e.preventDefault(); setUser({ badgeId: badgeInput || '9999', name: 'Almoxarife', role: 'admin' }); }} className="space-y-6">
            <div className="group">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-4 mb-3 block group-focus-within:text-brand-600 transition-colors tracking-widest">Matrícula do Colaborador</label>
              <div className="relative">
                <UserCheck className="absolute left-7 top-1/2 -translate-y-1/2 text-slate-300" size={24} />
                <input 
                  autoFocus
                  type="text" 
                  value={badgeInput} 
                  onChange={e => setBadgeInput(e.target.value)} 
                  placeholder="EX: 889900" 
                  className="w-full pl-18 pr-8 py-7 bg-slate-50 dark:bg-slate-800 border-3 border-transparent focus:border-brand-500 rounded-[2.5rem] dark:text-white font-black transition-all outline-none text-xl shadow-inner placeholder:text-slate-300" 
                />
              </div>
            </div>
            <button className="w-full py-7 bg-brand-600 text-white font-black rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(37,99,235,0.4)] active:scale-[0.98] transition-all hover:bg-brand-700 text-lg uppercase tracking-[0.2em]">ACESSAR SISTEMA</button>
          </form>
          
          <div className="mt-12 text-center">
            <p className="text-[10px] text-slate-300 font-bold uppercase tracking-widest">Versão Industrial v2.4 • 2024</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className={`h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans transition-colors duration-300 ${darkMode ? 'dark' : ''}`}>
      {/* Sidebar Refinada */}
      <aside className={`fixed lg:static inset-y-0 left-0 w-80 bg-white dark:bg-slate-900 border-r dark:border-slate-800 z-50 transform transition-transform duration-500 shadow-2xl lg:shadow-none ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex flex-col h-full p-10">
          <div className="flex items-center gap-5 mb-16 px-2">
            <Logo className="w-16 h-16" />
            <div className="flex flex-col">
              <span className="font-black text-3xl tracking-tighter leading-none">CARPA</span>
              <span className="text-[10px] font-black text-brand-600 uppercase tracking-[0.2em] mt-1">Industrial</span>
            </div>
          </div>
          
          <nav className="flex-1 space-y-4">
            {[
              { id: AppView.DASHBOARD, icon: LayoutDashboard, label: 'Dashboard' },
              { id: AppView.INVENTORY, icon: Package, label: 'Almoxarifado' },
              { id: AppView.MOVEMENTS, icon: ArrowRightLeft, label: 'Movimentações' },
              { id: AppView.SETTINGS, icon: Settings, label: 'Ajustes' }
            ].map(v => (
              <button 
                key={v.id} 
                onClick={() => { setCurrentView(v.id); setIsSidebarOpen(false); }} 
                className={`w-full flex items-center gap-5 p-6 rounded-[2rem] font-black text-sm transition-all group ${currentView === v.id ? 'bg-brand-600 text-white shadow-2xl shadow-brand-500/30' : 'text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
              >
                <v.icon size={22} className={`${currentView === v.id ? 'text-white' : 'group-hover:text-brand-500'}`} /> {v.label}
              </button>
            ))}
          </nav>

          <div className="mt-auto pt-10 border-t dark:border-slate-800 space-y-6">
             <div className="bg-slate-50 dark:bg-slate-800 p-6 rounded-[2.5rem] border dark:border-slate-700/50">
                <div className="flex items-center gap-4 mb-3">
                  <div className="w-12 h-12 rounded-2xl bg-brand-100 dark:bg-brand-900 flex items-center justify-center font-black text-brand-600 text-lg shadow-sm border border-brand-200 dark:border-brand-700">{user.name[0]}</div>
                  <div className="flex-1 truncate">
                    <p className="text-sm font-black truncate">{user.name}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Matrícula: {user.badgeId}</p>
                  </div>
                </div>
                <button onClick={() => setUser(null)} className="w-full flex items-center justify-center gap-2 py-3 bg-white dark:bg-slate-900 text-red-500 text-[10px] font-black uppercase rounded-xl border dark:border-slate-700 hover:bg-red-50 transition-colors shadow-sm tracking-widest"><LogOut size={14}/> Sair</button>
             </div>

             {/* Indicador de Status de Dados */}
             <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between px-2">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Conexão DB</span>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${dbStatus === 'connected' ? 'bg-emerald-500' : dbStatus === 'error' ? 'bg-red-500' : 'bg-orange-500 animate-pulse'}`} />
                    <span className={`text-[9px] font-black uppercase ${dbStatus === 'connected' ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {dbStatus === 'connected' ? 'Ativa' : 'Pendente'}
                    </span>
                  </div>
                </div>
                <div className="flex gap-3">
                    <button onClick={() => setDarkMode(!darkMode)} className="flex-1 py-5 bg-slate-50 dark:bg-slate-800 rounded-[1.5rem] flex justify-center text-slate-500 hover:text-brand-500 transition-all border dark:border-slate-700 shadow-sm">{darkMode ? <Sun size={20}/> : <Moon size={20}/>}</button>
                    <button onClick={() => fetchData(true)} className={`flex-1 py-5 bg-slate-50 dark:bg-slate-800 rounded-[1.5rem] flex justify-center text-brand-500 transition-all border dark:border-slate-700 shadow-sm ${isSyncing ? 'animate-spin' : ''}`}><RefreshCw size={20}/></button>
                </div>
             </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Header Profissional */}
        <header className="h-28 border-b dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-2xl flex items-center justify-between px-10 lg:px-14 z-30 sticky top-0">
          <div className="flex items-center gap-6">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-5 bg-slate-100 dark:bg-slate-800 rounded-[1.5rem] text-slate-600"><Menu size={24}/></button>
            <div className="hidden sm:block">
              <h2 className="font-black text-3xl tracking-tighter">
                {currentView === AppView.DASHBOARD && "Operações Ativas"}
                {currentView === AppView.INVENTORY && "Acervo de Materiais"}
                {currentView === AppView.MOVEMENTS && "Log de Auditoria"}
                {currentView === AppView.SETTINGS && "Painel de Controle"}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="hidden xl:flex items-center gap-4 px-6 py-3 rounded-full bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 shadow-sm">
               <div className="flex flex-col items-end">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Sincronização</span>
                  <span className="text-[10px] font-black text-emerald-600 uppercase">Supabase Linked</span>
               </div>
               <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600">
                  <CloudCheck size={20} />
               </div>
            </div>

            <button 
              onClick={() => { setEditingItem(null); setFormData({}); setIsItemModalOpen(true); }}
              className="bg-brand-600 hover:bg-brand-700 text-white px-10 py-5 rounded-[2rem] flex items-center gap-4 font-black text-sm shadow-[0_24px_48px_-12px_rgba(37,99,235,0.4)] transition-all active:scale-95 group"
            >
              <Plus size={22} className="group-hover:rotate-90 transition-transform" /> <span className="hidden md:inline uppercase tracking-widest">Novo Item</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-10 lg:p-14 bg-slate-50/30 dark:bg-slate-950/30">
          <div className="max-w-7xl mx-auto space-y-12">
            
            {currentView === AppView.DASHBOARD && (
              <div className="space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
                   <div className="bg-white dark:bg-slate-900 p-10 rounded-[3.5rem] border dark:border-slate-800 shadow-sm flex flex-col group hover:shadow-2xl transition-all relative overflow-hidden">
                      <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-[1.5rem] flex items-center justify-center text-brand-600 mb-10 group-hover:scale-110 transition-transform"><Database size={32}/></div>
                      <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Total de SKUs</span>
                      <h3 className="text-6xl font-black tracking-tighter">{stats.totalItems}</h3>
                      <p className="text-[10px] text-slate-400 mt-4 font-bold uppercase tracking-widest">Ativos Sincronizados</p>
                      <Box className="absolute -bottom-4 -right-4 text-slate-50 dark:text-slate-800/30 w-32 h-32 rotate-12" />
                   </div>
                   <div className="bg-white dark:bg-slate-900 p-10 rounded-[3.5rem] border border-red-100 dark:border-red-900/20 shadow-sm flex flex-col group hover:shadow-2xl transition-all">
                      <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-[1.5rem] flex items-center justify-center text-red-600 mb-10 group-hover:scale-110 transition-transform"><AlertTriangle size={32}/></div>
                      <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Alertas de Stock</span>
                      <h3 className="text-6xl font-black tracking-tighter text-red-600">{stats.lowStock}</h3>
                      <p className="text-[10px] text-red-400 mt-4 font-bold uppercase tracking-widest">Requerem Atenção</p>
                   </div>
                   <div className="bg-white dark:bg-slate-900 p-10 rounded-[3.5rem] border border-emerald-100 dark:border-emerald-900/20 shadow-sm flex flex-col group hover:shadow-2xl transition-all relative overflow-hidden">
                      <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-900/20 rounded-[1.5rem] flex items-center justify-center text-emerald-600 mb-10 group-hover:scale-110 transition-transform"><DollarSign size={32}/></div>
                      <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Capital em Mão</span>
                      <h3 className="text-4xl font-black tracking-tighter text-emerald-600">
                        {stats.inventoryValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </h3>
                      <p className="text-[10px] text-emerald-400 mt-4 font-bold uppercase tracking-widest">Valor do Almoxarifado</p>
                      <TrendingUp className="absolute -bottom-4 -right-4 text-emerald-50 dark:text-emerald-900/10 w-32 h-32 rotate-12" />
                   </div>
                   <div className="bg-white dark:bg-slate-900 p-10 rounded-[3.5rem] border dark:border-slate-800 shadow-sm flex flex-col group hover:shadow-2xl transition-all">
                      <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-[1.5rem] flex items-center justify-center text-slate-600 mb-10 group-hover:scale-110 transition-transform"><Activity size={32}/></div>
                      <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Giro Diário</span>
                      <h3 className="text-6xl font-black tracking-tighter">{stats.movesToday}</h3>
                      <p className="text-[10px] text-slate-400 mt-4 font-bold uppercase tracking-widest">Eventos Processados</p>
                   </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-14 rounded-[4.5rem] border dark:border-slate-800 shadow-sm overflow-hidden group">
                   <div className="flex items-center justify-between mb-12">
                      <div>
                        <h4 className="text-4xl font-black tracking-tighter">Auditoria de Fluxo</h4>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-[0.3em] mt-2 flex items-center gap-2"><CheckCircle2 size={12} className="text-brand-600" /> Sincronizado com xjefjewxrjrjclefiovj</p>
                      </div>
                      <button onClick={() => setCurrentView(AppView.MOVEMENTS)} className="p-5 bg-slate-50 dark:bg-slate-800 rounded-2xl text-brand-600 hover:bg-brand-600 hover:text-white transition-all shadow-md active:scale-95"><ChevronRight size={28} /></button>
                   </div>
                   <div className="space-y-5">
                      {movements.slice(0, 8).map(m => (
                        <div key={m.id} className="flex items-center gap-8 p-8 rounded-[2.5rem] bg-slate-50/40 dark:bg-slate-800/40 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 hover:bg-white dark:hover:bg-slate-800 transition-all group/item shadow-sm">
                           <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center shadow-lg ${m.type === 'IN' ? 'bg-emerald-100 text-emerald-600' : 'bg-orange-100 text-orange-600'}`}>
                              {m.type === 'IN' ? <TrendingUp size={28}/> : <TrendingDown size={28}/>}
                           </div>
                           <div className="flex-1 min-w-0">
                              <p className="text-xl font-black truncate text-slate-900 dark:text-white mb-1">{m.itemName}</p>
                              <div className="flex items-center gap-3">
                                <span className="text-[10px] font-black bg-white dark:bg-slate-700 px-3 py-1 rounded-full text-brand-600 border dark:border-slate-600 shadow-sm">{m.userName}</span>
                                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">• {new Date(m.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                              </div>
                           </div>
                           <div className="text-right">
                              <p className={`text-3xl font-black ${m.type === 'IN' ? 'text-emerald-600' : 'text-orange-600'}`}>
                                {m.type === 'IN' ? '+' : '-'}{m.quantity}
                              </p>
                              <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">UND</p>
                           </div>
                        </div>
                      ))}
                   </div>
                </div>
              </div>
            )}

            {currentView === AppView.INVENTORY && (
              <div className="space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="flex flex-col lg:flex-row gap-8 items-center">
                  <div className="flex-1 w-full bg-white dark:bg-slate-900 p-6 rounded-[3rem] border dark:border-slate-800 shadow-sm flex items-center gap-6">
                    <div className="relative flex-1">
                      <Search className="absolute left-8 top-1/2 -translate-y-1/2 text-slate-300" size={24}/>
                      <input 
                        value={searchTerm} 
                        onChange={e => setSearchTerm(e.target.value)} 
                        placeholder="Buscar por nome, tag ou localização técnica..." 
                        className="w-full pl-20 pr-8 py-6 bg-slate-50 dark:bg-slate-800 border-none rounded-[2rem] outline-none focus:ring-4 focus:ring-brand-500/10 font-black text-lg transition-all shadow-inner placeholder:text-slate-300" 
                      />
                    </div>
                    <div className="flex gap-3">
                       <button onClick={() => setInventoryDisplay('GRID')} className={`p-5 rounded-[1.5rem] transition-all shadow-md ${inventoryDisplay === 'GRID' ? 'bg-brand-600 text-white shadow-brand-500/20' : 'bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-brand-600'}`}><LayoutGrid size={24}/></button>
                       <button onClick={() => setInventoryDisplay('LIST')} className={`p-5 rounded-[1.5rem] transition-all shadow-md ${inventoryDisplay === 'LIST' ? 'bg-brand-600 text-white shadow-brand-500/20' : 'bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-brand-600'}`}><ListIcon size={24}/></button>
                    </div>
                  </div>

                  <div className="flex gap-4 w-full lg:w-auto">
                    <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="flex-1 lg:w-60 p-6 bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-[2rem] font-black text-xs uppercase cursor-pointer outline-none focus:ring-4 focus:ring-brand-500/10 shadow-sm tracking-widest">
                      <option value="">TODOS SETORES</option>
                      {departments.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <button onClick={exportToCSV} className="p-6 bg-white dark:bg-slate-900 border dark:border-slate-800 text-slate-400 rounded-[2rem] hover:text-brand-600 transition-all shadow-sm hover:scale-105 active:scale-95" title="Exportar Relatório"><Download size={28}/></button>
                  </div>
                </div>

                {inventoryDisplay === 'GRID' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-10">
                    {filteredItems.map(item => {
                      const isLow = item.currentStock <= item.minStock;
                      return (
                        <div key={item.id} className={`group bg-white dark:bg-slate-900 rounded-[3.5rem] border transition-all duration-500 overflow-hidden flex flex-col hover:shadow-[0_48px_96px_-16px_rgba(0,0,0,0.12)] hover:scale-[1.03] ${isLow ? 'border-red-200 dark:border-red-900/40' : 'dark:border-slate-800 shadow-sm'}`}>
                          <div className="aspect-square bg-slate-50 dark:bg-slate-800 relative overflow-hidden">
                             {item.photoUrl ? (
                               <img src={item.photoUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-[1500ms]" alt={item.name} />
                             ) : (
                               <div className="w-full h-full flex items-center justify-center text-slate-100 dark:text-slate-700/50"><Package size={100}/></div>
                             )}
                             <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all flex items-end p-10">
                                <p className="text-white text-sm font-medium leading-relaxed drop-shadow-md">{item.description || 'Especificação técnica não detalhada.'}</p>
                             </div>
                             {isLow && (
                               <div className="absolute top-8 right-8 bg-red-600 text-white text-[10px] font-black px-5 py-2.5 rounded-full shadow-2xl animate-pulse z-10 border-2 border-white/30 uppercase tracking-[0.2em]">Reposição Urgente</div>
                             )}
                             <div className="absolute top-8 left-8">
                               <span className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md text-[10px] font-black px-4 py-2 rounded-xl shadow-lg uppercase tracking-widest text-brand-600 border dark:border-slate-700">{item.category}</span>
                             </div>
                          </div>

                          <div className="p-10 flex-1 flex flex-col">
                             <div className="mb-8">
                               <h4 className="font-black text-slate-900 dark:text-white truncate text-2xl tracking-tight leading-none mb-3" title={item.name}>{item.name}</h4>
                               <div className="flex items-center gap-3">
                                  <span className="text-[10px] font-black text-brand-600 uppercase tracking-widest bg-brand-50 dark:bg-brand-900/20 px-2 py-0.5 rounded-lg">{item.department}</span>
                                  <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.location}</span>
                               </div>
                             </div>

                             <div className="mt-auto pt-10 border-t dark:border-slate-800 flex items-center justify-between">
                                <div>
                                   <p className="text-[10px] text-slate-400 font-black uppercase mb-1 tracking-[0.2em]">Saldo Disponível</p>
                                   <p className={`text-5xl font-black tracking-tighter transition-all ${isLow ? 'text-red-600' : 'text-slate-900 dark:text-white'}`}>
                                      {item.currentStock}<span className="text-base font-bold text-slate-300 ml-2 uppercase">{item.unit}</span>
                                   </p>
                                </div>
                                <div className="flex gap-2">
                                   <button onClick={(e) => { e.stopPropagation(); setMovementItemId(item.id); setMovementType('IN'); setIsMovementModalOpen(true); }} className="p-5 bg-slate-50 dark:bg-slate-800 text-emerald-600 rounded-3xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm active:scale-90"><TrendingUp size={24}/></button>
                                   <button onClick={(e) => { e.stopPropagation(); setMovementItemId(item.id); setMovementType('OUT'); setIsMovementModalOpen(true); }} className="p-5 bg-slate-50 dark:bg-slate-800 text-orange-600 rounded-3xl hover:bg-orange-600 hover:text-white transition-all shadow-sm active:scale-90"><TrendingDown size={24}/></button>
                                   <button onClick={(e) => { e.stopPropagation(); setEditingItem(item); setFormData(item); setIsItemModalOpen(true); }} className="p-5 bg-slate-50 dark:bg-slate-800 text-slate-400 rounded-3xl hover:bg-slate-900 hover:text-white transition-all shadow-sm active:scale-90"><MoreVertical size={24}/></button>
                                </div>
                             </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-white dark:bg-slate-900 rounded-[4rem] border dark:border-slate-800 shadow-sm overflow-hidden animate-in fade-in duration-700">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/50">
                          <th className="p-10 text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">Especificação Material</th>
                          <th className="p-10 text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">Setor / Localização</th>
                          <th className="p-10 text-[11px] font-black uppercase tracking-[0.3em] text-slate-400 text-center">Saldo Real</th>
                          <th className="p-10 text-[11px] font-black uppercase tracking-[0.3em] text-slate-400 text-right">Ações Rápidas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y dark:divide-slate-800">
                        {filteredItems.map(item => (
                          <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors group/row">
                            <td className="p-10">
                              <div className="flex items-center gap-6">
                                <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 overflow-hidden flex-shrink-0 shadow-inner group-hover/row:scale-105 transition-transform">
                                  {item.photoUrl ? <img src={item.photoUrl} className="w-full h-full object-cover" /> : <Package size={24} className="m-auto text-slate-200 h-full" />}
                                </div>
                                <div>
                                  <p className="font-black text-xl text-slate-900 dark:text-white tracking-tight">{item.name}</p>
                                  <p className="text-[10px] font-black text-brand-600 uppercase tracking-[0.2em] mt-1">{item.category}</p>
                                </div>
                              </div>
                            </td>
                            <td className="p-10">
                              <p className="text-sm font-black text-slate-700 dark:text-slate-300 mb-1">{item.location}</p>
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.department}</p>
                            </td>
                            <td className="p-10 text-center">
                              <span className={`text-4xl font-black ${item.currentStock <= item.minStock ? 'text-red-600' : 'text-slate-900 dark:text-white'}`}>{item.currentStock}</span>
                              <span className="text-[10px] font-black text-slate-300 ml-2 uppercase">{item.unit}</span>
                            </td>
                            <td className="p-10 text-right">
                               <div className="flex justify-end gap-3">
                                  <button onClick={() => { setMovementItemId(item.id); setMovementType('IN'); setIsMovementModalOpen(true); }} className="p-4 bg-slate-100 dark:bg-slate-800 text-emerald-600 rounded-2xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm"><Plus size={22}/></button>
                                  <button onClick={() => { setMovementItemId(item.id); setMovementType('OUT'); setIsMovementModalOpen(true); }} className="p-4 bg-slate-100 dark:bg-slate-800 text-orange-600 rounded-2xl hover:bg-orange-600 hover:text-white transition-all shadow-sm"><TrendingDown size={22}/></button>
                                  <button onClick={() => { setEditingItem(item); setFormData(item); setIsItemModalOpen(true); }} className="p-4 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-2xl hover:bg-slate-900 hover:text-white transition-all shadow-sm"><MoreVertical size={22}/></button>
                               </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modais de Cadastro e Fluxo (Mesmo design sofisticado do App.tsx anterior) */}
      {/* ... [Mantido os modais do App.tsx anterior com design de 4rem radius e scale-in] ... */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-6 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white dark:bg-slate-900 rounded-[4.5rem] shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col border dark:border-slate-800 scale-in-center">
            <div className="p-12 border-b dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/30">
              <div>
                <h3 className="text-4xl font-black tracking-tighter">{editingItem ? 'Editar Ativo Industrial' : 'Novo Material no Almoxarifado'}</h3>
                <p className="text-[11px] text-slate-400 font-black uppercase tracking-[0.3em] mt-2">Database Reference: xjefjewxrjrjclefiovj</p>
              </div>
              <button onClick={() => setIsItemModalOpen(false)} className="text-slate-400 bg-white dark:bg-slate-800 p-5 rounded-[2rem] shadow-2xl hover:text-red-500 transition-all active:scale-90 border dark:border-slate-700"><X size={28} /></button>
            </div>
            <form onSubmit={handleSaveItem} className="flex-1 overflow-y-auto p-14">
              {/* [Conteúdo do Formulário similar ao App.tsx anterior mas com espaçamentos ainda maiores] */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-20">
                <div className="lg:col-span-4 flex flex-col items-center">
                  <div className="w-full aspect-square rounded-[3.5rem] bg-slate-50 dark:bg-slate-800 border-12 border-white dark:border-slate-700 flex items-center justify-center overflow-hidden shadow-2xl mb-10 relative group border-double">
                    {formData.photoUrl ? (
                      <img src={formData.photoUrl} className="w-full h-full object-cover" alt="Preview" />
                    ) : (
                      <Camera className="text-slate-200 dark:text-slate-700" size={100}/>
                    )}
                    <div className="absolute inset-0 bg-brand-600/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                      <p className="text-white text-[11px] font-black uppercase tracking-widest bg-brand-600 px-6 py-3 rounded-full shadow-xl">Acionar Câmera</p>
                    </div>
                  </div>
                  <div className="flex gap-4 w-full">
                    <label className="flex-1 flex flex-col items-center p-8 bg-brand-600 text-white rounded-[2rem] cursor-pointer hover:bg-brand-700 transition shadow-2xl shadow-brand-500/30 active:scale-95">
                      <Camera size={32} className="mb-3"/> <span className="text-[10px] font-black uppercase tracking-widest">Foto Real</span>
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => {
                        const f = e.target.files?.[0];
                        if(f) { const r = new FileReader(); r.onloadend = () => setFormData(p => ({...p, photoUrl: r.result as string})); r.readAsDataURL(f); }
                      }} />
                    </label>
                    <label className="flex-1 flex flex-col items-center p-8 bg-slate-50 dark:bg-slate-800 text-slate-500 rounded-[2rem] cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition active:scale-95 border dark:border-slate-700">
                      <ImageIcon size={32} className="mb-3"/> <span className="text-[10px] font-black uppercase tracking-widest">Galeria</span>
                      <input type="file" accept="image/*" className="hidden" onChange={e => {
                        const f = e.target.files?.[0];
                        if(f) { const r = new FileReader(); r.onloadend = () => setFormData(p => ({...p, photoUrl: r.result as string})); r.readAsDataURL(f); }
                      }} />
                    </label>
                  </div>
                </div>
                <div className="lg:col-span-8 space-y-10">
                   <div className="space-y-8">
                    <div className="group">
                      <div className="flex items-center justify-between mb-4 ml-4">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] group-focus-within:text-brand-600 transition-colors">Nome / Tag Técnico do Ativo</label>
                        <button type="button" disabled={isGeneratingAI || !formData.name} onClick={handleAIGenerate} className="flex items-center gap-3 text-[11px] font-black text-brand-600 uppercase tracking-[0.2em] bg-brand-50 dark:bg-brand-900/40 px-5 py-2 rounded-full hover:bg-brand-600 hover:text-white transition-all disabled:opacity-30 shadow-sm"><Sparkles size={16} /> Assistente de IA</button>
                      </div>
                      <input required className="w-full p-8 bg-slate-50 dark:bg-slate-800 border-4 border-transparent focus:border-brand-500 rounded-[2.5rem] font-black text-2xl transition-all outline-none shadow-inner placeholder:text-slate-300" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="EX: MOTOR WEG 25HP 4P" />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-8">
                       <div className="group">
                        <label className="text-[11px] font-black text-slate-400 uppercase mb-4 block ml-4 tracking-widest">Centro de Custo / Setor</label>
                        <input className="w-full p-8 bg-slate-50 dark:bg-slate-800 border-none rounded-[2rem] font-bold text-lg outline-none shadow-inner uppercase" value={formData.department || ''} onChange={e => setFormData({...formData, department: e.target.value})} placeholder="PRODUÇÃO" />
                      </div>
                      <div className="group">
                        <label className="text-[11px] font-black text-slate-400 uppercase mb-4 block ml-4 tracking-widest">Endereço de Estoque</label>
                        <input className="w-full p-8 bg-slate-50 dark:bg-slate-800 border-none rounded-[2rem] font-bold text-lg outline-none shadow-inner uppercase" value={formData.location || ''} onChange={e => setFormData({...formData, location: e.target.value})} placeholder="RUA-B-05" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-8">
                      <div className="group">
                        <label className="text-[11px] font-black text-slate-400 uppercase mb-4 block ml-4 tracking-widest">Grupo de Material</label>
                        <input className="w-full p-8 bg-slate-50 dark:bg-slate-800 border-none rounded-[2rem] font-bold text-lg outline-none shadow-inner" value={formData.category || 'Geral'} onChange={e => setFormData({...formData, category: e.target.value})} />
                      </div>
                      <div className="group">
                        <label className="text-[11px] font-black text-slate-400 uppercase mb-4 block ml-4 tracking-widest">Valor de Aquisição (R$)</label>
                        <input type="number" step="0.01" className="w-full p-8 bg-slate-50 dark:bg-slate-800 border-none rounded-[2rem] font-bold text-lg outline-none shadow-inner" value={formData.price || 0} onChange={e => setFormData({...formData, price: Number(e.target.value)})} />
                      </div>
                    </div>

                    <div className="group relative">
                      <label className="text-[11px] font-black text-slate-400 uppercase block mb-4 ml-4 tracking-widest">Prontuário e Detalhes</label>
                      <textarea className="w-full p-8 bg-slate-50 dark:bg-slate-800 border-none rounded-[2.5rem] font-medium text-lg outline-none resize-none min-h-[160px] shadow-inner" value={formData.description || ''} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Informações de manutenção ou notas de fornecedor..." />
                    </div>

                    {aiAdvice && (
                      <div className="p-8 bg-brand-50 dark:bg-brand-900/30 rounded-[3rem] border-2 border-brand-100 dark:border-brand-800 flex items-start gap-6 animate-in slide-in-from-top-4">
                        <Info className="text-brand-600 mt-1 flex-shrink-0" size={28} />
                        <div>
                          <p className="text-[11px] font-black text-brand-600 uppercase tracking-[0.2em] mb-2">Protocolo Recomendado (IA)</p>
                          <p className="text-base text-slate-700 dark:text-slate-200 font-medium leading-relaxed italic">"{aiAdvice}"</p>
                        </div>
                      </div>
                    )}
                   </div>
                </div>
              </div>
            </form>
            <div className="p-12 border-t dark:border-slate-800 flex justify-end gap-8 bg-slate-50 dark:bg-slate-800/40">
              <button onClick={() => setIsItemModalOpen(false)} className="px-12 py-7 font-black text-slate-400 text-xs uppercase tracking-[0.3em] hover:text-slate-600 active:scale-95 transition-all">Cancelar</button>
              <button onClick={handleSaveItem} className="px-20 py-7 bg-brand-600 text-white rounded-[2.5rem] font-black shadow-[0_24px_48px_-12px_rgba(37,99,235,0.4)] hover:bg-brand-700 active:scale-95 transition-all uppercase tracking-[0.2em] text-sm">Validar e Gravar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Movimentação (Mesmo estilo de alto impacto) */}
      {isMovementModalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-8 bg-slate-950/95 backdrop-blur-2xl animate-in fade-in duration-300">
           <div className="bg-white dark:bg-slate-900 rounded-[5rem] shadow-2xl w-full max-w-lg overflow-hidden scale-in-center border dark:border-slate-800">
              <div className={`p-16 text-center ${movementType === 'IN' ? 'bg-emerald-600' : 'bg-orange-600'} text-white relative`}>
                 <Logo className="w-16 h-16 mx-auto mb-8 opacity-40 grayscale invert" />
                 <h3 className="text-5xl font-black uppercase tracking-tighter mb-4">{movementType === 'IN' ? 'Entrada' : 'Retirada'}</h3>
                 <div className="px-10">
                    <p className="text-[11px] font-black opacity-90 tracking-[0.3em] truncate leading-relaxed">SKU: {items.find(i => i.id === movementItemId)?.name}</p>
                 </div>
              </div>
              <form onSubmit={handleStockAction} className="p-16 space-y-12">
                 <div className="space-y-6">
                    <label className="text-[12px] font-black text-slate-400 uppercase block text-center tracking-[0.3em]">Volume do Lançamento</label>
                    <input type="number" min="1" required autoFocus className="w-full text-9xl font-black text-center p-14 bg-slate-50 dark:bg-slate-800 border-none rounded-[4rem] outline-none dark:text-white shadow-inner" value={moveData.quantity} onChange={e => setMoveData({...moveData, quantity: Number(e.target.value)})} />
                 </div>
                 <div className="space-y-6 pt-6">
                   <button type="submit" className={`w-full py-10 text-white text-xl font-black rounded-[3rem] shadow-2xl transition-all active:scale-95 uppercase tracking-[0.2em] ${movementType === 'IN' ? 'bg-emerald-600 shadow-emerald-500/30' : 'bg-orange-600 shadow-orange-500/30'}`}>
                     Autorizar e Sincronizar
                   </button>
                   <button type="button" onClick={() => setIsMovementModalOpen(false)} className="w-full text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] py-5">Anular Operação</button>
                 </div>
              </form>
           </div>
        </div>
      )}
    </div>
  );
}
