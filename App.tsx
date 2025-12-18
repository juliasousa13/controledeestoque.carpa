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
  Clock,
  ChevronRight
} from 'lucide-react';
import { InventoryItem, MovementLog, UserSession, AppView, UserProfile } from './types';
import { Logo } from './components/Logo';
import { generateProductDescription } from './services/geminiService';
import { supabase } from './services/supabaseClient';
import { saveOfflineData, loadOfflineData, addToSyncQueue, getSyncQueue, removeFromQueue } from './services/offlineStorage';
import { RealtimeChannel } from '@supabase/supabase-js';

const MAX_USERS = 20; // Aumentado para evitar bloqueios em múltiplos dispositivos

export default function App() {
  // -- Estado de Sistema --
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [user, setUser] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
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

  // -- Funções de Carga de Dados Robusta --
  const fetchData = useCallback(async (showLoader = true) => {
    if (!navigator.onLine) {
      setIsLoading(false);
      return;
    }
    if (showLoader) setIsSyncing(true);
    setSyncError(null);
    
    try {
      // Busca paralela de todas as tabelas essenciais
      const [it, mov, usr, dep] = await Promise.all([
        supabase.from('inventory_items').select('*').order('name'),
        supabase.from('movements').select('*').order('timestamp', { ascending: false }).limit(200),
        supabase.from('users').select('*'),
        supabase.from('departments').select('name').order('name')
      ]);

      if (it.error) throw it.error;

      // Importante: Só atualizar o estado se houver dados ou se for explicitamente um retorno vazio válido
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
    } catch (err: any) {
      console.error("Erro Crítico de Sincronia:", err);
      setSyncError("Não foi possível conectar ao banco de dados. Verifique sua internet.");
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  }, []);

  // -- Ciclo de Vida e Monitoramento --
  useEffect(() => {
    // 1. Prioridade Máxima: Carregar o que já existe no dispositivo para não abrir tela vazia
    const offline = loadOfflineData();
    if (offline.items?.length > 0) {
      setItems(offline.items);
      setMovements(offline.movements);
      setRegisteredUsers(offline.users);
      setDepartments(offline.depts);
      setIsLoading(false);
    }

    // 2. Monitorar Rede
    const handleOnline = () => { setIsOnline(true); fetchData(false); };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // 3. Primeira Busca no Servidor
    fetchData();

    // 4. Canais Realtime para Atualização Instantânea (Desktop -> Mobile)
    const dbChannel = supabase.channel('global_inventory')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' }, () => fetchData(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'movements' }, () => fetchData(false))
      .subscribe();

    const presenceRoom = supabase.channel('online_presence');
    presenceRoom
      .on('presence', { event: 'sync' }, () => {
        const state = presenceRoom.presenceState();
        setOnlineUsersCount(Object.keys(state).length);
      })
      .subscribe();
    setPresenceChannel(presenceRoom);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      supabase.removeChannel(dbChannel);
      supabase.removeChannel(presenceRoom);
    };
  }, [fetchData]);

  // Sincronizar dados locais quando o estado muda
  useEffect(() => {
    saveOfflineData(items, movements, registeredUsers, departments);
  }, [items, movements, registeredUsers, departments]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  // -- Lógica de Login e Permissões --
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (badgeInput.trim().length < 2) return;
    
    setIsLoading(true);
    const { data: userFromDB, error } = await supabase.from('users').select('*').eq('badge_id', badgeInput).single();
    
    if (userFromDB) {
      // Garantir que ele seja admin no sistema local e no DB
      const sessionUser: UserSession = { 
        badgeId: userFromDB.badge_id, 
        name: userFromDB.name, 
        role: 'admin' 
      };
      
      if (userFromDB.role !== 'admin') {
        await supabase.from('users').update({ role: 'admin' }).eq('badge_id', badgeInput);
      }
      
      setUser(sessionUser);
      fetchData(false);
    } else {
      setIsRegistering(true);
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) return;

    const newUser = { 
      badge_id: badgeInput, 
      name: nameInput, 
      role: 'admin', 
      created_at: new Date().toISOString() 
    };

    setIsLoading(true);
    const { error } = await supabase.from('users').insert(newUser);
    
    if (error) {
      alert("Erro ao cadastrar. Tente novamente.");
      setIsLoading(false);
      return;
    }

    setUser({ badgeId: newUser.badge_id, name: newUser.name, role: 'admin' });
    setIsRegistering(false);
    fetchData();
  };

  // -- Ações de Material --
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

    // Atualização otimista (mostra na hora)
    setItems(prev => editingItem ? prev.map(i => i.id === newItem.id ? newItem : i) : [newItem, ...prev]);

    const { error } = await supabase.from('inventory_items').upsert(mapToDB(newItem));
    
    if (error) {
      console.error("Erro ao salvar permanentemente:", error);
      alert("Atenção: Erro ao sincronizar com o servidor. O item está salvo apenas neste aparelho temporariamente.");
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
      alert("Estoque insuficiente no sistema!");
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

    const { error } = await Promise.all([
      supabase.from('inventory_items').update({ current_stock: newStock, last_updated: log.timestamp, last_updated_by: user?.name }).eq('id', item.id),
      supabase.from('movements').insert(log)
    ]);

    setIsMovementModalOpen(false);
    setMoveData({ quantity: 1, reason: '' });
  };

  const closeItemModal = () => { setIsItemModalOpen(false); setEditingItem(null); setFormData({}); };

  const filteredItems = useMemo(() => {
    let res = items;
    if (searchTerm) res = res.filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase()) || i.location.toLowerCase().includes(searchTerm.toLowerCase()));
    if (deptFilter) res = res.filter(i => i.department === deptFilter);
    if (showLowStockOnly) res = res.filter(i => i.currentStock <= i.minStock);
    return res;
  }, [items, searchTerm, deptFilter, showLowStockOnly]);

  // -- Renderização Mobile-Ready --
  if (isLoading && !items.length) return (
    <div className="h-screen flex items-center justify-center bg-white dark:bg-slate-900">
      <div className="flex flex-col items-center gap-4">
        <Logo className="w-16 h-16 animate-pulse" />
        <div className="flex items-center gap-2 text-brand-600 font-bold">
           <Loader2 className="animate-spin" /> Conectando ao Estoque...
        </div>
      </div>
    </div>
  );

  if (!user) return (
    <div className={`h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 ${darkMode ? 'dark' : ''}`}>
      <div className="w-full max-w-sm p-8 bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl border border-slate-100 dark:border-slate-800 mx-6">
        <div className="flex flex-col items-center mb-8">
          <Logo className="w-24 h-24 mb-6" />
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Login Sistema</h1>
          <p className="text-slate-400 text-sm font-medium">Controle Interno CARPA</p>
        </div>
        {!isRegistering ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="relative">
              <UserCheck className="absolute left-4 top-4 text-slate-400" size={20} />
              <input 
                type="text" 
                value={badgeInput} 
                onChange={e => setBadgeInput(e.target.value)} 
                placeholder="Sua Matrícula" 
                className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl dark:text-white font-bold placeholder:font-normal focus:ring-2 focus:ring-brand-500" 
              />
            </div>
            <button className="w-full py-4 bg-brand-600 hover:bg-brand-700 text-white font-black rounded-2xl shadow-xl shadow-brand-500/20 transition-all flex items-center justify-center gap-2">
              ACESSAR AGORA <ChevronRight size={20}/>
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4 animate-fade-in">
            <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-2xl border border-blue-100 dark:border-blue-800 mb-2">
               <p className="text-xs text-blue-700 dark:text-blue-300 font-bold leading-relaxed text-center">
                 A matrícula <span className="underline">{badgeInput}</span> não está no banco. Digite seu nome para criar seu acesso profissional:
               </p>
            </div>
            <input 
              type="text" 
              value={nameInput} 
              onChange={e => setNameInput(e.target.value)} 
              placeholder="Seu Nome Completo" 
              className="w-full px-4 py-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl dark:text-white font-bold outline-none" 
              required 
            />
            <button className="w-full py-4 bg-brand-600 text-white font-black rounded-2xl shadow-lg">CADASTRAR E ENTRAR</button>
            <button type="button" onClick={() => setIsRegistering(false)} className="w-full text-xs text-slate-400 font-bold uppercase tracking-widest">Voltar</button>
          </form>
        )}
      </div>
    </div>
  );

  return (
    <div className={`h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans ${darkMode ? 'dark' : ''}`}>
      {/* Sidebar - Mobile/Desktop Responsive */}
      {isSidebarOpen && <div className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)} />}
      
      <aside className={`fixed lg:static inset-y-0 left-0 w-72 bg-white dark:bg-slate-900 border-r dark:border-slate-800 z-50 transform transition-transform duration-300 ease-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex flex-col h-full p-6">
          <div className="flex items-center gap-4 mb-10 px-2">
            <Logo className="w-12 h-12" />
            <div>
              <p className="text-[10px] font-black text-brand-600 uppercase tracking-widest">Estoque Profissional</p>
              <h2 className="font-black text-2xl tracking-tighter">CARPA</h2>
            </div>
          </div>
          <nav className="flex-1 space-y-2">
            {[
              { id: AppView.DASHBOARD, icon: LayoutDashboard, label: 'Painel Geral' },
              { id: AppView.INVENTORY, icon: Package, label: 'Materiais em Estoque' },
              { id: AppView.MOVEMENTS, icon: ArrowRightLeft, label: 'Histórico de Fluxo' },
              { id: AppView.SETTINGS, icon: Settings, label: 'Configuração' }
            ].map(v => (
              <button 
                key={v.id} 
                onClick={() => { setCurrentView(v.id); setIsSidebarOpen(false); }} 
                className={`w-full flex items-center gap-4 p-4 rounded-2xl font-bold transition-all ${currentView === v.id ? 'bg-brand-600 text-white shadow-xl shadow-brand-500/20 scale-[1.02]' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
              >
                <v.icon size={22} /> {v.label}
              </button>
            ))}
          </nav>
          <div className="pt-6 border-t dark:border-slate-800 space-y-4">
             <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-900 flex items-center justify-center font-black text-brand-600 uppercase">{user.name[0]}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black truncate">{user.name.split(' ')[0]}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Mat: {user.badgeId}</p>
                </div>
                <button onClick={() => setUser(null)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors"><LogOut size={18}/></button>
             </div>
             <div className="flex gap-2">
                <button onClick={() => setDarkMode(!darkMode)} className="flex-1 p-3 bg-slate-100 dark:bg-slate-800 rounded-xl flex justify-center text-slate-500">{darkMode ? <Sun size={20}/> : <Moon size={20}/>}</button>
                <button onClick={() => fetchData()} className={`flex-1 p-3 bg-slate-100 dark:bg-slate-800 rounded-xl flex justify-center text-brand-600 ${isSyncing ? 'animate-spin' : ''}`}><RefreshCw size={20}/></button>
             </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-20 border-b dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between px-6 lg:px-10 z-30">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-3 bg-slate-50 dark:bg-slate-800 rounded-xl"><Menu size={24} /></button>
            <h1 className="font-black text-xl tracking-tight hidden sm:block">
               {currentView === AppView.DASHBOARD && "Painel de Controle"}
               {currentView === AppView.INVENTORY && "Gestão de Inventário"}
               {currentView === AppView.MOVEMENTS && "Histórico de Movimentos"}
               {currentView === AppView.SETTINGS && "Ajustes do Sistema"}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {!isOnline && (
              <div className="bg-orange-50 text-orange-600 px-3 py-1.5 rounded-full text-[10px] font-black flex items-center gap-2 animate-pulse">
                <WifiOff size={14}/> MODO OFFLINE
              </div>
            )}
            <button onClick={() => { setEditingItem(null); setFormData({}); setIsItemModalOpen(true); }} className="bg-brand-600 text-white px-5 py-3 rounded-2xl flex items-center gap-2 font-black shadow-lg shadow-brand-500/20 hover:scale-105 transition-transform">
              <Plus size={22}/> <span className="hidden md:inline">ADICIONAR ITEM</span>
            </button>
          </div>
        </header>

        {syncError && (
          <div className="bg-red-500 text-white px-6 py-3 flex items-center justify-between animate-fade-in shadow-lg">
             <div className="flex items-center gap-3 font-bold text-sm"><AlertCircle size={20}/> {syncError}</div>
             <button onClick={() => fetchData()} className="bg-white/20 px-4 py-1.5 rounded-lg text-xs font-black hover:bg-white/30 transition">RECONECTAR</button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 lg:p-10 scroll-smooth">
          <div className="max-w-7xl mx-auto h-full">
            
            {currentView === AppView.DASHBOARD && (
              <div className="space-y-8 animate-fade-in">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                   <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] border dark:border-slate-800 shadow-sm relative overflow-hidden group">
                      <div className="absolute -right-4 -top-4 w-24 h-24 bg-brand-500/5 rounded-full group-hover:scale-150 transition-transform" />
                      <p className="text-[11px] text-slate-400 font-black uppercase tracking-widest mb-1">Catálogo Ativo</p>
                      <h3 className="text-5xl font-black tracking-tighter">{items.length} <span className="text-lg font-bold text-slate-300 ml-1">itens</span></h3>
                   </div>
                   <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] border border-red-100 dark:border-red-900/20 shadow-sm relative overflow-hidden group">
                      <div className="absolute -right-4 -top-4 w-24 h-24 bg-red-500/5 rounded-full" />
                      <p className="text-[11px] text-red-400 font-black uppercase tracking-widest mb-1">Estoque Crítico</p>
                      <h3 className="text-5xl font-black tracking-tighter text-red-500">{items.filter(i => i.currentStock <= i.minStock).length} <span className="text-lg font-bold text-red-200 ml-1">alerta</span></h3>
                   </div>
                   <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] border border-emerald-100 dark:border-emerald-900/20 shadow-sm relative overflow-hidden group">
                      <div className="absolute -right-4 -top-4 w-24 h-24 bg-emerald-500/5 rounded-full" />
                      <p className="text-[11px] text-emerald-400 font-black uppercase tracking-widest mb-1">Movimentos Hoje</p>
                      <h3 className="text-5xl font-black tracking-tighter text-emerald-500">
                        {movements.filter(m => new Date(m.timestamp).toDateString() === new Date().toDateString()).length}
                      </h3>
                   </div>
                </div>

                {items.length === 0 && (
                  <div className="bg-white dark:bg-slate-900 p-16 rounded-[3rem] border-2 border-dashed dark:border-slate-800 text-center flex flex-col items-center max-w-2xl mx-auto shadow-2xl">
                    <div className="bg-slate-50 dark:bg-slate-800 w-24 h-24 rounded-full flex items-center justify-center mb-6 shadow-inner">
                      <Database className="text-brand-400" size={40}/>
                    </div>
                    <h3 className="text-2xl font-black mb-3">O Inventário parece vazio aqui?</h3>
                    <p className="text-slate-500 font-medium mb-8 leading-relaxed px-10">
                      Se você tem certeza que existem itens cadastrados mas não os vê, pode ser um atraso na rede móvel. Tente forçar uma carga direta agora:
                    </p>
                    <button onClick={() => fetchData()} className="bg-brand-600 text-white px-10 py-4 rounded-[1.5rem] font-black flex items-center gap-3 hover:scale-105 active:scale-95 transition-all shadow-xl shadow-brand-500/30">
                      <RefreshCw className={isSyncing ? 'animate-spin' : ''} /> SINCRONIZAR SERVIDOR
                    </button>
                  </div>
                )}

                <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border dark:border-slate-800 p-8 shadow-sm">
                   <h4 className="font-black text-lg mb-6 flex items-center gap-2"><Clock size={20} className="text-brand-500" /> Fluxo em Tempo Real</h4>
                   <div className="space-y-4">
                      {movements.slice(0, 5).map(m => (
                        <div key={m.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border dark:border-slate-800">
                           <div className="flex items-center gap-4">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black ${m.type === 'IN' ? 'bg-emerald-100 text-emerald-600' : 'bg-orange-100 text-orange-600'}`}>
                                 {m.type === 'IN' ? '+' : '-'}
                              </div>
                              <div>
                                <p className="font-bold text-sm">{m.itemName}</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">{m.userName.split(' ')[0]} • {new Date(m.timestamp).toLocaleTimeString()}</p>
                              </div>
                           </div>
                           <div className="font-black text-lg">{m.quantity}</div>
                        </div>
                      ))}
                   </div>
                </div>
              </div>
            )}

            {currentView === AppView.INVENTORY && (
              <div className="space-y-6 animate-fade-in">
                <div className="flex flex-col md:flex-row gap-4 items-center bg-white dark:bg-slate-900 p-4 rounded-[2rem] border dark:border-slate-800 shadow-sm sticky top-0 z-20">
                  <div className="relative flex-1 w-full">
                    <Search className="absolute left-4 top-3.5 text-slate-400" size={20}/>
                    <input 
                      value={searchTerm} 
                      onChange={e => setSearchTerm(e.target.value)} 
                      placeholder="Buscar por nome ou locação..." 
                      className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl outline-none focus:ring-2 focus:ring-brand-500 font-bold" 
                    />
                  </div>
                  <div className="flex gap-2 w-full md:w-auto">
                    <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="flex-1 md:w-56 p-3.5 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl font-black text-xs uppercase outline-none cursor-pointer">
                      <option value="">TODOS OS DEPTOS</option>
                      {departments.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <button onClick={() => setShowLowStockOnly(!showLowStockOnly)} className={`p-4 rounded-2xl transition-all shadow-md ${showLowStockOnly ? 'bg-red-500 text-white' : 'bg-white dark:bg-slate-800 text-slate-400'}`}>
                      <AlertTriangle size={20}/>
                    </button>
                  </div>
                </div>

                {filteredItems.length === 0 ? (
                  <div className="text-center py-32">
                    <Package className="mx-auto mb-6 text-slate-200" size={80} />
                    <p className="text-slate-400 font-black uppercase tracking-widest text-sm">Nenhum resultado para os filtros</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
                    {filteredItems.map(item => (
                      <div key={item.id} className="bg-white dark:bg-slate-900 rounded-[2.5rem] border dark:border-slate-800 shadow-sm overflow-hidden hover:shadow-2xl transition-all flex flex-col group">
                        <div className="aspect-square bg-slate-50 dark:bg-slate-800/50 relative overflow-hidden">
                          {item.photoUrl ? (
                            <img src={item.photoUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-200"><Package size={48}/></div>
                          )}
                          {item.currentStock <= item.minStock && (
                            <div className="absolute bottom-4 left-4 right-4 bg-red-600 text-white text-[10px] font-black px-4 py-2 rounded-xl text-center shadow-lg border border-red-400/30">
                              ESTOQUE CRÍTICO
                            </div>
                          )}
                        </div>
                        <div className="p-6 flex-1 flex flex-col">
                          <h4 className="font-black text-slate-900 dark:text-white truncate text-lg mb-1 leading-tight" title={item.name}>{item.name}</h4>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-6">{item.department} | {item.location}</p>
                          <div className="mt-auto flex items-end justify-between">
                            <div>
                              <p className="text-[9px] text-slate-400 font-black uppercase mb-1">SALDO ATUAL</p>
                              <p className={`text-4xl font-black tracking-tighter ${item.currentStock <= item.minStock ? 'text-red-600' : 'text-brand-600'}`}>
                                {item.currentStock}<span className="text-sm font-bold text-slate-300 ml-1">{item.unit.toLowerCase()}</span>
                              </p>
                            </div>
                            <div className="flex gap-1 bg-slate-50 dark:bg-slate-800 p-1.5 rounded-2xl">
                               <button onClick={() => { setMovementItemId(item.id); setMovementType('IN'); setIsMovementModalOpen(true); }} className="p-3 bg-white dark:bg-slate-700 text-emerald-600 rounded-xl shadow-sm hover:scale-110 transition-transform"><Plus size={18}/></button>
                               <button onClick={() => { setMovementItemId(item.id); setMovementType('OUT'); setIsMovementModalOpen(true); }} className="p-3 bg-white dark:bg-slate-700 text-orange-600 rounded-xl shadow-sm hover:scale-110 transition-transform"><ArrowRightLeft size={18}/></button>
                               <button onClick={() => { setEditingItem(item); setFormData(item); setIsItemModalOpen(true); }} className="p-3 bg-white dark:bg-slate-700 text-slate-400 rounded-xl shadow-sm hover:scale-110 transition-transform"><Edit size={18}/></button>
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
              <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border dark:border-slate-800 overflow-hidden shadow-sm animate-fade-in">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-400 font-black uppercase text-[10px] tracking-widest">
                      <tr>
                        <th className="px-8 py-6">Data de Registro</th>
                        <th className="px-8 py-6">Material</th>
                        <th className="px-8 py-6">Operação</th>
                        <th className="px-8 py-6 text-right">Quantidade</th>
                        <th className="px-8 py-6">Colaborador</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                      {movements.map(m => (
                        <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="px-8 py-6 text-slate-500 font-medium">{new Date(m.timestamp).toLocaleDateString()} {new Date(m.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</td>
                          <td className="px-8 py-6 font-black text-slate-900 dark:text-white">{m.itemName}</td>
                          <td className="px-8 py-6">
                            <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-tighter ${m.type === 'IN' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                              {m.type === 'IN' ? 'Entrada' : 'Saída'}
                            </span>
                          </td>
                          <td className="px-8 py-6 text-right font-black text-lg">{m.quantity}</td>
                          <td className="px-8 py-6">
                             <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[10px] font-black uppercase">{m.userName[0]}</div>
                                <span className="text-xs font-bold text-slate-500">{m.userName.split(' ')[0]}</span>
                             </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {currentView === AppView.SETTINGS && (
              <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
                 <div className="bg-white dark:bg-slate-900 p-10 rounded-[2.5rem] border dark:border-slate-800 shadow-sm">
                    <h3 className="font-black text-2xl mb-8 flex items-center gap-3"><Database className="text-brand-600" size={28} /> Diagnóstico de Conexão</h3>
                    <div className="space-y-4">
                       <div className="flex items-center justify-between p-5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border dark:border-slate-800">
                          <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Servidor Supabase</span>
                          <span className={`flex items-center gap-2 text-xs font-black ${isOnline ? 'text-emerald-500' : 'text-orange-500'}`}>
                            {isOnline ? <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"/> : <div className="w-2 h-2 rounded-full bg-orange-500"/>}
                            {isOnline ? 'ESTÁVEL & ONLINE' : 'MODO OFF-LINE'}
                          </span>
                       </div>
                       <div className="flex items-center justify-between p-5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border dark:border-slate-800">
                          <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Dispositivos Conectados</span>
                          <span className="text-xs font-black bg-brand-500 text-white px-3 py-1 rounded-full">{onlineUsersCount} ATIVOS</span>
                       </div>
                       <div className="pt-6 space-y-3">
                        <button onClick={() => fetchData()} className="w-full py-5 bg-brand-600 text-white rounded-[1.5rem] font-black shadow-xl shadow-brand-500/20 hover:bg-brand-700 transition flex items-center justify-center gap-3">
                            <RefreshCw className={isSyncing ? 'animate-spin' : ''} /> FORÇAR SINCRONIZAÇÃO COMPLETA
                        </button>
                        <p className="text-center text-[10px] text-slate-400 font-medium px-10">Use este botão caso o celular não esteja mostrando o mesmo estoque que o computador.</p>
                       </div>
                    </div>
                 </div>
              </div>
            )}

          </div>
        </div>
      </main>

      {/* --- Modais Profissionais --- */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-[3rem] shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] border dark:border-slate-800">
            <div className="p-8 border-b dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/30">
              <h3 className="text-2xl font-black tracking-tight">{editingItem ? 'Editar Cadastro' : 'Novo Material'}</h3>
              <button onClick={closeItemModal} className="text-slate-400 hover:text-slate-600 bg-white dark:bg-slate-800 p-2 rounded-xl shadow-sm"><X /></button>
            </div>
            <form onSubmit={handleSaveItem} className="flex-1 overflow-y-auto p-8 space-y-8">
              
              <div className="flex flex-col items-center gap-5">
                <div className="w-48 h-48 rounded-[2rem] bg-slate-100 dark:bg-slate-800 border-4 border-white dark:border-slate-700 flex items-center justify-center overflow-hidden shadow-2xl relative">
                  {formData.photoUrl ? <img src={formData.photoUrl} className="w-full h-full object-cover" /> : <Camera className="text-slate-300" size={48}/>}
                </div>
                <div className="flex gap-3 w-full max-w-xs">
                  <label className="flex-1 flex flex-col items-center justify-center gap-2 p-4 bg-brand-600 text-white rounded-2xl cursor-pointer hover:bg-brand-700 transition shadow-lg shadow-brand-500/30">
                    <Camera size={24}/> <span className="text-[10px] font-black uppercase">Tirar Foto</span>
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => {
                      const f = e.target.files?.[0];
                      if(f) { const r = new FileReader(); r.onloadend = () => setFormData(p => ({...p, photoUrl: r.result as string})); r.readAsDataURL(f); }
                    }} />
                  </label>
                  <label className="flex-1 flex flex-col items-center justify-center gap-2 p-4 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-2xl cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition">
                    <ImageIcon size={24}/> <span className="text-[10px] font-black uppercase">Galeria</span>
                    <input type="file" accept="image/*" className="hidden" onChange={e => {
                      const f = e.target.files?.[0];
                      if(f) { const r = new FileReader(); r.onloadend = () => setFormData(p => ({...p, photoUrl: r.result as string})); r.readAsDataURL(f); }
                    }} />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="col-span-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Identificação do Material</label>
                  <input required className="w-full p-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl font-bold text-lg focus:ring-2 focus:ring-brand-500 transition-all" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Nome completo do produto" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Setor Responsável</label>
                  <select className="w-full p-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl font-bold cursor-pointer" value={formData.department || 'Geral'} onChange={e => setFormData({...formData, department: e.target.value})}>
                    <option value="Geral">ESTOQUE GERAL</option>
                    {departments.map(d => <option key={d} value={d}>{d.toUpperCase()}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Locação Exata</label>
                  <input className="w-full p-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl font-bold" value={formData.location || ''} onChange={e => setFormData({...formData, location: e.target.value})} placeholder="Ex: Armário A, Prateleira 4" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Limite de Alerta</label>
                  <input type="number" className="w-full p-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl font-bold" value={formData.minStock || ''} onChange={e => setFormData({...formData, minStock: Number(e.target.value)})} placeholder="Avisar quando chegar em..." />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Saldo em Mãos</label>
                  <input type="number" className="w-full p-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl font-bold" value={formData.currentStock || ''} onChange={e => setFormData({...formData, currentStock: Number(e.target.value)})} placeholder="Quantidade contada hoje" />
                </div>
              </div>
            </form>
            <div className="p-8 border-t dark:border-slate-800 flex justify-end gap-4 bg-slate-50 dark:bg-slate-800/30">
              {editingItem && (
                 <button onClick={() => { setItemsToDelete([editingItem.id]); setIsDeleteModalOpen(true); }} className="text-red-500 font-black text-xs uppercase tracking-widest px-6 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-2xl transition-colors">Excluir Permanente</button>
              )}
              <button onClick={closeItemModal} className="px-6 py-4 font-black text-slate-400 text-xs uppercase tracking-widest">Cancelar</button>
              <button onClick={handleSaveItem} className="px-10 py-4 bg-brand-600 text-white rounded-2xl font-black shadow-xl shadow-brand-500/20 active:scale-95 transition-transform">SALVAR NO SISTEMA</button>
            </div>
          </div>
        </div>
      )}

      {isMovementModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-[3rem] shadow-2xl w-full max-w-sm overflow-hidden border dark:border-slate-800">
             <div className={`p-10 text-center ${movementType === 'IN' ? 'bg-emerald-600' : 'bg-orange-600'} text-white relative`}>
                <div className="absolute top-4 left-0 right-0 text-[10px] font-black uppercase tracking-[0.2em] opacity-50">Movimentação</div>
                <h3 className="text-3xl font-black uppercase tracking-tighter mt-2">{movementType === 'IN' ? 'Entrada' : 'Saída'}</h3>
                <p className="text-xs text-white/90 mt-2 font-bold max-w-[80%] mx-auto">{items.find(i => i.id === movementItemId)?.name}</p>
             </div>
             <form onSubmit={handleStockAction} className="p-10 space-y-8">
                <div>
                  <label className="text-center block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Quantidade Alterada</label>
                  <input 
                    type="number" 
                    min="1" 
                    required 
                    autoFocus
                    className="w-full text-6xl font-black text-center p-6 bg-slate-50 dark:bg-slate-800 border-none rounded-[2rem] dark:text-white" 
                    value={moveData.quantity} 
                    onChange={e => setMoveData({...moveData, quantity: Number(e.target.value)})} 
                  />
                </div>
                <div className="flex flex-col gap-3">
                  <button type="submit" className={`w-full py-5 text-white font-black rounded-2xl shadow-2xl transition-all active:scale-95 ${movementType === 'IN' ? 'bg-emerald-600 shadow-emerald-500/30' : 'bg-orange-600 shadow-orange-500/30'}`}>
                    CONFIRMAR {movementType === 'IN' ? 'ENTRADA' : 'SAÍDA'}
                  </button>
                  <button type="button" onClick={() => setIsMovementModalOpen(false)} className="w-full py-4 font-black text-slate-400 text-xs tracking-widest uppercase">Voltar</button>
                </div>
             </form>
          </div>
        </div>
      )}

      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in">
           <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] text-center max-w-xs w-full shadow-2xl border dark:border-slate-800">
              <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6"><Trash2 className="text-red-500" size={36}/></div>
              <h3 className="text-2xl font-black mb-2 tracking-tight">Tem certeza?</h3>
              <p className="text-slate-500 text-sm mb-8 font-medium leading-relaxed">Esta ação é <b>permanente</b> e todos os registros sumirão de todos os aparelhos.</p>
              <div className="flex flex-col gap-3">
                 <button onClick={async () => {
                   const ids = itemsToDelete;
                   setItems(prev => prev.filter(i => !ids.includes(i.id)));
                   await supabase.from('inventory_items').delete().in('id', ids);
                   setIsDeleteModalOpen(false);
                   closeItemModal();
                   fetchData(false);
                 }} className="w-full py-5 bg-red-600 text-white font-black rounded-2xl shadow-xl shadow-red-500/20 active:scale-95 transition-transform">APAGAR PARA SEMPRE</button>
                 <button onClick={() => setIsDeleteModalOpen(false)} className="w-full py-4 font-black text-slate-400 text-xs tracking-widest uppercase">Não, manter item</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
