import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  LayoutDashboard, Package, Plus, Search, Trash2, Moon, Sun, Menu, X, 
  Camera, AlertTriangle, Loader2, RefreshCw, TrendingDown, History, 
  Edit3, Users as UsersIcon, CheckCircle2, User as UserIcon, LogOut, 
  Database, Settings, Download, Filter, Sparkles, DatabaseZap, Clock, 
  CheckSquare, Square, Image as ImageIcon, MoreVertical, ChevronRight,
  Activity, ArrowUpRight, ArrowDownRight, ClipboardList, MapPin, Layers,
  ArrowRight, BarChart3, FileSpreadsheet, ShieldCheck, Wifi, WifiOff,
  UserCog, Smartphone, Check, MinusCircle
} from 'lucide-react';
import { InventoryItem, MovementLog, UserSession, AppView, UserProfile, Department } from './types';
import { Logo } from './components/Logo';
import { supabase } from './services/supabaseClient';
import { saveOfflineData, loadOfflineData, addToSyncQueue, getSyncQueue, removeFromQueue } from './services/offlineStorage';
import { generateProductInsights } from './services/geminiService';

declare const XLSX: any;
declare const Chart: any;

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
  const [isDeleting, setIsDeleting] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastSync, setLastSync] = useState<Date | null>(() => {
    const saved = localStorage.getItem('carpa_last_sync');
    return saved ? new Date(saved) : null;
  });
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('TODOS');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

  // Login state
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
  const [userFormData, setUserFormData] = useState<Partial<UserProfile>>({});
  const [moveData, setMoveData] = useState({ quantity: 1, reason: '' });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const userPhotoInputRef = useRef<HTMLInputElement>(null);
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<any>(null);

  // --- Network status ---
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // --- Data Fetching ---
  const fetchData = useCallback(async (showLoader = true) => {
    if (showLoader) setIsSyncing(true);
    try {
      const [itRes, movRes, userRes, depRes] = await Promise.all([
        supabase.from('inventory_items').select('*').eq('is_active', true).order('name'),
        supabase.from('movements').select('*').order('timestamp', { ascending: false }).limit(500),
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
      const now = new Date();
      setLastSync(now);
      localStorage.setItem('carpa_last_sync', now.toISOString());
    } catch (e) {
      console.error("Erro ao carregar dados:", e);
      const cached = loadOfflineData();
      if (items.length === 0) setItems(cached.items || []);
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  }, [items.length]);

  useEffect(() => {
    fetchData();
    const channel = supabase.channel('global-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' }, () => fetchData(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'movements' }, () => fetchData(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => fetchData(false))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  // --- Chart Lifecycle ---
  useEffect(() => {
    if (currentView === AppView.DASHBOARD && chartRef.current && movements.length > 0) {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }

      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      });

      const inData = last7Days.map(dateStr => {
        return movements
          .filter(m => m.type === 'IN' && new Date(m.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) === dateStr)
          .reduce((acc, curr) => acc + curr.quantity, 0);
      });

      const outData = last7Days.map(dateStr => {
        return movements
          .filter(m => m.type === 'OUT' && new Date(m.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) === dateStr)
          .reduce((acc, curr) => acc + curr.quantity, 0);
      });

      const ctx = chartRef.current.getContext('2d');
      chartInstance.current = new Chart(ctx, {
        type: 'line',
        data: {
          labels: last7Days,
          datasets: [
            {
              label: 'Entradas',
              data: inData,
              borderColor: '#10b981',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              borderWidth: 3,
              tension: 0.4,
              fill: true,
              pointRadius: 4,
              pointBackgroundColor: '#10b981'
            },
            {
              label: 'Saídas',
              data: outData,
              borderColor: '#f97316',
              backgroundColor: 'rgba(249, 115, 22, 0.1)',
              borderWidth: 3,
              tension: 0.4,
              fill: true,
              pointRadius: 4,
              pointBackgroundColor: '#f97316'
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'top',
              labels: {
                usePointStyle: true,
                font: { size: 10, weight: '800' },
                color: darkMode ? '#94a3b8' : '#64748b'
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              grid: { color: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
              ticks: { font: { size: 9, weight: '700' }, color: '#94a3b8' }
            },
            x: {
              grid: { display: false },
              ticks: { font: { size: 9, weight: '700' }, color: '#94a3b8' }
            }
          }
        }
      });
    }
  }, [currentView, movements, darkMode]);

  // --- Handlers ---
  const handleInitialLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const { data: dbUsers } = await supabase.from('users').select('*').eq('badge_id', tempBadge.trim());
    if (dbUsers && dbUsers.length > 0) {
      const u = dbUsers[0];
      const session = { badgeId: u.badge_id, name: u.name, role: u.role, photoUrl: u.photo_url };
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
    const newUser = { 
      badge_id: tempBadge.trim(), 
      name: tempName.trim().toUpperCase(), 
      role: 'Colaborador',
      created_at: new Date().toISOString()
    };
    await supabase.from('users').upsert(newUser);
    const session = { badgeId: newUser.badge_id, name: newUser.name, role: newUser.role };
    setUser(session);
    localStorage.setItem('carpa_user', JSON.stringify(session));
    fetchData();
  };

  const handleStockAction = async (e: React.FormEvent) => {
    e.preventDefault();
    const item = items.find(i => i.id === activeItemId);
    if (!item || !user) return;

    const qty = Math.abs(Number(moveData.quantity));
    const newStock = movementType === 'IN' ? item.current_stock + qty : item.current_stock - qty;

    if (newStock < 0) {
      alert("Operação negada: O estoque não pode ficar negativo.");
      return;
    }

    setIsSyncing(true);
    const now = new Date().toISOString();
    
    const { error: itemErr } = await supabase.from('inventory_items').update({ 
      current_stock: newStock, 
      last_updated: now, 
      last_updated_by: user.name 
    }).eq('id', item.id);

    if (!itemErr) {
      await supabase.from('movements').insert({
        id: `MOV-${Date.now()}`,
        item_id: item.id,
        item_name: item.name,
        type: movementType,
        quantity: qty,
        user_badge_id: user.badgeId,
        user_name: user.name,
        timestamp: now,
        reason: moveData.reason || (movementType === 'IN' ? 'Entrada Manual' : 'Saída Manual')
      });
    }

    setIsMovementModalOpen(false);
    setMoveData({ quantity: 1, reason: '' });
    fetchData(false);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !formData.name) return;

    setIsSyncing(true);
    const isEditing = !!editingItem;
    const now = new Date().toISOString();
    
    const itemData = {
      id: isEditing ? editingItem!.id : `IT-${Date.now()}`,
      name: formData.name.toUpperCase(),
      unit: (formData.unit || 'UND').toUpperCase(),
      current_stock: Number(formData.current_stock) || 0,
      min_stock: Number(formData.min_stock) || 0,
      department: (formData.department || 'GERAL').toUpperCase(),
      location: (formData.location || 'N/A').toUpperCase(),
      photo_url: formData.photo_url || null,
      last_updated: now,
      last_updated_by: user.name,
      is_active: true
    };

    const { error } = await supabase.from('inventory_items').upsert(itemData);
    
    if (!error) {
      await supabase.from('movements').insert({
        id: `LOG-${Date.now()}`,
        item_id: itemData.id,
        item_name: itemData.name,
        type: isEditing ? 'EDIT' : 'CREATE',
        quantity: itemData.current_stock,
        user_badge_id: user.badgeId,
        user_name: user.name,
        timestamp: now
      });
    }

    setIsItemModalOpen(false);
    setEditingItem(null);
    setFormData({});
    fetchData(false);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setIsSyncing(true);

    const updatedData = {
      ...editingUser,
      name: userFormData.name?.toUpperCase(),
      role: userFormData.role,
      badge_id: userFormData.badge_id,
      photo_url: userFormData.photo_url
    };

    const { error } = await supabase.from('users').upsert(updatedData).eq('badge_id', editingUser.badge_id);
    
    if (!error) {
      if (user?.badgeId === editingUser.badge_id) {
        const newSession = { 
          badgeId: updatedData.badge_id, 
          name: updatedData.name, 
          role: updatedData.role,
          photoUrl: updatedData.photo_url
        };
        setUser(newSession);
        localStorage.setItem('carpa_user', JSON.stringify(newSession));
      }
      setIsUserModalOpen(false);
      setEditingUser(null);
      fetchData(false);
    } else {
      alert("Erro ao salvar colaborador.");
      setIsSyncing(false);
    }
  };

  const handleDeleteBatch = async () => {
    if (selectedItemIds.length === 0 || isDeleting) return;
    const count = selectedItemIds.length;
    const msg = count === items.length 
      ? `🚨 ATENÇÃO CRÍTICA: Você está prestes a excluir TODO o inventário (${count} itens). Esta ação é irreversível. Confirmar?`
      : `Deseja excluir permanentemente os ${count} itens selecionados?`;
      
    if (!window.confirm(msg)) return;

    setIsDeleting(true);
    setIsSyncing(true);
    
    try {
      // Usando .in() com array de IDs para soft-delete
      const { error } = await supabase
        .from('inventory_items')
        .update({ is_active: false })
        .in('id', selectedItemIds);

      if (error) throw error;

      // Feedback imediato limpando a seleção local
      const deletedIds = new Set(selectedItemIds);
      setItems(prev => prev.filter(item => !deletedIds.has(item.id)));
      setSelectedItemIds([]);
      
      // Sincroniza com o banco para garantir consistência
      await fetchData(false);
      
      // Notificação sutil (opcional, aqui usamos alerta simples se necessário)
    } catch (e) {
      console.error("Erro na exclusão:", e);
      alert("Houve um problema ao processar a exclusão. Verifique sua conexão.");
    } finally {
      setIsDeleting(false);
      setIsSyncing(false);
    }
  };

  const handleExport = () => {
    const data = movements.map(m => ({
      DATA: new Date(m.timestamp).toLocaleString(),
      MATERIAL: m.item_name,
      TIPO: m.type === 'IN' ? 'Entrada' : m.type === 'OUT' ? 'Saída' : m.type,
      QTD: m.quantity,
      COLABORADOR: m.user_name,
      OBSERVAÇÃO: m.reason || ''
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Auditoria");
    XLSX.writeFile(wb, `relatorio_estoque_${Date.now()}.xlsx`);
  };

  const handleDownloadTemplate = () => {
    const headers = [
      {
        'NOME DO MATERIAL': 'EX: MARRETA 2KG',
        'UNIDADE DE MEDIDA': 'UND',
        'ESTOQUE MÍNIMO': 5,
        'LOCALIZAÇÃO': 'PRATELEIRA A1',
        'DEPARTAMENTO': 'ALMOXARIFADO',
        'SALDO INICIAL': 10
      }
    ];
    const ws = XLSX.utils.json_to_sheet(headers);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template Importação");
    XLSX.writeFile(wb, "template_importacao_estoque.xlsx");
  };

  // --- Filtering ---
  const filteredItems = useMemo(() => {
    const s = searchTerm.toLowerCase();
    return items.filter(i => {
      const matchSearch = !s || i.name.toLowerCase().includes(s) || (i.location && i.location.toLowerCase().includes(s));
      const matchDept = selectedDept === 'TODOS' || i.department === selectedDept;
      return matchSearch && matchDept;
    });
  }, [items, searchTerm, selectedDept]);

  const handleSelectAll = () => {
    const visibleIds = filteredItems.map(i => i.id);
    const allVisibleSelected = visibleIds.every(id => selectedItemIds.includes(id));

    if (allVisibleSelected && visibleIds.length > 0) {
      // Desmarca apenas os que estão visíveis
      setSelectedItemIds(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      // Adiciona os visíveis à seleção existente (evita duplicatas com Set)
      setSelectedItemIds(prev => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const stats = useMemo(() => ({
    critical: items.filter(i => i.current_stock <= i.min_stock).length,
    total: items.length
  }), [items]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('carpa_theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const activeItem = useMemo(() => items.find(i => i.id === activeItemId), [items, activeItemId]);
  const futureStock = useMemo(() => {
    if (!activeItem) return 0;
    const qty = Number(moveData.quantity) || 0;
    return movementType === 'IN' ? activeItem.current_stock + qty : activeItem.current_stock - qty;
  }, [activeItem, moveData.quantity, movementType]);

  const isFutureCritical = useMemo(() => {
    if (!activeItem) return false;
    return futureStock <= activeItem.min_stock;
  }, [activeItem, futureStock]);

  if (isLoading && items.length === 0) return (
    <div className="h-screen flex flex-col items-center justify-center bg-slate-100 dark:bg-[#020617]">
      <Logo className="w-16 h-16 mb-4 animate-pulse" />
      <p className="text-[10px] font-black text-brand-600 uppercase tracking-[0.2em] flex items-center gap-2">
        <Loader2 className="animate-spin" size={16} /> Carregando Inventário
      </p>
    </div>
  );

  if (!user) return (
    <div className="h-screen flex items-center justify-center bg-slate-100 dark:bg-[#020617] p-6">
      <div className="w-full max-sm:px-4">
        <div className="w-full max-w-sm mx-auto bg-white dark:bg-slate-900 rounded-[2.5rem] p-10 shadow-2xl border border-slate-200 dark:border-slate-800 text-center animate-in zoom-in duration-300">
          <Logo className="w-20 h-20 mx-auto mb-8 shadow-xl" />
          <h1 className="text-2xl font-black tracking-tighter mb-1 dark:text-white">AG SYSTEM</h1>
          <p className="text-[9px] font-black text-brand-500 uppercase tracking-widest mb-10">Controle de Estoque</p>
          
          {loginStep === 'BADGE' ? (
            <form onSubmit={handleInitialLogin} className="space-y-4">
              <input autoFocus required value={tempBadge} onChange={e => setTempBadge(e.target.value)} placeholder="MATRÍCULA" className="w-full py-4 rounded-xl bg-slate-50 dark:bg-slate-950 text-center font-black outline-none border-2 border-transparent focus:border-brand-500 text-lg shadow-inner dark:text-white" />
              <button type="submit" className="w-full py-4 bg-brand-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-95 transition-all">ACESSAR</button>
            </form>
          ) : (
            <form onSubmit={handleFinalizeLogin} className="space-y-4">
              <input autoFocus required value={tempName} onChange={e => setTempName(e.target.value)} placeholder="NOME COMPLETO" className="w-full py-4 rounded-xl bg-slate-50 dark:bg-slate-950 text-center font-black outline-none border-2 border-transparent focus:border-brand-500 text-base shadow-inner uppercase dark:text-white" />
              <div className="flex gap-2">
                <button type="button" onClick={() => setLoginStep('BADGE')} className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-xl font-black uppercase text-[10px]">Voltar</button>
                <button type="submit" className="flex-[2] py-4 bg-emerald-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-xl">Cadastrar</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-screen flex flex-col lg:flex-row bg-[#f8fafc] dark:bg-[#020617] text-slate-900 dark:text-white overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 w-64 z-50 transform transition-transform duration-300 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex flex-col h-full p-6">
          <div className="flex items-center gap-3 mb-10">
            <Logo className="w-10 h-10" />
            <span className="font-black text-xl tracking-tighter">AG SYSTEM</span>
          </div>
          <nav className="flex-1 space-y-1">
            {[
              { id: AppView.DASHBOARD, icon: LayoutDashboard, label: 'Painel' },
              { id: AppView.INVENTORY, icon: Package, label: 'Almoxarifado' },
              { id: AppView.MOVEMENTS, icon: History, label: 'Auditoria' },
              { id: AppView.SETTINGS, icon: Settings, label: 'Configurações' }
            ].map(v => (
              <button key={v.id} onClick={() => { setCurrentView(v.id); setIsSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 p-3.5 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all ${currentView === v.id ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/20' : 'text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-brand-500'}`}>
                <v.icon size={18} /> {v.label}
              </button>
            ))}
          </nav>
          <div className="mt-auto pt-6 border-t dark:border-slate-800">
            <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl mb-4">
              <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white font-black text-sm overflow-hidden">
                {user.photoUrl ? <img src={user.photoUrl} className="w-full h-full object-cover"/> : user.name.charAt(0)}
              </div>
              <div className="truncate">
                <p className="text-[10px] font-black uppercase truncate leading-tight">{user.name}</p>
                <p className="text-[7px] font-bold text-slate-400 uppercase">Mat: {user.badgeId}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDarkMode(!darkMode)} className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-400 flex-1 flex justify-center hover:bg-brand-500/10 transition-colors">{darkMode ? <Sun size={16}/> : <Moon size={16}/>}</button>
              <button onClick={() => { setUser(null); localStorage.removeItem('carpa_user'); }} className="p-2.5 bg-red-500/10 text-red-500 rounded-lg font-black text-[8px] uppercase flex-[2] hover:bg-red-500 hover:text-white transition-colors">Sair</button>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="h-14 flex items-center justify-between px-6 border-b border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-[#020617]/60 backdrop-blur-xl sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 bg-slate-100 dark:bg-slate-800 rounded-lg"><Menu size={18}/></button>
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-600">{currentView}</h2>
          </div>
          <div className="flex gap-2 items-center">
            {selectedItemIds.length > 0 && (
              <div className="flex items-center gap-2 animate-in slide-in-from-right duration-200">
                <button 
                  onClick={() => setSelectedItemIds([])}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white bg-slate-100 dark:bg-slate-800 rounded-lg transition-colors border dark:border-slate-700"
                  title="Cancelar seleção"
                >
                  <MinusCircle size={14}/>
                </button>
                <span className="text-[8px] font-black uppercase text-brand-600 bg-brand-50 dark:bg-brand-950/20 px-3 py-1.5 rounded-lg border dark:border-brand-900">
                  {selectedItemIds.length} selecionado{selectedItemIds.length > 1 ? 's' : ''}
                </span>
                <button 
                  onClick={handleDeleteBatch} 
                  disabled={isDeleting}
                  className="bg-red-600 text-white px-4 py-1.5 rounded-lg font-black text-[8px] uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-red-600/20 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDeleting ? <Loader2 size={14} className="animate-spin"/> : <Trash2 size={14}/>}
                  {isDeleting ? 'PROCESSANDO...' : 'EXCLUIR EM MASSA'}
                </button>
              </div>
            )}
            {currentView === AppView.INVENTORY && selectedItemIds.length === 0 && (
              <div className="flex gap-2">
                <button onClick={handleDownloadTemplate} className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-3 py-1.5 rounded-lg font-black text-[8px] uppercase tracking-widest flex items-center gap-2 hover:bg-slate-200 transition-colors border dark:border-slate-700">
                  <FileSpreadsheet size={16}/> TEMPLATE
                </button>
                <button onClick={() => { setEditingItem(null); setFormData({}); setIsItemModalOpen(true); }} className="bg-brand-600 text-white px-3 py-1.5 rounded-lg font-black text-[8px] uppercase tracking-widest flex items-center gap-2 shadow-md"><Plus size={16}/> NOVO ITEM</button>
              </div>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 lg:p-6 custom-scrollbar">
          <div className="max-w-7xl mx-auto">
            {currentView === AppView.DASHBOARD && (
              <div className="space-y-6 animate-in fade-in duration-500">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-transform hover:scale-[1.02]">
                    <div className="flex items-center justify-between mb-2">
                       <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total Geral</p>
                       <Package size={16} className="text-brand-500 opacity-50"/>
                    </div>
                    <h3 className="text-4xl font-black text-slate-800 dark:text-white tracking-tighter">{stats.total}</h3>
                    <p className="text-[7px] font-bold text-slate-400 mt-2 uppercase">Materiais Ativos</p>
                  </div>
                  <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-transform hover:scale-[1.02]">
                    <div className="flex items-center justify-between mb-2">
                       <p className="text-[9px] font-black text-red-500 uppercase tracking-widest">Alertas</p>
                       <AlertTriangle size={16} className="text-red-500 opacity-50"/>
                    </div>
                    <h3 className="text-4xl font-black text-red-600 tracking-tighter">{stats.critical}</h3>
                    <p className="text-[7px] font-bold text-red-400 mt-2 uppercase">Abaixo do Mínimo</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 p-8 rounded-[2.5rem] bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-xl overflow-hidden">
                    <div className="flex items-center justify-between mb-8">
                      <div>
                        <h3 className="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-white flex items-center gap-2">
                          <BarChart3 size={16} className="text-brand-600"/>
                          Controle de Fluxo Semanal
                        </h3>
                        <p className="text-[8px] font-bold text-slate-400 uppercase mt-1">Comparativo de entradas e saídas (7 dias)</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                          <span className="text-[8px] font-black uppercase text-slate-400">Entradas</span>
                        </div>
                        <div className="flex items-center gap-1.5 ml-2">
                          <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                          <span className="text-[8px] font-black uppercase text-slate-400">Saídas</span>
                        </div>
                      </div>
                    </div>
                    <div className="h-[280px] w-full">
                      <canvas ref={chartRef}></canvas>
                    </div>
                  </div>

                  <div className="p-8 rounded-[2.5rem] bg-slate-900 text-white border border-slate-800 shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                      <DatabaseZap size={100} />
                    </div>
                    <h3 className="text-xs font-black uppercase tracking-widest mb-6 flex items-center gap-2">
                      <Sparkles size={16} className="text-brand-400"/>
                      Status do Almoxarifado
                    </h3>
                    <div className="space-y-6 relative z-10">
                      <div>
                        <p className="text-[8px] font-black text-slate-400 uppercase mb-2">Giro de Estoque</p>
                        <div className="flex items-baseline gap-2">
                          <span className="text-5xl font-black tracking-tighter text-brand-400">
                            {movements.length}
                          </span>
                          <span className="text-[9px] font-black uppercase text-slate-500">Operações</span>
                        </div>
                      </div>
                      <div className="pt-6 border-t border-white/5 space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-black uppercase text-slate-400">Integridade de Dados</span>
                          <span className="text-[9px] font-black uppercase text-emerald-400">99.9%</span>
                        </div>
                        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                           <div className="h-full bg-brand-600 w-[99.9%]"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {currentView === AppView.INVENTORY && (
              <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500 pb-20">
                <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-3 sticky top-0 z-20">
                  <div className="flex-1 flex items-center gap-3 bg-slate-50 dark:bg-slate-950 px-4 py-2 rounded-xl border dark:border-slate-800 transition-all focus-within:border-brand-500 focus-within:bg-white">
                    <Search className="text-slate-400" size={16}/>
                    <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Pesquisar material..." className="w-full bg-transparent outline-none font-medium text-xs dark:text-white" />
                  </div>
                  
                  <div className="flex gap-1.5 items-center">
                    <button 
                      onClick={handleSelectAll}
                      className={`px-4 py-2 rounded-xl text-[8px] font-black uppercase tracking-wider transition-all flex items-center gap-2 border shadow-sm ${filteredItems.length > 0 && filteredItems.every(i => selectedItemIds.includes(i.id)) ? 'bg-brand-600 text-white border-brand-500' : 'bg-slate-50 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700 hover:text-brand-500'}`}
                    >
                      {filteredItems.length > 0 && filteredItems.every(i => selectedItemIds.includes(i.id)) ? <CheckSquare size={14}/> : <Square size={14}/>}
                      {filteredItems.length > 0 && filteredItems.every(i => selectedItemIds.includes(i.id)) ? 'Desmarcar Tudo' : 'Selecionar Tudo'}
                    </button>
                    
                    <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                      {['TODOS', ...dbDepartments.map(d => d.name)].map(d => (
                        <button key={d} onClick={() => setSelectedDept(d)} className={`px-4 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${selectedDept === d ? 'bg-brand-600 text-white shadow-md' : 'bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-brand-500'}`}>{d}</button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {filteredItems.map(item => (
                    <div key={item.id} className={`group bg-white dark:bg-slate-900 rounded-[1.5rem] border transition-all relative flex flex-col shadow-sm overflow-hidden ${selectedItemIds.includes(item.id) ? 'border-brand-600 ring-2 ring-brand-500/20 shadow-lg shadow-brand-500/5' : 'border-slate-100 dark:border-slate-800 hover:shadow-md hover:border-slate-200 dark:hover:border-slate-700'}`}>
                      <button 
                        onClick={() => setSelectedItemIds(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id])}
                        className={`absolute top-2.5 left-2.5 z-10 p-2 rounded-xl border backdrop-blur-md transition-all ${selectedItemIds.includes(item.id) ? 'bg-brand-600 text-white border-brand-500 scale-110 shadow-md' : 'bg-white/60 dark:bg-black/30 text-slate-400 border-white/20 opacity-0 group-hover:opacity-100'}`}
                      >
                        {selectedItemIds.includes(item.id) ? <CheckSquare size={16} /> : <Square size={16}/>}
                      </button>

                      <div className="aspect-[1/1] bg-slate-50 dark:bg-slate-950/50 relative overflow-hidden flex items-center justify-center border-b dark:border-slate-800">
                        {item.photo_url ? (
                          <img src={item.photo_url} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                        ) : (
                          <Package className="text-slate-200 dark:text-slate-800" size={48} />
                        )}
                        <div className="absolute top-2 right-2 flex flex-col gap-1.5 items-end">
                          <div className="px-2 py-0.5 bg-slate-900/70 backdrop-blur-md rounded-md text-[7px] font-black text-white uppercase tracking-wider border border-white/10 flex items-center gap-1 shadow-lg">
                            <MapPin size={8} /> {item.location}
                          </div>
                          {item.current_stock <= item.min_stock && (
                            <div className="px-2 py-0.5 bg-red-600 text-white rounded-md text-[7px] font-black uppercase tracking-wider flex items-center gap-1 shadow-lg animate-pulse">
                              <AlertTriangle size={8} /> Crítico
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="p-4 flex-1 flex flex-col">
                        <div className="mb-3">
                          <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{item.department}</p>
                          <h4 className="text-[11px] font-black uppercase text-slate-700 dark:text-slate-100 line-clamp-2 leading-tight" title={item.name}>
                            {item.name}
                          </h4>
                        </div>

                        <div className="mt-auto flex items-end justify-between pt-3 border-t border-slate-50 dark:border-slate-800/50">
                          <div>
                            <span className="text-[7px] font-black text-slate-400 uppercase block mb-0.5">Saldo Atual</span>
                            <div className="flex items-baseline gap-1">
                              <span className={`text-2xl font-black tracking-tighter ${item.current_stock <= item.min_stock ? 'text-red-500' : 'text-brand-600'}`}>
                                {item.current_stock}
                              </span>
                              <span className="text-[8px] font-black text-slate-300 dark:text-slate-600 uppercase">{item.unit}</span>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => { setActiveItemId(item.id); setMovementType('IN'); setIsMovementModalOpen(true); }} className="p-2 bg-emerald-500/10 text-emerald-600 rounded-lg hover:bg-emerald-600 hover:text-white transition-all border border-emerald-500/5" title="Entrada"><Plus size={14}/></button>
                            <button onClick={() => { setActiveItemId(item.id); setMovementType('OUT'); setIsMovementModalOpen(true); }} className="p-2 bg-orange-500/10 text-orange-600 rounded-lg hover:bg-orange-600 hover:text-white transition-all border border-orange-500/5" title="Saída"><TrendingDown size={14}/></button>
                            <button onClick={() => { setEditingItem(item); setFormData(item); setIsItemModalOpen(true); }} className="p-2 bg-slate-50 dark:bg-slate-800 text-slate-400 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-all border dark:border-slate-700" title="Editar"><Edit3 size={14}/></button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {currentView === AppView.MOVEMENTS && (
              <div className="max-w-4xl mx-auto space-y-3 pb-20 animate-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between px-2 mb-4">
                  <h3 className="text-sm font-black uppercase tracking-tighter text-slate-500">Histórico de Movimentações</h3>
                  <button onClick={handleExport} className="px-3 py-1.5 bg-brand-600 text-white rounded-lg flex items-center gap-2 font-black text-[8px] uppercase shadow-lg transition-transform hover:scale-105 active:scale-95"><Download size={14}/> Relatório</button>
                </div>
                {movements.map(m => (
                  <div key={m.id} className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${m.type === 'IN' ? 'bg-emerald-50 text-emerald-600' : m.type === 'OUT' ? 'bg-orange-50 text-orange-600' : 'bg-brand-50 text-brand-600'}`}>
                        {m.type === 'IN' ? <ArrowUpRight size={18}/> : m.type === 'OUT' ? <ArrowDownRight size={18}/> : <Activity size={18}/>}
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase dark:text-white leading-tight mb-1">{m.item_name}</p>
                        <div className="flex items-center gap-3 opacity-50 text-[7px] font-black uppercase">
                          <span className="flex items-center gap-1"><UserIcon size={10}/> {m.user_name}</span>
                          <span className="flex items-center gap-1"><Clock size={10}/> {new Date(m.timestamp).toLocaleString()}</span>
                          {m.reason && <span className="flex items-center gap-1 text-brand-500"><ClipboardList size={10}/> {m.reason}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`text-2xl font-black tracking-tighter ${m.type === 'IN' ? 'text-emerald-500' : m.type === 'OUT' ? 'text-orange-500' : 'text-slate-400'}`}>{m.quantity}</span>
                      <p className="text-[7px] font-black text-slate-400 uppercase">{m.type === 'IN' ? 'Entrada' : m.type === 'OUT' ? 'Saída' : 'Ajuste'}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {currentView === AppView.SETTINGS && (
              <div className="max-w-6xl mx-auto space-y-10 pb-20 animate-in slide-in-from-right-4 duration-500">
                <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div>
                    <h1 className="text-3xl font-black tracking-tighter text-slate-800 dark:text-white mb-1 uppercase">Configurações</h1>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ajustes do sistema e gestão de equipe</p>
                  </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="space-y-8">
                    <section className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-xl">
                      <h3 className="text-xs font-black uppercase tracking-widest text-brand-600 mb-6 flex items-center gap-2">
                        <Smartphone size={16}/> Preferências do Sistema
                      </h3>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-950/50 rounded-2xl border dark:border-slate-800">
                          <div>
                            <p className="text-[10px] font-black uppercase text-slate-700 dark:text-white">Modo de Exibição</p>
                            <p className="text-[8px] font-bold text-slate-400 uppercase">Alternar entre claro e escuro</p>
                          </div>
                          <button onClick={() => setDarkMode(!darkMode)} className="p-3 bg-white dark:bg-slate-800 rounded-xl shadow-md border dark:border-slate-700 text-brand-600 transition-transform active:scale-90">
                            {darkMode ? <Sun size={20}/> : <Moon size={20}/>}
                          </button>
                        </div>

                        <div className="p-6 bg-slate-900 rounded-3xl border border-white/5 relative overflow-hidden group">
                           <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform pointer-events-none">
                             <Database size={80}/>
                           </div>
                           <h4 className="text-[9px] font-black uppercase text-white tracking-[0.2em] mb-4 flex items-center gap-2">
                              <Activity size={12} className="text-brand-400"/> Status de Sincronia
                           </h4>
                           <div className="space-y-4 relative z-10">
                              <div className="flex items-center justify-between">
                                 <div className="flex items-center gap-3">
                                    <div className={`w-3 h-3 rounded-full animate-pulse ${isOnline ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                                    <span className="text-lg font-black text-white">{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
                                 </div>
                                 <button onClick={() => fetchData()} disabled={isSyncing} className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors disabled:opacity-50">
                                    <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''}/>
                                 </button>
                              </div>
                              <div className="flex items-center justify-between pt-2 border-t border-white/5">
                                 <span className="text-[8px] font-black text-slate-500 uppercase">Última Atualização:</span>
                                 <span className="text-[9px] font-black text-brand-400">{lastSync ? lastSync.toLocaleString() : 'NUNCA'}</span>
                              </div>
                           </div>
                        </div>
                      </div>
                    </section>
                  </div>

                  <section className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-xl flex flex-col h-full">
                     <h3 className="text-xs font-black uppercase tracking-widest text-brand-600 mb-6 flex items-center gap-2">
                        <UsersIcon size={16}/> Gestão de Equipe
                     </h3>
                     <div className="flex-1 space-y-4 overflow-y-auto max-h-[500px] pr-2 custom-scrollbar">
                        {allUsers.map(u => (
                          <div key={u.badge_id} className="group p-4 bg-slate-50 dark:bg-slate-950/50 rounded-2xl border dark:border-slate-800 flex items-center justify-between hover:border-brand-500 transition-all shadow-sm">
                             <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-brand-600 flex items-center justify-center text-white font-black text-lg overflow-hidden border-2 border-white dark:border-slate-800 shadow-lg">
                                   {u.photo_url ? <img src={u.photo_url} className="w-full h-full object-cover"/> : u.name.charAt(0)}
                                </div>
                                <div>
                                   <p className="text-[10px] font-black uppercase text-slate-800 dark:text-white leading-tight mb-0.5">{u.name}</p>
                                   <div className="flex items-center gap-3">
                                      <span className="text-[7px] font-black text-slate-400 uppercase px-1.5 py-0.5 bg-white dark:bg-slate-800 rounded border dark:border-slate-700">{u.role}</span>
                                      <span className="text-[7px] font-black text-slate-400 uppercase">MAT: {u.badge_id}</span>
                                   </div>
                                </div>
                             </div>
                             <button onClick={() => { setEditingUser(u); setUserFormData(u); setIsUserModalOpen(true); }} className="p-2.5 bg-white dark:bg-slate-800 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-xl transition-all shadow-sm border dark:border-slate-700 lg:opacity-0 group-hover:opacity-100">
                                <Edit3 size={16}/>
                             </button>
                          </div>
                        ))}
                     </div>
                  </section>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* User Edit Modal */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in zoom-in duration-200">
           <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-[3rem] overflow-hidden shadow-2xl border dark:border-slate-800">
              <div className="p-6 bg-slate-50 dark:bg-slate-950/50 border-b dark:border-slate-800 flex justify-between items-center">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-brand-600">Editar Perfil</h3>
                <button onClick={() => setIsUserModalOpen(false)} className="p-2 text-slate-400 hover:text-red-500 bg-white dark:bg-slate-800 rounded-lg transition-colors"><X size={18}/></button>
              </div>
              <form onSubmit={handleSaveUser} className="p-8 space-y-6">
                 <div className="flex flex-col items-center gap-4">
                    <div onClick={() => userPhotoInputRef.current?.click()} className="w-24 h-24 rounded-[2rem] bg-brand-50 dark:bg-brand-950/20 border-2 border-dashed border-brand-200 dark:border-brand-900 flex items-center justify-center cursor-pointer overflow-hidden relative group">
                       {userFormData.photo_url ? <img src={userFormData.photo_url} className="w-full h-full object-cover"/> : <UserIcon className="text-brand-300" size={32}/>}
                       <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"><Camera className="text-white" size={20}/></div>
                    </div>
                    <input ref={userPhotoInputRef} type="file" className="hidden" accept="image/*" onChange={(e) => {
                       const file = e.target.files?.[0];
                       if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => setUserFormData({ ...userFormData, photo_url: reader.result as string });
                          reader.readAsDataURL(file);
                       }
                    }}/>
                    <p className="text-[7px] font-black uppercase text-slate-400">Clique para alterar foto</p>
                 </div>

                 <div className="space-y-4">
                    <div className="space-y-1">
                       <label className="text-[8px] font-black text-slate-400 uppercase ml-1">Nome Completo</label>
                       <input required value={userFormData.name || ''} onChange={e => setUserFormData({...userFormData, name: e.target.value})} className="w-full p-4 rounded-xl bg-slate-50 dark:bg-slate-950 text-xs font-bold uppercase dark:text-white border-2 border-transparent focus:border-brand-500 outline-none"/>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                       <div className="space-y-1">
                          <label className="text-[8px] font-black text-slate-400 uppercase ml-1">Função</label>
                          <select value={userFormData.role || ''} onChange={e => setUserFormData({...userFormData, role: e.target.value})} className="w-full p-4 rounded-xl bg-slate-50 dark:bg-slate-950 text-[10px] font-black uppercase dark:text-white border-2 border-transparent focus:border-brand-500 outline-none appearance-none">
                             <option value="Colaborador">Colaborador</option>
                             <option value="Almoxarife">Almoxarife</option>
                             <option value="Supervisor">Supervisor</option>
                             <option value="Administrador">Administrador</option>
                          </select>
                       </div>
                       <div className="space-y-1">
                          <label className="text-[8px] font-black text-slate-400 uppercase ml-1">Matrícula</label>
                          <input required value={userFormData.badge_id || ''} onChange={e => setUserFormData({...userFormData, badge_id: e.target.value})} className="w-full p-4 rounded-xl bg-slate-50 dark:bg-slate-950 text-xs font-bold uppercase dark:text-white border-2 border-transparent focus:border-brand-500 outline-none"/>
                       </div>
                    </div>
                 </div>

                 <button type="submit" disabled={isSyncing} className="w-full py-4 bg-brand-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl flex items-center justify-center gap-2 hover:bg-brand-700 transition-all disabled:opacity-50">
                    {isSyncing ? <Loader2 className="animate-spin" size={16}/> : <CheckCircle2 size={16}/>}
                    SALVAR ALTERAÇÕES
                 </button>
              </form>
           </div>
        </div>
      )}

      {/* Item Modal */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in zoom-in duration-200">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-[2.5rem] overflow-hidden shadow-2xl border dark:border-slate-800">
            <div className="p-6 bg-slate-50 dark:bg-slate-950/50 border-b dark:border-slate-800 flex justify-between items-center">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-brand-600">Cadastro de Material</h3>
              <button onClick={() => setIsItemModalOpen(false)} className="p-2 text-slate-400 hover:text-red-500 bg-white dark:bg-slate-800 rounded-lg transition-colors"><X size={18}/></button>
            </div>
            <form onSubmit={handleSaveItem} className="p-8 space-y-6 max-h-[80vh] overflow-y-auto custom-scrollbar">
              <div className="flex gap-6 items-center">
                <div onClick={() => fileInputRef.current?.click()} className="w-28 h-28 rounded-2xl bg-slate-100 dark:bg-slate-950 border-2 border-dashed border-slate-300 dark:border-slate-800 flex flex-col items-center justify-center cursor-pointer relative overflow-hidden group">
                  {formData.photo_url ? <img src={formData.photo_url} className="w-full h-full object-cover" /> : <Camera className="text-slate-300" size={28} />}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><ImageIcon className="text-white" size={20}/></div>
                </div>
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" capture="environment" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onloadend = () => setFormData({ ...formData, photo_url: reader.result as string });
                    reader.readAsDataURL(file);
                  }
                }} />
                <div className="flex-1 space-y-1.5">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome do Item</label>
                  <input required value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Ex: Marreta 2kg" className="w-full p-4 rounded-xl bg-slate-50 dark:bg-slate-950 font-bold text-xs uppercase outline-none shadow-inner dark:text-white" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Unidade</label><input required value={formData.unit || 'UND'} onChange={e => setFormData({ ...formData, unit: e.target.value.toUpperCase() })} className="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 font-bold text-xs uppercase text-center dark:text-white" /></div>
                <div className="space-y-1.5"><label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Setor</label><input required value={formData.department || ''} onChange={e => setFormData({ ...formData, department: e.target.value.toUpperCase() })} className="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 font-bold text-xs uppercase text-center dark:text-white" /></div>
                <div className="space-y-1.5"><label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Endereço/Local</label><input required value={formData.location || ''} onChange={e => setFormData({ ...formData, location: e.target.value.toUpperCase() })} className="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 font-bold text-xs uppercase text-center dark:text-white" /></div>
                <div className="space-y-1.5"><label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Estoque Mínimo</label><input type="number" required value={formData.min_stock || 0} onChange={e => setFormData({ ...formData, min_stock: Number(e.target.value) })} className="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 font-bold text-xs text-center dark:text-white" /></div>
              </div>
              {!editingItem && (
                 <div className="space-y-1.5">
                  <label className="text-[8px] font-black text-brand-600 uppercase tracking-widest ml-1">Saldo de Abertura</label>
                  <input type="number" required value={formData.current_stock || 0} onChange={e => setFormData({ ...formData, current_stock: Number(e.target.value) })} className="w-full p-5 rounded-2xl bg-brand-50 dark:bg-brand-950/20 font-black text-2xl text-center text-brand-600 outline-none" />
                </div>
              )}
              <button type="submit" disabled={isSyncing} className="w-full py-5 bg-brand-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-95 transition-all disabled:opacity-50">
                {isSyncing ? <Loader2 className="animate-spin mx-auto" size={20}/> : 'SALVAR REGISTRO'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Stock Movement Modal */}
      {isMovementModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-md bg-white dark:bg-slate-900 rounded-[2.5rem] overflow-hidden shadow-2xl border dark:border-slate-800">
            <div className={`p-6 text-center text-white ${movementType === 'IN' ? 'bg-emerald-600' : 'bg-orange-600'}`}>
              <div className="flex items-center justify-center gap-2 mb-2">
                {movementType === 'IN' ? <ArrowUpRight size={24}/> : <ArrowDownRight size={24}/>}
                <h3 className="text-xl font-black uppercase tracking-widest">{movementType === 'IN' ? 'Entrada' : 'Saída'}</h3>
              </div>
              <p className="text-[10px] font-black uppercase opacity-80 leading-tight line-clamp-1 max-w-[80%] mx-auto">{activeItem?.name}</p>
            </div>
            
            <form onSubmit={handleStockAction} className="p-8 space-y-8">
              <div className="text-center space-y-4">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] block">Quanto deseja {movementType === 'IN' ? 'adicionar' : 'retirar'}?</label>
                <div className="flex items-center justify-center gap-6">
                  <button type="button" onClick={() => setMoveData(p => ({...p, quantity: Math.max(1, p.quantity - 1)}))} className="w-14 h-14 rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-500 font-black text-2xl shadow-sm hover:bg-slate-100 transition-colors active:scale-90">-</button>
                  <input type="number" min="1" required autoFocus value={moveData.quantity} onChange={e => setMoveData({ ...moveData, quantity: Math.abs(Number(e.target.value)) })} className="w-24 text-5xl font-black text-center bg-transparent outline-none dark:text-white border-none focus:ring-0" />
                  <button type="button" onClick={() => setMoveData(p => ({...p, quantity: p.quantity + 1}))} className="w-14 h-14 rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-500 font-black text-2xl shadow-sm hover:bg-slate-100 transition-colors active:scale-90">+</button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 relative">
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 shadow-lg border dark:border-slate-700 flex items-center justify-center z-10">
                    <ArrowRight size={20} className="text-slate-300 dark:text-slate-600" />
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-950/40 p-5 rounded-2xl border dark:border-slate-800 text-center flex flex-col items-center justify-center gap-2">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Atual</p>
                  <div className="flex flex-col items-center">
                    <span className="text-3xl font-black text-slate-600 dark:text-slate-400 tracking-tighter">{activeItem?.current_stock}</span>
                    <span className="text-[8px] font-black text-slate-300 dark:text-slate-700 uppercase">{activeItem?.unit}</span>
                  </div>
                </div>

                <div className={`p-5 rounded-2xl border-2 transition-all text-center flex flex-col items-center justify-center gap-2 ${isFutureCritical ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50' : 'bg-brand-50 dark:bg-brand-950/20 border-brand-200 dark:border-brand-900/50'}`}>
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Projetado</p>
                  <div className="flex flex-col items-center">
                    <span className={`text-3xl font-black tracking-tighter ${isFutureCritical ? 'text-red-600' : 'text-brand-600'}`}>{futureStock}</span>
                    <span className={`text-[8px] font-black uppercase ${isFutureCritical ? 'text-red-400' : 'text-brand-400'}`}>{activeItem?.unit}</span>
                  </div>
                  {isFutureCritical && (
                    <div className="mt-1 flex items-center gap-1 text-[7px] font-black text-red-600 uppercase bg-red-100 dark:bg-red-900/50 px-2 py-0.5 rounded-full animate-pulse">
                      <AlertTriangle size={8} /> Crítico
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block ml-1">Observação Contextual</label>
                <textarea 
                  value={moveData.reason} 
                  onChange={e => setMoveData({ ...moveData, reason: e.target.value.toUpperCase() })} 
                  placeholder="EX: RETIRADA PARA MANUTENÇÃO PREVENTIVA..." 
                  className="w-full p-4 rounded-xl bg-slate-50 dark:bg-slate-950 text-[10px] font-bold uppercase outline-none shadow-inner dark:text-white resize-none h-20 border-2 border-transparent focus:border-brand-500 transition-all" 
                />
              </div>

              <div className="flex flex-col gap-3 pt-4">
                <button type="submit" disabled={isSyncing} className={`w-full py-5 text-white rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] shadow-2xl active:scale-95 transition-all transform flex items-center justify-center gap-2 ${movementType === 'IN' ? 'bg-emerald-600 shadow-emerald-600/20' : 'bg-orange-600 shadow-orange-600/20'} disabled:opacity-50`}>
                   {isSyncing ? <Loader2 className="animate-spin" size={16}/> : (movementType === 'IN' ? <ArrowUpRight size={16}/> : <ArrowDownRight size={16}/>)}
                   {isSyncing ? 'PROCESSANDO...' : `EFETIVAR ${movementType === 'IN' ? 'ENTRADA' : 'SAÍDA'}`}
                </button>
                <button type="button" onClick={() => setIsMovementModalOpen(false)} className="w-full py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-red-500 transition-colors">Descartar Operação</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 3px; height: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #3b82f6; border-radius: 10px; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        * { -webkit-tap-highlight-color: transparent; outline: none !important; }
      `}</style>
    </div>
  );
}
