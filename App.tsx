
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  LayoutDashboard, Package, Plus, Search, Trash2, Moon, Sun, Menu, X, 
  Camera, AlertTriangle, Loader2, RefreshCw, TrendingDown, Box, 
  History, Activity, Edit3, Users, FileSpreadsheet, 
  Upload, CheckCircle2, User as UserIcon, LogOut, ChevronRight,
  Info, Check, Database, ShieldCheck, Settings, Download, Filter,
  Sparkles, BrainCircuit, ListChecks, UserPlus, Zap, Globe, Signal, SignalLow,
  PieChart, BarChart3
} from 'lucide-react';
import { InventoryItem, MovementLog, UserSession, AppView, UserProfile } from './types';
import { Logo } from './components/Logo';
import { supabase } from './services/supabaseClient';
import { generateProductInsights } from './services/geminiService';

declare const XLSX: any;

export default function App() {
  // Theme Management
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('carpa_theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  
  // State Management
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
  const [selectedDepartment, setSelectedDepartment] = useState('TODOS');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

  // Modals State
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [isUserEditModalOpen, setIsUserEditModalOpen] = useState(false);
  const [isImportHelpOpen, setIsImportHelpOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  
  // Form Data State
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [movementType, setMovementType] = useState<'IN' | 'OUT'>('IN');
  const [movementItemId, setMovementItemId] = useState<string>('');
  const [formData, setFormData] = useState<Partial<InventoryItem>>({});
  const [userFormData, setUserFormData] = useState<Partial<UserProfile>>({});
  const [moveData, setMoveData] = useState({ quantity: 1, reason: '' });
  const [deleteTarget, setDeleteTarget] = useState<'SINGLE' | 'BATCH'>('SINGLE');
  const [itemToDelete, setItemToDelete] = useState<InventoryItem | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const userPhotoInputRef = useRef<HTMLInputElement>(null);

  // Apply Theme
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('carpa_theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  // Real-time Sync and Initial Data Fetch
  const fetchData = useCallback(async (showLoader = true) => {
    if (showLoader) setIsSyncing(true);
    try {
      const [itRes, movRes, userRes] = await Promise.all([
        supabase.from('inventory_items').select('*').order('name'),
        supabase.from('movements').select('*').order('timestamp', { ascending: false }).limit(60),
        supabase.from('users').select('*').order('name')
      ]);

      if (itRes.error) throw itRes.error;

      if (itRes.data) setItems(itRes.data);
      if (movRes.data) setMovements(movRes.data);
      if (userRes.data) setAllUsers(userRes.data);
      
      setLastSync(new Date());
      setConnStatus('online');
    } catch (err) {
      console.error("Sync error:", err);
      setConnStatus('offline');
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    // Enable Real-time Subscriptions for multiple devices simultaneous connectivity
    const inventoryChannel = supabase.channel('carpa-realtime-sync')
      .on('postgres_changes', { event: '*', table: 'inventory_items', schema: 'public' }, () => {
        fetchData(false);
      })
      .on('postgres_changes', { event: '*', table: 'movements', schema: 'public' }, () => {
        fetchData(false);
      })
      .on('postgres_changes', { event: '*', table: 'users', schema: 'public' }, () => {
        fetchData(false);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setConnStatus('online');
        else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') setConnStatus('offline');
      });

    // Network status listeners
    const handleOnline = () => setConnStatus('online');
    const handleOffline = () => setConnStatus('offline');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      supabase.removeChannel(inventoryChannel);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [fetchData]);

  // Optimized filtering
  const filteredItems = useMemo(() => {
    const s = searchTerm.toLowerCase();
    return items.filter(i => {
      const matchesSearch = !searchTerm || 
        i.name.toLowerCase().includes(s) || 
        i.location.toLowerCase().includes(s);
      const matchesDept = selectedDepartment === 'TODOS' || i.department === selectedDepartment;
      return matchesSearch && matchesDept;
    });
  }, [items, searchTerm, selectedDepartment]);

  const departments = useMemo(() => {
    const deps = new Set(items.map(i => i.department).filter(Boolean));
    return ['TODOS', ...Array.from(deps)].sort();
  }, [items]);

  // Status Stats for Dashboard
  const statusStats = useMemo(() => {
    let below = 0;
    let ideal = 0;
    let above = 0;

    items.forEach(i => {
      if (i.current_stock <= i.min_stock) below++;
      else if (i.current_stock <= i.min_stock * 2.5) ideal++;
      else above++;
    });

    const total = items.length || 1;
    return {
      below, ideal, above,
      belowPct: (below / total) * 100,
      idealPct: (ideal / total) * 100,
      abovePct: (above / total) * 100,
      totalCount: items.length
    };
  }, [items]);

  // Department distribution for Dashboard
  const deptDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    items.forEach(i => {
      const dept = i.department || 'OUTROS';
      counts[dept] = (counts[dept] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5); // Top 5 depts
  }, [items]);

  // Bulk Actions
  const handleSelectAll = useCallback(() => {
    if (selectedItemIds.length === filteredItems.length && filteredItems.length > 0) {
      setSelectedItemIds([]);
    } else {
      setSelectedItemIds(filteredItems.map(i => i.id));
    }
  }, [filteredItems, selectedItemIds]);

  const toggleItemSelection = (id: string) => {
    setSelectedItemIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>, target: 'item' | 'user') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        if (target === 'user') setUserFormData(prev => ({ ...prev, photo_url: base64String }));
        else setFormData(prev => ({ ...prev, photo_url: base64String }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAIAssistant = async () => {
    if (!formData.name) return;
    setIsSyncing(true);
    const insights = await generateProductInsights(formData.name, formData.department || 'GERAL');
    if (insights) setFormData(prev => ({ ...prev, description: insights.description }));
    setIsSyncing(false);
  };

  // Item Management with mandatory history logging
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !user) return;
    setIsSyncing(true);
    
    const isNew = !editingItem;
    const itemToSave = {
      id: editingItem?.id || `IT-${Date.now()}`,
      name: formData.name.toUpperCase(),
      unit: (formData.unit || 'UND').toUpperCase(),
      min_stock: Number(formData.min_stock) || 0,
      current_stock: Number(formData.current_stock) || 0,
      location: (formData.location || 'N/A').toUpperCase(),
      department: (formData.department || 'GERAL').toUpperCase(),
      photo_url: formData.photo_url || null,
      description: formData.description || '',
      last_updated: new Date().toISOString(),
      last_updated_by: user.name
    };

    try {
      const { error } = await supabase.from('inventory_items').upsert(itemToSave);
      if (error) throw error;
      
      // Every single change must be logged in the database history
      await supabase.from('movements').insert({
        item_id: itemToSave.id,
        item_name: itemToSave.name,
        type: isNew ? 'CREATE' : 'EDIT',
        quantity: isNew ? itemToSave.current_stock : 0,
        user_badge_id: user.badgeId,
        user_name: user.name,
        timestamp: itemToSave.last_updated,
        reason: isNew ? 'Cadastro inicial via console' : 'Alteração de dados cadastrais'
      });

      setIsItemModalOpen(false);
      setEditingItem(null);
      setFormData({});
    } catch (err: any) {
      alert("Falha na conexão com o banco de dados.");
    } finally {
      setIsSyncing(false);
    }
  };

  // User Management
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userFormData.badge_id || !userFormData.name) return;
    setIsSyncing(true);
    
    const userToSave = {
      badge_id: userFormData.badge_id,
      name: userFormData.name.toUpperCase(),
      role: userFormData.role || 'Colaborador',
      photo_url: userFormData.photo_url || null,
      created_at: editingUser?.created_at || new Date().toISOString()
    };

    try {
      const { error } = await supabase.from('users').upsert(userToSave);
      if (error) throw error;
      
      if (user?.badgeId === userToSave.badge_id) {
        setUser({ ...user, name: userToSave.name, role: userToSave.role, photoUrl: userToSave.photo_url || undefined });
      }

      setIsUserEditModalOpen(false);
      setEditingUser(null);
      setUserFormData({});
    } catch (err) {
      alert("Erro ao sincronizar perfil do colaborador.");
    } finally {
      setIsSyncing(false);
    }
  };

  const executeDelete = async () => {
    if (!user) return;
    setIsSyncing(true);
    try {
      if (deleteTarget === 'SINGLE' && itemToDelete) {
        // Log delete movement
        await supabase.from('movements').insert({
          item_id: itemToDelete.id, item_name: itemToDelete.name, type: 'DELETE',
          quantity: itemToDelete.current_stock, user_badge_id: user.badgeId,
          user_name: user.name, timestamp: new Date().toISOString(),
          reason: 'Exclusão definitiva por administrador'
        });
        await supabase.from('inventory_items').delete().eq('id', itemToDelete.id);
      } else if (deleteTarget === 'BATCH' && selectedItemIds.length > 0) {
        for (const id of selectedItemIds) {
          const item = items.find(i => i.id === id);
          if (item) {
            await supabase.from('movements').insert({
              item_id: item.id, item_name: item.name, type: 'DELETE',
              quantity: item.current_stock, user_badge_id: user.badgeId,
              user_name: user.name, timestamp: new Date().toISOString(),
              reason: 'Exclusão em massa autorizada'
            });
          }
        }
        await supabase.from('inventory_items').delete().in('id', selectedItemIds);
      }
      setIsDeleteConfirmOpen(false);
      setItemToDelete(null);
      setSelectedItemIds([]);
    } catch (err: any) {
      alert("Erro ao processar exclusão no banco.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    const item = items.find(i => i.id === movementItemId);
    if (!item || !user) return;
    setIsSyncing(true);
    const qty = Number(moveData.quantity);
    const newStock = movementType === 'IN' ? item.current_stock + qty : item.current_stock - qty;
    
    if (newStock < 0) {
      alert("Estoque insuficiente.");
      setIsSyncing(false);
      return;
    }
    
    try {
      // Update item stock
      await supabase.from('inventory_items').update({ 
        current_stock: newStock, last_updated: new Date().toISOString(), last_updated_by: user.name 
      }).eq('id', item.id);

      // Audit Log - Every movement must be registered in the database history
      await supabase.from('movements').insert({
        item_id: item.id, item_name: item.name, type: movementType,
        quantity: qty, user_badge_id: user.badgeId, user_name: user.name,
        timestamp: new Date().toISOString(), reason: moveData.reason || (movementType === 'IN' ? 'Entrada operacional' : 'Saída operacional')
      });

      setIsMovementModalOpen(false);
      setMoveData({ quantity: 1, reason: '' });
    } catch (err: any) {
      alert("Erro ao registrar movimentação.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExportExcel = () => {
    const data = filteredItems.map(i => ({
      "Material": i.name, "Setor": i.department, "Local": i.location,
      "Saldo": i.current_stock, "Mínimo": i.min_stock, "Unidade": i.unit,
      "Ultima_Atualizacao": i.last_updated
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventário_Realtime");
    XLSX.writeFile(wb, `RELATORIO_ESTOQUE_AG_${new Date().toLocaleDateString().replace(/\//g,'-')}.xlsx`);
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
          const itemToSave = {
            id: `IT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: (row.Material || '').toUpperCase(),
            department: (row.Setor || 'GERAL').toUpperCase(),
            location: (row.Localizacao || 'N/A').toUpperCase(),
            current_stock: Number(row.Saldo) || 0,
            min_stock: Number(row.EstoqueMin) || 0,
            unit: (row.Unidade || 'UND').toUpperCase(),
            last_updated: new Date().toISOString(),
            last_updated_by: user.name
          };
          if (itemToSave.name) {
            await supabase.from('inventory_items').upsert(itemToSave);
            // Log import as creation movement
            await supabase.from('movements').insert({
              item_id: itemToSave.id, item_name: itemToSave.name, type: 'CREATE',
              quantity: itemToSave.current_stock, user_badge_id: user.badgeId,
              user_name: user.name, timestamp: itemToSave.last_updated,
              reason: 'Importação via planilha Excel'
            });
          }
        }
        alert("Dados sincronizados com sucesso.");
      } catch (err) { alert("Erro ao importar planilha. Verifique as colunas."); } finally { setIsSyncing(false); }
    };
    reader.readAsBinaryString(file);
  };

  if (isLoading) return (
    <div className="h-screen flex flex-col items-center justify-center bg-white dark:bg-[#020617]">
      <Logo className="w-16 h-16 animate-pulse" />
      <div className="mt-8 flex flex-col items-center gap-2">
        <Loader2 className="animate-spin text-brand-600" size={32} />
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Iniciando Multi-Sincronismo...</span>
      </div>
    </div>
  );

  if (!user) return (
    <div className="h-screen flex items-center justify-center p-6 bg-slate-100 dark:bg-[#020617]">
      <div className="w-full max-w-[340px] p-10 rounded-[3rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl animate-in zoom-in duration-500">
        <div className="flex flex-col items-center mb-10 text-center">
          <Logo className="w-16 h-16 mb-5" />
          <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">CONTROLE AG</h1>
          <p className="text-[10px] font-black text-brand-500 uppercase tracking-widest mt-2">Database Realtime Online</p>
        </div>
        <form onSubmit={async (e) => {
          e.preventDefault();
          const badge = (e.target as any).badge.value;
          const { data } = await supabase.from('users').select('*').eq('badge_id', badge).single();
          if (data) setUser({ badgeId: data.badge_id, name: data.name, role: data.role, photoUrl: data.photo_url });
          else {
            const name = prompt("Matrícula nova. Nome Completo do Usuário:");
            if (name) {
              await supabase.from('users').insert({ badge_id: badge, name: name.toUpperCase(), role: 'Colaborador' });
              setUser({ badgeId: badge, name: name.toUpperCase(), role: 'Colaborador' });
            }
          }
        }} className="space-y-4">
          <input name="badge" required placeholder="DIGITE SUA MATRÍCULA" className="w-full py-5 rounded-2xl font-black text-center uppercase outline-none border-2 border-transparent focus:border-brand-500 text-sm bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white shadow-inner" />
          <button className="w-full py-5 bg-brand-600 text-white font-black rounded-2xl uppercase tracking-widest active:scale-95 transition-all text-xs">IDENTIFICAR DISPOSITIVO</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="h-screen flex flex-col lg:flex-row bg-slate-50 dark:bg-[#020617] text-slate-900 dark:text-white overflow-hidden transition-all duration-500">
      
      {/* Sidebar de Controle Multi-Dispositivo */}
      <aside className={`fixed lg:static inset-y-0 left-0 w-64 z-50 transform transition-transform duration-300 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex flex-col h-full p-6">
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-4 group cursor-default">
              <Logo className={`w-9 h-9 ${isSyncing ? 'animate-pulse' : ''}`} />
              <span className="font-black text-xl tracking-tighter">AG SYSTEM</span>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2 text-slate-400 hover:text-red-500"><X size={26}/></button>
          </div>
          
          <nav className="flex-1 space-y-2">
            {[
              { id: AppView.DASHBOARD, icon: LayoutDashboard, label: 'Painel Geral' },
              { id: AppView.INVENTORY, icon: Package, label: 'Estoque Ativo' },
              { id: AppView.MOVEMENTS, icon: History, label: 'Log de Auditoria' },
              { id: AppView.USERS, icon: Users, label: 'Gestão de Time' },
              { id: AppView.SETTINGS, icon: Globe, label: 'Sincronismo DB' }
            ].map(v => (
              <button key={v.id} onClick={() => { setCurrentView(v.id); setIsSidebarOpen(false); setSelectedItemIds([]); }} 
                className={`w-full flex items-center gap-4 p-4 rounded-2xl font-bold text-[11px] transition-all ${currentView === v.id ? 'bg-brand-600 text-white shadow-xl' : 'text-slate-400 hover:bg-brand-500/10'}`}>
                <v.icon size={18} /> {v.label}
              </button>
            ))}
          </nav>

          <div className="mt-auto pt-6 border-t border-slate-200 dark:border-slate-800">
             <div className="mb-4 p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Status Cloud</span>
                  <div className={`w-2 h-2 rounded-full ${connStatus === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
                </div>
                <div className="flex items-center gap-2">
                  <Signal size={10} className={connStatus === 'online' ? 'text-emerald-500' : 'text-red-500'} />
                  <span className={`text-[9px] font-black uppercase ${connStatus === 'online' ? 'text-emerald-500' : 'text-red-500'}`}>
                    {connStatus === 'online' ? 'Conectado' : 'Offline'}
                  </span>
                </div>
             </div>

             <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 flex items-center gap-3 border border-slate-200 dark:border-slate-800 shadow-inner">
              <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center overflow-hidden border border-brand-500/20 shadow-md shrink-0">
                {user.photoUrl ? <img src={user.photoUrl} className="w-full h-full object-cover" /> : <UserIcon className="text-white" size={20}/>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-black text-[10px] truncate uppercase leading-none">{user.name}</p>
                <p className="text-[8px] text-brand-500 font-bold uppercase mt-1 tracking-tighter">{user.role}</p>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setDarkMode(!darkMode)} title="Alternar Tema" className="flex-1 p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-center text-slate-500 hover:text-brand-500 transition-all">
                {darkMode ? <Sun size={20}/> : <Moon size={20}/>}
              </button>
              <button onClick={() => setUser(null)} className="flex-1 p-3 bg-red-500/10 text-red-500 rounded-xl font-black text-[10px] uppercase hover:bg-red-500 hover:text-white transition-all shadow-sm">LOGOUT</button>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="h-16 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-8 bg-white/60 dark:bg-[#020617]/60 backdrop-blur-xl sticky top-0 z-30">
          <div className="flex items-center gap-5">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 text-slate-500 hover:text-brand-500"><Menu size={24}/></button>
            
            <div className="hidden sm:flex items-center gap-3 px-4 py-2 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 transition-all shadow-inner">
              <div className="flex items-center gap-2.5">
                <div className={`w-2.5 h-2.5 rounded-full ${connStatus === 'online' ? 'bg-emerald-500 animate-pulse shadow-[0_0_12px_rgba(16,185,129,0.5)]' : 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.5)]'}`} />
                <span className={`text-[10px] font-black uppercase tracking-[0.15em] ${connStatus === 'online' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {connStatus === 'online' ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>
              <div className="w-px h-4 bg-slate-200 dark:bg-slate-800" />
              <div className="flex items-center gap-2 text-slate-500">
                <RefreshCw size={12} className={`${isSyncing ? 'animate-spin text-brand-500' : 'text-slate-400'}`} />
                <div className="flex flex-col justify-center">
                  <span className="text-[7px] font-black text-slate-400 uppercase leading-none mb-0.5">Última Sinc</span>
                  <span className="text-[9px] font-black uppercase text-slate-700 dark:text-slate-300 leading-none tracking-tighter">
                    {lastSync ? lastSync.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'}) : 'AGUARDANDO...'}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="sm:hidden flex flex-col">
              <h2 className="font-black text-[10px] uppercase tracking-widest text-slate-400 leading-none mb-1">{currentView}</h2>
              <div className="flex items-center gap-1.5">
                 <div className={`w-1.5 h-1.5 rounded-full ${connStatus === 'online' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                 <span className={`text-[8px] font-black uppercase ${connStatus === 'online' ? 'text-emerald-500' : 'text-red-500'}`}>
                   {connStatus === 'online' ? 'Ativo' : 'Desconectado'}
                 </span>
              </div>
            </div>
          </div>
          
          <div className="flex gap-2">
            {selectedItemIds.length > 0 && (
              <button onClick={() => { setDeleteTarget('BATCH'); setIsDeleteConfirmOpen(true); }} className="bg-red-500 text-white px-4 py-2 rounded-xl font-black text-[10px] flex items-center gap-2 shadow-xl animate-in slide-in-from-top-6">
                <Trash2 size={14}/> EXCLUIR LOTE ({selectedItemIds.length})
              </button>
            )}
            {currentView === AppView.INVENTORY && (
              <button onClick={() => { setEditingItem(null); setFormData({}); setIsItemModalOpen(true); }} className="bg-brand-600 text-white px-5 py-2.5 rounded-xl font-black text-[11px] flex items-center gap-3 shadow-2xl uppercase tracking-widest active:scale-95 transition-all">
                <Plus size={20}/> NOVO MATERIAL
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 lg:p-8 custom-scrollbar">
          <div className="max-w-7xl mx-auto space-y-6">
            
            {/* DASHBOARD - ESTATÍSTICAS E GRÁFICOS */}
            {currentView === AppView.DASHBOARD && (
              <div className="space-y-6 animate-in fade-in duration-500">
                <div className={`p-8 rounded-[3rem] border transition-all duration-500 flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl overflow-hidden relative group ${connStatus === 'online' ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                  <div className="absolute top-0 right-0 p-12 opacity-[0.03] group-hover:scale-110 transition-transform">
                    {connStatus === 'online' ? <Globe size={180} /> : <SignalLow size={180} />}
                  </div>
                  
                  <div className="flex items-center gap-6 relative z-10">
                    <div className={`w-20 h-20 rounded-[2.5rem] flex items-center justify-center shadow-lg transition-all ${connStatus === 'online' ? 'bg-emerald-500 text-white shadow-emerald-500/20' : 'bg-red-500 text-white shadow-red-500/20'}`}>
                       {connStatus === 'online' ? <Signal size={40} /> : <SignalLow size={40} />}
                    </div>
                    <div>
                      <h3 className="text-2xl font-black uppercase tracking-tighter leading-none mb-2">
                        {connStatus === 'online' ? 'Conexão Estabelecida' : 'Sem Conexão Cloud'}
                      </h3>
                      <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest max-w-sm">
                        {connStatus === 'online' 
                          ? 'Múltiplos terminais sincronizados via Supabase Realtime Gateway.' 
                          : 'As alterações locais serão enviadas assim que a conexão for restabelecida.'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-center md:items-end gap-2 relative z-10">
                    <div className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                      <RefreshCw size={14} className={isSyncing ? 'animate-spin text-brand-500' : 'text-slate-400'} />
                      <div className="text-right">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Backup Sincronizado às</p>
                        <p className="text-lg font-black tracking-tighter text-slate-900 dark:text-white leading-none uppercase">
                          {lastSync ? lastSync.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'}) : 'PENDENTE'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="p-10 rounded-[3rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl flex flex-col items-center justify-center text-center group transition-all hover:translate-y-[-4px]">
                    <div className="w-16 h-16 rounded-2xl bg-brand-600/10 flex items-center justify-center mb-5 text-brand-500 shadow-inner"><Box size={32}/></div>
                    <p className="text-[11px] font-black uppercase text-slate-400 tracking-widest">SKUs Ativos</p>
                    <h3 className="text-5xl font-black text-slate-900 dark:text-white mt-2 tracking-tighter">{items.length}</h3>
                  </div>
                  <div className="p-10 rounded-[3rem] border border-red-100 dark:border-red-900/30 bg-red-50/50 dark:bg-red-500/5 shadow-xl flex flex-col items-center justify-center text-center group transition-all hover:translate-y-[-4px]">
                    <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mb-5 text-red-500 shadow-inner"><AlertTriangle size={32} className="animate-pulse"/></div>
                    <p className="text-[11px] font-black uppercase text-red-500 tracking-widest">Abaixo do Mínimo</p>
                    <h3 className="text-5xl font-black text-red-600 mt-2 tracking-tighter">{statusStats.below}</h3>
                  </div>
                  <div className="p-10 rounded-[3rem] border border-emerald-100 dark:border-emerald-900/30 bg-emerald-50/50 dark:bg-emerald-500/5 shadow-xl flex flex-col items-center justify-center text-center group transition-all hover:translate-y-[-4px]">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-5 text-emerald-500 shadow-inner"><History size={32}/></div>
                    <p className="text-[11px] font-black uppercase text-emerald-500 tracking-widest">Registros Log</p>
                    <h3 className="text-5xl font-black text-emerald-600 mt-2 tracking-tighter">{movements.length}</h3>
                  </div>
                </div>

                {/* GRÁFICOS ANALÍTICOS */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-10">
                  {/* Gráfico 1: Status de Estoque (SVG Donut) */}
                  <div className="p-10 rounded-[3.5rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden relative group">
                    <div className="flex items-center gap-4 mb-10">
                      <div className="p-2.5 bg-brand-600 rounded-xl text-white shadow-lg"><PieChart size={20}/></div>
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-widest leading-none">Status de Reposição</h4>
                        <p className="text-[8px] font-bold text-slate-400 uppercase mt-1">Visão geral do inventário por níveis</p>
                      </div>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row items-center gap-10">
                      <div className="relative w-48 h-48 shrink-0">
                        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                          {/* Segmento Abaixo do Mínimo (Vermelho) */}
                          <circle cx="50" cy="50" r="40" fill="transparent" stroke="currentColor" strokeWidth="12" 
                            className="text-red-500/20" />
                          <circle cx="50" cy="50" r="40" fill="transparent" stroke="currentColor" strokeWidth="12" 
                            strokeDasharray={`${statusStats.belowPct * 2.51} 251.2`} 
                            strokeLinecap="round" className="text-red-500 transition-all duration-1000" />
                          
                          {/* Segmento Ideal (Verde) */}
                          <circle cx="50" cy="50" r="40" fill="transparent" stroke="currentColor" strokeWidth="12" 
                            strokeDasharray={`${statusStats.idealPct * 2.51} 251.2`} 
                            strokeDashoffset={`-${statusStats.belowPct * 2.51}`}
                            strokeLinecap="round" className="text-emerald-500 transition-all duration-1000" />
                          
                          {/* Segmento Acima (Azul) */}
                          <circle cx="50" cy="50" r="40" fill="transparent" stroke="currentColor" strokeWidth="12" 
                            strokeDasharray={`${statusStats.abovePct * 2.51} 251.2`} 
                            strokeDashoffset={`-${(statusStats.belowPct + statusStats.idealPct) * 2.51}`}
                            strokeLinecap="round" className="text-brand-500 transition-all duration-1000" />
                          
                          {/* Centro */}
                          <circle cx="50" cy="50" r="30" className="fill-white dark:fill-slate-900" />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                          <span className="text-3xl font-black tracking-tighter">{items.length}</span>
                          <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">ITENS</span>
                        </div>
                      </div>
                      
                      <div className="flex-1 space-y-4 w-full">
                        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                          <div className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full bg-red-500"></div>
                            <span className="text-[10px] font-black uppercase text-slate-600 dark:text-slate-400">CRÍTICO</span>
                          </div>
                          <span className="text-xs font-black text-red-600">{statusStats.below} UND</span>
                        </div>
                        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                          <div className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                            <span className="text-[10px] font-black uppercase text-slate-600 dark:text-slate-400">IDEAL</span>
                          </div>
                          <span className="text-xs font-black text-emerald-600">{statusStats.ideal} UND</span>
                        </div>
                        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                          <div className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full bg-brand-500"></div>
                            <span className="text-[10px] font-black uppercase text-slate-600 dark:text-slate-400">ACIMA</span>
                          </div>
                          <span className="text-xs font-black text-brand-600">{statusStats.above} UND</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Gráfico 2: Distribuição por Setor (Tailwind Horizontal Bars) */}
                  <div className="p-10 rounded-[3.5rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden relative group">
                    <div className="flex items-center gap-4 mb-10">
                      <div className="p-2.5 bg-brand-600 rounded-xl text-white shadow-lg"><BarChart3 size={20}/></div>
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-widest leading-none">Distribuição por Setor</h4>
                        <p className="text-[8px] font-bold text-slate-400 uppercase mt-1">Principais departamentos operacionais</p>
                      </div>
                    </div>
                    
                    <div className="space-y-6">
                      {deptDistribution.map((dept, idx) => {
                        const pct = (dept.count / Math.max(...deptDistribution.map(d => d.count))) * 100;
                        return (
                          <div key={idx} className="space-y-2 group/bar">
                            <div className="flex justify-between items-end">
                              <span className="text-[10px] font-black uppercase text-slate-700 dark:text-slate-300 tracking-widest">{dept.name}</span>
                              <span className="text-xs font-black text-brand-500">{dept.count} ITENS</span>
                            </div>
                            <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner p-0.5">
                              <div 
                                className="h-full bg-brand-600 rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(37,99,235,0.3)] group-hover/bar:bg-emerald-500" 
                                style={{ width: `${pct}%` }} 
                              />
                            </div>
                          </div>
                        );
                      })}
                      
                      {deptDistribution.length === 0 && (
                        <div className="h-40 flex flex-col items-center justify-center text-slate-400 opacity-30">
                           <BarChart3 size={48} className="mb-4" />
                           <span className="text-[10px] font-black uppercase tracking-widest">Nenhum dado departamental</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* INVENTORY - GRID RESPONSIVO OTIMIZADO */}
            {currentView === AppView.INVENTORY && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="flex flex-col xl:flex-row gap-4 items-start xl:items-center bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-md">
                  <div className="flex-1 w-full flex items-center gap-4 px-3">
                    <Search className="text-slate-400" size={20}/>
                    <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="PESQUISAR POR NOME OU LOCALIZAÇÃO..." className="flex-1 bg-transparent border-none outline-none font-bold text-sm uppercase dark:text-white placeholder-slate-500" />
                  </div>
                  
                  <div className="flex items-center gap-2 w-full xl:w-auto overflow-x-auto pb-1 xl:pb-0 custom-scrollbar shrink-0">
                    <button onClick={handleSelectAll} className={`px-4 py-2.5 rounded-xl font-black text-[9px] uppercase transition-all flex items-center gap-2 border shrink-0 ${selectedItemIds.length === filteredItems.length && filteredItems.length > 0 ? 'bg-brand-600 border-brand-600 text-white' : 'bg-slate-50 dark:bg-slate-950 border-transparent text-slate-500 hover:border-brand-500'}`}>
                       <ListChecks size={14}/> {selectedItemIds.length === filteredItems.length && filteredItems.length > 0 ? 'LIMPAR SELEÇÃO' : 'SELECIONAR TUDO'}
                    </button>
                    <div className="w-px h-8 bg-slate-200 dark:bg-slate-800 mx-2 shrink-0"></div>
                    {departments.map(dept => (
                      <button key={dept} onClick={() => { setSelectedDepartment(dept); setSelectedItemIds([]); }} 
                        className={`px-4 py-2.5 rounded-xl font-black text-[9px] uppercase whitespace-nowrap transition-all border shrink-0 ${selectedDepartment === dept ? 'bg-brand-600 border-brand-600 text-white shadow-lg' : 'bg-slate-50 dark:bg-slate-950 border-transparent text-slate-500 hover:bg-brand-500'}`}>
                        {dept}
                      </button>
                    ))}
                  </div>
                </div>

                {/* GRID DE CARDS ULTRA COMPACTOS */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-4">
                  {filteredItems.map(item => {
                    const isSelected = selectedItemIds.includes(item.id);
                    return (
                      <div key={item.id} onClick={() => toggleItemSelection(item.id)}
                        className={`group p-3 rounded-[1.8rem] border transition-all cursor-pointer relative overflow-hidden ${isSelected ? 'border-brand-500 bg-brand-500/5 dark:bg-brand-500/10 scale-95 shadow-inner' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:shadow-2xl hover:border-brand-500/50'}`}>
                        <div className="aspect-square bg-slate-50 dark:bg-slate-950/40 rounded-[1.4rem] mb-3 overflow-hidden relative border border-slate-200 dark:border-slate-800/10">
                          {item.photo_url ? <img src={item.photo_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center opacity-10"><Package size={40}/></div>}
                          <div className="absolute top-2 left-2 bg-slate-900/80 backdrop-blur-md px-2 py-0.5 rounded-lg text-[7px] font-black text-white uppercase tracking-tighter shadow-xl border border-white/10">{item.location}</div>
                        </div>
                        
                        <h4 className="font-black text-[10px] uppercase truncate text-slate-900 dark:text-white leading-tight mb-0.5">{item.name}</h4>
                        <p className="text-[8px] font-bold text-slate-400 uppercase mb-3 truncate opacity-80">{item.department}</p>
                        
                        <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800/40">
                          <div className="flex flex-col">
                            <span className={`text-xl font-black tracking-tighter leading-none ${item.current_stock <= item.min_stock ? 'text-red-500 animate-pulse' : 'text-slate-900 dark:text-slate-200'}`}>{item.current_stock}</span>
                            <span className="text-[7px] font-black text-slate-400 uppercase mt-1 tracking-widest">{item.unit}</span>
                          </div>
                          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                             <button onClick={() => { setMovementItemId(item.id); setMovementType('IN'); setIsMovementModalOpen(true); }} className="p-2 bg-emerald-500/10 text-emerald-500 rounded-xl hover:bg-emerald-500 hover:text-white transition-all shadow-sm"><Plus size={14}/></button>
                             <button onClick={() => { setMovementItemId(item.id); setMovementType('OUT'); setIsMovementModalOpen(true); }} className="p-2 bg-orange-500/10 text-orange-500 rounded-xl hover:bg-orange-500 hover:text-white transition-all shadow-sm"><TrendingDown size={14}/></button>
                             <button onClick={() => { setEditingItem(item); setFormData(item); setIsItemModalOpen(true); }} className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-xl hover:bg-brand-600 hover:text-white transition-all shadow-sm"><Edit3 size={14}/></button>
                          </div>
                        </div>
                        {isSelected && <div className="absolute top-4 right-4 bg-brand-500 text-white p-1 rounded-full shadow-2xl scale-in-center border-2 border-white dark:border-slate-900"><Check size={10} strokeWidth={4} /></div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* MONITORAMENTO DE CONEXÃO E EQUIPE NO SETTINGS */}
            {currentView === AppView.SETTINGS && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in slide-in-from-bottom-8">
                <div className="p-10 rounded-[3.5rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden relative">
                  <div className="flex items-center gap-5 mb-10">
                    <Signal className="text-brand-500" size={32} />
                    <h3 className="text-sm font-black uppercase tracking-widest">Sincronismo Global (Realtime)</h3>
                  </div>
                  <div className="space-y-5">
                    <div className="flex justify-between items-center p-6 rounded-3xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 shadow-inner group">
                      <div className="flex flex-col">
                        <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest leading-none">Gateway de Dados</span>
                        <span className="text-[8px] text-slate-400 font-bold uppercase mt-2 tracking-tighter">Conexão Ativa Multi-Dispositivo</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className={`w-3.5 h-3.5 rounded-full ${connStatus === 'online' ? 'bg-emerald-500 animate-pulse shadow-[0_0_20px_rgba(16,185,129,0.5)]' : 'bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.5)]'}`} />
                        <span className={`text-[12px] font-black uppercase tracking-widest ${connStatus === 'online' ? 'text-emerald-500' : 'text-red-500'}`}>{connStatus === 'online' ? 'ATIVO' : 'DESCONECTADO'}</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center p-6 rounded-3xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 shadow-inner">
                      <div className="flex flex-col">
                        <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Último Ponto de Sincronismo</span>
                      </div>
                      <span className="text-[12px] font-black uppercase text-slate-900 dark:text-white tracking-tighter">
                        {lastSync ? lastSync.toLocaleString([], {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit'}) : 'AGUARDANDO...'}
                      </span>
                    </div>
                    <button onClick={() => fetchData(true)} className="w-full py-6 bg-brand-600 text-white font-black rounded-3xl uppercase text-[10px] shadow-2xl transition-all hover:bg-brand-700 active:scale-95 flex items-center justify-center gap-4">
                       <RefreshCw size={20} className={isSyncing ? "animate-spin" : ""} /> FORÇAR SINCRONISMO AGORA
                    </button>
                  </div>
                </div>

                <div className="p-10 rounded-[3.5rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl flex flex-col justify-center items-center text-center group">
                   <div className="w-24 h-24 rounded-full bg-brand-600/10 flex items-center justify-center mb-10 shadow-inner group-hover:scale-110 transition-transform">
                      <Settings className="text-brand-500 animate-[spin_12s_linear_infinite]" size={48} />
                   </div>
                   <h3 className="text-sm font-black uppercase tracking-widest mb-4">Ergonomia Visual</h3>
                   <button onClick={() => setDarkMode(!darkMode)} className="flex items-center gap-4 px-10 py-5 rounded-[2.5rem] bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black uppercase text-[10px] shadow-2xl transition-all active:scale-90">
                      {darkMode ? <Sun size={22}/> : <Moon size={22}/>}
                      {darkMode ? 'MODO CLARO' : 'MODO ESCURO'}
                   </button>
                </div>
              </div>
            )}

            {/* AUDIT LOG - HISTÓRICO COMPLETO */}
            {currentView === AppView.MOVEMENTS && (
               <div className="space-y-3 max-w-4xl mx-auto animate-in slide-in-from-bottom-8">
                 <div className="flex items-center justify-between mb-4 px-2">
                    <h3 className="text-xs font-black uppercase tracking-[0.3em] flex items-center gap-3"><History size={20} className="text-brand-500"/> Registros de Atividade</h3>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{movements.length} Movimentos Gravados</span>
                 </div>
                 {movements.map(m => (
                   <div key={m.id} className="p-5 rounded-[2rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 flex items-center justify-between hover:bg-white dark:hover:bg-slate-900 transition-all shadow-sm border-l-4 border-l-transparent hover:border-l-brand-500">
                     <div className="flex gap-6 items-center">
                       <div className={`p-4 rounded-2xl shadow-inner ${m.type === 'IN' ? 'bg-emerald-500/20 text-emerald-500' : m.type === 'OUT' ? 'bg-orange-500/20 text-orange-500' : m.type === 'DELETE' ? 'bg-red-500/20 text-red-500' : 'bg-brand-500/20 text-brand-500'}`}>
                          {m.type === 'IN' ? <Plus size={22}/> : m.type === 'OUT' ? <TrendingDown size={22}/> : m.type === 'DELETE' ? <Trash2 size={22}/> : <Edit3 size={22}/>}
                       </div>
                       <div>
                         <p className="font-black text-xs uppercase text-slate-900 dark:text-white tracking-tight">{m.item_name}</p>
                         <p className="text-[9px] text-slate-400 uppercase font-bold mt-2">{new Date(m.timestamp).toLocaleString()} • <span className="text-brand-500 tracking-widest">{m.user_name}</span></p>
                       </div>
                     </div>
                     <div className="text-right">
                        <p className={`font-black text-xl tracking-tighter ${m.type === 'IN' ? 'text-emerald-500' : m.type === 'OUT' ? 'text-orange-500' : 'text-slate-400'}`}>{m.type === 'IN' ? '+' : m.type === 'OUT' ? '-' : ''}{m.quantity}</p>
                        <p className="text-[8px] font-black text-slate-400 uppercase mt-1 opacity-50">{m.reason}</p>
                     </div>
                   </div>
                 ))}
               </div>
            )}

            {/* TEAM VIEW - GESTÃO DE EQUIPE */}
            {currentView === AppView.USERS && (
              <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-bottom-8">
                <div className="flex items-center justify-between mb-4">
                   <div className="flex items-center gap-4">
                     <div className="p-3 bg-brand-600 rounded-2xl text-white shadow-lg"><Users size={22}/></div>
                     <div>
                       <h3 className="text-sm font-black uppercase tracking-widest">Gestão de Colaboradores</h3>
                       <p className="text-[9px] font-bold text-slate-400 uppercase">Perfis cadastrados com acesso ao terminal</p>
                     </div>
                   </div>
                   <button onClick={() => { setEditingUser(null); setUserFormData({ role: 'Colaborador' }); setIsUserEditModalOpen(true); }} className="bg-brand-600 text-white px-5 py-3 rounded-2xl text-[10px] font-black uppercase shadow-2xl active:scale-95 transition-all flex items-center gap-3">
                     <UserPlus size={18}/> NOVO CADASTRO
                   </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {allUsers.map(u => (
                    <div key={u.badge_id} className="p-6 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 flex items-center gap-6 group hover:border-brand-500/40 shadow-sm relative overflow-hidden transition-all">
                      <div className="w-16 h-16 rounded-[1.5rem] bg-brand-600/10 flex items-center justify-center overflow-hidden border-2 border-brand-500/20 shadow-inner group-hover:scale-105 transition-transform">
                        {u.photo_url ? <img src={u.photo_url} className="w-full h-full object-cover" /> : <UserIcon className="text-brand-500" size={32}/>}
                      </div>
                      <div className="min-w-0 flex-1 relative z-10">
                        <p className="font-black text-sm uppercase truncate text-slate-900 dark:text-white leading-tight">{u.name}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-[9px] font-black text-brand-500 uppercase tracking-widest">{u.role}</span>
                          <span className="text-[9px] font-bold text-slate-400 uppercase">ID: {u.badge_id}</span>
                        </div>
                      </div>
                      <button onClick={() => { setEditingUser(u); setUserFormData(u); setIsUserEditModalOpen(true); }} 
                        className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 text-slate-400 hover:text-brand-500 hover:bg-brand-500/10 transition-all shadow-sm">
                        <Edit3 size={20}/>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Floating Actions */}
        {currentView === AppView.INVENTORY && (
           <div className="fixed bottom-10 right-10 flex flex-col gap-4 z-40">
             <button onClick={handleExportExcel} className="w-14 h-14 rounded-full bg-brand-600 text-white flex items-center justify-center shadow-2xl hover:scale-110 active:scale-90 group relative">
               <Download size={26}/>
               <span className="absolute right-full mr-5 bg-brand-600 text-white text-[9px] font-black px-4 py-2 rounded-xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap shadow-2xl">EXPORTAR RELATÓRIO EXCEL</span>
             </button>
             <label className="w-14 h-14 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-2xl hover:scale-110 active:scale-90 cursor-pointer group relative">
                <Upload size={26}/>
                <span className="absolute right-full mr-5 bg-emerald-600 text-white text-[9px] font-black px-4 py-2 rounded-xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap shadow-2xl">CARGA DE DADOS (PLANILHA)</span>
                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImportExcel} />
             </label>
           </div>
        )}
      </main>

      {/* MODAL DE REGISTRO DE MOVIMENTAÇÃO */}
      {isMovementModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/95 backdrop-blur-3xl animate-in fade-in duration-300">
           <div className="rounded-[4rem] w-full max-w-[340px] overflow-hidden bg-white dark:bg-slate-900 shadow-2xl scale-in-center border border-white/10">
              <div className={`p-10 text-center ${movementType === 'IN' ? 'bg-emerald-600 shadow-[0_15px_40px_rgba(16,185,129,0.4)]' : 'bg-orange-600 shadow-[0_15px_40px_rgba(234,88,12,0.4)]'} text-white`}>
                 <h3 className="text-4xl font-black uppercase tracking-widest">{movementType === 'IN' ? 'Entrada' : 'Saída'}</h3>
                 <p className="text-[10px] mt-4 font-black uppercase opacity-80 truncate px-6 tracking-widest">{items.find(i => i.id === movementItemId)?.name}</p>
              </div>
              <form onSubmit={handleMovement} className="p-10 space-y-8 text-center">
                 <div className="space-y-4">
                   <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Quantidade Operacional</label>
                   <input type="number" min="1" required autoFocus className="w-full text-7xl font-black text-center p-8 rounded-[2.5rem] outline-none bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white shadow-inner focus:border-brand-500 border-2 border-transparent transition-all" value={moveData.quantity} onChange={e => setMoveData({...moveData, quantity: Number(e.target.value)})} />
                 </div>
                 <div className="space-y-2 text-left">
                   <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Referência / Nota Fiscal</label>
                   <input placeholder="OPCIONAL..." className="w-full p-5 rounded-2xl text-center uppercase text-[11px] bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none font-bold shadow-inner focus:border-brand-500 border border-transparent transition-all" value={moveData.reason} onChange={e => setMoveData({...moveData, reason: e.target.value})} />
                 </div>
                 <button type="submit" disabled={isSyncing} className={`w-full py-7 text-white font-black rounded-[2rem] uppercase text-xs shadow-2xl active:scale-95 transition-all ${movementType === 'IN' ? 'bg-emerald-600' : 'bg-orange-600'}`}>
                   {isSyncing ? <Loader2 className="animate-spin m-auto" size={24}/> : 'CONFIRMAR OPERAÇÃO'}
                 </button>
                 <button type="button" onClick={() => setIsMovementModalOpen(false)} className="w-full text-[10px] font-black text-slate-400 uppercase tracking-[0.5em] hover:text-red-500 transition-colors">DESCARTAR</button>
              </form>
           </div>
        </div>
      )}

      {/* MODAL DE CADASTRO/EDIÇÃO DE ITEM */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in zoom-in duration-300">
          <div className="rounded-[4rem] w-full max-w-lg max-h-[96vh] overflow-hidden flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl">
            <div className="p-10 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center px-12 bg-slate-50 dark:bg-slate-950/50">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-brand-600">{editingItem ? 'Edição Técnica de SKU' : 'Cadastrar Novo Recurso'}</h3>
              <button onClick={() => setIsItemModalOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors"><X size={36} /></button>
            </div>
            <form onSubmit={handleSaveItem} className="p-12 space-y-8 overflow-y-auto custom-scrollbar">
               <div className="flex flex-col items-center gap-8">
                  <div className="w-36 h-36 rounded-[2.5rem] bg-slate-50 dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 overflow-hidden relative group shadow-inner">
                    {formData.photo_url ? <img src={formData.photo_url} className="w-full h-full object-cover" /> : <Package size={56} className="m-auto mt-12 opacity-10" />}
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="absolute inset-0 bg-brand-600/90 flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all backdrop-blur-sm"><Camera size={32}/><span className="text-[10px] font-black mt-2">CAPTURAR IMAGEM</span></button>
                  </div>
                  <input type="file" accept="image/*" capture="environment" ref={fileInputRef} className="hidden" onChange={(e) => handlePhotoUpload(e, 'item')} />
                  <div className="w-full space-y-3">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Descrição do Material</label>
                    <div className="relative">
                      <input required className="w-full p-6 rounded-[1.8rem] font-black text-center uppercase outline-none focus:border-brand-500 border-2 border-transparent text-sm bg-slate-50 dark:bg-slate-950 shadow-inner pr-16" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="NOME DO MATERIAL" />
                      <button type="button" onClick={handleAIAssistant} className="absolute right-4 top-1/2 -translate-y-1/2 p-2.5 bg-brand-500 text-white rounded-2xl shadow-lg hover:scale-110 active:scale-95 transition-all group">
                        <BrainCircuit size={22} className="group-hover:rotate-12 transition-transform"/>
                      </button>
                    </div>
                  </div>
               </div>
               <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Setor</label>
                    <input className="w-full p-5 rounded-2xl font-bold text-center uppercase text-[12px] bg-slate-50 dark:bg-slate-950 outline-none border-2 border-transparent focus:border-brand-500 transition-all shadow-inner" value={formData.department || ''} onChange={e => setFormData({...formData, department: e.target.value})} placeholder="EX: PRODUÇÃO" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Localização Interna</label>
                    <input className="w-full p-5 rounded-2xl font-bold text-center uppercase text-[12px] bg-slate-50 dark:bg-slate-950 outline-none border-2 border-transparent focus:border-brand-500 transition-all shadow-inner" value={formData.location || ''} onChange={e => setFormData({...formData, location: e.target.value})} placeholder="EX: BOX A-01" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Unid. Medida</label>
                    <input className="w-full p-5 rounded-2xl font-bold text-center uppercase text-[12px] bg-slate-50 dark:bg-slate-950 outline-none border-2 border-transparent focus:border-brand-500 transition-all shadow-inner" value={formData.unit || 'UND'} onChange={e => setFormData({...formData, unit: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Mínimo</label>
                    <input type="number" className="w-full p-5 rounded-2xl font-black text-center text-xs bg-slate-50 dark:bg-slate-950 outline-none border-2 border-transparent focus:border-brand-500 transition-all shadow-inner" value={formData.min_stock || 0} onChange={e => setFormData({...formData, min_stock: Number(e.target.value)})} />
                  </div>
               </div>
               {!editingItem && (
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Saldo de Abertura</label>
                    <input type="number" className="w-full p-6 rounded-[1.8rem] font-black text-center text-2xl bg-brand-500/5 dark:bg-brand-500/10 border-2 border-brand-500/30 outline-none focus:border-brand-500 shadow-inner" value={formData.current_stock || 0} onChange={e => setFormData({...formData, current_stock: Number(e.target.value)})} />
                 </div>
               )}
               <button type="submit" disabled={isSyncing} className="w-full py-6 bg-brand-600 text-white rounded-[2.2rem] font-black uppercase text-xs shadow-2xl hover:bg-brand-700 active:scale-95 transition-all flex items-center justify-center gap-5">
                 {isSyncing ? <Loader2 className="animate-spin" size={24}/> : <CheckCircle2 size={24}/>}
                 {editingItem ? 'ATUALIZAR REGISTRO' : 'CONCLUIR CADASTRO NO CLOUD'}
               </button>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRMAÇÃO DE EXCLUSÃO */}
      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-8 bg-black/95 backdrop-blur-3xl animate-in fade-in duration-300">
           <div className="rounded-[4rem] w-full max-w-[360px] p-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl text-center scale-in-center">
              <div className="w-24 h-24 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-8 animate-pulse border-2 border-red-500/20 shadow-[0_0_30px_rgba(239,68,68,0.2)]">
                <Trash2 size={44} />
              </div>
              <h3 className="text-2xl font-black uppercase tracking-tighter mb-4 text-slate-900 dark:text-white">Ação Irreversível</h3>
              <p className="text-[11px] text-slate-500 mb-10 uppercase tracking-widest font-bold leading-relaxed px-4">
                {deleteTarget === 'SINGLE' 
                  ? `Deseja remover permanentemente "${itemToDelete?.name}" do inventário?`
                  : `Confirma a remoção definitiva de ${selectedItemIds.length} materiais selecionados?`}
              </p>
              <div className="space-y-4">
                <button onClick={executeDelete} disabled={isSyncing} className="w-full py-6 bg-red-600 text-white font-black rounded-[2rem] uppercase text-xs shadow-2xl active:scale-95 transition-all">
                  {isSyncing ? <Loader2 className="animate-spin m-auto" /> : 'CONFIRMAR EXCLUSÃO'}
                </button>
                <button onClick={() => setIsDeleteConfirmOpen(false)} className="w-full py-4 text-slate-400 font-black rounded-[2rem] uppercase text-[10px] tracking-widest hover:text-slate-900 dark:hover:text-white transition-colors">DESCARTAR</button>
              </div>
           </div>
        </div>
      )}

      {/* MODAL DE PERFIL DO COLABORADOR */}
      {isUserEditModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-black/95 backdrop-blur-2xl animate-in zoom-in duration-200">
           <div className="rounded-[3.5rem] w-full max-w-[360px] overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl">
              <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950/50">
                 <h3 className="text-[10px] font-black uppercase tracking-widest text-brand-600">{editingUser ? 'Edição de Perfil Autorizado' : 'Novo Perfil de Acesso'}</h3>
                 <button onClick={() => setIsUserEditModalOpen(false)} className="text-slate-400 hover:text-red-500"><X size={28}/></button>
              </div>
              <form onSubmit={handleSaveUser} className="p-10 space-y-8">
                 <div className="flex flex-col items-center gap-6">
                    <div className="w-28 h-28 rounded-[2.5rem] bg-slate-100 dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 overflow-hidden relative group shadow-inner">
                      {userFormData.photo_url ? <img src={userFormData.photo_url} className="w-full h-full object-cover" /> : <UserIcon size={44} className="m-auto mt-7 opacity-10" />}
                      <button type="button" onClick={() => userPhotoInputRef.current?.click()} className="absolute inset-0 bg-brand-600/90 flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all backdrop-blur-sm"><Camera size={30}/><span className="text-[8px] font-black mt-2">ENVIAR FOTO</span></button>
                    </div>
                    <input type="file" accept="image/*" ref={userPhotoInputRef} className="hidden" onChange={(e) => handlePhotoUpload(e, 'user')} />
                    
                    <div className="w-full space-y-5">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Matrícula</label>
                        <input required disabled={!!editingUser} className="w-full p-4.5 rounded-2xl font-black text-center uppercase outline-none focus:border-brand-500 border-2 border-transparent text-sm bg-slate-50 dark:bg-slate-950 shadow-inner disabled:opacity-50" value={userFormData.badge_id || ''} onChange={e => setUserFormData({...userFormData, badge_id: e.target.value})} placeholder="Nº ÚNICO" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Completo</label>
                        <input required className="w-full p-4.5 rounded-2xl font-black text-center uppercase outline-none focus:border-brand-500 border-2 border-transparent text-sm bg-slate-50 dark:bg-slate-950 shadow-inner" value={userFormData.name || ''} onChange={e => setUserFormData({...userFormData, name: e.target.value})} placeholder="NOME DO COLABORADOR" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Função Hierárquica</label>
                        <select className="w-full p-4.5 rounded-2xl font-black text-center uppercase outline-none focus:border-brand-500 border-2 border-transparent text-sm bg-slate-50 dark:bg-slate-950 shadow-inner appearance-none cursor-pointer" value={userFormData.role || 'Colaborador'} onChange={e => setUserFormData({...userFormData, role: e.target.value})}>
                           <option value="Colaborador">Colaborador</option>
                           <option value="Estoquista">Estoquista</option>
                           <option value="Supervisor">Supervisor</option>
                           <option value="Coordenador">Coordenador</option>
                           <option value="Gerente">Gerente</option>
                           <option value="Administrador">Administrador</option>
                        </select>
                      </div>
                    </div>
                 </div>
                 <button type="submit" disabled={isSyncing} className="w-full py-6 bg-brand-600 text-white rounded-[2rem] font-black uppercase text-[11px] shadow-2xl active:scale-95 transition-all">
                    {isSyncing ? <Loader2 className="animate-spin m-auto" size={24}/> : editingUser ? 'CONCLUIR EDIÇÃO' : 'EFETIVAR CADASTRO'}
                 </button>
              </form>
           </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 3px; height: 3px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #3b82f6; border-radius: 10px; opacity: 0.1; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #2563eb; }
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
        @keyframes scale-in-center { 0% { transform: scale(0); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
        .scale-in-center { animation: scale-in-center 0.3s cubic-bezier(0.250, 0.460, 0.450, 0.940) both; }
        * { transition: background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), transform 150ms cubic-bezier(0.4, 0, 0.2, 1); }
      `}</style>
    </div>
  );
}
