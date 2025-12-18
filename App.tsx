
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  LayoutDashboard, Package, Plus, Search, Trash2, Moon, Sun, Menu, X, 
  Camera, AlertTriangle, Loader2, RefreshCw, TrendingDown, Box, 
  History, Activity, Edit3, Users as UsersIcon, FileSpreadsheet, 
  Upload, CheckCircle2, Settings, User as UserIcon, LogOut, ChevronRight
} from 'lucide-react';
import { InventoryItem, MovementLog, UserSession, AppView, UserProfile } from './types';
import { Logo } from './components/Logo';
import { supabase } from './services/supabaseClient';
import { saveOfflineData, loadOfflineData } from './services/offlineStorage';

declare const XLSX: any;

export default function App() {
  const [darkMode, setDarkMode] = useState<boolean>(true);
  const [user, setUser] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<MovementLog[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [movementType, setMovementType] = useState<'IN' | 'OUT'>('IN');
  const [movementItemId, setMovementItemId] = useState<string>('');
  
  const [formData, setFormData] = useState<Partial<InventoryItem>>({});
  const [moveData, setMoveData] = useState({ quantity: 1, reason: '' });
  const [profileFormData, setProfileFormData] = useState({ name: '', photoUrl: '' });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const profileFileInputRef = useRef<HTMLInputElement>(null);

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

  const fetchData = useCallback(async (showLoader = true) => {
    if (showLoader) setIsSyncing(true);
    try {
      const { data: itData } = await supabase.from('inventory_items').select('*').order('name');
      const { data: movData } = await supabase.from('movements').select('*').order('timestamp', { ascending: false }).limit(100);
      const { data: userData } = await supabase.from('users').select('*').order('name');

      if (itData) setItems(itData.map(mapFromDB));
      if (movData) {
        setMovements(movData.map(m => ({
          id: String(m.id), itemId: m.item_id, itemName: m.item_name, type: m.type as any,
          quantity: m.quantity, userBadgeId: m.user_badge_id, userName: m.user_name,
          timestamp: m.timestamp, reason: m.reason
        })));
      }
      if (userData) {
        setAllUsers(userData.map(u => ({
          badgeId: u.badge_id, name: u.name, role: u.role, photoUrl: u.photo_url, createdAt: u.created_at
        })));
        // Atualiza o usuário logado se ele estiver na lista
        const currentUserData = userData.find(u => u.badge_id === user?.badgeId);
        if (currentUserData && user) {
          setUser({ ...user, name: currentUserData.name, photoUrl: currentUserData.photo_url });
        }
      }
    } catch (err) {
      console.error("Erro na carga:", err);
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  }, [user?.badgeId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Captura de Foto
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>, isProfile = false) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        if (isProfile) {
          setProfileFormData(prev => ({ ...prev, photoUrl: base64String }));
        } else {
          setFormData(prev => ({ ...prev, photoUrl: base64String }));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSyncing(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({ name: profileFormData.name, photo_url: profileFormData.photoUrl })
        .eq('badge_id', user.badgeId);
      
      if (error) throw error;
      setUser({ ...user, name: profileFormData.name, photoUrl: profileFormData.photoUrl });
      setIsProfileModalOpen(false);
      fetchData(false);
    } catch (err) {
      alert("Erro ao atualizar perfil.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Deseja excluir ${selectedItemIds.length} materiais selecionados?`)) return;
    setIsSyncing(true);
    try {
      const { error } = await supabase.from('inventory_items').delete().in('id', selectedItemIds);
      if (error) throw error;
      setItems(prev => prev.filter(i => !selectedItemIds.includes(i.id)));
      setSelectedItemIds([]);
    } catch (err) {
      alert("Erro na exclusão em lote.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !user) return;

    setIsSyncing(true);
    const itemToSave = {
      id: editingItem?.id || Date.now().toString(),
      name: formData.name.toUpperCase(),
      unit: (formData.unit || 'UND').toUpperCase(),
      min_stock: Number(formData.minStock) || 0,
      current_stock: Number(formData.currentStock) || 0,
      location: (formData.location || '').toUpperCase(),
      department: (formData.department || '').toUpperCase(),
      photo_url: formData.photoUrl,
      description: formData.description || '',
      last_updated: new Date().toISOString(),
      last_updated_by: user.name,
      last_updated_by_badge: user.badgeId
    };

    try {
      const { error } = await supabase.from('inventory_items').upsert(itemToSave);
      if (error) throw error;
      setIsItemModalOpen(false);
      setEditingItem(null);
      setFormData({});
      fetchData(false);
    } catch (err) {
      alert("Erro ao salvar.");
    } finally {
      setIsSyncing(false);
    }
  };

  const filteredItems = useMemo(() => {
    if (!searchTerm) return items;
    const s = searchTerm.toLowerCase();
    return items.filter(i => i.name.toLowerCase().includes(s) || i.location.toLowerCase().includes(s) || i.department.toLowerCase().includes(s));
  }, [items, searchTerm]);

  if (isLoading) return (
    <div className={`h-screen flex flex-col items-center justify-center ${darkMode ? 'bg-[#020617]' : 'bg-white'}`}>
      <Logo className="w-24 h-24 mb-8 animate-pulse" />
      <Loader2 className="animate-spin text-brand-600" size={40} />
    </div>
  );

  if (!user) {
    return (
      <div className={`h-screen flex items-center justify-center p-6 ${darkMode ? 'bg-[#020617]' : 'bg-slate-100'}`}>
        <div className={`w-full max-w-[440px] p-12 rounded-[3.5rem] shadow-2xl border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} backdrop-blur-xl animate-in zoom-in`}>
          <div className="flex flex-col items-center mb-10 text-center">
            <Logo className="w-20 h-20 mb-6" />
            <h1 className={`text-4xl font-black tracking-tighter mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>CARPA</h1>
            <p className="text-[10px] font-black text-brand-500 uppercase tracking-widest">Controle Profissional</p>
          </div>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const badge = (e.target as any).badge.value;
            const { data } = await supabase.from('users').select('*').eq('badge_id', badge).single();
            if (data) {
              setUser({ badgeId: data.badge_id, name: data.name, role: data.role, photoUrl: data.photo_url });
            } else {
              const name = prompt("Matrícula não encontrada. Qual seu nome para cadastro?");
              if (name) {
                await supabase.from('users').insert({ badge_id: badge, name, role: 'staff' });
                setUser({ badgeId: badge, name, role: 'staff' });
              }
            }
          }} className="space-y-8">
            <div className="text-center">
              <label className="text-[10px] font-black text-slate-400 uppercase mb-4 block tracking-widest">ID da Matrícula</label>
              <input name="badge" required type="text" placeholder="MATRÍCULA" className={`w-full py-6 rounded-[2rem] font-black outline-none text-2xl text-center uppercase shadow-inner ${darkMode ? 'bg-slate-950 text-white focus:border-brand-500 border-2 border-transparent' : 'bg-slate-50 border-2 border-transparent focus:border-brand-500'}`} />
            </div>
            <button className="w-full py-6 bg-brand-600 text-white font-black rounded-[2.5rem] shadow-xl hover:bg-brand-700 active:scale-95 transition-all text-lg tracking-widest">ACESSAR</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-screen flex font-sans transition-colors duration-500 ${darkMode ? 'bg-[#020617] text-white' : 'bg-slate-50 text-slate-900'}`}>
      {/* Sidebar Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 w-80 z-50 transform transition-transform duration-500 border-r ${darkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200'} backdrop-blur-3xl ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex flex-col h-full p-8">
          <div className="flex items-center gap-4 mb-12">
            <Logo className="w-12 h-12" />
            <span className="font-black text-2xl tracking-tighter">CARPA</span>
          </div>
          
          <nav className="flex-1 space-y-2">
            {[
              { id: AppView.DASHBOARD, icon: LayoutDashboard, label: 'Resumo' },
              { id: AppView.INVENTORY, icon: Package, label: 'Materiais' },
              { id: AppView.MOVEMENTS, icon: History, label: 'Atividades' },
              { id: AppView.USERS, icon: Settings, label: 'Configurações' }
            ].map(v => (
              <button 
                key={v.id} 
                onClick={() => { setCurrentView(v.id); setIsSidebarOpen(false); }} 
                className={`w-full flex items-center gap-4 p-5 rounded-2xl font-bold text-sm transition-all ${currentView === v.id ? 'bg-brand-600 text-white shadow-lg' : 'text-slate-400 hover:bg-brand-500/10'}`}
              >
                <v.icon size={20} /> {v.label}
              </button>
            ))}
          </nav>

          {/* Profile Card Sidebar */}
          <div className="mt-auto space-y-4">
            <button 
              onClick={() => { setProfileFormData({ name: user.name, photoUrl: user.photoUrl || '' }); setIsProfileModalOpen(true); }}
              className={`w-full p-4 rounded-3xl border text-left transition-all hover:scale-[1.02] active:scale-95 flex items-center gap-4 ${darkMode ? 'bg-slate-950/50 border-slate-800' : 'bg-slate-50 border-slate-200'}`}
            >
              <div className="w-12 h-12 rounded-2xl bg-brand-600/20 flex items-center justify-center overflow-hidden border border-brand-500/30">
                {user.photoUrl ? <img src={user.photoUrl} className="w-full h-full object-cover" /> : <UserIcon className="text-brand-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-xs truncate uppercase">{user.name}</p>
                <p className="text-[9px] font-bold text-slate-500 truncate">{user.badgeId} • {user.role.toUpperCase()}</p>
              </div>
              <ChevronRight size={14} className="text-slate-600" />
            </button>
            
            <div className="flex gap-2">
              <button onClick={() => setDarkMode(!darkMode)} className={`flex-1 p-4 rounded-2xl border flex justify-center ${darkMode ? 'border-slate-800 bg-slate-950/50' : 'border-slate-200 bg-white'}`}>
                {darkMode ? <Sun size={18}/> : <Moon size={18}/>}
              </button>
              <button onClick={() => setUser(null)} className="flex-1 p-4 bg-red-500/10 text-red-500 rounded-2xl font-black text-[10px] uppercase flex items-center justify-center gap-2">
                <LogOut size={16}/> Sair
              </button>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-20 border-b flex items-center justify-between px-10 bg-inherit/50 backdrop-blur-xl">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden"><Menu/></button>
            <h2 className="font-black text-xl uppercase tracking-tighter">{currentView}</h2>
          </div>
          {currentView === AppView.INVENTORY && selectedItemIds.length > 0 && (
            <button onClick={handleBulkDelete} className="bg-red-500 text-white px-6 py-3 rounded-xl font-black text-[10px] flex items-center gap-2 animate-in slide-in-from-top-4">
              <Trash2 size={16}/> EXCLUIR SELECIONADOS ({selectedItemIds.length})
            </button>
          )}
          <button onClick={() => { setEditingItem(null); setFormData({}); setIsItemModalOpen(true); }} className="bg-brand-600 text-white px-6 py-3 rounded-xl font-black text-[10px] flex items-center gap-2 shadow-lg shadow-brand-500/20 active:scale-95 transition-all">
            <Plus size={16}/> NOVO MATERIAL
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto space-y-8">
            {currentView === AppView.INVENTORY && (
              <div className="space-y-6">
                <div className={`p-6 rounded-[2.5rem] border flex items-center gap-4 ${darkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200'}`}>
                  <Search className="text-slate-500" size={20}/>
                  <input 
                    value={searchTerm} onChange={e => setSearchTerm(e.target.value)} 
                    placeholder="BUSCAR MATERIAL, ENDEREÇO OU SETOR..." 
                    className="flex-1 bg-transparent border-none outline-none font-bold text-center uppercase" 
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {filteredItems.map(item => {
                    const isSelected = selectedItemIds.includes(item.id);
                    return (
                      <div 
                        key={item.id} 
                        onClick={() => {
                          if (selectedItemIds.length > 0) {
                            setSelectedItemIds(prev => isSelected ? prev.filter(id => id !== item.id) : [...prev, item.id]);
                          }
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setSelectedItemIds(prev => isSelected ? prev.filter(id => id !== item.id) : [...prev, item.id]);
                        }}
                        className={`group relative p-6 rounded-[2.5rem] border transition-all duration-300 ${isSelected ? 'border-brand-500 bg-brand-500/10 scale-[0.98]' : darkMode ? 'bg-slate-900 border-slate-800 hover:border-slate-700' : 'bg-white shadow-sm border-slate-100 hover:shadow-md'}`}
                      >
                        <div className="aspect-square bg-slate-950/50 rounded-[2rem] mb-5 overflow-hidden relative border border-slate-800/50">
                          {item.photoUrl ? (
                            <img src={item.photoUrl} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center opacity-10"><Package size={48}/></div>
                          )}
                          <div className="absolute top-3 left-3 bg-brand-600 px-3 py-1 rounded-full text-[8px] font-black text-white uppercase tracking-widest">{item.location}</div>
                          {isSelected && <div className="absolute inset-0 bg-brand-600/20 flex items-center justify-center"><CheckCircle2 className="text-white" size={48}/></div>}
                        </div>
                        
                        <h4 className="font-black text-lg uppercase truncate tracking-tighter mb-1">{item.name}</h4>
                        <div className="flex items-center gap-2 mb-4">
                           <span className="text-[9px] font-black px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 uppercase">{item.department || 'ALMOX.'}</span>
                           <span className="text-[9px] font-black text-slate-500 uppercase">{item.unit}</span>
                        </div>

                        <div className="flex items-center justify-between pt-4 border-t border-slate-800/30">
                          <div className="flex flex-col">
                            <span className={`text-3xl font-black tracking-tighter ${item.currentStock <= item.minStock ? 'text-red-500' : 'text-slate-300'}`}>{item.currentStock}</span>
                            <span className="text-[8px] font-black text-slate-600 uppercase">SALDO</span>
                          </div>
                          <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                             <button onClick={(e) => { e.stopPropagation(); setMovementItemId(item.id); setMovementType('IN'); setIsMovementModalOpen(true); }} className="p-2.5 bg-emerald-500/10 text-emerald-500 rounded-xl hover:bg-emerald-500 hover:text-white"><Plus size={16}/></button>
                             <button onClick={(e) => { e.stopPropagation(); setMovementItemId(item.id); setMovementType('OUT'); setIsMovementModalOpen(true); }} className="p-2.5 bg-orange-500/10 text-orange-500 rounded-xl hover:bg-orange-500 hover:text-white"><TrendingDown size={16}/></button>
                             <button onClick={(e) => { e.stopPropagation(); setEditingItem(item); setFormData(item); setIsItemModalOpen(true); }} className="p-2.5 bg-slate-800 text-slate-400 rounded-xl hover:text-white"><Edit3 size={16}/></button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {currentView === AppView.USERS && (
              <div className="space-y-8 animate-in fade-in duration-500">
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-black uppercase tracking-tighter">Equipe Cadastrada ({allUsers.length})</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {allUsers.map(u => (
                    <div key={u.badgeId} className={`p-6 rounded-[2.5rem] border flex items-center gap-6 ${darkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200'}`}>
                      <div className="w-16 h-16 rounded-2xl bg-brand-600/10 flex items-center justify-center overflow-hidden border border-brand-500/20">
                        {u.photoUrl ? <img src={u.photoUrl} className="w-full h-full object-cover" /> : <UserIcon className="text-brand-500" size={24}/>}
                      </div>
                      <div>
                        <p className="font-black text-lg uppercase truncate">{u.name}</p>
                        <p className="text-[10px] font-bold text-slate-500">ID: {u.badgeId} • {u.role.toUpperCase()}</p>
                        <p className="text-[8px] font-bold text-slate-600 mt-1 uppercase">Membro desde {new Date(u.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {currentView === AppView.DASHBOARD && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                 <div className={`p-8 rounded-[3rem] border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white shadow-sm'}`}>
                    <Box className="text-brand-500 mb-6" size={32}/>
                    <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Ativos em Inventário</p>
                    <h3 className="text-6xl font-black tracking-tighter">{items.length}</h3>
                 </div>
                 <div className={`p-8 rounded-[3rem] border ${darkMode ? 'bg-red-500/10 border-red-500/20' : 'bg-red-50 border-red-100'}`}>
                    <AlertTriangle className="text-red-500 mb-6" size={32}/>
                    <p className="text-[10px] font-black uppercase text-red-500 tracking-widest">Nível Crítico</p>
                    <h3 className="text-6xl font-black tracking-tighter text-red-500">{items.filter(i => i.currentStock <= i.minStock).length}</h3>
                 </div>
                 <div className={`p-8 rounded-[3rem] border ${darkMode ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-emerald-50 border-emerald-100'}`}>
                    <Activity className="text-emerald-500 mb-6" size={32}/>
                    <p className="text-[10px] font-black uppercase text-emerald-500 tracking-widest">Operações Logadas</p>
                    <h3 className="text-6xl font-black tracking-tighter text-emerald-500">{movements.length}</h3>
                 </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* MODAL EDITAR PERFIL */}
      {isProfileModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/95 backdrop-blur-2xl animate-in fade-in">
          <div className={`rounded-[3.5rem] w-full max-w-md overflow-hidden border border-slate-800 ${darkMode ? 'bg-slate-900' : 'bg-white'}`}>
            <div className="p-8 border-b border-slate-800 flex justify-between items-center bg-brand-600 text-white">
              <h3 className="text-2xl font-black uppercase tracking-tighter">Meu Perfil</h3>
              <button onClick={() => setIsProfileModalOpen(false)}><X size={24} /></button>
            </div>
            <form onSubmit={handleUpdateProfile} className="p-10 space-y-8 text-center">
              <div className="flex flex-col items-center gap-4">
                <div className="w-32 h-32 rounded-[2.5rem] bg-slate-950 border-4 border-slate-800 overflow-hidden relative group">
                  {profileFormData.photoUrl ? (
                    <img src={profileFormData.photoUrl} className="w-full h-full object-cover" />
                  ) : (
                    <UserIcon size={48} className="text-slate-700 m-auto mt-8" />
                  )}
                  <button 
                    type="button"
                    onClick={() => profileFileInputRef.current?.click()}
                    className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white"
                  >
                    <Camera size={24}/>
                    <span className="text-[8px] font-black mt-2 uppercase">Alterar Foto</span>
                  </button>
                  <input type="file" accept="image/*" capture="user" ref={profileFileInputRef} className="hidden" onChange={(e) => handlePhotoUpload(e, true)} />
                </div>
                <p className="text-[10px] font-black text-slate-500 uppercase">Matrícula: {user.badgeId}</p>
              </div>
              <input 
                required 
                className={`w-full p-5 rounded-2xl font-black text-center uppercase shadow-inner outline-none ${darkMode ? 'bg-slate-950 text-white border-2 border-transparent focus:border-brand-500' : 'bg-slate-50'}`} 
                value={profileFormData.name} 
                onChange={e => setProfileFormData({...profileFormData, name: e.target.value.toUpperCase()})} 
                placeholder="SEU NOME" 
              />
              <button type="submit" disabled={isSyncing} className="w-full py-6 bg-brand-600 text-white rounded-[2rem] font-black uppercase tracking-widest shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all">
                {isSyncing ? <Loader2 className="animate-spin"/> : 'ATUALIZAR DADOS'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL NOVO/EDITAR ITEM */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-2xl animate-in zoom-in duration-300">
          <div className={`rounded-[4rem] w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border border-slate-800 shadow-2xl ${darkMode ? 'bg-slate-900' : 'bg-white'}`}>
            <div className="p-8 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-2xl font-black uppercase tracking-tighter">{editingItem ? 'Ajustar Material' : 'Novo Ativo'}</h3>
              <button onClick={() => setIsItemModalOpen(false)} className="hover:text-red-500 transition-all"><X size={32} /></button>
            </div>
            <form onSubmit={handleSaveItem} className="p-10 space-y-8 overflow-y-auto">
               <div className="flex flex-col md:flex-row gap-8">
                  <div className="w-full md:w-64 space-y-4">
                    <div className="aspect-square rounded-[3rem] bg-slate-950 border-4 border-slate-800 overflow-hidden relative group">
                      {formData.photoUrl ? (
                        <img src={formData.photoUrl} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-700">
                          <Package size={48}/>
                          <span className="text-[8px] font-black mt-2 uppercase">Sem Foto</span>
                        </div>
                      )}
                      <button 
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white"
                      >
                        <Camera size={32}/>
                        <span className="text-[10px] font-black mt-2 uppercase">Tirar / Escolher Foto</span>
                      </button>
                    </div>
                    <input type="file" accept="image/*" capture="environment" ref={fileInputRef} className="hidden" onChange={handlePhotoUpload} />
                  </div>
                  <div className="flex-1 space-y-6">
                    <input required className={`w-full p-6 rounded-[2rem] font-black text-2xl text-center uppercase shadow-inner outline-none focus:border-brand-500 border-4 border-transparent transition-all ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50'}`} value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="NOME DO MATERIAL" />
                    <div className="grid grid-cols-2 gap-4">
                      <input className={`w-full p-5 rounded-2xl font-bold text-center uppercase shadow-inner outline-none ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50'}`} value={formData.department || ''} onChange={e => setFormData({...formData, department: e.target.value})} placeholder="SETOR" />
                      <input className={`w-full p-5 rounded-2xl font-bold text-center uppercase shadow-inner outline-none ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50'}`} value={formData.location || ''} onChange={e => setFormData({...formData, location: e.target.value})} placeholder="ENDEREÇO" />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <input className={`w-full p-5 rounded-2xl font-bold text-center uppercase shadow-inner outline-none ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50'}`} value={formData.unit || 'UND'} onChange={e => setFormData({...formData, unit: e.target.value})} placeholder="UND" />
                      <input type="number" className={`w-full p-5 rounded-2xl font-bold text-center uppercase shadow-inner outline-none ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50'}`} value={formData.minStock || 0} onChange={e => setFormData({...formData, minStock: Number(e.target.value)})} placeholder="MIN" />
                      <input type="number" disabled={!!editingItem} className={`w-full p-5 rounded-2xl font-bold text-center uppercase shadow-inner outline-none disabled:opacity-30 ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50'}`} value={formData.currentStock || 0} onChange={e => setFormData({...formData, currentStock: Number(e.target.value)})} placeholder="SALDO" />
                    </div>
                  </div>
               </div>
               <button type="submit" className="w-full py-7 bg-brand-600 text-white rounded-[2.5rem] font-black uppercase tracking-widest shadow-2xl hover:bg-brand-700 active:scale-95 transition-all">CONCLUIR REGISTRO</button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL MOVIMENTAÇÃO */}
      {isMovementModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-8 bg-slate-950/95 backdrop-blur-3xl animate-in fade-in">
           <div className={`rounded-[4rem] w-full max-w-lg overflow-hidden border border-slate-800 ${darkMode ? 'bg-slate-900' : 'bg-white'}`}>
              <div className={`p-12 text-center ${movementType === 'IN' ? 'bg-emerald-600' : 'bg-orange-600'} text-white`}>
                 <h3 className="text-5xl font-black uppercase tracking-tighter">{movementType === 'IN' ? 'Entrada' : 'Retirada'}</h3>
                 <p className="text-[10px] mt-4 font-black uppercase tracking-widest opacity-80 truncate">{items.find(i => i.id === movementItemId)?.name}</p>
              </div>
              <form onSubmit={async (e) => {
                e.preventDefault();
                const item = items.find(i => i.id === movementItemId);
                if (!item || !user) return;
                setIsSyncing(true);
                const qty = Number(moveData.quantity);
                const newStock = movementType === 'IN' ? item.currentStock + qty : item.currentStock - qty;
                try {
                  await supabase.from('inventory_items').update({ current_stock: newStock, last_updated: new Date().toISOString(), last_updated_by: user.name, last_updated_by_badge: user.badgeId }).eq('id', item.id);
                  await supabase.from('movements').insert({ item_id: item.id, item_name: item.name, type: movementType, quantity: qty, user_badge_id: user.badgeId, user_name: user.name, timestamp: new Date().toISOString(), reason: moveData.reason });
                  setIsMovementModalOpen(false);
                  setMoveData({ quantity: 1, reason: '' });
                  fetchData(false);
                } catch (err) { alert("Erro na movimentação."); } finally { setIsSyncing(false); }
              }} className="p-14 space-y-8 text-center">
                 <input type="number" min="1" required autoFocus className={`w-full text-9xl font-black text-center p-8 rounded-[3rem] outline-none shadow-inner ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'}`} value={moveData.quantity} onChange={e => setMoveData({...moveData, quantity: Number(e.target.value)})} />
                 <input type="text" placeholder="JUSTIFICATIVA" className={`w-full p-6 rounded-2xl font-black text-center uppercase shadow-inner outline-none ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50'}`} value={moveData.reason} onChange={e => setMoveData({...moveData, reason: e.target.value})} />
                 <button type="submit" className={`w-full py-8 text-white text-2xl font-black rounded-[3rem] shadow-2xl uppercase active:scale-95 transition-all ${movementType === 'IN' ? 'bg-emerald-600' : 'bg-orange-600'}`}>CONFIRMAR</button>
                 <button type="button" onClick={() => setIsMovementModalOpen(false)} className="w-full text-[10px] font-black text-slate-500 uppercase tracking-widest">CANCELAR</button>
              </form>
           </div>
        </div>
      )}
    </div>
  );
}
