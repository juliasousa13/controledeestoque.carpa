
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  LayoutDashboard, Package, Plus, Search, Trash2, Moon, Sun, Menu, X, 
  Camera, AlertTriangle, Loader2, RefreshCw, TrendingDown, Box, 
  History, Activity, Edit3, Users as UsersIcon, FileSpreadsheet, 
  Upload, CheckCircle2, User as UserIcon, LogOut, ChevronRight,
  Info, Check, CloudCheck, Settings as SettingsIcon
} from 'lucide-react';
import { InventoryItem, MovementLog, UserSession, AppView, UserProfile } from './types';
import { Logo } from './components/Logo';
import { supabase } from './services/supabaseClient';

declare const XLSX: any;

export default function App() {
  const [darkMode, setDarkMode] = useState<boolean>(true);
  const [user, setUser] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  
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
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [movementType, setMovementType] = useState<'IN' | 'OUT'>('IN');
  const [movementItemId, setMovementItemId] = useState<string>('');
  
  const [formData, setFormData] = useState<Partial<InventoryItem>>({});
  const [userFormData, setUserFormData] = useState<Partial<UserProfile>>({});
  const [moveData, setMoveData] = useState({ quantity: 1, reason: '' });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const userFileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async (showLoader = true) => {
    if (showLoader) setIsSyncing(true);
    try {
      const [itRes, movRes, userRes] = await Promise.all([
        supabase.from('inventory_items').select('*').order('name'),
        supabase.from('movements').select('*').order('timestamp', { ascending: false }).limit(50),
        supabase.from('users').select('*').order('name')
      ]);

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
    } catch (err) {
      console.error("Erro na sincronização:", err);
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  }, [user?.badgeId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userFormData.name || !userFormData.badge_id) return;
    setIsSyncing(true);
    try {
      const { error } = await supabase.from('users').upsert({
        badge_id: userFormData.badge_id,
        name: userFormData.name.toUpperCase(),
        role: userFormData.role || 'Colaborador',
        photo_url: userFormData.photo_url || null
      });
      if (error) throw error;
      setIsUserEditModalOpen(false);
      setEditingUser(null);
      fetchData(false);
    } catch (err: any) {
      alert("Erro ao salvar colaborador: " + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !user) return;
    setIsSyncing(true);
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
        type: editingItem ? 'EDIT' : 'CREATE',
        quantity: 0,
        user_badge_id: user.badgeId,
        user_name: user.name,
        timestamp: itemToSave.last_updated,
        reason: editingItem ? 'Ajuste de Cadastro' : 'Entrada Inicial'
      });

      setIsItemModalOpen(false);
      setEditingItem(null);
      setFormData({});
      fetchData(false);
    } catch (err: any) {
      alert("Erro ao salvar material: " + err.message);
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
      alert("Erro na movimentação: " + err.message);
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
    <div className={`h-screen flex flex-col items-center justify-center ${darkMode ? 'bg-[#020617]' : 'bg-white'}`}>
      <Logo className="w-16 h-16 animate-pulse" />
      <Loader2 className="animate-spin text-brand-600 mt-4" size={32} />
    </div>
  );

  if (!user) {
    return (
      <div className={`h-screen flex items-center justify-center p-4 ${darkMode ? 'bg-[#020617]' : 'bg-slate-100'}`}>
        <div className={`w-full max-w-[340px] p-8 rounded-3xl border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-2xl'}`}>
          <div className="flex flex-col items-center mb-6 text-center">
            <Logo className="w-12 h-12 mb-4" />
            <h1 className={`text-xl font-black tracking-tighter ${darkMode ? 'text-white' : 'text-slate-900'}`}>CARPA ESTOQUE</h1>
          </div>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const badge = (e.target as any).badge.value;
            const { data } = await supabase.from('users').select('*').eq('badge_id', badge).single();
            if (data) {
              setUser({ badgeId: data.badge_id, name: data.name, role: data.role, photoUrl: data.photo_url });
            } else {
              const name = prompt("Matrícula nova. Seu Nome:");
              if (name) {
                const { error } = await supabase.from('users').insert({ badge_id: badge, name: name.toUpperCase(), role: 'Colaborador' });
                if (!error) setUser({ badgeId: badge, name: name.toUpperCase(), role: 'Colaborador' });
                else alert("Erro ao criar usuário.");
              }
            }
          }} className="space-y-4">
            <input name="badge" required placeholder="DIGITE SUA MATRÍCULA" className={`w-full py-4 rounded-xl font-black text-center uppercase outline-none border-2 border-transparent focus:border-brand-500 text-sm ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50'}`} />
            <button className="w-full py-4 bg-brand-600 text-white font-black rounded-xl uppercase tracking-widest active:scale-95 transition-all text-xs">ENTRAR</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-screen flex flex-col lg:flex-row font-sans transition-colors duration-500 ${darkMode ? 'bg-[#020617] text-white' : 'bg-slate-50 text-slate-900'}`}>
      
      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 w-64 z-50 transform transition-transform duration-500 border-r ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} backdrop-blur-3xl ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex flex-col h-full p-5">
          <div className="flex items-center justify-between mb-8 px-2">
            <div className="flex items-center gap-2">
              <Logo className="w-7 h-7" />
              <span className="font-black text-base tracking-tighter">CARPA</span>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-1"><X size={18}/></button>
          </div>
          
          <nav className="flex-1 space-y-1">
            {[
              { id: AppView.DASHBOARD, icon: LayoutDashboard, label: 'Resumo' },
              { id: AppView.INVENTORY, icon: Package, label: 'Estoque' },
              { id: AppView.MOVEMENTS, icon: History, label: 'Histórico' },
              { id: AppView.SETTINGS, icon: SettingsIcon, label: 'Configurações' }
            ].map(v => (
              <button 
                key={v.id} 
                onClick={() => { setCurrentView(v.id); setIsSidebarOpen(false); }} 
                className={`w-full flex items-center gap-3 p-3 rounded-xl font-bold text-xs transition-all ${currentView === v.id ? 'bg-brand-600 text-white' : 'text-slate-400 hover:bg-brand-500/10'}`}
              >
                <v.icon size={16} /> {v.label}
              </button>
            ))}
          </nav>

          <div className="mt-auto space-y-2 pt-4 border-t border-slate-800/50">
            <div className={`p-2 rounded-xl border flex items-center gap-3 ${darkMode ? 'bg-slate-950/50 border-slate-800' : 'bg-white border-slate-200'}`}>
              <div className="w-8 h-8 rounded-lg bg-brand-600/10 flex items-center justify-center overflow-hidden border border-brand-500/20">
                {user.photoUrl ? <img src={user.photoUrl} className="w-full h-full object-cover" /> : <UserIcon size={14}/>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-black text-[9px] truncate uppercase">{user.name}</p>
                <p className="text-[7px] text-slate-500 truncate uppercase">{user.role}</p>
              </div>
            </div>
            
            <div className="flex gap-2">
              <button onClick={() => setDarkMode(!darkMode)} className="flex-1 p-2 rounded-lg border flex justify-center"><Sun size={14}/></button>
              <button onClick={() => setUser(null)} className="flex-1 p-2 bg-red-500/10 text-red-500 rounded-lg font-black text-[9px] uppercase">SAIR</button>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-14 border-b flex items-center justify-between px-4 bg-inherit/40 backdrop-blur-xl sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2"><Menu size={18}/></button>
            <h2 className="font-black text-[10px] md:text-xs uppercase tracking-tighter">{currentView}</h2>
          </div>
          
          <div className="flex gap-2">
            {currentView === AppView.INVENTORY && (
              <button onClick={() => { setEditingItem(null); setFormData({}); setIsItemModalOpen(true); }} className="bg-brand-600 text-white px-3 py-1.5 rounded-lg font-black text-[9px] flex items-center gap-1 shadow-md active:scale-95 uppercase">
                <Plus size={12}/> ADICIONAR
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="max-w-5xl mx-auto space-y-4">
            
            {currentView === AppView.INVENTORY && (
              <div className="space-y-3">
                <div className={`p-2 px-4 rounded-xl border flex items-center gap-2 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white shadow-sm'}`}>
                  <Search className="text-slate-500" size={14}/>
                  <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="PESQUISAR MATERIAL..." className="flex-1 bg-transparent border-none outline-none font-bold text-center uppercase text-[9px]" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                  {filteredItems.map(item => {
                    const isSelected = selectedItemIds.includes(item.id);
                    return (
                      <div key={item.id} className={`p-3 rounded-2xl border transition-all ${isSelected ? 'border-brand-500 bg-brand-500/5' : darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white shadow-sm'}`}>
                        <div className="aspect-square bg-slate-950/40 rounded-xl mb-3 overflow-hidden relative border border-slate-800/10">
                          {item.photo_url ? <img src={item.photo_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center opacity-10"><Package size={24}/></div>}
                          <div className="absolute top-1.5 left-1.5 bg-slate-900/80 px-1.5 py-0.5 rounded-md text-[5px] font-black text-white uppercase">{item.location}</div>
                        </div>
                        <h4 className="font-black text-[10px] uppercase truncate mb-1">{item.name}</h4>
                        <div className="flex items-center justify-between pt-2 border-t border-slate-800/10">
                          <div className="flex flex-col">
                            <span className={`text-lg font-black ${item.current_stock <= item.min_stock ? 'text-red-500' : 'text-slate-200'}`}>{item.current_stock}</span>
                            <span className="text-[5px] font-black text-slate-500 uppercase tracking-widest">SALDO</span>
                          </div>
                          <div className="flex gap-1">
                             <button onClick={() => { setMovementItemId(item.id); setMovementType('IN'); setIsMovementModalOpen(true); }} className="p-1.5 bg-emerald-500/10 text-emerald-500 rounded-lg"><Plus size={12}/></button>
                             <button onClick={() => { setMovementItemId(item.id); setMovementType('OUT'); setIsMovementModalOpen(true); }} className="p-1.5 bg-orange-500/10 text-orange-500 rounded-lg"><TrendingDown size={12}/></button>
                             <button onClick={() => { setEditingItem(item); setFormData(item); setIsItemModalOpen(true); }} className="p-1.5 bg-slate-800 text-slate-400 rounded-lg"><Edit3 size={12}/></button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {currentView === AppView.SETTINGS && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black uppercase">Gerenciamento de Equipe</h3>
                  <button onClick={() => { setEditingUser(null); setUserFormData({ badge_id: '', name: '', role: '', photo_url: '' }); setIsUserEditModalOpen(true); }} className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-[9px] font-black uppercase shadow-lg">Cadastrar Colaborador</button>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {allUsers.map(u => (
                    <div 
                      key={u.badge_id} 
                      onClick={() => { setEditingUser(u); setUserFormData(u); setIsUserEditModalOpen(true); }}
                      className={`p-4 rounded-2xl border flex items-center gap-4 cursor-pointer transition-all hover:border-brand-500 ${darkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-white shadow-sm'}`}
                    >
                      <div className="w-12 h-12 rounded-xl bg-slate-950 flex items-center justify-center overflow-hidden border border-slate-800">
                        {u.photo_url ? <img src={u.photo_url} className="w-full h-full object-cover" /> : <UserIcon className="text-slate-600" size={20}/>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-xs uppercase truncate">{u.name}</p>
                        <p className="text-[8px] font-bold text-brand-500 uppercase tracking-widest">{u.role}</p>
                        <p className="text-[7px] text-slate-500 uppercase">Matrícula: {u.badge_id}</p>
                      </div>
                      <Edit3 size={14} className="text-slate-600" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {currentView === AppView.DASHBOARD && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                 <div className={`p-5 rounded-2xl border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white shadow-sm'}`}>
                    <Box className="text-brand-500 mb-2" size={18}/>
                    <p className="text-[8px] font-black uppercase text-slate-500">Itens Ativos</p>
                    <h3 className="text-3xl font-black">{items.length}</h3>
                 </div>
                 <div className={`p-5 rounded-2xl border ${darkMode ? 'bg-red-500/10 border-red-500/20' : 'bg-red-50 border-red-100'}`}>
                    <AlertTriangle className="text-red-500 mb-2" size={18}/>
                    <p className="text-[8px] font-black uppercase text-red-500">Reposição</p>
                    <h3 className="text-3xl font-black text-red-500">{items.filter(i => i.current_stock <= i.min_stock).length}</h3>
                 </div>
                 <div className={`p-5 rounded-2xl border ${darkMode ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-emerald-50 border-emerald-100'}`}>
                    <Activity className="text-emerald-500 mb-2" size={18}/>
                    <p className="text-[8px] font-black uppercase text-emerald-500">Eventos</p>
                    <h3 className="text-3xl font-black text-emerald-500">{movements.length}</h3>
                 </div>
              </div>
            )}

            {currentView === AppView.MOVEMENTS && (
               <div className="space-y-2">
                 {movements.map(m => (
                   <div key={m.id} className={`p-3 rounded-xl border flex items-center justify-between text-[9px] ${darkMode ? 'bg-slate-900/40 border-slate-800' : 'bg-white'}`}>
                     <div className="flex gap-3 items-center">
                       <div className={`p-1.5 rounded-lg ${m.type === 'IN' ? 'bg-emerald-500/10 text-emerald-500' : m.type === 'OUT' ? 'bg-orange-500/10 text-orange-500' : 'bg-slate-500/10 text-slate-500'}`}>
                          {m.type === 'IN' ? <Plus size={12}/> : m.type === 'OUT' ? <TrendingDown size={12}/> : <Edit3 size={12}/>}
                       </div>
                       <div>
                         <p className="font-black uppercase">{m.item_name}</p>
                         <p className="text-[7px] text-slate-500 uppercase">{new Date(m.timestamp).toLocaleString()} • {m.user_name}</p>
                       </div>
                     </div>
                     <p className={`font-black text-sm ${m.type === 'IN' ? 'text-emerald-500' : 'text-orange-500'}`}>{m.type === 'IN' ? '+' : '-'}{m.quantity}</p>
                   </div>
                 ))}
               </div>
            )}
          </div>
        </div>
      </main>

      {/* MODAL USUÁRIO */}
      {isUserEditModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className={`rounded-2xl w-full max-w-sm overflow-hidden flex flex-col border border-slate-800 ${darkMode ? 'bg-slate-900' : 'bg-white'}`}>
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-brand-600 text-white">
              <h3 className="text-xs font-black uppercase">{editingUser ? 'Editar' : 'Novo'} Colaborador</h3>
              <button onClick={() => setIsUserEditModalOpen(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSaveUser} className="p-6 space-y-4">
              <div className="flex flex-col items-center gap-3">
                <div className="w-20 h-20 rounded-2xl bg-slate-950 border-2 border-slate-800 overflow-hidden relative group">
                  {userFormData.photo_url ? <img src={userFormData.photo_url} className="w-full h-full object-cover" /> : <UserIcon size={24} className="m-auto mt-7 opacity-20" />}
                  <button type="button" onClick={() => userFileInputRef.current?.click()} className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"><Camera size={14}/></button>
                </div>
                <input type="file" accept="image/*" ref={userFileInputRef} className="hidden" onChange={(e) => handlePhotoUpload(e, 'user')} />
              </div>
              <div className="space-y-3">
                <input required placeholder="MATRÍCULA" disabled={!!editingUser} className="w-full p-3 rounded-xl bg-slate-950 text-white font-black text-center uppercase text-xs outline-none focus:border-brand-500 border-2 border-transparent disabled:opacity-30" value={userFormData.badge_id || ''} onChange={e => setUserFormData({...userFormData, badge_id: e.target.value})} />
                <input required placeholder="NOME COMPLETO" className="w-full p-3 rounded-xl bg-slate-950 text-white font-black text-center uppercase text-xs outline-none focus:border-brand-500 border-2 border-transparent" value={userFormData.name || ''} onChange={e => setUserFormData({...userFormData, name: e.target.value})} />
                <input placeholder="CARGO / FUNÇÃO" className="w-full p-3 rounded-xl bg-slate-950 text-white font-black text-center uppercase text-xs outline-none focus:border-brand-500 border-2 border-transparent" value={userFormData.role || ''} onChange={e => setUserFormData({...userFormData, role: e.target.value})} />
              </div>
              <button type="submit" disabled={isSyncing} className="w-full py-4 bg-brand-600 text-white rounded-xl font-black uppercase text-xs shadow-lg active:scale-95 transition-all">
                {isSyncing ? <Loader2 className="animate-spin m-auto" size={16}/> : 'SALVAR DADOS'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL MATERIAL */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in zoom-in">
          <div className={`rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col border border-slate-800 ${darkMode ? 'bg-slate-900' : 'bg-white'}`}>
            <div className="p-4 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-xs font-black uppercase">{editingItem ? 'EDITAR' : 'NOVO'} MATERIAL</h3>
              <button onClick={() => setIsItemModalOpen(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveItem} className="p-6 space-y-4 overflow-y-auto">
               <div className="flex flex-col items-center gap-4">
                  <div className="w-24 h-24 rounded-xl bg-slate-950 border-2 border-slate-800 overflow-hidden relative group">
                    {formData.photo_url ? <img src={formData.photo_url} className="w-full h-full object-cover" /> : <Package size={24} className="m-auto mt-8 opacity-20" />}
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100"><Camera size={16}/></button>
                  </div>
                  <input type="file" accept="image/*" capture="environment" ref={fileInputRef} className="hidden" onChange={(e) => handlePhotoUpload(e, 'item')} />
                  <input required className={`w-full p-3 rounded-lg font-black text-center uppercase outline-none focus:border-brand-500 border-2 border-transparent text-xs ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50'}`} value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="NOME DO MATERIAL" />
               </div>
               <div className="grid grid-cols-2 gap-3">
                  <input className="p-3 rounded-lg font-bold text-center uppercase text-[9px] bg-slate-950/50" value={formData.department || ''} onChange={e => setFormData({...formData, department: e.target.value})} placeholder="SETOR" />
                  <input className="p-3 rounded-lg font-bold text-center uppercase text-[9px] bg-slate-950/50" value={formData.location || ''} onChange={e => setFormData({...formData, location: e.target.value})} placeholder="LOCAL" />
                  <input className="p-3 rounded-lg font-bold text-center uppercase text-[9px] bg-slate-950/50" value={formData.unit || 'UND'} onChange={e => setFormData({...formData, unit: e.target.value})} placeholder="UND" />
                  <div className="flex gap-2">
                    <input type="number" className="w-1/2 p-3 rounded-lg font-bold text-center text-[9px] bg-slate-950/50" value={formData.min_stock || 0} onChange={e => setFormData({...formData, min_stock: Number(e.target.value)})} placeholder="MIN" />
                    <input type="number" disabled={!!editingItem} className="w-1/2 p-3 rounded-lg font-bold text-center text-[9px] bg-slate-950/50 disabled:opacity-20" value={formData.current_stock || 0} onChange={e => setFormData({...formData, current_stock: Number(e.target.value)})} placeholder="SALDO" />
                  </div>
               </div>
               <button type="submit" disabled={isSyncing} className="w-full py-4 bg-brand-600 text-white rounded-xl font-black uppercase text-[9px] shadow-lg">
                 {isSyncing ? <Loader2 className="animate-spin m-auto" size={16}/> : 'SALVAR'}
               </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL MOVIMENTAÇÃO */}
      {isMovementModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in">
           <div className={`rounded-2xl w-full max-w-[280px] overflow-hidden border border-slate-800 ${darkMode ? 'bg-slate-900' : 'bg-white'}`}>
              <div className={`p-5 text-center ${movementType === 'IN' ? 'bg-emerald-600' : 'bg-orange-600'} text-white`}>
                 <h3 className="text-xl font-black uppercase tracking-widest">{movementType === 'IN' ? 'Entrada' : 'Saída'}</h3>
                 <p className="text-[7px] mt-1 font-black uppercase opacity-80 truncate px-2">{items.find(i => i.id === movementItemId)?.name}</p>
              </div>
              <form onSubmit={handleMovement} className="p-5 space-y-4 text-center">
                 <input type="number" min="1" required autoFocus className="w-full text-4xl font-black text-center p-3 rounded-xl outline-none bg-slate-950 text-white border-2 border-transparent focus:border-brand-500" value={moveData.quantity} onChange={e => setMoveData({...moveData, quantity: Number(e.target.value)})} />
                 <input placeholder="JUSTIFICATIVA" className="w-full p-2.5 rounded-lg text-center uppercase text-[8px] bg-slate-950 text-white outline-none" value={moveData.reason} onChange={e => setMoveData({...moveData, reason: e.target.value})} />
                 <button type="submit" disabled={isSyncing} className={`w-full py-3.5 text-white font-black rounded-xl uppercase text-[10px] shadow-lg ${movementType === 'IN' ? 'bg-emerald-600' : 'bg-orange-600'}`}>
                   {isSyncing ? <Loader2 className="animate-spin m-auto" /> : 'CONFIRMAR'}
                 </button>
                 <button type="button" onClick={() => setIsMovementModalOpen(false)} className="w-full text-[7px] font-black text-slate-500 uppercase">CANCELAR</button>
              </form>
           </div>
        </div>
      )}
    </div>
  );
}
