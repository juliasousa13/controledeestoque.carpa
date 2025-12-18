
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  LayoutDashboard, Package, Plus, Search, Trash2, Moon, Sun, Menu, X, 
  Camera, AlertTriangle, Loader2, RefreshCw, TrendingDown, Box, 
  History, Activity, Edit3, Users, FileSpreadsheet, 
  Upload, CheckCircle2, User, LogOut, ChevronRight,
  Info, Check, Database, ShieldCheck, Settings
} from 'lucide-react';
import { InventoryItem, MovementLog, UserSession, AppView, UserProfile } from './types';
import { Logo } from './components/Logo';
import { supabase } from './services/supabaseClient';

declare const XLSX: any;

export default function App() {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('carpa_theme');
    return saved ? saved === 'dark' : true;
  });
  
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

  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [isUserEditModalOpen, setIsUserEditModalOpen] = useState(false);
  const [isImportHelpOpen, setIsImportHelpOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [movementType, setMovementType] = useState<'IN' | 'OUT'>('IN');
  const [movementItemId, setMovementItemId] = useState<string>('');
  
  const [formData, setFormData] = useState<Partial<InventoryItem>>({});
  const [userFormData, setUserFormData] = useState<Partial<UserProfile>>({});
  const [moveData, setMoveData] = useState({ quantity: 1, reason: '' });
  const [deleteTarget, setDeleteTarget] = useState<'SINGLE' | 'BATCH'>('SINGLE');
  const [itemToDelete, setItemToDelete] = useState<InventoryItem | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const userFileInputRef = useRef<HTMLInputElement>(null);

  // Theme management - Fixed Syntax
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('carpa_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('carpa_theme', 'light');
    }
  }, [darkMode]);

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
      if (userRes.data) {
        setAllUsers(userRes.data);
        const current = userRes.data.find(u => u.badge_id === user?.badgeId);
        if (current && user) {
          setUser({ ...user, name: current.name, role: current.role, photoUrl: current.photo_url });
        }
      }
      setLastSync(new Date());
      setConnStatus('online');
    } catch (err) {
      console.error("Erro na sincronização:", err);
      setConnStatus('offline');
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  }, [user?.badgeId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
      alert("Erro ao salvar material.");
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
          item_id: itemToDelete.id,
          item_name: itemToDelete.name,
          type: 'DELETE',
          quantity: itemToDelete.current_stock,
          user_badge_id: user.badgeId,
          user_name: user.name,
          timestamp: new Date().toISOString(),
          reason: 'Item removido do sistema'
        });

        const { error } = await supabase.from('inventory_items').delete().eq('id', itemToDelete.id);
        if (error) throw error;
        setSelectedItemIds(prev => prev.filter(id => id !== itemToDelete.id));
      } else if (deleteTarget === 'BATCH' && selectedItemIds.length > 0) {
        // Log batch delete movements
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
              reason: 'Exclusão em massa'
            });
          }
        }
        const { error } = await supabase.from('inventory_items').delete().in('id', selectedItemIds);
        if (error) throw error;
        setSelectedItemIds([]);
      }
      setIsDeleteConfirmOpen(false);
      fetchData(false);
    } catch (err: any) {
      alert("Erro ao processar exclusão.");
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
      alert("Saldo insuficiente para esta saída.");
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
      alert("Falha na movimentação.");
    } finally {
      setIsSyncing(false);
    }
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

  if (isLoading) return (
    <div className="h-screen flex flex-col items-center justify-center bg-white dark:bg-[#020617]">
      <Logo className="w-16 h-16 animate-pulse" />
      <div className="mt-8 flex flex-col items-center gap-2">
        <Loader2 className="animate-spin text-brand-600" size={32} />
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Sincronizando...</span>
      </div>
    </div>
  );

  if (!user) return (
    <div className="h-screen flex items-center justify-center p-4 bg-slate-100 dark:bg-[#020617]">
      <div className="w-full max-w-[340px] p-8 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl">
        <div className="flex flex-col items-center mb-8 text-center">
          <Logo className="w-14 h-14 mb-4" />
          <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase">CARPA ESTOQUE</h1>
          <p className="text-[9px] font-black text-brand-500 uppercase tracking-widest mt-1">Acesso Restrito</p>
        </div>
        <form onSubmit={async (e) => {
          e.preventDefault();
          const badge = (e.target as any).badge.value;
          const { data } = await supabase.from('users').select('*').eq('badge_id', badge).single();
          if (data) {
            setUser({ badgeId: data.badge_id, name: data.name, role: data.role, photoUrl: data.photo_url });
          } else {
            const name = prompt("Matrícula não encontrada. Digite seu nome completo:");
            if (name) {
              const { error } = await supabase.from('users').insert({ badge_id: badge, name: name.toUpperCase(), role: 'Colaborador' });
              if (!error) setUser({ badgeId: badge, name: name.toUpperCase(), role: 'Colaborador' });
            }
          }
        }} className="space-y-4">
          <input name="badge" required placeholder="DIGITE SUA MATRÍCULA" className="w-full py-4 rounded-xl font-black text-center uppercase outline-none border-2 border-transparent focus:border-brand-500 text-sm bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white transition-all" />
          <button className="w-full py-4 bg-brand-600 text-white font-black rounded-xl uppercase tracking-widest active:scale-95 transition-all text-xs">ENTRAR</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="h-screen flex flex-col lg:flex-row font-sans bg-slate-50 dark:bg-[#020617] text-slate-900 dark:text-white overflow-hidden">
      
      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 w-64 z-50 transform transition-transform duration-500 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex flex-col h-full p-5">
          <div className="flex items-center justify-between mb-8 px-2">
            <div className="flex items-center gap-3">
              <Logo className="w-8 h-8" />
              <span className="font-black text-lg tracking-tighter">CARPA</span>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden text-slate-400"><X size={20}/></button>
          </div>
          
          <nav className="flex-1 space-y-1">
            {[
              { id: AppView.DASHBOARD, icon: LayoutDashboard, label: 'Painel Principal' },
              { id: AppView.INVENTORY, icon: Package, label: 'Itens em Estoque' },
              { id: AppView.MOVEMENTS, icon: History, label: 'Histórico' },
              { id: AppView.SETTINGS, icon: Settings, label: 'Configurações' }
            ].map(v => (
              <button 
                key={v.id} 
                onClick={() => { setCurrentView(v.id); setIsSidebarOpen(false); setSelectedItemIds([]); }} 
                className={`w-full flex items-center gap-3 p-3 rounded-xl font-bold text-xs transition-all ${currentView === v.id ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/20' : 'text-slate-400 hover:bg-brand-500/10'}`}
              >
                <v.icon size={16} /> {v.label}
              </button>
            ))}
          </nav>

          <div className="mt-auto pt-4 border-t border-slate-200 dark:border-slate-800/50">
            <div className="flex gap-2 mb-3">
              <button onClick={() => setDarkMode(!darkMode)} className="flex-1 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-center text-slate-500">
                {darkMode ? <Sun size={16}/> : <Moon size={16}/>}
              </button>
              <button onClick={() => setUser(null)} className="flex-1 p-2.5 bg-red-500/10 text-red-500 rounded-xl font-black text-[9px] uppercase hover:bg-red-500 hover:text-white transition-all">SAIR</button>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="h-16 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 bg-white/40 dark:bg-inherit/40 backdrop-blur-xl sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 text-slate-500"><Menu size={20}/></button>
            <h2 className="font-black text-xs uppercase tracking-widest">{currentView}</h2>
          </div>
          
          <div className="flex gap-2">
            {selectedItemIds.length > 0 && (
              <button onClick={() => { setDeleteTarget('BATCH'); setIsDeleteConfirmOpen(true); }} className="bg-red-500 text-white px-4 py-2 rounded-lg font-black text-[10px] flex items-center gap-2 shadow-lg animate-in slide-in-from-top-2">
                <Trash2 size={14}/> EXCLUIR SELECIONADOS ({selectedItemIds.length})
              </button>
            )}
            {currentView === AppView.INVENTORY && (
              <button onClick={() => { setEditingItem(null); setFormData({}); setIsItemModalOpen(true); }} className="bg-brand-600 text-white px-4 py-2 rounded-lg font-black text-[10px] flex items-center gap-2 shadow-lg active:scale-95 uppercase">
                <Plus size={14}/> NOVO ITEM
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
          <div className="max-w-6xl mx-auto space-y-6">
            
            {currentView === AppView.INVENTORY && (
              <div className="space-y-4">
                <div className="p-2 px-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-3 shadow-sm">
                  <Search className="text-slate-500" size={16}/>
                  <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="PESQUISAR MATERIAL, SETOR OU LOCALIZAÇÃO..." className="flex-1 bg-transparent border-none outline-none font-bold text-center uppercase text-[10px] placeholder-slate-500" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredItems.map(item => {
                    const isSelected = selectedItemIds.includes(item.id);
                    return (
                      <div 
                        key={item.id} 
                        className={`group p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${isSelected ? 'border-brand-500 bg-brand-500/5 dark:bg-brand-500/10' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-brand-500/50 hover:shadow-xl'}`}
                        onClick={() => toggleItemSelection(item.id)}
                      >
                        <div className="aspect-square bg-slate-100 dark:bg-slate-950/40 rounded-xl mb-3 overflow-hidden relative border border-slate-200 dark:border-slate-800/10">
                          {item.photo_url ? <img src={item.photo_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center opacity-10"><Package size={28}/></div>}
                          <div className="absolute top-2 left-2 bg-slate-900/80 backdrop-blur-md px-2 py-0.5 rounded-md text-[6px] font-black text-white uppercase">{item.location}</div>
                          
                          <button 
                            onClick={(e) => { e.stopPropagation(); setItemToDelete(item); setDeleteTarget('SINGLE'); setIsDeleteConfirmOpen(true); }} 
                            className="absolute top-2 right-2 p-1.5 bg-red-500/90 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 size={12}/>
                          </button>
                        </div>
                        
                        <h4 className="font-black text-[11px] uppercase truncate mb-1 text-slate-900 dark:text-white">{item.name}</h4>
                        
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/30">
                          <div className="flex flex-col">
                            <span className={`text-xl font-black tracking-tighter ${item.current_stock <= item.min_stock ? 'text-red-500 animate-pulse' : 'text-slate-900 dark:text-slate-200'}`}>{item.current_stock}</span>
                            <span className="text-[6px] font-black text-slate-400 uppercase tracking-widest">SALDO ({item.unit})</span>
                          </div>
                          <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
                             <button onClick={() => { setMovementItemId(item.id); setMovementType('IN'); setIsMovementModalOpen(true); }} className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg"><Plus size={14}/></button>
                             <button onClick={() => { setMovementItemId(item.id); setMovementType('OUT'); setIsMovementModalOpen(true); }} className="p-2 bg-orange-500/10 text-orange-500 rounded-lg"><TrendingDown size={14}/></button>
                             <button onClick={() => { setEditingItem(item); setFormData(item); setIsItemModalOpen(true); }} className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-lg hover:bg-brand-600 hover:text-white transition-colors"><Edit3 size={14}/></button>
                          </div>
                        </div>
                        
                        {isSelected && (
                          <div className="absolute inset-0 border-2 border-brand-500 rounded-2xl pointer-events-none">
                            <div className="absolute top-2 right-2 bg-brand-500 text-white p-0.5 rounded-full flex items-center justify-center">
                              <Check size={8} strokeWidth={4} />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {currentView === AppView.MOVEMENTS && (
               <div className="space-y-2 max-w-4xl mx-auto">
                 {movements.map(m => (
                   <div key={m.id} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 flex items-center justify-between text-[10px] hover:bg-white dark:hover:bg-slate-900 transition-all">
                     <div className="flex gap-4 items-center">
                       <div className={`p-2 rounded-lg ${m.type === 'IN' ? 'bg-emerald-500/10 text-emerald-500' : m.type === 'OUT' ? 'bg-orange-500/10 text-orange-500' : m.type === 'DELETE' ? 'bg-red-500/10 text-red-500' : 'bg-slate-500/10 text-slate-500'}`}>
                          {m.type === 'IN' ? <Plus size={14}/> : m.type === 'OUT' ? <TrendingDown size={14}/> : m.type === 'DELETE' ? <Trash2 size={14}/> : <Edit3 size={14}/>}
                       </div>
                       <div>
                         <p className="font-black uppercase text-slate-900 dark:text-white">{m.item_name}</p>
                         <p className="text-[8px] text-slate-500 uppercase font-medium">{new Date(m.timestamp).toLocaleString()} • {m.user_name}</p>
                       </div>
                     </div>
                     <div className="text-right">
                        <p className={`font-black text-sm ${m.type === 'IN' ? 'text-emerald-500' : m.type === 'OUT' ? 'text-orange-500' : m.type === 'DELETE' ? 'text-red-500' : 'text-slate-400'}`}>{m.type === 'IN' ? '+' : m.type === 'OUT' ? '-' : ''}{m.quantity}</p>
                        {m.reason && <p className="text-[7px] text-slate-400 uppercase font-bold">{m.reason}</p>}
                     </div>
                   </div>
                 ))}
               </div>
            )}
          </div>
        </div>
      </main>

      {/* MODAL CONFIRMAÇÃO EXCLUSÃO */}
      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
           <div className="rounded-3xl w-full max-w-[320px] p-8 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl text-center scale-in-center">
              <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 size={32} />
              </div>
              <h3 className="text-lg font-black uppercase tracking-tighter mb-2">Confirmar Exclusão?</h3>
              <p className="text-[10px] text-slate-500 mb-8 uppercase tracking-widest leading-relaxed">
                {deleteTarget === 'SINGLE' 
                  ? `Deseja realmente excluir o item "${itemToDelete?.name}"? Esta ação é irreversível e será registrada no histórico.`
                  : `Deseja realmente excluir os ${selectedItemIds.length} materiais selecionados?`}
              </p>
              <div className="space-y-3">
                <button onClick={executeDelete} disabled={isSyncing} className="w-full py-4 bg-red-600 text-white font-black rounded-2xl uppercase text-[10px] shadow-lg shadow-red-600/20 active:scale-95 transition-all">
                  {isSyncing ? <Loader2 className="animate-spin m-auto" /> : 'EXCLUIR AGORA'}
                </button>
                <button onClick={() => setIsDeleteConfirmOpen(false)} className="w-full py-4 text-slate-400 font-black rounded-2xl uppercase text-[10px] tracking-widest">CANCELAR</button>
              </div>
           </div>
        </div>
      )}

      {/* MODAL MATERIAL */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in zoom-in duration-300">
          <div className="rounded-3xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center px-8">
              <h3 className="text-sm font-black uppercase tracking-tighter">{editingItem ? 'Editar' : 'Novo'} Material</h3>
              <button onClick={() => setIsItemModalOpen(false)} className="text-slate-400 hover:text-red-500"><X size={24} /></button>
            </div>
            <form onSubmit={handleSaveItem} className="p-8 space-y-6 overflow-y-auto custom-scrollbar">
               <div className="flex flex-col items-center gap-6">
                  <div className="w-28 h-28 rounded-2xl bg-slate-100 dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 overflow-hidden relative group">
                    {formData.photo_url ? <img src={formData.photo_url} className="w-full h-full object-cover" /> : <Package size={40} className="m-auto mt-8 opacity-20" />}
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"><Camera size={20}/></button>
                  </div>
                  <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={(e) => handlePhotoUpload(e, 'item')} />
                  <input required className="w-full p-4 rounded-xl font-black text-center uppercase outline-none focus:border-brand-500 border-2 border-transparent text-sm bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white transition-all shadow-inner" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="NOME DO MATERIAL" />
               </div>
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-500 uppercase px-1">Setor</label>
                    <input className="w-full p-4 rounded-xl font-bold text-center uppercase text-[11px] bg-slate-50 dark:bg-slate-950/50 outline-none focus:border-brand-500 border-2 border-transparent transition-all" value={formData.department || ''} onChange={e => setFormData({...formData, department: e.target.value})} placeholder="EX: ELÉTRICA" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-500 uppercase px-1">Localização</label>
                    <input className="w-full p-4 rounded-xl font-bold text-center uppercase text-[11px] bg-slate-50 dark:bg-slate-950/50 outline-none focus:border-brand-500 border-2 border-transparent transition-all" value={formData.location || ''} onChange={e => setFormData({...formData, location: e.target.value})} placeholder="EX: B4" />
                  </div>
               </div>
               <button type="submit" disabled={isSyncing} className="w-full py-5 bg-brand-600 text-white rounded-2xl font-black uppercase text-[11px] shadow-xl hover:bg-brand-700 active:scale-95 transition-all">
                 {isSyncing ? <Loader2 className="animate-spin m-auto" size={18}/> : 'CONCLUIR CADASTRO'}
               </button>
            </form>
          </div>
        </div>
      )}

      {isMovementModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in">
           <div className="rounded-3xl w-full max-w-[300px] overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl">
              <div className={`p-6 text-center ${movementType === 'IN' ? 'bg-emerald-600' : 'bg-orange-600'} text-white`}>
                 <h3 className="text-2xl font-black uppercase tracking-widest">{movementType === 'IN' ? 'Entrada' : 'Saída'}</h3>
                 <p className="text-[8px] mt-1 font-black uppercase opacity-80 truncate px-2">{items.find(i => i.id === movementItemId)?.name}</p>
              </div>
              <form onSubmit={handleMovement} className="p-6 space-y-5 text-center">
                 <div className="space-y-1">
                   <label className="text-[8px] font-black text-slate-500 uppercase">Quantidade</label>
                   <input type="number" min="1" required autoFocus className="w-full text-5xl font-black text-center p-4 rounded-2xl outline-none bg-slate-50 dark:bg-slate-950 border-2 border-transparent focus:border-brand-500 transition-all" value={moveData.quantity} onChange={e => setMoveData({...moveData, quantity: Number(e.target.value)})} />
                 </div>
                 <button type="submit" disabled={isSyncing} className={`w-full py-4 text-white font-black rounded-xl uppercase text-xs shadow-lg active:scale-95 transition-all ${movementType === 'IN' ? 'bg-emerald-600' : 'bg-orange-600'}`}>
                   {isSyncing ? <Loader2 className="animate-spin m-auto" /> : 'CONFIRMAR'}
                 </button>
                 <button type="button" onClick={() => setIsMovementModalOpen(false)} className="w-full text-[8px] font-black text-slate-400 uppercase tracking-widest">CANCELAR</button>
              </form>
           </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #3b82f6; border-radius: 10px; opacity: 0.3; }
        input[type=number]::-webkit-inner-spin-button { display: none; }
        @keyframes scale-in-center {
          0% { transform: scale(0); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        .scale-in-center { animation: scale-in-center 0.3s cubic-bezier(0.250, 0.460, 0.450, 0.940) both; }
      `}</style>
    </div>
  );
}
