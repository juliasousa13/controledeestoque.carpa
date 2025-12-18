
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  LayoutDashboard, 
  Package, 
  ArrowRightLeft, 
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
  Box,
  ChevronRight,
  Sparkles,
  Info,
  Database,
  History,
  Activity,
  User as UserIcon,
  Edit3,
  Users as UsersGroup,
  FileText
} from 'lucide-react';
import { InventoryItem, MovementLog, UserSession, AppView, UserProfile } from './types';
import { Logo } from './components/Logo';
import { supabase } from './services/supabaseClient';
import { saveOfflineData, loadOfflineData, addToSyncQueue, getSyncQueue, removeFromQueue } from './services/offlineStorage';
import { generateProductInsights } from './services/geminiService';

export default function App() {
  // -- Sistema e UI --
  const [darkMode, setDarkMode] = useState<boolean>(true); // Padrão escuro
  const [user, setUser] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // -- Dados --
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<MovementLog[]>([]);
  const [registeredUsers, setRegisteredUsers] = useState<UserProfile[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  
  // -- Navegação --
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  const [inventoryDisplay, setInventoryDisplay] = useState<'GRID' | 'LIST'>('GRID');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState('');

  // -- Modais e Forms --
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [movementType, setMovementType] = useState<'IN' | 'OUT'>('IN');
  const [movementItemId, setMovementItemId] = useState<string>('');
  const [formData, setFormData] = useState<Partial<InventoryItem>>({});
  const [moveData, setMoveData] = useState({ quantity: 1, reason: '' });
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);

  // -- Mapeamento DB --
  const mapFromDB = (i: any): InventoryItem => ({
    id: String(i.id), 
    name: i.name || '', 
    unit: i.unit || 'UND', 
    minStock: Number(i.min_stock) || 0,
    currentStock: Number(i.current_stock) || 0, 
    location: i.location || '', 
    department: i.department || '',
    photoUrl: i.photo_url, 
    description: i.description, 
    lastUpdated: i.last_updated || new Date().toISOString(),
    lastUpdatedBy: i.last_updated_by || 'Sistema',
    lastUpdatedByBadge: i.last_updated_by_badge || '0000'
  });

  const mapToDB = (i: InventoryItem) => ({
    id: i.id, 
    name: i.name, 
    unit: i.unit, 
    min_stock: i.minStock,
    current_stock: i.currentStock, 
    location: i.location, 
    department: i.department,
    photo_url: i.photoUrl, 
    description: i.description, 
    last_updated: i.lastUpdated,
    last_updated_by: i.lastUpdatedBy,
    last_updated_by_badge: i.lastUpdatedByBadge
  });

  const fetchData = useCallback(async (showLoader = true) => {
    if (!navigator.onLine) {
      const offline = loadOfflineData();
      if (offline.items) setItems(offline.items);
      setIsLoading(false);
      return;
    }
    
    if (showLoader) setIsSyncing(true);
    try {
      const [it, mov, usr, dep] = await Promise.all([
        supabase.from('inventory_items').select('*').order('name'),
        supabase.from('movements').select('*').order('timestamp', { ascending: false }).limit(50),
        supabase.from('users').select('*').order('name'),
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
    } catch (err) {
      console.error("Erro na carga de dados:", err);
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  }, []);

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !user) return;

    const itemToSave: InventoryItem = {
      id: editingItem?.id || Date.now().toString(),
      name: formData.name,
      unit: formData.unit || 'UND',
      minStock: Number(formData.minStock) || 0,
      currentStock: Number(formData.currentStock) || 0,
      location: (formData.location || '').toUpperCase(),
      department: (formData.department || '').toUpperCase(),
      photoUrl: formData.photoUrl,
      description: formData.description,
      lastUpdated: new Date().toISOString(),
      lastUpdatedBy: user.name,
      lastUpdatedByBadge: user.badgeId
    };

    const isNew = !editingItem;
    const logAction = {
      item_id: itemToSave.id,
      item_name: itemToSave.name,
      type: isNew ? 'CREATE' : 'EDIT',
      quantity: 0,
      user_badge_id: user.badgeId,
      user_name: user.name,
      timestamp: itemToSave.lastUpdated,
      reason: isNew ? 'Cadastro de novo material' : 'Edição de informações'
    };

    if (isOnline) {
      await Promise.all([
        supabase.from('inventory_items').upsert(mapToDB(itemToSave)),
        supabase.from('movements').insert(logAction)
      ]);
      fetchData(false);
    }
    setIsItemModalOpen(false);
    setEditingItem(null);
    setFormData({});
  };

  const handleDeleteItem = async () => {
    if (!editingItem || !user || !confirm('Confirmar EXCLUSÃO DEFINITIVA deste material?')) return;

    const logAction = {
      item_id: editingItem.id,
      item_name: editingItem.name,
      type: 'DELETE',
      quantity: 0,
      user_badge_id: user.badgeId,
      user_name: user.name,
      timestamp: new Date().toISOString(),
      reason: 'Exclusão definitiva de item'
    };

    if (isOnline) {
      await Promise.all([
        supabase.from('inventory_items').delete().eq('id', editingItem.id),
        supabase.from('movements').insert(logAction)
      ]);
      fetchData(false);
    }
    setIsItemModalOpen(false);
    setEditingItem(null);
  };

  const handleStockAction = async (e: React.FormEvent) => {
    e.preventDefault();
    const item = items.find(i => i.id === movementItemId);
    if (!item || !user) return;

    const qty = Number(moveData.quantity);
    const newStock = movementType === 'IN' ? item.currentStock + qty : item.currentStock - qty;
    
    const log = {
      item_id: item.id,
      item_name: item.name,
      type: movementType,
      quantity: qty,
      user_badge_id: user.badgeId,
      user_name: user.name,
      timestamp: new Date().toISOString(),
      reason: moveData.reason
    };

    if (isOnline) {
      await Promise.all([
        supabase.from('inventory_items').update({ 
          current_stock: newStock, 
          last_updated: log.timestamp, 
          last_updated_by: user.name,
          last_updated_by_badge: user.badgeId
        }).eq('id', item.id),
        supabase.from('movements').insert(log)
      ]);
      fetchData(false);
    }
    setIsMovementModalOpen(false);
    setMoveData({ quantity: 1, reason: '' });
  };

  const handleAIGenerate = async () => {
    if (!formData.name) return;
    setIsGeneratingAI(true);
    const res = await generateProductInsights(formData.name, formData.department || 'Almoxarifado');
    if (res) setFormData(p => ({ ...p, description: res.description }));
    setIsGeneratingAI(false);
  };

  useEffect(() => {
    fetchData();
    const hOnline = () => setIsOnline(true);
    const hOffline = () => setIsOnline(false);
    window.addEventListener('online', hOnline);
    window.addEventListener('offline', hOffline);
    return () => {
      window.removeEventListener('online', hOnline);
      window.removeEventListener('offline', hOffline);
    };
  }, [fetchData]);

  const filteredItems = useMemo(() => {
    let res = items;
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      res = res.filter(i => i.name.toLowerCase().includes(s) || i.location.toLowerCase().includes(s));
    }
    if (deptFilter) res = res.filter(i => i.department === deptFilter);
    return res;
  }, [items, searchTerm, deptFilter]);

  const stats = useMemo(() => {
    const total = items.length;
    const low = items.filter(i => i.currentStock <= i.minStock).length;
    const movesToday = movements.filter(m => new Date(m.timestamp).toDateString() === new Date().toDateString()).length;
    return { total, low, movesToday };
  }, [items, movements]);

  // --- Sub-componente de Login (Para evitar bug de re-render no input) ---
  const LoginView = () => {
    const [badge, setBadge] = useState('');
    const [name, setName] = useState('');
    const [isReg, setIsReg] = useState(false);
    const [localLoading, setLocalLoading] = useState(false);

    const onLoginSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!badge) return;
      setLocalLoading(true);
      const { data } = await supabase.from('users').select('*').eq('badge_id', badge).single();
      if (data) {
        setUser({ badgeId: data.badge_id, name: data.name, role: data.role });
      } else {
        setIsReg(true);
      }
      setLocalLoading(false);
    };

    const onRegSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!badge || !name) return;
      setLocalLoading(true);
      await supabase.from('users').insert({ badge_id: badge, name, role: 'staff' });
      setUser({ badgeId: badge, name, role: 'staff' });
      setLocalLoading(false);
    };

    return (
      <div className={`h-screen flex items-center justify-center p-6 ${darkMode ? 'bg-[#020617]' : 'bg-slate-100'}`}>
        <div className={`w-full max-w-[460px] p-12 rounded-[4rem] shadow-2xl border ${darkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200'} backdrop-blur-xl animate-in zoom-in duration-500`}>
          <div className="flex flex-col items-center mb-12 text-center">
            <Logo className="w-24 h-24 mb-8" />
            <h1 className={`text-4xl font-black tracking-tighter mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>CARPA INVENTORY</h1>
            <p className="text-[10px] font-black text-brand-500 uppercase tracking-[0.3em]">Operação de Suprimentos</p>
          </div>
          
          <form onSubmit={isReg ? onRegSubmit : onLoginSubmit} className="space-y-6">
            <div className="group">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-4 mb-3 block tracking-widest">Matrícula Operacional</label>
              <div className="relative">
                <UserCheck className="absolute left-7 top-1/2 -translate-y-1/2 text-slate-400" size={24} />
                <input 
                  type="text" 
                  value={badge} 
                  onChange={e => setBadge(e.target.value)} 
                  placeholder="Seu ID" 
                  className={`w-full pl-18 pr-8 py-7 rounded-[2.5rem] font-black transition-all outline-none text-xl shadow-inner ${darkMode ? 'bg-slate-950/50 text-white focus:border-brand-500 border-2 border-transparent' : 'bg-slate-50 border-2 border-transparent focus:border-brand-500'}`} 
                />
              </div>
            </div>
            {isReg && (
              <div className="group animate-in slide-in-from-top-4">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-4 mb-3 block tracking-widest">Nome do Colaborador</label>
                <input 
                  type="text" 
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                  placeholder="Nome Completo" 
                  className={`w-full px-8 py-7 rounded-[2.5rem] font-black transition-all outline-none text-xl shadow-inner ${darkMode ? 'bg-slate-950/50 text-white focus:border-brand-500 border-2 border-transparent' : 'bg-slate-50 border-2 border-transparent focus:border-brand-500'}`} 
                />
              </div>
            )}
            <button disabled={localLoading} className="w-full py-7 bg-brand-600 text-white font-black rounded-[2.5rem] shadow-xl hover:bg-brand-700 active:scale-95 transition-all text-lg tracking-widest flex justify-center items-center">
              {localLoading ? <Loader2 className="animate-spin" /> : (isReg ? 'CADASTRAR E ENTRAR' : 'AUTENTICAR')}
            </button>
            {isReg && <button type="button" onClick={() => setIsReg(false)} className="w-full text-[10px] font-black text-slate-400 uppercase py-2">Voltar</button>}
          </form>
        </div>
      </div>
    );
  };

  if (isLoading) return (
    <div className={`h-screen flex flex-col items-center justify-center ${darkMode ? 'bg-[#020617]' : 'bg-white'}`}>
      <Logo className="w-24 h-24 mb-8 animate-pulse" />
      <Loader2 className="animate-spin text-brand-600" size={40} />
    </div>
  );

  if (!user) return <LoginView />;

  return (
    <div className={`h-screen flex font-sans transition-colors duration-500 ${darkMode ? 'bg-[#020617] text-white' : 'bg-slate-50 text-slate-900'}`}>
      {/* Sidebar - Visual Renovado */}
      <aside className={`fixed lg:static inset-y-0 left-0 w-80 z-50 transform transition-transform duration-500 border-r ${darkMode ? 'bg-slate-900/40 border-slate-800' : 'bg-white border-slate-200'} backdrop-blur-3xl ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex flex-col h-full p-10">
          <div className="flex items-center gap-5 mb-16">
            <Logo className="w-14 h-14" />
            <div className="flex flex-col">
              <span className="font-black text-3xl tracking-tighter leading-none">CARPA</span>
              <span className="text-[10px] font-black text-brand-500 uppercase tracking-widest">Inventory</span>
            </div>
          </div>
          
          <nav className="flex-1 space-y-4">
            {[
              { id: AppView.DASHBOARD, icon: LayoutDashboard, label: 'Visão Geral' },
              { id: AppView.INVENTORY, icon: Package, label: 'Almoxarifado' },
              { id: AppView.MOVEMENTS, icon: History, label: 'Audit Log' },
              { id: AppView.USERS, icon: UsersGroup, label: 'Equipe' }
            ].map(v => (
              <button 
                key={v.id} 
                onClick={() => { setCurrentView(v.id); setIsSidebarOpen(false); }} 
                className={`w-full flex items-center gap-5 p-6 rounded-[2rem] font-black text-sm transition-all ${currentView === v.id ? 'bg-brand-600 text-white shadow-2xl shadow-brand-500/20' : 'text-slate-400 hover:bg-brand-500/10'}`}
              >
                <v.icon size={22} /> {v.label}
              </button>
            ))}
          </nav>

          <div className="mt-auto pt-10 border-t border-slate-800 space-y-6">
             <div className={`p-6 rounded-[2.5rem] border ${darkMode ? 'bg-slate-950/50 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-brand-600 flex items-center justify-center font-black text-white">{user.name[0]}</div>
                  <div className="flex-1 truncate">
                    <p className="text-sm font-black truncate">{user.name}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Matrícula: {user.badgeId}</p>
                  </div>
                </div>
                <button onClick={() => setUser(null)} className="w-full py-3 bg-red-500/10 text-red-500 text-[10px] font-black uppercase rounded-xl hover:bg-red-500 hover:text-white transition-all">Sair</button>
             </div>
             <div className="flex gap-3">
                <button onClick={() => setDarkMode(!darkMode)} className={`flex-1 py-5 rounded-[1.5rem] flex justify-center border transition-all ${darkMode ? 'bg-slate-900 border-slate-800 text-brand-400' : 'bg-white border-slate-200 text-slate-500'}`}>{darkMode ? <Sun size={20}/> : <Moon size={20}/>}</button>
                <button onClick={() => fetchData(true)} className={`flex-1 py-5 rounded-[1.5rem] flex justify-center border transition-all ${darkMode ? 'bg-slate-900 border-slate-800 text-brand-400' : 'bg-white border-slate-200 text-brand-500'} ${isSyncing ? 'animate-spin' : ''}`}><RefreshCw size={20}/></button>
             </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className={`h-28 border-b flex items-center justify-between px-10 lg:px-14 z-30 sticky top-0 ${darkMode ? 'bg-[#020617]/80 border-slate-800' : 'bg-white/80 border-slate-200'} backdrop-blur-2xl`}>
          <div className="flex items-center gap-6">
            <button onClick={() => setIsSidebarOpen(true)} className={`lg:hidden p-5 rounded-[1.5rem] ${darkMode ? 'bg-slate-900' : 'bg-slate-100'}`}><Menu size={24}/></button>
            <h2 className="font-black text-3xl tracking-tighter hidden sm:block">
              {currentView === AppView.DASHBOARD && "Painel de Controle"}
              {currentView === AppView.INVENTORY && "Suprimentos Ativos"}
              {currentView === AppView.MOVEMENTS && "Audit Log de Equipe"}
              {currentView === AppView.USERS && "Membros Registrados"}
            </h2>
          </div>

          <button 
            onClick={() => { setEditingItem(null); setFormData({}); setIsItemModalOpen(true); }}
            className="bg-brand-600 hover:bg-brand-700 text-white px-10 py-5 rounded-[2rem] flex items-center gap-4 font-black text-sm shadow-[0_20px_40px_-10px_rgba(37,99,235,0.3)] transition-all active:scale-95 group"
          >
            <Plus size={22} className="group-hover:rotate-90 transition-transform" /> <span className="hidden md:inline uppercase tracking-widest">Novo Item</span>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-10 lg:p-14 bg-transparent">
          <div className="max-w-7xl mx-auto space-y-12">
            
            {currentView === AppView.DASHBOARD && (
              <div className="space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                   <div className={`p-10 rounded-[3.5rem] border flex flex-col group overflow-hidden relative ${darkMode ? 'bg-slate-900/40 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
                      <div className="w-16 h-16 bg-blue-500/10 rounded-[1.5rem] flex items-center justify-center text-brand-500 mb-10"><Box size={32}/></div>
                      <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">Total no Acervo</span>
                      <h3 className="text-6xl font-black tracking-tighter">{stats.total}</h3>
                      <Activity className="absolute -bottom-6 -right-6 text-brand-500/10 w-40 h-40 rotate-12" />
                   </div>
                   <div className={`p-10 rounded-[3.5rem] border flex flex-col relative overflow-hidden ${darkMode ? 'bg-red-900/10 border-red-900/30' : 'bg-red-50 border-red-100 shadow-sm'}`}>
                      <div className="w-16 h-16 bg-red-500/10 rounded-[1.5rem] flex items-center justify-center text-red-500 mb-10"><AlertTriangle size={32}/></div>
                      <span className="text-[11px] font-black text-red-400 uppercase tracking-widest mb-2">Abaixo do Mínimo</span>
                      <h3 className="text-6xl font-black tracking-tighter text-red-600">{stats.low}</h3>
                   </div>
                   <div className={`p-10 rounded-[3.5rem] border flex flex-col relative overflow-hidden ${darkMode ? 'bg-emerald-900/10 border-emerald-900/30' : 'bg-emerald-50 border-emerald-100 shadow-sm'}`}>
                      <div className="w-16 h-16 bg-emerald-500/10 rounded-[1.5rem] flex items-center justify-center text-emerald-500 mb-10"><Activity size={32}/></div>
                      <span className="text-[11px] font-black text-emerald-400 uppercase tracking-widest mb-2">Ações de Hoje</span>
                      <h3 className="text-6xl font-black tracking-tighter text-emerald-600">{stats.movesToday}</h3>
                   </div>
                </div>

                <div className={`p-14 rounded-[4.5rem] border overflow-hidden group ${darkMode ? 'bg-slate-900/40 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
                   <div className="flex items-center justify-between mb-12">
                      <div>
                        <h4 className="text-4xl font-black tracking-tighter">Eventos Recentes</h4>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-2">Últimas 8 movimentações autorizadas</p>
                      </div>
                   </div>
                   <div className="space-y-4">
                      {movements.slice(0, 8).map(m => (
                        <div key={m.id} className={`flex items-center gap-8 p-8 rounded-[2.5rem] border transition-all ${darkMode ? 'bg-slate-950/40 border-slate-800 hover:bg-slate-800/60' : 'bg-slate-50 border-slate-100 hover:bg-white'}`}>
                           <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center shadow-lg ${
                             m.type === 'IN' ? 'bg-emerald-100 text-emerald-600' : m.type === 'OUT' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'
                           }`}>
                              {m.type === 'IN' ? <TrendingUp size={28}/> : m.type === 'OUT' ? <TrendingDown size={28}/> : <Activity size={28}/>}
                           </div>
                           <div className="flex-1 min-w-0">
                              <p className="text-xl font-black truncate mb-1">{m.itemName}</p>
                              <div className="flex items-center gap-3">
                                <span className="text-[10px] font-black bg-brand-600 text-white px-3 py-1 rounded-full uppercase tracking-widest">{m.userName}</span>
                                <span className="text-[11px] font-bold text-slate-400">• {new Date(m.timestamp).toLocaleTimeString()}</span>
                              </div>
                           </div>
                           <div className="text-right">
                              {m.quantity !== 0 && (
                                <p className={`text-4xl font-black ${m.type === 'IN' ? 'text-emerald-600' : 'text-orange-600'}`}>
                                  {m.type === 'IN' ? '+' : '-'}{m.quantity}
                                </p>
                              )}
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{m.type}</p>
                           </div>
                        </div>
                      ))}
                   </div>
                </div>
              </div>
            )}

            {currentView === AppView.INVENTORY && (
              <div className="space-y-12 animate-in fade-in duration-700">
                <div className={`p-6 rounded-[3rem] border flex items-center gap-6 ${darkMode ? 'bg-slate-900/40 border-slate-800' : 'bg-white border-slate-200'}`}>
                  <div className="relative flex-1">
                    <Search className="absolute left-8 top-1/2 -translate-y-1/2 text-slate-500" size={24}/>
                    <input 
                      value={searchTerm} 
                      onChange={e => setSearchTerm(e.target.value)} 
                      placeholder="Buscar material ou prateleira..." 
                      className={`w-full pl-20 pr-8 py-6 border-none rounded-[2rem] outline-none font-black text-lg shadow-inner ${darkMode ? 'bg-slate-950/50 text-white placeholder:text-slate-600' : 'bg-slate-50 text-slate-900'}`} 
                    />
                  </div>
                  <div className="flex gap-3">
                     <button onClick={() => setInventoryDisplay('GRID')} className={`p-5 rounded-[1.5rem] ${inventoryDisplay === 'GRID' ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/20' : 'text-slate-400'}`}><LayoutGrid size={24}/></button>
                     <button onClick={() => setInventoryDisplay('LIST')} className={`p-5 rounded-[1.5rem] ${inventoryDisplay === 'LIST' ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/20' : 'text-slate-400'}`}><ListIcon size={24}/></button>
                  </div>
                </div>

                {inventoryDisplay === 'GRID' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-10">
                    {filteredItems.map(item => {
                      const isLow = item.currentStock <= item.minStock;
                      return (
                        <div key={item.id} className={`group rounded-[3.5rem] border transition-all duration-500 overflow-hidden flex flex-col hover:shadow-3xl hover:scale-[1.02] ${darkMode ? 'bg-slate-900/40 border-slate-800' : 'bg-white border-slate-200'}`}>
                          <div className={`aspect-square relative overflow-hidden ${darkMode ? 'bg-slate-950/50' : 'bg-slate-100'}`}>
                             {item.photoUrl ? <img src={item.photoUrl} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" /> : <div className="w-full h-full flex items-center justify-center text-slate-800/20"><Package size={100}/></div>}
                             {isLow && <div className="absolute top-8 right-8 bg-red-600 text-white text-[10px] font-black px-4 py-2 rounded-full shadow-2xl animate-pulse">ALERTA REPOSIÇÃO</div>}
                             <div className="absolute top-8 left-8 bg-brand-600/90 backdrop-blur-md px-3 py-1.5 rounded-xl text-[10px] font-black text-white shadow-lg">{item.location}</div>
                          </div>
                          <div className="p-10 flex-1 flex flex-col">
                             <h4 className="font-black text-2xl tracking-tighter leading-none mb-2 truncate">{item.name}</h4>
                             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">{item.department}</p>
                             <div className="mt-auto pt-8 border-t border-slate-800/50 flex items-center justify-between">
                                <div>
                                   <p className="text-[10px] text-slate-500 font-black uppercase mb-1 tracking-widest">Saldo</p>
                                   <p className={`text-5xl font-black tracking-tighter ${isLow ? 'text-red-600' : ''}`}>{item.currentStock}<span className="text-sm font-bold ml-1 opacity-50">{item.unit}</span></p>
                                </div>
                                <div className="flex gap-2">
                                   <button onClick={() => { setMovementItemId(item.id); setMovementType('IN'); setIsMovementModalOpen(true); }} className="p-4 bg-emerald-500/10 text-emerald-500 rounded-2xl hover:bg-emerald-600 hover:text-white transition-all"><TrendingUp size={24}/></button>
                                   <button onClick={() => { setMovementItemId(item.id); setMovementType('OUT'); setIsMovementModalOpen(true); }} className="p-4 bg-orange-500/10 text-orange-500 rounded-2xl hover:bg-orange-600 hover:text-white transition-all"><TrendingDown size={24}/></button>
                                   <button onClick={() => { setEditingItem(item); setFormData(item); setIsItemModalOpen(true); }} className={`p-4 rounded-2xl transition-all ${darkMode ? 'bg-slate-800 text-slate-400 hover:text-white' : 'bg-slate-100 text-slate-500'}`}><Edit3 size={24}/></button>
                                </div>
                             </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className={`rounded-[4rem] border overflow-hidden ${darkMode ? 'bg-slate-900/40 border-slate-800' : 'bg-white border-slate-200'}`}>
                    <table className="w-full text-left">
                      <thead>
                        <tr className={darkMode ? 'bg-slate-800/50' : 'bg-slate-50'}>
                          <th className="p-10 text-[11px] font-black uppercase text-slate-500 tracking-widest">Material</th>
                          <th className="p-10 text-[11px] font-black uppercase text-slate-500 tracking-widest">Endereço</th>
                          <th className="p-10 text-[11px] font-black uppercase text-slate-500 tracking-widest text-center">Saldo</th>
                          <th className="p-10 text-[11px] font-black uppercase text-slate-500 tracking-widest text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                        {filteredItems.map(item => (
                          <tr key={item.id} className="hover:bg-brand-500/5 transition-colors">
                            <td className="p-10">
                              <div className="flex items-center gap-6">
                                <div className="w-16 h-16 rounded-2xl overflow-hidden bg-slate-950/40">
                                  {item.photoUrl ? <img src={item.photoUrl} className="w-full h-full object-cover" /> : <Package className="m-auto h-full opacity-10" size={24} />}
                                </div>
                                <p className="text-xl font-black">{item.name}</p>
                              </div>
                            </td>
                            <td className="p-10">
                              <p className="font-bold text-brand-500">{item.location}</p>
                              <p className="text-[10px] text-slate-500 uppercase font-black">{item.department}</p>
                            </td>
                            <td className="p-10 text-center">
                              <span className={`text-4xl font-black ${item.currentStock <= item.minStock ? 'text-red-600' : ''}`}>{item.currentStock}</span>
                              <span className="text-[10px] font-black ml-2 opacity-30">{item.unit}</span>
                            </td>
                            <td className="p-10 text-right">
                               <div className="flex justify-end gap-2">
                                  <button onClick={() => { setMovementItemId(item.id); setMovementType('IN'); setIsMovementModalOpen(true); }} className="p-4 bg-emerald-500/10 text-emerald-500 rounded-2xl hover:bg-emerald-600 hover:text-white transition-all"><Plus size={22}/></button>
                                  <button onClick={() => { setMovementItemId(item.id); setMovementType('OUT'); setIsMovementModalOpen(true); }} className="p-4 bg-orange-500/10 text-orange-500 rounded-2xl hover:bg-orange-600 hover:text-white transition-all"><TrendingDown size={22}/></button>
                                  <button onClick={() => { setEditingItem(item); setFormData(item); setIsItemModalOpen(true); }} className="p-4 bg-slate-800 text-slate-400 rounded-2xl"><Edit3 size={22}/></button>
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

      {/* --- Modais --- */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-xl animate-in fade-in duration-300">
          <div className={`rounded-[4.5rem] shadow-3xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col border border-slate-800 scale-in-center ${darkMode ? 'bg-slate-900' : 'bg-white'}`}>
            <div className={`p-12 border-b flex justify-between items-center ${darkMode ? 'bg-slate-950/50 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div>
                <h3 className="text-4xl font-black tracking-tighter">{editingItem ? 'Ficha Técnica' : 'Novo Material'}</h3>
                <p className="text-[11px] text-brand-500 font-black uppercase tracking-[0.3em] mt-2">Autorizado por: {user.badgeId}</p>
              </div>
              <button onClick={() => setIsItemModalOpen(false)} className={`p-5 rounded-[2rem] shadow-xl hover:text-red-500 transition-all ${darkMode ? 'bg-slate-800 text-slate-400' : 'bg-white text-slate-400'}`}><X size={28} /></button>
            </div>
            <form onSubmit={handleSaveItem} className="flex-1 overflow-y-auto p-14 space-y-12">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
                <div className="lg:col-span-4 flex flex-col items-center">
                  <div className={`w-full aspect-square rounded-[3.5rem] border-8 flex items-center justify-center overflow-hidden shadow-2xl mb-8 relative group border-double ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-white'}`}>
                    {formData.photoUrl ? <img src={formData.photoUrl} className="w-full h-full object-cover" /> : <Camera className="text-slate-800 opacity-20" size={100}/>}
                  </div>
                  <div className="flex gap-4 w-full">
                    <label className="flex-1 flex flex-col items-center p-8 bg-brand-600 text-white rounded-[2rem] cursor-pointer hover:bg-brand-700 transition shadow-xl active:scale-95">
                      <Camera size={32} className="mb-2"/> <span className="text-[10px] font-black uppercase tracking-widest">Câmera</span>
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => {
                        const f = e.target.files?.[0];
                        if(f) { const r = new FileReader(); r.onloadend = () => setFormData(p => ({...p, photoUrl: r.result as string})); r.readAsDataURL(f); }
                      }} />
                    </label>
                    <label className={`flex-1 flex flex-col items-center p-8 rounded-[2rem] cursor-pointer transition active:scale-95 border ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                      <ImageIcon size={32} className="mb-2"/> <span className="text-[10px] font-black uppercase tracking-widest">Galeria</span>
                      <input type="file" accept="image/*" className="hidden" onChange={e => {
                        const f = e.target.files?.[0];
                        if(f) { const r = new FileReader(); r.onloadend = () => setFormData(p => ({...p, photoUrl: r.result as string})); r.readAsDataURL(f); }
                      }} />
                    </label>
                  </div>
                </div>
                <div className="lg:col-span-8 space-y-10">
                    <div className="group">
                      <div className="flex items-center justify-between mb-4 ml-4">
                        <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Nome do Material</label>
                        <button type="button" disabled={isGeneratingAI || !formData.name} onClick={handleAIGenerate} className="flex items-center gap-3 text-[11px] font-black text-brand-500 uppercase tracking-[0.2em] bg-brand-500/10 px-5 py-2 rounded-full hover:bg-brand-600 hover:text-white transition-all disabled:opacity-30"><Sparkles size={16} /> IA</button>
                      </div>
                      <input required className={`w-full p-8 border-4 border-transparent focus:border-brand-500 rounded-[2.5rem] font-black text-2xl transition-all outline-none shadow-inner ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'}`} value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="EX: VÁLVULA SOLENOIDE 220V" />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-8">
                      <div className="group">
                        <label className="text-[11px] font-black text-slate-500 uppercase mb-4 block ml-4 tracking-widest">Setor / Departamento</label>
                        <input className={`w-full p-8 border-none rounded-[2rem] font-bold text-lg outline-none shadow-inner uppercase ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'}`} value={formData.department || ''} onChange={e => setFormData({...formData, department: e.target.value})} placeholder="MANUTENÇÃO" />
                      </div>
                      <div className="group">
                        <label className="text-[11px] font-black text-slate-500 uppercase mb-4 block ml-4 tracking-widest">Prateleira / Localização</label>
                        <input className={`w-full p-8 border-none rounded-[2rem] font-bold text-lg outline-none shadow-inner uppercase ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'}`} value={formData.location || ''} onChange={e => setFormData({...formData, location: e.target.value})} placeholder="P-01-A" />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-8">
                      <div>
                        <label className="text-[11px] font-black text-slate-500 uppercase mb-4 block ml-4">Unidade</label>
                        <input className={`w-full p-8 border-none rounded-[2rem] font-black outline-none uppercase text-center shadow-inner ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'}`} value={formData.unit || 'UND'} onChange={e => setFormData({...formData, unit: e.target.value})} />
                      </div>
                      <div>
                        <label className="text-[11px] font-black text-slate-500 uppercase mb-4 block ml-4">Mínimo</label>
                        <input type="number" className={`w-full p-8 border-none rounded-[2rem] font-black outline-none text-center shadow-inner ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'}`} value={formData.minStock || 0} onChange={e => setFormData({...formData, minStock: Number(e.target.value)})} />
                      </div>
                      <div>
                        <label className="text-[11px] font-black text-slate-500 uppercase mb-4 block ml-4">Atual</label>
                        <input type="number" disabled={!!editingItem} className={`w-full p-8 border-none rounded-[2rem] font-black outline-none text-center disabled:opacity-40 shadow-inner ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'}`} value={formData.currentStock || 0} onChange={e => setFormData({...formData, currentStock: Number(e.target.value)})} />
                      </div>
                    </div>

                    <div className="group relative">
                      <label className="text-[11px] font-black text-slate-500 uppercase block mb-4 ml-4">Observações Técnicas</label>
                      <textarea className={`w-full p-8 border-none rounded-[2.5rem] font-medium text-lg outline-none resize-none min-h-[160px] shadow-inner ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'}`} value={formData.description || ''} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Detalhes para controle..." />
                    </div>
                </div>
              </div>
            </form>
            <div className={`p-12 border-t flex justify-between items-center ${darkMode ? 'bg-slate-950/50 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              {editingItem && (
                <button type="button" onClick={handleDeleteItem} className="flex items-center gap-3 px-12 py-7 bg-red-500/10 text-red-500 rounded-[2.5rem] font-black uppercase text-xs hover:bg-red-500 hover:text-white transition-all"><Trash2 size={20} /> Deletar Ativo</button>
              )}
              <div className="flex gap-6 ml-auto">
                <button onClick={() => setIsItemModalOpen(false)} className="px-12 py-7 font-black text-slate-400 text-xs uppercase tracking-widest">Anular</button>
                <button onClick={handleSaveItem} className="px-20 py-7 bg-brand-600 text-white rounded-[2.5rem] font-black shadow-xl hover:bg-brand-700 active:scale-95 transition-all uppercase tracking-widest">Gravar Alterações</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Movimentação - Foco na Matricula */}
      {isMovementModalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-8 bg-slate-950/95 backdrop-blur-2xl animate-in fade-in">
           <div className={`rounded-[5rem] shadow-3xl w-full max-w-lg overflow-hidden border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
              <div className={`p-16 text-center ${movementType === 'IN' ? 'bg-emerald-600' : 'bg-orange-600'} text-white`}>
                 <Logo className="w-16 h-16 mx-auto mb-8 opacity-40 grayscale invert" />
                 <h3 className="text-5xl font-black uppercase tracking-tighter mb-4">{movementType === 'IN' ? 'Entrada' : 'Saída'}</h3>
                 <p className="text-[11px] font-black opacity-80 uppercase tracking-widest truncate px-10">{items.find(i => i.id === movementItemId)?.name}</p>
              </div>
              <form onSubmit={handleStockAction} className="p-16 space-y-12">
                 <div className="space-y-6 text-center">
                    <label className="text-[12px] font-black text-slate-500 uppercase tracking-widest">Quantidade</label>
                    <input 
                      type="number" 
                      min="1" 
                      required 
                      autoFocus 
                      className={`w-full text-9xl font-black text-center p-14 border-none rounded-[4rem] outline-none shadow-inner ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'}`} 
                      value={moveData.quantity} 
                      onChange={e => setMoveData({...moveData, quantity: Number(e.target.value)})} 
                    />
                 </div>
                 <div className="space-y-6">
                    <label className="text-[12px] font-black text-slate-500 uppercase tracking-widest ml-4">Motivo / OS</label>
                    <input 
                      type="text" 
                      placeholder="Ex: Manutenção Preventiva" 
                      className={`w-full p-6 border-none rounded-2xl outline-none font-bold text-center ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'}`} 
                      value={moveData.reason} 
                      onChange={e => setMoveData({...moveData, reason: e.target.value})} 
                    />
                 </div>
                 <button type="submit" className={`w-full py-10 text-white text-xl font-black rounded-[3rem] shadow-2xl transition-all active:scale-95 uppercase tracking-widest ${movementType === 'IN' ? 'bg-emerald-600' : 'bg-orange-600'}`}>
                   Confirmar e Registrar
                 </button>
                 <button type="button" onClick={() => setIsMovementModalOpen(false)} className="w-full text-[11px] font-black text-slate-500 uppercase py-5">Cancelar</button>
              </form>
           </div>
        </div>
      )}
    </div>
  );
}
