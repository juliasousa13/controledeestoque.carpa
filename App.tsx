
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  LayoutDashboard, Package, Plus, Search, Trash2, Moon, Sun, Menu, X, 
  Camera, AlertTriangle, Loader2, RefreshCw, TrendingDown, Box, 
  History, Activity, Edit3, Users, FileSpreadsheet, 
  Upload, CheckCircle2, User as UserIcon, LogOut, ChevronRight,
  Info, Check, Database, ShieldCheck, Settings, Download
} from 'lucide-react';
import { InventoryItem, MovementLog, UserSession, AppView, UserProfile } from './types';
import { Logo } from './components/Logo';
import { supabase } from './services/supabaseClient';

declare const XLSX: any;

export default function App() {
  // Theme Management (Otimizado para evitar flickering)
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
  const userFileInputRef = useRef<HTMLInputElement>(null);

  // Apply Theme
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('carpa_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('carpa_theme', 'light');
    }
  }, [darkMode]);

  // Data Fetching
  const fetchData = useCallback(async (showLoader = true) => {
    if (showLoader) setIsSyncing(true);
    try {
      const [itRes, movRes, userRes] = await Promise.all([
        supabase.from('inventory_items').select('*').order('name'),
        supabase.from('movements').select('*').order('timestamp', { ascending: false }).limit(50),
        supabase.from('users').select('*').order('name')
      ]);

      if (itRes.error) throw itRes.error;

      if (itRes.data) setItems(itRes.data);
      if (movRes.data) setMovements(movRes.data);
      if (userRes.data) setAllUsers(userRes.data);
      
      setLastSync(new Date());
      setConnStatus('online');
    } catch (err) {
      console.error("Erro na sincronização:", err);
      setConnStatus('offline');
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handlers
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
        reason: isNew ? 'Cadastro de novo item' : 'Ajuste de informações'
      });

      setIsItemModalOpen(false);
      setEditingItem(null);
      setFormData({});
      fetchData(false);
    } catch (err: any) {
      alert("Erro ao salvar material no banco de dados.");
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
          item_id: itemToDelete.id,
          item_name: itemToDelete.name,
          type: 'DELETE',
          quantity: itemToDelete.current_stock,
          user_badge_id: user.badgeId,
          user_name: user.name,
          timestamp: new Date().toISOString(),
          reason: 'Item removido permanentemente'
        });

        const { error } = await supabase.from('inventory_items').delete().eq('id', itemToDelete.id);
        if (error) throw error;
        setSelectedItemIds(prev => prev.filter(id => id !== itemToDelete.id));
      } else if (deleteTarget === 'BATCH' && selectedItemIds.length > 0) {
        for (const id of selectedItemIds) {
          const item = items.find(i => i.id === id);
          if (item) {
            await supabase.from('movements').insert({
              item_id: item.id,
              item_name: item.name,
              type: 'DELETE',
              quantity: item.current_stock,
              user_badge_id: user.badgeId,
              user_name: user.name,
              timestamp: new Date().toISOString(),
              reason: 'Exclusão em massa selecionada'
            });
          }
        }
        const { error } = await supabase.from('inventory_items').delete().in('id', selectedItemIds);
        if (error) throw error;
        setSelectedItemIds([]);
      }
      setIsDeleteConfirmOpen(false);
      setItemToDelete(null);
      fetchData(false);
    } catch (err: any) {
      alert("Erro ao processar exclusão no banco de dados.");
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
      alert("Operação negada: O saldo não pode ficar negativo.");
      setIsSyncing(false);
      return;
    }
    
    try {
      const { error: upError } = await supabase.from('inventory_items')
        .update({ 
          current_stock: newStock, 
          last_updated: new Date().toISOString(), 
          last_updated_by: user.name 
        })
        .eq('id', item.id);
      
      if (upError) throw upError;

      await supabase.from('movements').insert({
        item_id: item.id,
        item_name: item.name,
        type: movementType,
        quantity: qty,
        user_badge_id: user.badgeId,
        user_name: user.name,
        timestamp: new Date().toISOString(),
        reason: moveData.reason
      });

      setIsMovementModalOpen(false);
      setMoveData({ quantity: 1, reason: '' });
      fetchData(false);
    } catch (err: any) {
      alert("Falha ao registrar movimentação no banco de dados.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExportExcel = () => {
    if (items.length === 0) return alert("Não há dados para exportar.");
    const data = items.map(i => ({
      "Material": i.name,
      "Setor": i.department,
      "Localizacao": i.location,
      "Saldo": i.current_stock,
      "EstoqueMin": i.min_stock,
      "Unidade": i.unit,
      "Descricao": i.description || ''
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventário");
    XLSX.writeFile(wb, `ESTOQUE_CARPA_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws);
        
        setIsSyncing(true);
        const toUpsert = json.map((row: any) => ({
          id: `IMP-${Math.random().toString(36).substr(2, 9)}`,
          name: (row["Material"] || "SEM NOME").toString().toUpperCase(),
          department: (row["Setor"] || "ESTOQUE").toString().toUpperCase(),
          location: (row["Localizacao"] || "N/A").toString().toUpperCase(),
          current_stock: Number(row["Saldo"] || 0),
          min_stock: Number(row["EstoqueMin"] || 0),
          unit: (row["Unidade"] || "UND").toString().toUpperCase(),
          description: row["Descricao"] || "",
          last_updated: new Date().toISOString(),
          last_updated_by: user.name
        }));

        const { error } = await supabase.from('inventory_items').upsert(toUpsert);
        if (error) throw error;
        
        alert(`Sucesso! ${toUpsert.length} itens foram importados/atualizados.`);
        fetchData(false);
      } catch (err) {
        alert("Erro ao processar planilha. Verifique as colunas.");
      } finally {
        setIsSyncing(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const filteredItems = useMemo(() => {
    if (!searchTerm) return items;
    const s = searchTerm.toLowerCase();
    return items.filter(i => 
      i.name.toLowerCase().includes(s) || 
      i.location.toLowerCase().includes(s) || 
      i.department.toLowerCase().includes(s)
    );
  }, [items, searchTerm]);

  // Auth/Loading Screens
  if (isLoading) return (
    <div className="h-screen flex flex-col items-center justify-center bg-white dark:bg-[#020617] transition-colors duration-500">
      <Logo className="w-16 h-16 animate-pulse" />
      <div className="mt-8 flex flex-col items-center gap-2">
        <Loader2 className="animate-spin text-brand-600" size={32} />
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Iniciando Sistemas CARPA...</span>
      </div>
    </div>
  );

  if (!user) return (
    <div className="h-screen flex items-center justify-center p-4 bg-slate-100 dark:bg-[#020617] transition-colors duration-500">
      <div className="w-full max-w-[340px] p-8 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl animate-in zoom-in duration-300">
        <div className="flex flex-col items-center mb-8 text-center">
          <Logo className="w-14 h-14 mb-4" />
          <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">CARPA ESTOQUE</h1>
          <p className="text-[9px] font-black text-brand-500 uppercase tracking-widest mt-1">Acesso ao Banco de Dados</p>
        </div>
        <form onSubmit={async (e) => {
          e.preventDefault();
          const badge = (e.target as any).badge.value;
          const { data, error } = await supabase.from('users').select('*').eq('badge_id', badge).single();
          if (data) {
            setUser({ badgeId: data.badge_id, name: data.name, role: data.role, photoUrl: data.photo_url });
          } else {
            const name = prompt("Matrícula não cadastrada. Digite seu nome completo:");
            if (name) {
              await supabase.from('users').insert({ badge_id: badge, name: name.toUpperCase(), role: 'Colaborador' });
              setUser({ badgeId: badge, name: name.toUpperCase(), role: 'Colaborador' });
            }
          }
        }} className="space-y-4">
          <input name="badge" required placeholder="DIGITE SUA MATRÍCULA" className="w-full py-4 rounded-xl font-black text-center uppercase outline-none border-2 border-transparent focus:border-brand-500 text-sm bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white transition-all shadow-inner" />
          <button className="w-full py-4 bg-brand-600 text-white font-black rounded-xl uppercase tracking-widest active:scale-95 transition-all text-xs shadow-lg shadow-brand-500/30">ENTRAR</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="h-screen flex flex-col lg:flex-row font-sans bg-slate-50 dark:bg-[#020617] text-slate-900 dark:text-white transition-colors duration-500 overflow-hidden">
      
      {/* Sidebar Otimizada */}
      <aside className={`fixed lg:static inset-y-0 left-0 w-64 z-50 transform transition-transform duration-500 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex flex-col h-full p-5">
          <div className="flex items-center justify-between mb-8 px-2">
            <div className="flex items-center gap-3">
              <Logo className="w-8 h-8" />
              <span className="font-black text-lg tracking-tighter">CARPA</span>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-1 text-slate-400 hover:text-red-500 transition-colors"><X size={20}/></button>
          </div>
          
          <nav className="flex-1 space-y-1">
            {[
              { id: AppView.DASHBOARD, icon: LayoutDashboard, label: 'Painel Principal' },
              { id: AppView.INVENTORY, icon: Package, label: 'Itens em Estoque' },
              { id: AppView.MOVEMENTS, icon: History, label: 'Histórico Completo' },
              { id: AppView.USERS, icon: Users, label: 'Gestão de Equipe' },
              { id: AppView.SETTINGS, icon: Settings, label: 'Configurações' }
            ].map(v => (
              <button 
                key={v.id} 
                onClick={() => { setCurrentView(v.id); setIsSidebarOpen(false); setSelectedItemIds([]); }} 
                className={`w-full flex items-center gap-3 p-3 rounded-xl font-bold text-xs transition-all ${currentView === v.id ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/20 scale-105' : 'text-slate-400 hover:bg-brand-500/10'}`}
              >
                <v.icon size={16} /> {v.label}
              </button>
            ))}
          </nav>

          <div className="mt-auto space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800/50">
             <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-brand-600 flex items-center justify-center overflow-hidden border border-brand-500/20 shadow-inner">
                {user.photoUrl ? <img src={user.photoUrl} className="w-full h-full object-cover" /> : <UserIcon className="text-white" size={16}/>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-black text-[10px] truncate uppercase leading-none">{user.name}</p>
                <p className="text-[8px] text-brand-500 font-bold uppercase mt-1 tracking-tighter">{user.role}</p>
              </div>
            </div>
            
            <div className="flex gap-2">
              <button onClick={() => setDarkMode(!darkMode)} className="flex-1 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-center text-slate-500 hover:text-brand-500 hover:border-brand-500 transition-all">
                {darkMode ? <Sun size={16}/> : <Moon size={16}/>}
              </button>
              <button onClick={() => setUser(null)} className="flex-1 p-2.5 bg-red-500/10 text-red-500 rounded-xl font-black text-[9px] uppercase hover:bg-red-500 hover:text-white transition-all">SAIR</button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="h-16 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 bg-white/40 dark:bg-[#020617]/40 backdrop-blur-xl sticky top-0 z-30 transition-colors duration-500">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 text-slate-500 hover:text-brand-500 transition-colors"><Menu size={20}/></button>
            <h2 className="font-black text-xs uppercase tracking-[0.2em] text-slate-900 dark:text-white">{currentView}</h2>
          </div>
          
          <div className="flex gap-2">
            {selectedItemIds.length > 0 && (
              <button onClick={() => { setDeleteTarget('BATCH'); setIsDeleteConfirmOpen(true); }} className="bg-red-500 text-white px-4 py-2 rounded-lg font-black text-[10px] flex items-center gap-2 shadow-lg animate-in slide-in-from-top-2 active:scale-95 transition-all">
                <Trash2 size={14}/> EXCLUIR ({selectedItemIds.length})
              </button>
            )}
            {currentView === AppView.INVENTORY && (
              <button onClick={() => { setEditingItem(null); setFormData({}); setIsItemModalOpen(true); }} className="bg-brand-600 text-white px-4 py-2 rounded-lg font-black text-[10px] flex items-center gap-2 shadow-lg active:scale-95 transition-all uppercase">
                <Plus size={14}/> NOVO MATERIAL
              </button>
            )}
            {isSyncing && <Loader2 className="animate-spin text-brand-500" size={16} />}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
          <div className="max-w-6xl mx-auto space-y-6">
            
            {/* Dashboard View */}
            {currentView === AppView.DASHBOARD && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in slide-in-from-bottom-4 duration-500">
                <div className="p-8 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl flex flex-col items-center justify-center text-center group">
                  <Box className="text-brand-500 mb-4 group-hover:scale-110 transition-transform" size={48}/>
                  <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Itens Ativos</p>
                  <h3 className="text-5xl font-black text-slate-900 dark:text-white mt-1 tracking-tighter">{items.length}</h3>
                </div>
                <div className="p-8 rounded-3xl border border-red-200 dark:border-red-900/30 bg-red-50/50 dark:bg-red-500/5 shadow-xl flex flex-col items-center justify-center text-center group">
                  <AlertTriangle className="text-red-500 mb-4 group-hover:animate-bounce" size={48}/>
                  <p className="text-[10px] font-black uppercase text-red-500 tracking-widest">Estoque Crítico</p>
                  <h3 className="text-5xl font-black text-red-600 mt-1 tracking-tighter">{items.filter(i => i.current_stock <= i.min_stock).length}</h3>
                </div>
                <div className="p-8 rounded-3xl border border-emerald-200 dark:border-emerald-900/30 bg-emerald-50/50 dark:bg-emerald-500/5 shadow-xl flex flex-col items-center justify-center text-center group">
                  <Activity className="text-emerald-500 mb-4 group-hover:rotate-12 transition-transform" size={48}/>
                  <p className="text-[10px] font-black uppercase text-emerald-500 tracking-widest">Movimentações</p>
                  <h3 className="text-5xl font-black text-emerald-600 mt-1 tracking-tighter">{movements.length}</h3>
                </div>
              </div>
            )}

            {/* Inventory View */}
            {currentView === AppView.INVENTORY && (
              <div className="space-y-4 animate-in fade-in duration-500">
                <div className="p-3 px-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-4 shadow-sm focus-within:border-brand-500 transition-all">
                  <Search className="text-slate-400" size={18}/>
                  <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="PESQUISAR MATERIAL, SETOR OU LOCALIZAÇÃO..." className="flex-1 bg-transparent border-none outline-none font-bold text-sm uppercase dark:text-white placeholder-slate-500" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredItems.map(item => {
                    const isSelected = selectedItemIds.includes(item.id);
                    return (
                      <div 
                        key={item.id} 
                        className={`group p-4 rounded-3xl border transition-all cursor-pointer relative overflow-hidden ${isSelected ? 'border-brand-500 bg-brand-500/5 dark:bg-brand-500/10 scale-95 shadow-inner' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:shadow-2xl hover:border-brand-500/50'}`}
                        onClick={() => toggleItemSelection(item.id)}
                      >
                        <div className="aspect-square bg-slate-100 dark:bg-slate-950/40 rounded-2xl mb-4 overflow-hidden relative border border-slate-200 dark:border-slate-800/10 shadow-inner">
                          {item.photo_url ? <img src={item.photo_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center opacity-10"><Package size={32}/></div>}
                          <div className="absolute top-2 left-2 bg-slate-900/80 backdrop-blur-md px-2 py-0.5 rounded-lg text-[7px] font-black text-white uppercase border border-white/10">{item.location}</div>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setItemToDelete(item); setDeleteTarget('SINGLE'); setIsDeleteConfirmOpen(true); }} 
                            className="absolute top-2 right-2 p-2 bg-red-500/90 text-white rounded-xl opacity-0 group-hover:opacity-100 transition-all hover:scale-110"
                          >
                            <Trash2 size={14}/>
                          </button>
                        </div>
                        
                        <h4 className="font-black text-[12px] uppercase truncate mb-1 text-slate-900 dark:text-white tracking-tight">{item.name}</h4>
                        <p className="text-[8px] font-bold text-slate-500 uppercase mb-4">{item.department}</p>
                        
                        <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800/40">
                          <div className="flex flex-col">
                            <span className={`text-2xl font-black tracking-tighter ${item.current_stock <= item.min_stock ? 'text-red-500 animate-pulse' : 'text-slate-900 dark:text-slate-200'}`}>{item.current_stock}</span>
                            <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">SALDO ({item.unit})</span>
                          </div>
                          <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
                             <button onClick={() => { setMovementItemId(item.id); setMovementType('IN'); setIsMovementModalOpen(true); }} className="p-2.5 bg-emerald-500/10 text-emerald-500 rounded-xl hover:bg-emerald-500 hover:text-white transition-all"><Plus size={16}/></button>
                             <button onClick={() => { setMovementItemId(item.id); setMovementType('OUT'); setIsMovementModalOpen(true); }} className="p-2.5 bg-orange-500/10 text-orange-500 rounded-xl hover:bg-orange-500 hover:text-white transition-all"><TrendingDown size={16}/></button>
                             <button onClick={() => { setEditingItem(item); setFormData(item); setIsItemModalOpen(true); }} className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-xl hover:bg-brand-600 hover:text-white transition-all"><Edit3 size={16}/></button>
                          </div>
                        </div>
                        
                        {isSelected && (
                          <div className="absolute inset-0 border-2 border-brand-500 rounded-3xl pointer-events-none">
                            <div className="absolute top-3 right-3 bg-brand-500 text-white p-1 rounded-full shadow-lg">
                              <Check size={10} strokeWidth={4} />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Team View */}
            {currentView === AppView.USERS && (
              <div className="max-w-4xl mx-auto space-y-4 animate-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2"><Users size={18}/> Nossa Equipe</h3>
                  <button onClick={() => { setEditingUser(null); setUserFormData({ badge_id: '', name: '', role: '', photo_url: '' }); setIsUserEditModalOpen(true); }} className="bg-brand-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase shadow-lg shadow-brand-500/20 active:scale-95 transition-all">Novo Colaborador</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {allUsers.map(u => (
                    <div key={u.badge_id} onClick={() => { setEditingUser(u); setUserFormData(u); setIsUserEditModalOpen(true); }} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 flex items-center gap-4 cursor-pointer hover:border-brand-500/50 transition-all group">
                      <div className="w-14 h-14 rounded-2xl bg-brand-600/10 flex items-center justify-center overflow-hidden border border-brand-500/20 shadow-inner group-hover:scale-110 transition-transform">
                        {u.photo_url ? <img src={u.photo_url} className="w-full h-full object-cover" /> : <UserIcon className="text-brand-500" size={24}/>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-black text-xs uppercase truncate text-slate-900 dark:text-white">{u.name}</p>
                        <p className="text-[8px] font-bold text-slate-500 uppercase mt-1">Matrícula: {u.badge_id} • {u.role}</p>
                      </div>
                      <ChevronRight size={16} className="text-slate-300 group-hover:text-brand-500 transition-colors" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Movements View */}
            {currentView === AppView.MOVEMENTS && (
               <div className="space-y-2 max-w-4xl mx-auto animate-in slide-in-from-bottom-4 duration-500">
                 {movements.map(m => (
                   <div key={m.id} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 flex items-center justify-between hover:bg-white dark:hover:bg-slate-900 transition-all shadow-sm">
                     <div className="flex gap-4 items-center">
                       <div className={`p-3 rounded-xl shadow-inner ${m.type === 'IN' ? 'bg-emerald-500/20 text-emerald-500' : m.type === 'OUT' ? 'bg-orange-500/20 text-orange-500' : m.type === 'DELETE' ? 'bg-red-500/20 text-red-500' : 'bg-brand-500/20 text-brand-500'}`}>
                          {m.type === 'IN' ? <Plus size={18}/> : m.type === 'OUT' ? <TrendingDown size={18}/> : m.type === 'DELETE' ? <Trash2 size={18}/> : <Edit3 size={18}/>}
                       </div>
                       <div>
                         <p className="font-black text-xs uppercase text-slate-900 dark:text-white tracking-tight">{m.item_name}</p>
                         <p className="text-[9px] text-slate-500 uppercase font-medium mt-1">{new Date(m.timestamp).toLocaleString()} • <span className="text-brand-500 font-bold">{m.user_name}</span></p>
                       </div>
                     </div>
                     <div className="text-right">
                        <p className={`font-black text-lg tracking-tighter ${m.type === 'IN' ? 'text-emerald-500' : m.type === 'OUT' ? 'text-orange-500' : m.type === 'DELETE' ? 'text-red-500' : 'text-brand-400'}`}>{m.type === 'IN' ? '+' : m.type === 'OUT' ? '-' : ''}{m.quantity}</p>
                        {m.reason && <p className="text-[7px] text-slate-400 uppercase font-bold tracking-widest">{m.reason}</p>}
                     </div>
                   </div>
                 ))}
               </div>
            )}

            {/* Settings View */}
            {currentView === AppView.SETTINGS && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-bottom-4 duration-500">
                <div className="p-8 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden relative">
                  <div className="flex items-center gap-3 mb-8">
                    <Database className="text-brand-500" size={24} />
                    <h3 className="text-sm font-black uppercase tracking-widest">Estado da Sincronização</h3>
                  </div>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center p-5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Banco Supabase</span>
                      <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${connStatus === 'online' ? 'bg-emerald-500 animate-pulse shadow-lg shadow-emerald-500/50' : 'bg-red-500'}`} />
                        <span className={`text-[10px] font-black uppercase ${connStatus === 'online' ? 'text-emerald-500' : 'text-red-500'}`}>{connStatus === 'online' ? 'Operacional' : 'Sem Conexão'}</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center p-5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Última Atualização</span>
                      <span className="text-[10px] font-black uppercase text-slate-900 dark:text-white">{lastSync ? lastSync.toLocaleString() : 'Pendente'}</span>
                    </div>
                    <button onClick={() => fetchData(true)} className="w-full py-5 bg-brand-600/10 text-brand-600 font-black rounded-2xl uppercase text-[10px] transition-all hover:bg-brand-600 hover:text-white active:scale-95 flex items-center justify-center gap-3 border border-brand-500/20">
                       <RefreshCw size={16} className={isSyncing ? "animate-spin" : ""} /> ATUALIZAR DADOS AGORA
                    </button>
                  </div>
                  <div className="absolute -right-8 -bottom-8 text-brand-500/5 rotate-12"><ShieldCheck size={200}/></div>
                </div>

                <div className="p-8 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl flex flex-col justify-center items-center text-center">
                   <div className="w-20 h-20 rounded-full bg-brand-600/10 flex items-center justify-center mb-6">
                      <Settings className="text-brand-500 animate-[spin_8s_linear_infinite]" size={40} />
                   </div>
                   <h3 className="text-sm font-black uppercase tracking-[0.3em] mb-2">Preferências</h3>
                   <p className="text-[10px] text-slate-500 uppercase font-bold max-w-[200px] mb-8">Personalize sua experiência de uso no CARPA ESTOQUE.</p>
                   <button onClick={() => setDarkMode(!darkMode)} className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black uppercase text-[10px] shadow-2xl transition-all active:scale-90">
                      {darkMode ? <Sun size={18}/> : <Moon size={18}/>}
                      {darkMode ? 'Mudar para Modo Claro' : 'Mudar para Modo Escuro'}
                   </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Floating Actions */}
        {currentView === AppView.INVENTORY && (
           <div className="fixed bottom-8 right-8 flex flex-col gap-3 z-40">
             <button onClick={() => setIsImportHelpOpen(true)} className="w-14 h-14 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center shadow-2xl transition-all active:scale-90 border border-white/10 group">
               <Info size={22} className="group-hover:rotate-12 transition-transform"/>
               <span className="absolute right-full mr-4 bg-slate-900 text-white text-[8px] font-black px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap border border-white/10">GUIA DE IMPORTAÇÃO</span>
             </button>
             <button onClick={handleExportExcel} className="w-14 h-14 rounded-full bg-brand-600 text-white flex items-center justify-center shadow-2xl transition-all active:scale-90 group">
               <Download size={24}/>
               <span className="absolute right-full mr-4 bg-brand-600 text-white text-[8px] font-black px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">EXPORTAR PLANILHA</span>
             </button>
             <label className="w-14 h-14 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-2xl transition-all active:scale-90 cursor-pointer group">
                <Upload size={24}/>
                <span className="absolute right-full mr-4 bg-emerald-600 text-white text-[8px] font-black px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">IMPORTAR PLANILHA</span>
                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImportExcel} />
             </label>
           </div>
        )}
      </main>

      {/* MODAL AJUDA IMPORTAÇÃO (RESTAURADO) */}
      {isImportHelpOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="rounded-[2.5rem] w-full max-w-sm p-10 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl text-center">
            <h3 className="text-xl font-black uppercase tracking-tighter mb-6">Instruções de Importação</h3>
            <p className="text-[11px] text-slate-500 mb-8 uppercase tracking-widest leading-relaxed">Certifique-se que sua planilha (.xlsx) tenha exatamente estas colunas na primeira linha:</p>
            <div className="grid grid-cols-1 gap-2 mb-10">
              {["Material", "Setor", "Localizacao", "Saldo", "EstoqueMin", "Unidade", "Descricao"].map(col => (
                <div key={col} className="p-3 rounded-2xl flex items-center justify-between font-black uppercase text-[10px] tracking-widest border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                  {col} <CheckCircle2 size={16} className="text-emerald-500" />
                </div>
              ))}
            </div>
            <button onClick={() => setIsImportHelpOpen(false)} className="w-full py-5 bg-brand-600 text-white font-black rounded-[1.5rem] uppercase text-xs shadow-xl active:scale-95 transition-all">ESTOU CIENTE</button>
          </div>
        </div>
      )}

      {/* MODAL CONFIRMAÇÃO EXCLUSÃO (PROFISSIONAL) */}
      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-2xl animate-in fade-in">
           <div className="rounded-[3rem] w-full max-w-[340px] p-10 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl text-center">
              <div className="w-20 h-20 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-8 animate-pulse">
                <Trash2 size={36} />
              </div>
              <h3 className="text-xl font-black uppercase tracking-tighter mb-4 text-slate-900 dark:text-white">Ação Irreversível</h3>
              <p className="text-[10px] text-slate-500 mb-10 uppercase tracking-[0.1em] font-bold leading-relaxed">
                {deleteTarget === 'SINGLE' 
                  ? `Deseja realmente excluir "${itemToDelete?.name}"? Isso removerá o item do inventário e registrará a exclusão no histórico oficial.`
                  : `Deseja realmente excluir os ${selectedItemIds.length} materiais selecionados de uma vez?`}
              </p>
              <div className="space-y-4">
                <button onClick={executeDelete} disabled={isSyncing} className="w-full py-5 bg-red-600 text-white font-black rounded-3xl uppercase text-[11px] shadow-xl shadow-red-600/20 active:scale-95 transition-all">
                  {isSyncing ? <Loader2 className="animate-spin m-auto" /> : 'SIM, EXCLUIR DEFINITIVAMENTE'}
                </button>
                <button onClick={() => setIsDeleteConfirmOpen(false)} className="w-full py-4 text-slate-400 font-black rounded-3xl uppercase text-[10px] tracking-widest hover:text-slate-900 dark:hover:text-white transition-colors">DESISTIR E VOLTAR</button>
              </div>
           </div>
        </div>
      )}

      {/* MODAL MATERIAL (COMPLETO) */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in zoom-in duration-300">
          <div className="rounded-[2.5rem] w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center px-10">
              <h3 className="text-sm font-black uppercase tracking-widest text-brand-600">{editingItem ? 'Editando Material' : 'Novo Cadastro de Material'}</h3>
              <button onClick={() => setIsItemModalOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors"><X size={28} /></button>
            </div>
            <form onSubmit={handleSaveItem} className="p-10 space-y-8 overflow-y-auto custom-scrollbar">
               <div className="flex flex-col items-center gap-6">
                  <div className="w-32 h-32 rounded-[2rem] bg-slate-50 dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 overflow-hidden relative group shadow-inner">
                    {formData.photo_url ? <img src={formData.photo_url} className="w-full h-full object-cover" /> : <Package size={48} className="m-auto mt-10 opacity-10" />}
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="absolute inset-0 bg-brand-600/80 flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all backdrop-blur-sm"><Camera size={24}/><span className="text-[8px] font-black mt-2">FOTOGRAFAR</span></button>
                  </div>
                  <input type="file" accept="image/*" capture="environment" ref={fileInputRef} className="hidden" onChange={(e) => handlePhotoUpload(e, 'item')} />
                  <div className="w-full space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Identificação do Material</label>
                    <input required className="w-full p-5 rounded-2xl font-black text-center uppercase outline-none focus:border-brand-500 border-2 border-transparent text-sm bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white transition-all shadow-inner" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="NOME OU DESCRIÇÃO CURTA" />
                  </div>
               </div>
               <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Setor</label>
                    <input className="w-full p-5 rounded-2xl font-bold text-center uppercase text-[12px] bg-slate-50 dark:bg-slate-950/50 outline-none focus:border-brand-500 border-2 border-transparent transition-all shadow-inner" value={formData.department || ''} onChange={e => setFormData({...formData, department: e.target.value})} placeholder="EX: PRODUÇÃO" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Localização</label>
                    <input className="w-full p-5 rounded-2xl font-bold text-center uppercase text-[12px] bg-slate-50 dark:bg-slate-950/50 outline-none focus:border-brand-500 border-2 border-transparent transition-all shadow-inner" value={formData.location || ''} onChange={e => setFormData({...formData, location: e.target.value})} placeholder="EX: GAVETA 03" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Unid. Medida</label>
                    <input className="w-full p-5 rounded-2xl font-bold text-center uppercase text-[12px] bg-slate-50 dark:bg-slate-950/50 outline-none focus:border-brand-500 border-2 border-transparent transition-all shadow-inner" value={formData.unit || 'UND'} onChange={e => setFormData({...formData, unit: e.target.value})} placeholder="EX: KG, METRO" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Estoque Crítico</label>
                    <input type="number" className="w-full p-5 rounded-2xl font-black text-center text-sm bg-slate-50 dark:bg-slate-950/50 outline-none focus:border-brand-500 border-2 border-transparent transition-all shadow-inner" value={formData.min_stock || 0} onChange={e => setFormData({...formData, min_stock: Number(e.target.value)})} />
                  </div>
               </div>
               {!editingItem && (
                 <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Saldo de Abertura</label>
                    <input type="number" className="w-full p-5 rounded-2xl font-black text-center text-sm bg-brand-500/5 dark:bg-brand-500/10 border-2 border-brand-500/30 outline-none focus:border-brand-500 transition-all shadow-inner" value={formData.current_stock || 0} onChange={e => setFormData({...formData, current_stock: Number(e.target.value)})} />
                 </div>
               )}
               <button type="submit" disabled={isSyncing} className="w-full py-6 bg-brand-600 text-white rounded-[2rem] font-black uppercase text-xs shadow-xl hover:bg-brand-700 active:scale-95 transition-all flex items-center justify-center gap-3">
                 {isSyncing ? <Loader2 className="animate-spin" /> : <CheckCircle2 size={20}/>}
                 {editingItem ? 'ATUALIZAR MATERIAL NO BANCO' : 'SALVAR NOVO MATERIAL'}
               </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL MOVIMENTAÇÃO (Otimizado Rotativo) */}
      {isMovementModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl animate-in fade-in duration-300">
           <div className="rounded-[3rem] w-full max-w-[320px] overflow-hidden border border-white/10 bg-white dark:bg-slate-900 shadow-2xl">
              <div className={`p-8 text-center ${movementType === 'IN' ? 'bg-emerald-600' : 'bg-orange-600'} text-white shadow-lg`}>
                 <h3 className="text-3xl font-black uppercase tracking-widest">{movementType === 'IN' ? 'Entrada' : 'Saída'}</h3>
                 <p className="text-[9px] mt-2 font-black uppercase opacity-80 tracking-[0.2em] line-clamp-2 px-4">{items.find(i => i.id === movementItemId)?.name}</p>
              </div>
              <form onSubmit={handleMovement} className="p-8 space-y-6 text-center">
                 <div className="space-y-1">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Informe a Quantidade</label>
                   <input type="number" min="1" required autoFocus className="w-full text-6xl font-black text-center p-6 rounded-[2rem] outline-none bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white border-2 border-transparent focus:border-brand-500 transition-all shadow-inner" value={moveData.quantity} onChange={e => setMoveData({...moveData, quantity: Number(e.target.value)})} />
                 </div>
                 <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Observação (Opcional)</label>
                    <input placeholder="EX: NOTA FISCAL, REQUISIÇÃO..." className="w-full p-4 rounded-xl text-center uppercase text-[10px] bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none font-bold border border-transparent focus:border-brand-500 transition-all shadow-inner" value={moveData.reason} onChange={e => setMoveData({...moveData, reason: e.target.value})} />
                 </div>
                 <button type="submit" disabled={isSyncing} className={`w-full py-5 text-white font-black rounded-3xl uppercase text-xs shadow-xl active:scale-95 transition-all ${movementType === 'IN' ? 'bg-emerald-600 shadow-emerald-500/30' : 'bg-orange-600 shadow-orange-500/30'}`}>
                   {isSyncing ? <Loader2 className="animate-spin m-auto" /> : 'CONFIRMAR OPERAÇÃO'}
                 </button>
                 <button type="button" onClick={() => setIsMovementModalOpen(false)} className="w-full text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] hover:text-red-500 transition-colors">CANCELAR</button>
              </form>
           </div>
        </div>
      )}

      {/* Global CSS for Custom Scrollbar and Animations */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #3b82f6; border-radius: 10px; opacity: 0.2; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #2563eb; }
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
        
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes zoom-in { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        @keyframes slide-in-bottom { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slide-in-top { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
        
        .animate-in { animation-duration: 0.3s; animation-fill-mode: both; }
        .fade-in { animation-name: fade-in; }
        .zoom-in { animation-name: zoom-in; }
        .slide-in-from-bottom-4 { animation-name: slide-in-bottom; }
        .slide-in-from-top-2 { animation-name: slide-in-top; }
      `}</style>
    </div>
  );
}
