import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  LayoutDashboard, 
  Package, 
  ArrowRightLeft, 
  Settings, 
  Plus, 
  Search, 
  Trash2, 
  Edit, 
  Moon, 
  Sun, 
  LogOut, 
  Upload, 
  Download, 
  Menu,
  X,
  UserCheck,
  Camera,
  AlertTriangle,
  Sparkles,
  List as ListIcon,
  Grid as GridIcon,
  CheckSquare,
  Square,
  UserPlus,
  AlertCircle,
  HelpCircle,
  Loader2,
  Wifi,
  WifiOff,
  Database,
  Filter,
  XCircle,
  CloudOff,
  RefreshCw,
  Share,
  Info,
  Users,
  Image as ImageIcon,
  Clock
} from 'lucide-react';
import { InventoryItem, MovementLog, UserSession, AppView, UserProfile } from './types';
import { Logo } from './components/Logo';
import { generateProductDescription } from './services/geminiService';
import { supabase } from './services/supabaseClient';
import { saveOfflineData, loadOfflineData, addToSyncQueue, getSyncQueue, removeFromQueue } from './services/offlineStorage';
import { RealtimeChannel } from '@supabase/supabase-js';

const MAX_USERS = 10;

export default function App() {
  // -- Estado de Sistema --
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [user, setUser] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [onlineUsersCount, setOnlineUsersCount] = useState(0);
  const [presenceChannel, setPresenceChannel] = useState<RealtimeChannel | null>(null);
  
  // -- Dados --
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<MovementLog[]>([]);
  const [registeredUsers, setRegisteredUsers] = useState<UserProfile[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  
  // -- Navegação e UI --
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  const [badgeInput, setBadgeInput] = useState('');
  const [nameInput, setNameInput] = useState(''); 
  const [isRegistering, setIsRegistering] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);

  // -- Modais e Forms --
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [movementType, setMovementType] = useState<'IN' | 'OUT'>('IN');
  const [movementItemId, setMovementItemId] = useState<string>('');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemsToDelete, setItemsToDelete] = useState<string[]>([]);
  const [formData, setFormData] = useState<Partial<InventoryItem>>({});
  const [moveData, setMoveData] = useState({ quantity: 1, reason: '' });

  // -- Mapeamento DB --
  const mapFromDB = (i: any): InventoryItem => ({
    id: i.id, name: i.name, unit: i.unit, minStock: Number(i.min_stock),
    currentStock: Number(i.current_stock), location: i.location, department: i.department,
    photoUrl: i.photo_url, description: i.description, lastUpdated: i.last_updated,
    lastUpdatedBy: i.last_updated_by
  });

  const mapToDB = (i: InventoryItem) => ({
    id: i.id, name: i.name, unit: i.unit, min_stock: i.minStock,
    current_stock: i.currentStock, location: i.location, department: i.department,
    photo_url: i.photoUrl, description: i.description, last_updated: i.lastUpdated,
    last_updated_by: i.lastUpdatedBy
  });

  // -- Funções de Carga de Dados --
  const fetchData = useCallback(async (showLoader = true) => {
    if (!navigator.onLine) {
      setIsLoading(false);
      return;
    }
    if (showLoader) setIsSyncing(true);
    
    try {
      const [it, mov, usr, dep] = await Promise.all([
        supabase.from('inventory_items').select('*').order('name'),
        supabase.from('movements').select('*').order('timestamp', { ascending: false }).limit(100),
        supabase.from('users').select('*'),
        supabase.from('departments').select('name').order('name')
      ]);

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
    } catch (err) {
      console.error("Erro ao sincronizar:", err);
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  }, []);

  // -- Ciclo de Vida --
  useEffect(() => {
    // Carregar dados offline primeiro (Instantâneo)
    const offline = loadOfflineData();
    if (offline.items?.length > 0) {
      setItems(offline.items);
      setMovements(offline.movements);
      setRegisteredUsers(offline.users);
      setDepartments(offline.depts);
      setIsLoading(false);
    }

    // Monitor de Rede
    const handleOnline = () => { setIsOnline(true); fetchData(false); };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    fetchData();

    // Canais Realtime
    const presenceRoom = supabase.channel('presence_carpa');
    presenceRoom
      .on('presence', { event: 'sync' }, () => {
        setOnlineUsersCount(Object.keys(presenceRoom.presenceState()).length);
      })
      .subscribe();
    setPresenceChannel(presenceRoom);

    const dbChannel = supabase.channel('db_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' }, () => fetchData(false))
      .subscribe();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      supabase.removeChannel(presenceRoom);
      supabase.removeChannel(dbChannel);
    };
  }, [fetchData]);

  useEffect(() => {
    if (presenceChannel && isOnline && user) {
      presenceChannel.track({ user: user.badgeId, online_at: new Date().toISOString() });
    }
  }, [user, presenceChannel, isOnline]);

  useEffect(() => {
    saveOfflineData(items, movements, registeredUsers, departments);
  }, [items, movements, registeredUsers, departments]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  // -- Ações de Usuário --
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (badgeInput.length < 2) return;
    
    const existing = registeredUsers.find(u => u.badgeId === badgeInput);
    if (existing) {
      setUser(existing);
      fetchData(false);
    } else {
      setIsRegistering(true);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) return;

    const newUser = { 
      badge_id: badgeInput, 
      name: nameInput, 
      role: 'admin', // FORÇANDO ADMIN PARA TODOS TEREM PERMISSÃO DE ESCRITA
      created_at: new Date().toISOString() 
    };

    if (isOnline) {
      await supabase.from('users').insert(newUser);
      fetchData(false);
    } else {
      addToSyncQueue({ type: 'ADD_USER', payload: newUser });
    }

    setUser({ badgeId: newUser.badge_id, name: newUser.name, role: 'admin' });
    setIsRegistering(false);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;

    const newItem: InventoryItem = {
      id: editingItem?.id || Date.now().toString(),
      name: formData.name,
      unit: formData.unit || 'Unid',
      minStock: Number(formData.minStock) || 0,
      currentStock: Number(formData.currentStock) || 0,
      location: formData.location || 'Geral',
      department: formData.department || 'Geral',
      photoUrl: formData.photoUrl,
      description: formData.description,
      lastUpdated: new Date().toISOString(),
      lastUpdatedBy: user?.name
    };

    // Atualização otimista
    setItems(prev => editingItem ? prev.map(i => i.id === newItem.id ? newItem : i) : [...prev, newItem]);

    if (isOnline) {
      await supabase.from('inventory_items').upsert(mapToDB(newItem));
    } else {
      addToSyncQueue({ type: editingItem ? 'UPDATE_ITEM' : 'ADD_ITEM', payload: newItem });
    }

    closeItemModal();
  };

  const handleStockAction = async (e: React.FormEvent) => {
    e.preventDefault();
    const item = items.find(i => i.id === movementItemId);
    if (!item) return;

    const qty = Number(moveData.quantity);
    const newStock = movementType === 'IN' ? item.currentStock + qty : item.currentStock - qty;
    
    if (movementType === 'OUT' && item.currentStock < qty) {
      alert("Estoque insuficiente!");
      return;
    }

    const log = {
      id: Date.now().toString(),
      item_id: item.id,
      item_name: item.name,
      type: movementType,
      quantity: qty,
      user_badge_id: user?.badgeId || '?',
      user_name: user?.name || '?',
      timestamp: new Date().toISOString(),
      reason: moveData.reason
    };

    const updatedItem = { ...item, currentStock: newStock, lastUpdated: log.timestamp, lastUpdatedBy: user?.name };
    
    setItems(prev => prev.map(i => i.id === item.id ? updatedItem : i));
    setMovements(prev => [{...log, itemId: log.item_id, itemName: log.item_name, userBadgeId: log.user_badge_id, userName: log.user_name, type: log.type as any}, ...prev]);

    if (isOnline) {
      await Promise.all([
        supabase.from('inventory_items').update({ current_stock: newStock, last_updated: log.timestamp, last_updated_by: user?.name }).eq('id', item.id),
        supabase.from('movements').insert(log)
      ]);
    } else {
      addToSyncQueue({ type: 'UPDATE_ITEM', payload: updatedItem });
      addToSyncQueue({ type: 'ADD_MOVEMENT', payload: log });
    }

    setIsMovementModalOpen(false);
    setMoveData({ quantity: 1, reason: '' });
  };

  const closeItemModal = () => { setIsItemModalOpen(false); setEditingItem(null); setFormData({}); };

  const filteredItems = useMemo(() => {
    let res = items;
    if (searchTerm) res = res.filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase()));
    if (deptFilter) res = res.filter(i => i.department === deptFilter);
    if (showLowStockOnly) res = res.filter(i => i.currentStock <= i.minStock);
    return res;
  }, [items, searchTerm, deptFilter, showLowStockOnly]);

  // -- Renderização --
  if (isLoading) return (
    <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="text-center">
        <Loader2 className="w-12 h-12 text-brand-600 animate-spin mx-auto mb-4" />
        <p className="text-slate-500 font-bold">Iniciando CARPA...</p>
      </div>
    </div>
  );

  if (!user) return (
    <div className={`h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 ${darkMode ? 'dark' : ''}`}>
      <div className="w-full max-w-md p-8 bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-700 mx-4">
        <div className="flex flex-col items-center mb-8">
          <Logo className="w-20 h-20 mb-4" />
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">Estoque CARPA</h1>
          <div className="flex gap-2 mt-4">
            {!isOnline && <div className="bg-orange-100 text-orange-600 text-[10px] px-2 py-1 rounded-full font-bold flex items-center gap-1"><WifiOff size={12}/> OFFLINE</div>}
            <div className="bg-emerald-100 text-emerald-600 text-[10px] px-2 py-1 rounded-full font-bold flex items-center gap-1"><Users size={12}/> {onlineUsersCount}/{MAX_USERS} ONLINE</div>
          </div>
        </div>
        {!isRegistering ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="relative">
              <UserCheck className="absolute left-3 top-3.5 text-slate-400" size={20} />
              <input type="text" value={badgeInput} onChange={e => setBadgeInput(e.target.value)} placeholder="Matrícula" className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-900 border rounded-xl dark:text-white outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <button className="w-full py-4 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-2xl shadow-lg transition transform active:scale-95">Entrar</button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <p className="text-xs text-blue-600 font-bold text-center">Nova matrícula detecteda. Como você se chama?</p>
            <input type="text" value={nameInput} onChange={e => setNameInput(e.target.value)} placeholder="Seu Nome Completo" className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border rounded-xl dark:text-white outline-none" required />
            <button className="w-full py-4 bg-brand-600 text-white font-bold rounded-2xl">Confirmar Cadastro</button>
            <button type="button" onClick={() => setIsRegistering(false)} className="w-full text-sm text-slate-500 font-bold">Voltar</button>
          </form>
        )}
      </div>
    </div>
  );

  return (
    <div className={`h-screen flex bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 ${darkMode ? 'dark' : ''}`}>
      {/* Sidebar Mobile */}
      {isSidebarOpen && <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setIsSidebarOpen(false)} />}
      
      <aside className={`fixed lg:static inset-y-0 left-0 w-64 bg-white dark:bg-slate-800 border-r z-50 transform transition-transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex flex-col h-full">
          <div className="p-6 border-b flex items-center gap-3">
            <Logo className="w-10 h-10" />
            <span className="font-black text-xl">CARPA</span>
          </div>
          <nav className="flex-1 p-4 space-y-2">
            {[
              { id: AppView.DASHBOARD, icon: LayoutDashboard, label: 'Geral' },
              { id: AppView.INVENTORY, icon: Package, label: 'Materiais' },
              { id: AppView.MOVEMENTS, icon: ArrowRightLeft, label: 'Histórico' },
              { id: AppView.SETTINGS, icon: Settings, label: 'Sistema' }
            ].map(v => (
              <button key={v.id} onClick={() => { setCurrentView(v.id); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 p-3 rounded-xl font-bold transition ${currentView === v.id ? 'bg-brand-500 text-white shadow-lg' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
                <v.icon size={20} /> {v.label}
              </button>
            ))}
          </nav>
          <div className="p-4 border-t space-y-4">
             <div className="flex items-center gap-3 px-2">
                <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900 flex items-center justify-center font-bold text-xs text-brand-600">{user.name[0]}</div>
                <div className="flex-1 truncate text-sm font-bold">{user.name.split(' ')[0]}</div>
                <button onClick={() => setUser(null)} className="text-red-500"><LogOut size={18}/></button>
             </div>
             <div className="flex gap-2">
                <button onClick={() => setDarkMode(!darkMode)} className="flex-1 p-2 bg-slate-100 dark:bg-slate-700 rounded-lg flex justify-center">{darkMode ? <Sun size={18}/> : <Moon size={18}/>}</button>
                <button onClick={() => fetchData()} className={`flex-1 p-2 bg-slate-100 dark:bg-slate-700 rounded-lg flex justify-center ${isSyncing ? 'animate-spin' : ''}`}><RefreshCw size={18}/></button>
             </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b bg-white dark:bg-slate-800 flex items-center justify-between px-4 lg:px-8">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2"><Menu /></button>
            <h1 className="font-black text-lg">{currentView}</h1>
          </div>
          <div className="flex items-center gap-4">
            {lastSync && (
              <div className="hidden md:flex items-center gap-1 text-[10px] text-slate-400 font-bold uppercase">
                <Clock size={12}/> Sincronizado: {lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
            {!isOnline && <WifiOff className="text-orange-500" size={20} />}
            <button onClick={() => { setEditingItem(null); setFormData({}); setIsItemModalOpen(true); }} className="bg-brand-600 text-white p-2 md:px-4 md:py-2 rounded-xl flex items-center gap-2 font-bold shadow-md hover:bg-brand-700 transition">
              <Plus size={20}/> <span className="hidden md:inline">Novo Item</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 lg:p-8">
          <div className="max-w-6xl mx-auto h-full">
            
            {currentView === AppView.DASHBOARD && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                   <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border shadow-sm">
                      <p className="text-xs text-slate-500 font-bold uppercase">Materiais Totais</p>
                      <h3 className="text-4xl font-black mt-1">{items.length}</h3>
                   </div>
                   <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border shadow-sm">
                      <p className="text-xs text-slate-500 font-bold uppercase">Estoque Baixo</p>
                      <h3 className="text-4xl font-black mt-1 text-red-500">{items.filter(i => i.currentStock <= i.minStock).length}</h3>
                   </div>
                   <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border shadow-sm">
                      <p className="text-xs text-slate-500 font-bold uppercase">Movimentos Hoje</p>
                      <h3 className="text-4xl font-black mt-1 text-emerald-500">
                        {movements.filter(m => new Date(m.timestamp).toDateString() === new Date().toDateString()).length}
                      </h3>
                   </div>
                </div>

                {items.length === 0 && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-12 rounded-3xl border-2 border-dashed border-blue-200 text-center">
                    <div className="bg-white dark:bg-slate-800 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                      <Search className="text-blue-500" size={32}/>
                    </div>
                    <h3 className="text-xl font-bold mb-2">Inventário Vazio no Celular?</h3>
                    <p className="text-slate-500 text-sm mb-6">Às vezes a rede demora a carregar os dados no primeiro acesso.</p>
                    <button onClick={() => fetchData()} className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-bold flex items-center gap-2 mx-auto hover:bg-blue-700 transition">
                      <RefreshCw className={isSyncing ? 'animate-spin' : ''} /> Tentar Carregar Agora
                    </button>
                  </div>
                )}
              </div>
            )}

            {currentView === AppView.INVENTORY && (
              <div className="space-y-4">
                <div className="flex flex-col md:flex-row gap-4 items-center mb-6">
                  <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-3 text-slate-400" size={18}/>
                    <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Pesquisar material..." className="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-800 border rounded-2xl outline-none focus:ring-2 focus:ring-brand-500 shadow-sm" />
                  </div>
                  <div className="flex gap-2 w-full md:w-auto">
                    <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="flex-1 md:w-48 p-3 bg-white dark:bg-slate-800 border rounded-2xl font-bold text-sm shadow-sm outline-none">
                      <option value="">Todos Deptos</option>
                      {departments.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <button onClick={() => setShowLowStockOnly(!showLowStockOnly)} className={`p-3 border rounded-2xl transition shadow-sm ${showLowStockOnly ? 'bg-red-500 text-white border-red-500' : 'bg-white dark:bg-slate-800 text-slate-500'}`}>
                      <AlertTriangle size={20}/>
                    </button>
                  </div>
                </div>

                {filteredItems.length === 0 ? (
                  <div className="text-center py-20 bg-white dark:bg-slate-800 rounded-3xl border border-dashed">
                    <Package className="mx-auto mb-4 text-slate-200" size={64} />
                    <p className="text-slate-400 font-bold">Nenhum material encontrado.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pb-20">
                    {filteredItems.map(item => (
                      <div key={item.id} className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden hover:shadow-xl transition flex flex-col">
                        <div className="aspect-video bg-slate-50 dark:bg-slate-900 relative">
                          {item.photoUrl ? (
                            <img src={item.photoUrl} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-200"><Package size={48}/></div>
                          )}
                          {item.currentStock <= item.minStock && (
                            <div className="absolute top-3 right-3 bg-red-500 text-white text-[10px] font-black px-2 py-1 rounded-full shadow-lg animate-pulse">CRÍTICO</div>
                          )}
                        </div>
                        <div className="p-5 flex-1 flex flex-col">
                          <h4 className="font-bold text-slate-900 dark:text-white truncate text-lg" title={item.name}>{item.name}</h4>
                          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-4">{item.department} • {item.location}</p>
                          <div className="flex items-end justify-between mt-auto">
                            <div>
                              <p className="text-[10px] text-slate-400 font-bold uppercase">Saldo Atual</p>
                              <p className={`text-3xl font-black ${item.currentStock <= item.minStock ? 'text-red-500' : 'text-brand-600 dark:text-brand-400'}`}>
                                {item.currentStock} <span className="text-sm font-normal text-slate-400">{item.unit}</span>
                              </p>
                            </div>
                            <div className="flex gap-1">
                               <button onClick={() => { setMovementItemId(item.id); setMovementType('IN'); setIsMovementModalOpen(true); }} className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl hover:bg-emerald-100 dark:bg-emerald-900/20"><Plus size={18}/></button>
                               <button onClick={() => { setMovementItemId(item.id); setMovementType('OUT'); setIsMovementModalOpen(true); }} className="p-3 bg-orange-50 text-orange-600 rounded-2xl hover:bg-orange-100 dark:bg-orange-900/20"><ArrowRightLeft size={18}/></button>
                               <button onClick={() => { setEditingItem(item); setFormData(item); setIsItemModalOpen(true); }} className="p-3 bg-slate-50 text-slate-500 rounded-2xl hover:bg-slate-100 dark:bg-slate-700"><Edit size={18}/></button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {currentView === AppView.MOVEMENTS && (
              <div className="bg-white dark:bg-slate-800 rounded-3xl border overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-400 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="px-6 py-4">Data</th>
                        <th className="px-6 py-4">Item</th>
                        <th className="px-6 py-4">Operação</th>
                        <th className="px-6 py-4 text-right">Qtd</th>
                        <th className="px-6 py-4">Usuário</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                      {movements.map(m => (
                        <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition">
                          <td className="px-6 py-4 text-slate-500">{new Date(m.timestamp).toLocaleDateString()}</td>
                          <td className="px-6 py-4 font-bold">{m.itemName}</td>
                          <td className="px-6 py-4">
                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${m.type === 'IN' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                              {m.type === 'IN' ? 'Entrada' : 'Saída'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right font-black">{m.quantity}</td>
                          <td className="px-6 py-4 text-xs font-bold text-slate-400">{m.userName.split(' ')[0]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {currentView === AppView.SETTINGS && (
              <div className="max-w-2xl mx-auto space-y-6">
                 <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl border shadow-sm">
                    <h3 className="font-black text-xl mb-6 flex items-center gap-2"><Database className="text-brand-500" /> Saúde do Sistema</h3>
                    <div className="space-y-4">
                       <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl">
                          <span className="text-sm font-bold text-slate-500">Conexão Realtime</span>
                          <span className={`flex items-center gap-1 text-xs font-black ${isOnline ? 'text-emerald-500' : 'text-orange-500'}`}>
                            {isOnline ? 'CONECTADO' : 'OFFLINE'}
                          </span>
                       </div>
                       <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl">
                          <span className="text-sm font-bold text-slate-500">Limites Simultâneos</span>
                          <span className="text-xs font-black">{onlineUsersCount} / {MAX_USERS} PESSOAS</span>
                       </div>
                       <button onClick={() => fetchData()} className="w-full py-4 bg-brand-600 text-white rounded-2xl font-bold shadow-lg hover:bg-brand-700 transition flex items-center justify-center gap-2">
                          <RefreshCw className={isSyncing ? 'animate-spin' : ''} /> Forçar Sincronização Geral
                       </button>
                    </div>
                 </div>
              </div>
            )}

          </div>
        </div>
      </main>

      {/* --- Modais --- */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b flex justify-between items-center">
              <h3 className="text-xl font-black">{editingItem ? 'Editar Material' : 'Novo Material'}</h3>
              <button onClick={closeItemModal} className="text-slate-400 p-2"><X /></button>
            </div>
            <form onSubmit={handleSaveItem} className="flex-1 overflow-y-auto p-6 space-y-6">
              
              <div className="flex flex-col items-center gap-4">
                <div className="w-40 h-40 rounded-3xl bg-slate-50 dark:bg-slate-900 border-2 border-dashed flex items-center justify-center overflow-hidden shadow-inner relative">
                  {formData.photoUrl ? <img src={formData.photoUrl} className="w-full h-full object-cover" /> : <Camera className="text-slate-300" size={40}/>}
                </div>
                <div className="flex gap-2 w-full max-w-xs">
                  <label className="flex-1 flex flex-col items-center justify-center gap-1 p-3 bg-brand-50 text-brand-600 rounded-2xl cursor-pointer hover:bg-brand-100 transition">
                    <Camera size={20}/> <span className="text-[10px] font-black uppercase">Câmera</span>
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => {
                      const f = e.target.files?.[0];
                      if(f) { const r = new FileReader(); r.onloadend = () => setFormData(p => ({...p, photoUrl: r.result as string})); r.readAsDataURL(f); }
                    }} />
                  </label>
                  <label className="flex-1 flex flex-col items-center justify-center gap-1 p-3 bg-slate-50 text-slate-500 rounded-2xl cursor-pointer hover:bg-slate-100 transition">
                    <ImageIcon size={20}/> <span className="text-[10px] font-black uppercase">Galeria</span>
                    <input type="file" accept="image/*" className="hidden" onChange={e => {
                      const f = e.target.files?.[0];
                      if(f) { const r = new FileReader(); r.onloadend = () => setFormData(p => ({...p, photoUrl: r.result as string})); r.readAsDataURL(f); }
                    }} />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs font-black text-slate-400 uppercase">Nome do Material</label>
                  <input required className="w-full p-3 bg-slate-50 dark:bg-slate-900 border rounded-2xl font-bold" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
                </div>
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase">Departamento</label>
                  <select className="w-full p-3 bg-slate-50 dark:bg-slate-900 border rounded-2xl font-bold" value={formData.department || ''} onChange={e => setFormData({...formData, department: e.target.value})}>
                    <option value="Geral">Geral</option>
                    {departments.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase">Locação</label>
                  <input className="w-full p-3 bg-slate-50 dark:bg-slate-900 border rounded-2xl font-bold" value={formData.location || ''} onChange={e => setFormData({...formData, location: e.target.value})} />
                </div>
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase">Estoque Mínimo</label>
                  <input type="number" className="w-full p-3 bg-slate-50 dark:bg-slate-900 border rounded-2xl font-bold" value={formData.minStock || ''} onChange={e => setFormData({...formData, minStock: Number(e.target.value)})} />
                </div>
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase">Saldo Inicial</label>
                  <input type="number" className="w-full p-3 bg-slate-50 dark:bg-slate-900 border rounded-2xl font-bold" value={formData.currentStock || ''} onChange={e => setFormData({...formData, currentStock: Number(e.target.value)})} />
                </div>
              </div>
            </form>
            <div className="p-6 border-t flex justify-end gap-3 bg-slate-50 dark:bg-slate-800/50">
              {editingItem && (
                 <button onClick={() => { setItemsToDelete([editingItem.id]); setIsDeleteModalOpen(true); }} className="text-red-500 font-bold px-4">Excluir</button>
              )}
              <button onClick={closeItemModal} className="px-6 py-3 font-bold text-slate-500">Cancelar</button>
              <button onClick={handleSaveItem} className="px-8 py-3 bg-brand-600 text-white rounded-2xl font-black shadow-lg">Salvar Material</button>
            </div>
          </div>
        </div>
      )}

      {isMovementModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-[40px] shadow-2xl w-full max-w-sm overflow-hidden">
             <div className={`p-8 text-center ${movementType === 'IN' ? 'bg-emerald-600' : 'bg-orange-600'} text-white`}>
                <h3 className="text-2xl font-black uppercase tracking-tighter">Registrar {movementType === 'IN' ? 'Entrada' : 'Saída'}</h3>
                <p className="text-xs text-white/80 mt-1 font-bold">{items.find(i => i.id === movementItemId)?.name}</p>
             </div>
             <form onSubmit={handleStockAction} className="p-8 space-y-6">
                <div>
                  <label className="text-center block text-xs font-black text-slate-400 uppercase mb-2">Quantidade</label>
                  <input type="number" min="1" required className="w-full text-5xl font-black text-center p-4 bg-slate-50 dark:bg-slate-900 border-none rounded-3xl" value={moveData.quantity} onChange={e => setMoveData({...moveData, quantity: Number(e.target.value)})} />
                </div>
                <div className="flex gap-4">
                  <button type="button" onClick={() => setIsMovementModalOpen(false)} className="flex-1 py-4 font-bold text-slate-400">Voltar</button>
                  <button type="submit" className={`flex-1 py-4 text-white font-black rounded-2xl shadow-xl transition ${movementType === 'IN' ? 'bg-emerald-600' : 'bg-orange-600'}`}>Confirmar</button>
                </div>
             </form>
          </div>
        </div>
      )}

      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
           <div className="bg-white dark:bg-slate-800 p-8 rounded-[40px] text-center max-w-xs w-full">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4"><Trash2 className="text-red-500" size={32}/></div>
              <h3 className="text-xl font-black mb-2">Apagar Material?</h3>
              <p className="text-slate-500 text-sm mb-6">Esta ação removerá permanentemente o item e todo seu histórico.</p>
              <div className="flex flex-col gap-2">
                 <button onClick={async () => {
                   const ids = itemsToDelete;
                   setItems(prev => prev.filter(i => !ids.includes(i.id)));
                   if (isOnline) await supabase.from('inventory_items').delete().in('id', ids);
                   setIsDeleteModalOpen(false);
                   closeItemModal();
                 }} className="w-full py-4 bg-red-600 text-white font-black rounded-2xl">Confirmar Exclusão</button>
                 <button onClick={() => setIsDeleteModalOpen(false)} className="w-full py-4 font-bold text-slate-400">Cancelar</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
