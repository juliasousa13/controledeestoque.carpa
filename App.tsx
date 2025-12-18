
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  LayoutDashboard, Package, Plus, Search, Trash2, Moon, Sun, Menu, X, 
  Camera, AlertTriangle, Loader2, RefreshCw, TrendingDown, Box, 
  History, Activity, Edit3, Users, FileSpreadsheet, 
  Upload, CheckCircle2, User as UserIcon, LogOut, ChevronRight,
  Info, Check, Database, ShieldCheck, Settings, Download, Filter,
  Sparkles, BrainCircuit, ListChecks, UserPlus
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

  // Optimized Data Fetching
  const fetchData = useCallback(async (showLoader = true) => {
    if (showLoader) setIsSyncing(true);
    try {
      const [itRes, movRes, userRes] = await Promise.all([
        supabase.from('inventory_items').select('*').order('name'),
        supabase.from('movements').select('*').order('timestamp', { ascending: false }).limit(40),
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
  }, [fetchData]);

  // Filtered List - memoized for performance
  const filteredItems = useMemo(() => {
    return items.filter(i => {
      const matchesSearch = !searchTerm || 
        i.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        i.location.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesDept = selectedDepartment === 'TODOS' || i.department === selectedDepartment;
      return matchesSearch && matchesDept;
    });
  }, [items, searchTerm, selectedDepartment]);

  const departments = useMemo(() => {
    const deps = new Set(items.map(i => i.department).filter(Boolean));
    return ['TODOS', ...Array.from(deps)].sort();
  }, [items]);

  // Select All logic
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

  // Item Management
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
      
      await supabase.from('movements').insert({
        item_id: itemToSave.id,
        item_name: itemToSave.name,
        type: isNew ? 'CREATE' : 'EDIT',
        quantity: isNew ? itemToSave.current_stock : 0,
        user_badge_id: user.badgeId,
        user_name: user.name,
        timestamp: itemToSave.last_updated,
        reason: isNew ? 'Abertura de estoque' : 'Atualização técnica'
      });

      setIsItemModalOpen(false);
      setEditingItem(null);
      setFormData({});
      fetchData(false);
    } catch (err: any) {
      alert("Erro ao sincronizar. Verifique sua conexão.");
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
      
      setIsUserEditModalOpen(false);
      setEditingUser(null);
      setUserFormData({});
      fetchData(false);
    } catch (err) {
      alert("Erro ao atualizar perfil do colaborador.");
    } finally {
      setIsSyncing(false);
    }
  };

  const executeDelete = async () => {
    if (!user) return;
    setIsSyncing(true);
    try {
      if (deleteTarget === 'SINGLE' && itemToDelete) {
        await supabase.from('movements').insert({
          item_id: itemToDelete.id, item_name: itemToDelete.name, type: 'DELETE',
          quantity: itemToDelete.current_stock, user_badge_id: user.badgeId,
          user_name: user.name, timestamp: new Date().toISOString(),
          reason: 'Remoção via sistema'
        });
        const { error } = await supabase.from('inventory_items').delete().eq('id', itemToDelete.id);
        if (error) throw error;
      } else if (deleteTarget === 'BATCH' && selectedItemIds.length > 0) {
        for (const id of selectedItemIds) {
          const item = items.find(id => id.id === id);
          if (item) {
            await supabase.from('movements').insert({
              item_id: item.id, item_name: item.name, type: 'DELETE',
              quantity: item.current_stock, user_badge_id: user.badgeId,
              user_name: user.name, timestamp: new Date().toISOString(),
              reason: 'Exclusão em massa por setor'
            });
          }
        }
        const { error } = await supabase.from('inventory_items').delete().in('id', selectedItemIds);
        if (error) throw error;
      }
      setIsDeleteConfirmOpen(false);
      setItemToDelete(null);
      setSelectedItemIds([]);
      fetchData(false);
    } catch (err: any) {
      alert("Erro no processo de exclusão.");
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
      alert("Saldo insuficiente para operação.");
      setIsSyncing(false);
      return;
    }
    
    try {
      await supabase.from('inventory_items').update({ 
        current_stock: newStock, last_updated: new Date().toISOString(), last_updated_by: user.name 
      }).eq('id', item.id);

      await supabase.from('movements').insert({
        item_id: item.id, item_name: item.name, type: movementType,
        quantity: qty, user_badge_id: user.badgeId, user_name: user.name,
        timestamp: new Date().toISOString(), reason: moveData.reason
      });

      setIsMovementModalOpen(false);
      setMoveData({ quantity: 1, reason: '' });
      fetchData(false);
    } catch (err: any) {
      alert("Erro ao processar movimentação.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExportExcel = () => {
    const data = items.map(i => ({
      "Material": i.name, "Setor": i.department, "Local": i.location,
      "Saldo": i.current_stock, "Unidade": i.unit
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Estoque");
    XLSX.writeFile(wb, `CONTROLE_AG_RELATORIO.xlsx`);
  };

  // Fix for error on line 604: Added missing handleImportExcel function to process spreadsheet uploads
  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        setIsSyncing(true);
        for (const row of data as any[]) {
          const itemToSave = {
            id: `IT-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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
          }
        }
        fetchData(false);
        alert("Importação concluída com sucesso!");
      } catch (err) {
        console.error("Import error:", err);
        alert("Erro ao processar arquivo Excel.");
      } finally {
        setIsSyncing(false);
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  if (isLoading) return (
    <div className="h-screen flex flex-col items-center justify-center bg-white dark:bg-[#020617]">
      <Logo className="w-16 h-16 animate-pulse" />
      <div className="mt-6 flex flex-col items-center gap-2">
        <Loader2 className="animate-spin text-brand-600" size={28} />
        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Sincronizando Sistema...</span>
      </div>
    </div>
  );

  if (!user) return (
    <div className="h-screen flex items-center justify-center p-6 bg-slate-100 dark:bg-[#020617]">
      <div className="w-full max-w-[320px] p-8 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl animate-in zoom-in">
        <div className="flex flex-col items-center mb-8 text-center">
          <Logo className="w-14 h-14 mb-4" />
          <h1 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">CONTROLE AG</h1>
          <p className="text-[9px] font-black text-brand-500 uppercase tracking-widest mt-1">Console Administrativo</p>
        </div>
        <form onSubmit={async (e) => {
          e.preventDefault();
          const badge = (e.target as any).badge.value;
          const { data } = await supabase.from('users').select('*').eq('badge_id', badge).single();
          if (data) setUser({ badgeId: data.badge_id, name: data.name, role: data.role, photoUrl: data.photo_url });
          else {
            const name = prompt("Matrícula não cadastrada. Nome do Usuário:");
            if (name) {
              await supabase.from('users').insert({ badge_id: badge, name: name.toUpperCase(), role: 'Colaborador' });
              setUser({ badgeId: badge, name: name.toUpperCase(), role: 'Colaborador' });
            }
          }
        }} className="space-y-4">
          <input name="badge" required placeholder="MATRÍCULA" className="w-full py-4 rounded-2xl font-black text-center uppercase outline-none border-2 border-transparent focus:border-brand-500 text-sm bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white shadow-inner" />
          <button className="w-full py-4 bg-brand-600 text-white font-black rounded-2xl uppercase tracking-widest active:scale-95 transition-all text-xs">IDENTIFICAR</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="h-screen flex flex-col lg:flex-row bg-slate-50 dark:bg-[#020617] text-slate-900 dark:text-white overflow-hidden transition-colors duration-300">
      
      {/* Sidebar Compacta */}
      <aside className={`fixed lg:static inset-y-0 left-0 w-64 z-50 transform transition-transform duration-300 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex flex-col h-full p-5">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <Logo className="w-8 h-8" />
              <span className="font-black text-lg tracking-tighter">AG ESTOQUE</span>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden text-slate-400"><X size={24}/></button>
          </div>
          
          <nav className="flex-1 space-y-1">
            {[
              { id: AppView.DASHBOARD, icon: LayoutDashboard, label: 'Painel Geral' },
              { id: AppView.INVENTORY, icon: Package, label: 'Inventário' },
              { id: AppView.MOVEMENTS, icon: History, label: 'Movimentações' },
              { id: AppView.USERS, icon: Users, label: 'Equipe AG' },
              { id: AppView.SETTINGS, icon: Settings, label: 'Preferências' }
            ].map(v => (
              <button key={v.id} onClick={() => { setCurrentView(v.id); setIsSidebarOpen(false); setSelectedItemIds([]); }} 
                className={`w-full flex items-center gap-4 p-3 rounded-xl font-bold text-[11px] transition-all ${currentView === v.id ? 'bg-brand-600 text-white shadow-md' : 'text-slate-400 hover:bg-brand-500/10'}`}>
                <v.icon size={16} /> {v.label}
              </button>
            ))}
          </nav>

          <div className="mt-auto pt-5 border-t border-slate-200 dark:border-slate-800">
             <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 flex items-center gap-3 border border-slate-200 dark:border-slate-800">
              <div className="w-9 h-9 rounded-lg bg-brand-600 flex items-center justify-center overflow-hidden border border-brand-500/20 shadow-inner shrink-0">
                {user.photoUrl ? <img src={user.photoUrl} className="w-full h-full object-cover" /> : <UserIcon className="text-white" size={16}/>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-black text-[10px] truncate uppercase leading-none">{user.name}</p>
                <p className="text-[8px] text-brand-500 font-bold uppercase mt-1 tracking-tighter">{user.role}</p>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setDarkMode(!darkMode)} className="flex-1 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-center text-slate-500 hover:text-brand-500 transition-all">
                {darkMode ? <Sun size={18}/> : <Moon size={18}/>}
              </button>
              <button onClick={() => setUser(null)} className="flex-1 p-2.5 bg-red-500/10 text-red-500 rounded-xl font-black text-[9px] uppercase hover:bg-red-500 hover:text-white transition-all">SAIR</button>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="h-14 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 bg-white/60 dark:bg-[#020617]/60 backdrop-blur-xl sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 text-slate-500"><Menu size={22}/></button>
            <h2 className="font-black text-[9px] uppercase tracking-widest opacity-60">{currentView}</h2>
          </div>
          
          <div className="flex gap-2">
            {selectedItemIds.length > 0 && (
              <button onClick={() => { setDeleteTarget('BATCH'); setIsDeleteConfirmOpen(true); }} className="bg-red-500 text-white px-3 py-1.5 rounded-lg font-black text-[9px] flex items-center gap-2 shadow-lg animate-in slide-in-from-top-4">
                <Trash2 size={12}/> EXCLUIR SETOR ({selectedItemIds.length})
              </button>
            )}
            {currentView === AppView.INVENTORY && (
              <button onClick={() => { setEditingItem(null); setFormData({}); setIsItemModalOpen(true); }} className="bg-brand-600 text-white px-4 py-1.5 rounded-lg font-black text-[10px] flex items-center gap-2 shadow-lg uppercase tracking-widest active:scale-95">
                <Plus size={14}/> NOVO ITEM
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 lg:p-6 custom-scrollbar">
          <div className="max-w-7xl mx-auto space-y-4">
            
            {/* INVENTORY - Optimized Grid & Bulk Actions */}
            {currentView === AppView.INVENTORY && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <div className="flex flex-col xl:flex-row gap-3 items-start xl:items-center bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <div className="flex-1 w-full flex items-center gap-3 px-3">
                    <Search className="text-slate-400" size={16}/>
                    <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="PESQUISAR MATERIAL..." className="flex-1 bg-transparent border-none outline-none font-bold text-xs uppercase dark:text-white placeholder-slate-500" />
                  </div>
                  
                  <div className="flex items-center gap-2 w-full xl:w-auto overflow-x-auto pb-1 xl:pb-0 custom-scrollbar shrink-0">
                    <button onClick={handleSelectAll} className={`px-3 py-2 rounded-xl font-black text-[8px] uppercase transition-all flex items-center gap-2 border shrink-0 ${selectedItemIds.length === filteredItems.length && filteredItems.length > 0 ? 'bg-brand-600 border-brand-600 text-white' : 'bg-slate-50 dark:bg-slate-950 border-transparent text-slate-500 hover:border-brand-500'}`}>
                       <ListChecks size={12}/> {selectedItemIds.length === filteredItems.length && filteredItems.length > 0 ? 'DESELECIONAR TUDO' : 'SELECIONAR TUDO'}
                    </button>
                    <div className="w-px h-6 bg-slate-200 dark:bg-slate-800 mx-1 shrink-0"></div>
                    <Filter size={12} className="text-slate-400 shrink-0" />
                    {departments.map(dept => (
                      <button key={dept} onClick={() => { setSelectedDepartment(dept); setSelectedItemIds([]); }} 
                        className={`px-3 py-2 rounded-xl font-black text-[8px] uppercase whitespace-nowrap border shrink-0 ${selectedDepartment === dept ? 'bg-brand-500 border-brand-500 text-white shadow-sm' : 'bg-slate-50 dark:bg-slate-950 border-transparent text-slate-500'}`}>
                        {dept}
                      </button>
                    ))}
                  </div>
                </div>

                {/* COMPACT RESPONSIVE GRID */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 2xl:grid-cols-8 gap-3">
                  {filteredItems.map(item => {
                    const isSelected = selectedItemIds.includes(item.id);
                    return (
                      <div key={item.id} onClick={() => toggleItemSelection(item.id)}
                        className={`group p-2.5 rounded-[1.2rem] border transition-all cursor-pointer relative ${isSelected ? 'border-brand-500 bg-brand-500/5 dark:bg-brand-500/10 scale-95' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:shadow-md'}`}>
                        <div className="aspect-square bg-slate-50 dark:bg-slate-950/40 rounded-xl mb-2 overflow-hidden relative border border-slate-200 dark:border-slate-800/10">
                          {item.photo_url ? <img src={item.photo_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center opacity-10"><Package size={28}/></div>}
                          <div className="absolute top-1.5 left-1.5 bg-slate-900/80 px-1.5 py-0.5 rounded-md text-[6px] font-black text-white uppercase tracking-tighter">{item.location}</div>
                        </div>
                        
                        <h4 className="font-black text-[9px] uppercase truncate text-slate-900 dark:text-white mb-0.5">{item.name}</h4>
                        <p className="text-[7px] font-bold text-slate-400 uppercase mb-2 truncate">{item.department}</p>
                        
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/40">
                          <div className="flex flex-col">
                            <span className={`text-base font-black tracking-tighter ${item.current_stock <= item.min_stock ? 'text-red-500 animate-pulse' : 'text-slate-900 dark:text-slate-200'}`}>{item.current_stock}</span>
                            <span className="text-[6px] font-black text-slate-400 uppercase">{item.unit}</span>
                          </div>
                          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                             <button onClick={() => { setMovementItemId(item.id); setMovementType('IN'); setIsMovementModalOpen(true); }} className="p-1.5 bg-emerald-500/10 text-emerald-500 rounded-md hover:bg-emerald-500 hover:text-white"><Plus size={12}/></button>
                             <button onClick={() => { setMovementItemId(item.id); setMovementType('OUT'); setIsMovementModalOpen(true); }} className="p-1.5 bg-orange-500/10 text-orange-500 rounded-md hover:bg-orange-500 hover:text-white"><TrendingDown size={12}/></button>
                             <button onClick={() => { setEditingItem(item); setFormData(item); setIsItemModalOpen(true); }} className="p-1.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-md hover:bg-brand-600 hover:text-white"><Edit3 size={12}/></button>
                          </div>
                        </div>
                        {isSelected && <div className="absolute top-3 right-3 bg-brand-500 text-white p-1 rounded-full shadow-lg scale-in-center"><Check size={8} strokeWidth={4} /></div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TEAM VIEW - With Edit Profile Option */}
            {currentView === AppView.USERS && (
              <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-bottom-8 duration-300">
                <div className="flex items-center justify-between">
                   <div className="flex items-center gap-3">
                     <Users size={20} className="text-brand-500"/>
                     <h3 className="text-sm font-black uppercase tracking-widest">Colaboradores AG</h3>
                   </div>
                   <button onClick={() => { setEditingUser(null); setUserFormData({ role: 'Colaborador' }); setIsUserEditModalOpen(true); }} className="bg-brand-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase shadow-lg flex items-center gap-2">
                     <UserPlus size={14}/> NOVO CADASTRO
                   </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
                  {allUsers.map(u => (
                    <div key={u.badge_id} className="p-5 rounded-[2rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 flex items-center gap-5 group hover:border-brand-500/40 shadow-sm relative overflow-hidden transition-all">
                      <div className="w-14 h-14 rounded-2xl bg-brand-600/10 flex items-center justify-center overflow-hidden border border-brand-500/20 shrink-0">
                        {u.photo_url ? <img src={u.photo_url} className="w-full h-full object-cover" /> : <UserIcon className="text-brand-500" size={24}/>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-black text-sm uppercase truncate text-slate-900 dark:text-white leading-tight">{u.name}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase mt-1.5">{u.role} • Matrícula: {u.badge_id}</p>
                      </div>
                      <button onClick={() => { setEditingUser(u); setUserFormData(u); setIsUserEditModalOpen(true); }} 
                        className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 text-slate-400 hover:text-brand-500 hover:bg-brand-500/10 transition-all">
                        <Edit3 size={18}/>
                      </button>
                      <div className="absolute -right-4 -bottom-4 opacity-[0.03] text-brand-500 pointer-events-none group-hover:scale-125 transition-transform duration-700">
                        <ShieldCheck size={80}/>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* DASHBOARD STATS */}
            {currentView === AppView.DASHBOARD && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in slide-in-from-bottom-8 duration-300">
                <div className="p-10 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg flex flex-col items-center justify-center text-center group">
                  <Box className="text-brand-500 mb-4 group-hover:scale-110 transition-transform" size={48}/>
                  <p className="text-[11px] font-black uppercase text-slate-400 tracking-widest">Itens em Estoque</p>
                  <h3 className="text-6xl font-black text-slate-900 dark:text-white mt-2 tracking-tighter">{items.length}</h3>
                </div>
                <div className="p-10 rounded-[2.5rem] border border-red-100 dark:border-red-900/30 bg-red-50/50 dark:bg-red-500/5 shadow-lg flex flex-col items-center justify-center text-center group">
                  <AlertTriangle className="text-red-500 mb-4 group-hover:animate-bounce" size={48}/>
                  <p className="text-[11px] font-black uppercase text-red-500 tracking-widest">Abaixo do Mínimo</p>
                  <h3 className="text-6xl font-black text-red-600 mt-2 tracking-tighter">{items.filter(i => i.current_stock <= i.min_stock).length}</h3>
                </div>
                <div className="p-10 rounded-[2.5rem] border border-emerald-100 dark:border-emerald-900/30 bg-emerald-50/50 dark:bg-emerald-500/5 shadow-lg flex flex-col items-center justify-center text-center group">
                  <Activity className="text-emerald-500 mb-4 group-hover:rotate-12 transition-transform" size={48}/>
                  <p className="text-[11px] font-black uppercase text-emerald-500 tracking-widest">Logs Gravados</p>
                  <h3 className="text-6xl font-black text-emerald-600 mt-2 tracking-tighter">{movements.length}</h3>
                </div>
              </div>
            )}
            
            {/* OTHER VIEWS (MINIMAL UPDATE FOR PERFORMANCE) */}
            {currentView === AppView.MOVEMENTS && (
               <div className="space-y-2 max-w-4xl mx-auto animate-in slide-in-from-bottom-4 duration-300">
                 {movements.map(m => (
                   <div key={m.id} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 flex items-center justify-between hover:bg-white transition-all shadow-sm">
                     <div className="flex gap-4 items-center">
                       <div className={`p-2.5 rounded-xl ${m.type === 'IN' ? 'bg-emerald-500/20 text-emerald-500' : m.type === 'OUT' ? 'bg-orange-500/20 text-orange-500' : 'bg-brand-500/20 text-brand-500'}`}>
                          {m.type === 'IN' ? <Plus size={18}/> : m.type === 'OUT' ? <TrendingDown size={18}/> : <Edit3 size={18}/>}
                       </div>
                       <div>
                         <p className="font-black text-[11px] uppercase text-slate-900 dark:text-white leading-tight">{m.item_name}</p>
                         <p className="text-[8px] text-slate-400 uppercase font-bold mt-1">{new Date(m.timestamp).toLocaleString()} • <span className="text-brand-500">{m.user_name}</span></p>
                       </div>
                     </div>
                     <div className="text-right">
                        <p className={`font-black text-base tracking-tighter ${m.type === 'IN' ? 'text-emerald-500' : m.type === 'OUT' ? 'text-orange-500' : 'text-slate-400'}`}>{m.type === 'IN' ? '+' : m.type === 'OUT' ? '-' : ''}{m.quantity}</p>
                     </div>
                   </div>
                 ))}
               </div>
            )}

            {currentView === AppView.SETTINGS && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in slide-in-from-bottom-8 duration-300">
                <div className="p-10 rounded-[3rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl">
                  <div className="flex items-center gap-4 mb-8">
                    <Database className="text-brand-500" size={24} />
                    <h3 className="text-xs font-black uppercase tracking-widest">Sincronismo AG</h3>
                  </div>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center p-5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                      <span className="text-[10px] font-black text-slate-500 uppercase">Status Cloud</span>
                      <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${connStatus === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                        <span className={`text-[10px] font-black uppercase ${connStatus === 'online' ? 'text-emerald-500' : 'text-red-500'}`}>{connStatus === 'online' ? 'Online' : 'Offline'}</span>
                      </div>
                    </div>
                    <button onClick={() => fetchData(true)} className="w-full py-4 bg-brand-600 text-white font-black rounded-xl uppercase text-[10px] shadow-lg flex items-center justify-center gap-3">
                       <RefreshCw size={16} className={isSyncing ? "animate-spin" : ""} /> ATUALIZAR BANCO
                    </button>
                  </div>
                </div>
                <div className="p-10 rounded-[3rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl flex flex-col justify-center items-center text-center">
                   <Settings className="text-brand-500 mb-6 animate-[spin_8s_linear_infinite]" size={40} />
                   <h3 className="text-[10px] font-black uppercase mb-8">Aparência do Console</h3>
                   <button onClick={() => setDarkMode(!darkMode)} className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black uppercase text-[10px] shadow-2xl transition-all">
                      {darkMode ? <Sun size={18}/> : <Moon size={18}/>}
                      {darkMode ? 'MODO CLARO' : 'MODO ESCURO'}
                   </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Floating Actions */}
        {currentView === AppView.INVENTORY && (
           <div className="fixed bottom-8 right-8 flex flex-col gap-3 z-40">
             <button onClick={handleExportExcel} className="w-14 h-14 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center shadow-2xl hover:scale-110 active:scale-90 group relative border border-white/10">
               <Download size={22}/>
               <span className="absolute right-full mr-4 bg-slate-900 text-white text-[8px] font-black px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap">EXPORTAR RELATÓRIO</span>
             </button>
             <label className="w-14 h-14 rounded-full bg-brand-600 text-white flex items-center justify-center shadow-2xl hover:scale-110 active:scale-90 cursor-pointer group relative">
                <Upload size={24}/>
                <span className="absolute right-full mr-4 bg-brand-600 text-white text-[8px] font-black px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap">IMPORTAR PLANILHA</span>
                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImportExcel} />
             </label>
           </div>
        )}
      </main>

      {/* USER EDIT MODAL (New functionality requested) */}
      {isUserEditModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-in zoom-in duration-200">
           <div className="rounded-[3rem] w-full max-w-sm overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl">
              <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950/50">
                 <h3 className="text-xs font-black uppercase tracking-widest text-brand-600">{editingUser ? 'Editar Perfil' : 'Novo Colaborador'}</h3>
                 <button onClick={() => setIsUserEditModalOpen(false)} className="text-slate-400 hover:text-red-500"><X size={24}/></button>
              </div>
              <form onSubmit={handleSaveUser} className="p-10 space-y-6">
                 <div className="flex flex-col items-center gap-5">
                    <div className="w-24 h-24 rounded-3xl bg-slate-100 dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 overflow-hidden relative group shadow-inner">
                      {userFormData.photo_url ? <img src={userFormData.photo_url} className="w-full h-full object-cover" /> : <UserIcon size={40} className="m-auto mt-6 opacity-10" />}
                      <button type="button" onClick={() => userPhotoInputRef.current?.click()} className="absolute inset-0 bg-brand-600/90 flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all backdrop-blur-sm"><Camera size={24}/><span className="text-[7px] font-black mt-1">FOTO</span></button>
                    </div>
                    <input type="file" accept="image/*" ref={userPhotoInputRef} className="hidden" onChange={(e) => handlePhotoUpload(e, 'user')} />
                    
                    <div className="w-full space-y-4">
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Matrícula</label>
                        <input required disabled={!!editingUser} className="w-full p-4 rounded-xl font-black text-center uppercase outline-none focus:border-brand-500 border-2 border-transparent text-sm bg-slate-50 dark:bg-slate-950 shadow-inner disabled:opacity-50" value={userFormData.badge_id || ''} onChange={e => setUserFormData({...userFormData, badge_id: e.target.value})} placeholder="ID ÚNICO" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Completo</label>
                        <input required className="w-full p-4 rounded-xl font-black text-center uppercase outline-none focus:border-brand-500 border-2 border-transparent text-sm bg-slate-50 dark:bg-slate-950 shadow-inner" value={userFormData.name || ''} onChange={e => setUserFormData({...userFormData, name: e.target.value})} placeholder="NOME DO COLABORADOR" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Função</label>
                        <select className="w-full p-4 rounded-xl font-black text-center uppercase outline-none focus:border-brand-500 border-2 border-transparent text-sm bg-slate-50 dark:bg-slate-950 shadow-inner appearance-none" value={userFormData.role || 'Colaborador'} onChange={e => setUserFormData({...userFormData, role: e.target.value})}>
                           <option value="Colaborador">Colaborador</option>
                           <option value="Estoquista">Estoquista</option>
                           <option value="Gerente">Gerente</option>
                           <option value="Supervisor">Supervisor</option>
                           <option value="Administrador">Administrador</option>
                        </select>
                      </div>
                    </div>
                 </div>
                 <button type="submit" disabled={isSyncing} className="w-full py-5 bg-brand-600 text-white rounded-2xl font-black uppercase text-[10px] shadow-xl active:scale-95 transition-all">
                    {isSyncing ? <Loader2 className="animate-spin m-auto" /> : editingUser ? 'SALVAR ALTERAÇÕES' : 'CONFIRMAR CADASTRO'}
                 </button>
              </form>
           </div>
        </div>
      )}

      {/* DELETE CONFIRMATION */}
      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/95 backdrop-blur-2xl animate-in fade-in duration-200">
           <div className="rounded-[3rem] w-full max-w-[340px] p-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl text-center scale-in-center">
              <div className="w-20 h-20 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse border border-red-500/20">
                <Trash2 size={36} />
              </div>
              <h3 className="text-xl font-black uppercase tracking-tighter mb-4 text-slate-900 dark:text-white">Ação Crítica</h3>
              <p className="text-[10px] text-slate-500 mb-10 uppercase tracking-widest font-bold leading-relaxed px-2">
                {deleteTarget === 'SINGLE' 
                  ? `Deseja excluir permanentemente "${itemToDelete?.name}"?`
                  : `Confirma a remoção definitiva de ${selectedItemIds.length} materiais selecionados? Esta ação é irreversível.`}
              </p>
              <div className="space-y-4">
                <button onClick={executeDelete} disabled={isSyncing} className="w-full py-5 bg-red-600 text-white font-black rounded-2xl uppercase text-[10px] shadow-xl active:scale-95 transition-all">
                  {isSyncing ? <Loader2 className="animate-spin m-auto" /> : 'CONFIRMAR EXCLUSÃO'}
                </button>
                <button onClick={() => setIsDeleteConfirmOpen(false)} className="w-full py-4 text-slate-400 font-black rounded-2xl uppercase text-[9px] tracking-widest hover:text-slate-900 transition-colors">CANCELAR</button>
              </div>
           </div>
        </div>
      )}

      {/* MOVEMENT MODAL */}
      {isMovementModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/95 backdrop-blur-2xl animate-in fade-in duration-200">
           <div className="rounded-[3.5rem] w-full max-w-[320px] overflow-hidden bg-white dark:bg-slate-900 shadow-2xl">
              <div className={`p-8 text-center ${movementType === 'IN' ? 'bg-emerald-600' : 'bg-orange-600'} text-white`}>
                 <h3 className="text-3xl font-black uppercase tracking-widest">{movementType === 'IN' ? 'Entrada' : 'Saída'}</h3>
                 <p className="text-[9px] mt-3 font-black uppercase opacity-80 truncate px-4">{items.find(i => i.id === movementItemId)?.name}</p>
              </div>
              <form onSubmit={handleMovement} className="p-8 space-y-6 text-center">
                 <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Quantidade</label>
                   <input type="number" min="1" required autoFocus className="w-full text-6xl font-black text-center p-6 rounded-[2rem] outline-none bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white shadow-inner" value={moveData.quantity} onChange={e => setMoveData({...moveData, quantity: Number(e.target.value)})} />
                 </div>
                 <input placeholder="JUSTIFICATIVA" className="w-full p-4 rounded-xl text-center uppercase text-[10px] bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none font-bold" value={moveData.reason} onChange={e => setMoveData({...moveData, reason: e.target.value})} />
                 <button type="submit" disabled={isSyncing} className={`w-full py-5 text-white font-black rounded-2xl uppercase text-[10px] shadow-xl active:scale-95 transition-all ${movementType === 'IN' ? 'bg-emerald-600' : 'bg-orange-600'}`}>
                   {isSyncing ? <Loader2 className="animate-spin m-auto" size={20}/> : 'REGISTRAR'}
                 </button>
                 <button type="button" onClick={() => setIsMovementModalOpen(false)} className="w-full text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-red-500">FECHAR</button>
              </form>
           </div>
        </div>
      )}

      {/* ITEM MODAL */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in zoom-in duration-300">
          <div className="rounded-[3rem] w-full max-w-md max-h-[95vh] overflow-hidden flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl">
            <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center px-10 bg-slate-50 dark:bg-slate-950/50">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-brand-600">{editingItem ? 'Editar Dados' : 'Novo Cadastro'}</h3>
              <button onClick={() => setIsItemModalOpen(false)} className="text-slate-400 hover:text-red-500"><X size={32} /></button>
            </div>
            <form onSubmit={handleSaveItem} className="p-10 space-y-6 overflow-y-auto custom-scrollbar">
               <div className="flex flex-col items-center gap-6">
                  <div className="w-32 h-32 rounded-3xl bg-slate-50 dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 overflow-hidden relative group shadow-inner">
                    {formData.photo_url ? <img src={formData.photo_url} className="w-full h-full object-cover" /> : <Package size={48} className="m-auto mt-10 opacity-10" />}
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="absolute inset-0 bg-brand-600/90 flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all backdrop-blur-sm"><Camera size={28}/><span className="text-[9px] font-black mt-2">FOTO</span></button>
                  </div>
                  <input type="file" accept="image/*" capture="environment" ref={fileInputRef} className="hidden" onChange={(e) => handlePhotoUpload(e, 'item')} />
                  <div className="w-full space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Descrição do Item</label>
                    <div className="relative">
                      <input required className="w-full p-5 rounded-2xl font-black text-center uppercase outline-none focus:border-brand-500 border-2 border-transparent text-sm bg-slate-50 dark:bg-slate-950 shadow-inner pr-14" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="NOME DO MATERIAL" />
                      <button type="button" onClick={handleAIAssistant} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-brand-500 text-white rounded-xl shadow-lg hover:scale-110 active:scale-95 transition-all">
                        <BrainCircuit size={18}/>
                      </button>
                    </div>
                  </div>
               </div>
               <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Setor</label>
                    <input className="w-full p-4 rounded-xl font-bold text-center uppercase text-[11px] bg-slate-50 dark:bg-slate-950 outline-none border-2 border-transparent focus:border-brand-500 transition-all shadow-inner" value={formData.department || ''} onChange={e => setFormData({...formData, department: e.target.value})} placeholder="EX: TÉCNICO" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Localização</label>
                    <input className="w-full p-4 rounded-xl font-bold text-center uppercase text-[11px] bg-slate-50 dark:bg-slate-950 outline-none border-2 border-transparent focus:border-brand-500 transition-all shadow-inner" value={formData.location || ''} onChange={e => setFormData({...formData, location: e.target.value})} placeholder="EX: BOX A" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Unidade</label>
                    <input className="w-full p-4 rounded-xl font-bold text-center uppercase text-[11px] bg-slate-50 dark:bg-slate-950 outline-none border-2 border-transparent focus:border-brand-500 transition-all shadow-inner" value={formData.unit || 'UND'} onChange={e => setFormData({...formData, unit: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Mínimo</label>
                    <input type="number" className="w-full p-4 rounded-xl font-black text-center text-xs bg-slate-50 dark:bg-slate-950 outline-none border-2 border-transparent focus:border-brand-500 transition-all shadow-inner" value={formData.min_stock || 0} onChange={e => setFormData({...formData, min_stock: Number(e.target.value)})} />
                  </div>
               </div>
               {!editingItem && (
                 <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Saldo Atual</label>
                    <input type="number" className="w-full p-5 rounded-2xl font-black text-center text-xl bg-brand-500/5 dark:bg-brand-500/10 border-2 border-brand-500/30 outline-none focus:border-brand-500 shadow-inner" value={formData.current_stock || 0} onChange={e => setFormData({...formData, current_stock: Number(e.target.value)})} />
                 </div>
               )}
               <button type="submit" disabled={isSyncing} className="w-full py-5 bg-brand-600 text-white rounded-2xl font-black uppercase text-[10px] shadow-2xl hover:bg-brand-700 active:scale-95 transition-all flex items-center justify-center gap-3">
                 {isSyncing ? <Loader2 className="animate-spin" size={20}/> : <CheckCircle2 size={20}/>}
                 {editingItem ? 'SALVAR ALTERAÇÕES' : 'CONCLUIR CADASTRO'}
               </button>
            </form>
          </div>
        </div>
      )}

      {/* HELP MODAL */}
      {isImportHelpOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-black/80 backdrop-blur-2xl animate-in fade-in duration-300">
          <div className="rounded-[3rem] w-full max-w-sm p-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl text-center">
            <h3 className="text-xl font-black uppercase tracking-tighter mb-8 text-slate-900 dark:text-white">Guia Excel</h3>
            <div className="grid grid-cols-1 gap-2 mb-10">
              {["Material", "Setor", "Localizacao", "Saldo", "EstoqueMin", "Unidade"].map(col => (
                <div key={col} className="p-3.5 rounded-xl flex items-center justify-between font-black uppercase text-[10px] border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 shadow-sm">
                  {col} <CheckCircle2 size={16} className="text-emerald-500" />
                </div>
              ))}
            </div>
            <button onClick={() => setIsImportHelpOpen(false)} className="w-full py-5 bg-brand-600 text-white font-black rounded-xl uppercase text-xs active:scale-95 shadow-lg">CIENTE</button>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 3px; height: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #3b82f6; border-radius: 10px; }
        @keyframes scale-in-center { 0% { transform: scale(0); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
        .scale-in-center { animation: scale-in-center 0.25s cubic-bezier(0.250, 0.460, 0.450, 0.940) both; }
        * { transition: background-color 100ms ease-out, border-color 100ms ease-out, transform 100ms ease-out, opacity 100ms ease-out; }
      `}</style>
    </div>
  );
}
