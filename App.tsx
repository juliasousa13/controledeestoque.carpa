
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  LayoutDashboard, Package, Plus, Search, Trash2, Moon, Sun, Menu, X, 
  Camera, AlertTriangle, Loader2, RefreshCw, TrendingDown, Box, 
  History, Activity, Edit3, Users as UsersIcon, FileSpreadsheet, 
  Upload, CheckCircle2, Settings, User as UserIcon, LogOut, ChevronRight,
  Info, Check, CloudCheck, CloudOff, Database
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
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [dbStatus, setDbStatus] = useState<'online' | 'offline'>('online');
  
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<MovementLog[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isImportHelpOpen, setIsImportHelpOpen] = useState(false);
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
      const [itRes, movRes, userRes] = await Promise.all([
        supabase.from('inventory_items').select('*').order('name'),
        supabase.from('movements').select('*').order('timestamp', { ascending: false }).limit(100),
        supabase.from('users').select('*').order('name')
      ]);

      if (itRes.error) throw itRes.error;

      if (itRes.data) setItems(itRes.data.map(mapFromDB));
      if (movRes.data) {
        setMovements(movRes.data.map(m => ({
          id: String(m.id), itemId: m.item_id, itemName: m.item_name, type: m.type as any,
          quantity: m.quantity, userBadgeId: m.user_badge_id, userName: m.user_name,
          timestamp: m.timestamp, reason: m.reason
        })));
      }
      if (userRes.data) {
        setAllUsers(userRes.data.map(u => ({
          badgeId: u.badge_id, name: u.name, role: u.role, photoUrl: u.photo_url, createdAt: u.created_at
        })));
        const current = userRes.data.find(u => u.badge_id === user?.badgeId);
        if (current && user) {
          setUser({ ...user, name: current.name, photoUrl: current.photo_url });
        }
      }
      setLastSync(new Date());
      setDbStatus('online');
    } catch (err) {
      console.error("Erro na sincronização:", err);
      setDbStatus('offline');
      const offline = loadOfflineData();
      if (offline.items.length > 0) setItems(offline.items);
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  }, [user?.badgeId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>, isProfile = false) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        if (isProfile) setProfileFormData(prev => ({ ...prev, photoUrl: base64String }));
        else setFormData(prev => ({ ...prev, photoUrl: base64String }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSyncing(true);
    try {
      const { error } = await supabase.from('users')
        .update({ name: profileFormData.name.toUpperCase(), photo_url: profileFormData.photoUrl })
        .eq('badge_id', user.badgeId);
      if (error) throw error;
      setUser({ ...user, name: profileFormData.name.toUpperCase(), photoUrl: profileFormData.photoUrl });
      setIsProfileModalOpen(false);
      fetchData(false);
    } catch (err) { alert("Erro ao atualizar perfil."); } 
    finally { setIsSyncing(false); }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Excluir ${selectedItemIds.length} itens?`)) return;
    setIsSyncing(true);
    try {
      const { error } = await supabase.from('inventory_items').delete().in('id', selectedItemIds);
      if (error) throw error;
      setItems(prev => prev.filter(i => !selectedItemIds.includes(i.id)));
      setSelectedItemIds([]);
    } catch (err) { alert("Erro ao excluir."); } 
    finally { setIsSyncing(false); }
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !user) return;

    setIsSyncing(true);
    const itemToSave = {
      id: editingItem?.id || `ART-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: formData.name.toUpperCase(),
      unit: (formData.unit || 'UND').toUpperCase(),
      min_stock: Number(formData.minStock) || 0,
      current_stock: Number(formData.currentStock) || 0,
      location: (formData.location || 'GERAL').toUpperCase(),
      department: (formData.department || 'ESTOQUE').toUpperCase(),
      photo_url: formData.photoUrl || null,
      description: formData.description || '',
      last_updated: new Date().toISOString(),
      last_updated_by: user.name,
      last_updated_by_badge: user.badgeId
    };

    try {
      const { error } = await supabase.from('inventory_items').upsert(itemToSave);
      if (error) {
        if (error.code === 'PGRST204') throw new Error("Coluna 'last_updated_by_badge' ausente no banco. Execute o SQL de ajuste.");
        throw error;
      }
      
      await supabase.from('movements').insert({
        item_id: itemToSave.id,
        item_name: itemToSave.name,
        type: editingItem ? 'EDIT' : 'CREATE',
        quantity: 0,
        user_badge_id: user.badgeId,
        user_name: user.name,
        timestamp: itemToSave.last_updated,
        reason: editingItem ? 'Ajuste Cadastral' : 'Novo Cadastro'
      });

      setIsItemModalOpen(false);
      setEditingItem(null);
      setFormData({});
      fetchData(false);
    } catch (err: any) {
      alert(err.message || "Erro ao salvar. Verifique sua conexão ou banco de dados.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExportExcel = () => {
    if (items.length === 0) return alert("Nada para exportar.");
    const data = items.map(i => ({
      "Material": i.name,
      "Setor": i.department,
      "Localizacao": i.location,
      "Saldo": i.currentStock,
      "EstoqueMin": i.minStock,
      "Unidade": i.unit,
      "Descricao": i.description
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Estoque");
    XLSX.writeFile(wb, `CARPA_Export_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: 'binary' });
        const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        setIsSyncing(true);
        const toSave = json.map((item: any) => ({
          id: `IMP-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
          name: (item["Material"] || "NÃO INFORMADO").toString().toUpperCase(),
          department: (item["Setor"] || "ESTOQUE").toString().toUpperCase(),
          location: (item["Localizacao"] || "N/A").toString().toUpperCase(),
          current_stock: Number(item["Saldo"] || 0),
          min_stock: Number(item["EstoqueMin"] || 0),
          unit: (item["Unidade"] || "UND").toString().toUpperCase(),
          description: item["Descricao"] || "",
          last_updated: new Date().toISOString(),
          last_updated_by: user.name,
          last_updated_by_badge: user.badgeId
        }));
        const { error } = await supabase.from('inventory_items').upsert(toSave);
        if (error) throw error;
        alert("Importação finalizada!");
        fetchData(false);
      } catch (err) { alert("Erro no Excel. Verifique o Guia de Ajuda."); }
      finally { setIsSyncing(false); }
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

  if (isLoading) return (
    <div className={`h-screen flex flex-col items-center justify-center ${darkMode ? 'bg-[#020617]' : 'bg-white'}`}>
      <Logo className="w-16 h-16 md:w-24 md:h-24 mb-6 animate-pulse" />
      <Loader2 className="animate-spin text-brand-600 mb-4" size={32} />
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Sincronizando...</p>
    </div>
  );

  if (!user) {
    return (
      <div className={`h-screen flex items-center justify-center p-4 ${darkMode ? 'bg-[#020617]' : 'bg-slate-100'}`}>
        <div className={`w-full max-w-[400px] p-8 md:p-12 rounded-[2.5rem] md:rounded-[4rem] shadow-2xl border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} backdrop-blur-xl animate-in zoom-in`}>
          <div className="flex flex-col items-center mb-8 text-center">
            <Logo className="w-16 h-16 mb-4" />
            <h1 className={`text-3xl md:text-4xl font-black tracking-tighter mb-1 ${darkMode ? 'text-white' : 'text-slate-900'}`}>CARPA</h1>
            <p className="text-[9px] font-black text-brand-500 uppercase tracking-widest">Controle de Estoque</p>
          </div>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const badge = (e.target as any).badge.value;
            const { data } = await supabase.from('users').select('*').eq('badge_id', badge).single();
            if (data) {
              setUser({ badgeId: data.badge_id, name: data.name, role: data.role, photoUrl: data.photo_url });
            } else {
              const name = prompt("Matrícula nova. Seu nome:");
              if (name) {
                await supabase.from('users').insert({ badge_id: badge, name: name.toUpperCase(), role: 'staff' });
                setUser({ badgeId: badge, name: name.toUpperCase(), role: 'staff' });
              }
            }
          }} className="space-y-6">
            <input name="badge" required type="text" placeholder="MATRÍCULA" className={`w-full py-5 rounded-3xl font-black outline-none text-xl text-center uppercase shadow-inner border-2 border-transparent focus:border-brand-500 transition-all ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50'}`} />
            <button className="w-full py-5 bg-brand-600 text-white font-black rounded-3xl shadow-xl hover:bg-brand-700 active:scale-95 transition-all text-base uppercase tracking-widest">ACESSAR</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-screen flex flex-col lg:flex-row font-sans transition-colors duration-500 ${darkMode ? 'bg-[#020617] text-white' : 'bg-slate-50 text-slate-900'}`}>
      
      {/* Sidebar / Topbar para Mobile */}
      <aside className={`fixed lg:static inset-y-0 left-0 w-72 z-50 transform transition-transform duration-500 border-r ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} backdrop-blur-3xl ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex flex-col h-full p-6">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <Logo className="w-10 h-10" />
              <span className="font-black text-xl tracking-tighter">CARPA</span>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2"><X size={20}/></button>
          </div>
          
          <nav className="flex-1 space-y-1">
            {[
              { id: AppView.DASHBOARD, icon: LayoutDashboard, label: 'Painel' },
              { id: AppView.INVENTORY, icon: Package, label: 'Estoque' },
              { id: AppView.MOVEMENTS, icon: History, label: 'Atividades' },
              { id: AppView.USERS, icon: UsersIcon, label: 'Equipe' }
            ].map(v => (
              <button 
                key={v.id} 
                onClick={() => { setCurrentView(v.id); setIsSidebarOpen(false); }} 
                className={`w-full flex items-center gap-3 p-4 rounded-2xl font-bold text-xs transition-all ${currentView === v.id ? 'bg-brand-600 text-white shadow-lg' : 'text-slate-400 hover:bg-brand-500/10'}`}
              >
                <v.icon size={18} /> {v.label}
              </button>
            ))}
          </nav>

          <div className="mt-auto space-y-4 pt-6 border-t border-slate-800/50">
            <button 
              onClick={() => { setProfileFormData({ name: user.name, photoUrl: user.photoUrl || '' }); setIsProfileModalOpen(true); }}
              className={`w-full p-3 rounded-2xl border text-left flex items-center gap-3 ${darkMode ? 'bg-slate-950/50 border-slate-800' : 'bg-white border-slate-200'}`}
            >
              <div className="w-10 h-10 rounded-xl bg-brand-600/10 flex items-center justify-center overflow-hidden border border-brand-500/20">
                {user.photoUrl ? <img src={user.photoUrl} className="w-full h-full object-cover" /> : <UserIcon className="text-brand-500" size={16}/>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-[10px] truncate uppercase">{user.name}</p>
                <p className="text-[7px] font-bold text-slate-500 uppercase tracking-widest">{user.badgeId}</p>
              </div>
              <ChevronRight size={12} className="text-slate-600" />
            </button>
            
            <div className="flex gap-2">
              <button onClick={() => setDarkMode(!darkMode)} className={`flex-1 p-3 rounded-xl border flex justify-center ${darkMode ? 'border-slate-800 bg-slate-950/50' : 'border-slate-200 bg-white'}`}>
                {darkMode ? <Sun size={16}/> : <Moon size={16}/>}
              </button>
              <button onClick={() => setUser(null)} className="flex-1 p-3 bg-red-500/10 text-red-500 rounded-xl font-black text-[8px] uppercase flex items-center justify-center gap-2 border border-red-500/20">
                SAIR
              </button>
            </div>

            <div className="flex items-center justify-center gap-2 pt-2">
              {isSyncing ? <RefreshCw size={10} className="animate-spin text-brand-500" /> : <CloudCheck size={10} className="text-emerald-500" />}
              <span className="text-[6px] font-black text-slate-500 uppercase tracking-widest">
                {dbStatus === 'online' ? `Sincronizado: ${lastSync?.toLocaleTimeString() || '--'}` : 'Offline'}
              </span>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="h-16 md:h-20 border-b flex items-center justify-between px-4 md:px-8 bg-inherit/40 backdrop-blur-xl sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2"><Menu size={20}/></button>
            <h2 className="font-black text-sm md:text-xl uppercase tracking-tighter">{currentView}</h2>
          </div>
          
          <div className="flex gap-2">
            {currentView === AppView.INVENTORY && (
              <button onClick={() => { setEditingItem(null); setFormData({}); setIsItemModalOpen(true); }} className="bg-brand-600 text-white p-2.5 md:px-5 md:py-3 rounded-xl font-black text-[9px] md:text-[10px] flex items-center gap-2 shadow-lg shadow-brand-500/20 active:scale-95 transition-all uppercase">
                <Plus size={14}/> <span className="hidden sm:inline">Novo</span>
              </button>
            )}
            {selectedItemIds.length > 0 && (
              <button onClick={handleBulkDelete} className="bg-red-600 text-white p-2.5 md:px-5 md:py-3 rounded-xl font-black text-[9px] md:text-[10px] flex items-center gap-2 animate-in slide-in-from-top-4 uppercase">
                <Trash2 size={14}/> <span className="hidden sm:inline">Excluir ({selectedItemIds.length})</span>
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto space-y-6 pb-12">
            
            {currentView === AppView.INVENTORY && (
              <div className="space-y-4 md:space-y-6">
                <div className={`p-3 px-5 md:p-4 md:px-8 rounded-2xl md:rounded-[3rem] border flex items-center gap-3 ${darkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200'}`}>
                  <Search className="text-slate-500" size={16}/>
                  <input 
                    value={searchTerm} onChange={e => setSearchTerm(e.target.value)} 
                    placeholder="PESQUISAR..." 
                    className="flex-1 bg-transparent border-none outline-none font-bold text-center uppercase text-[10px] md:text-xs tracking-widest" 
                  />
                  {searchTerm && <button onClick={() => setSearchTerm('')}><X size={14}/></button>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6 animate-in fade-in">
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
                        className={`group relative p-4 md:p-6 rounded-3xl border transition-all duration-300 ${isSelected ? 'border-brand-500 bg-brand-500/5' : darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white shadow-sm'}`}
                      >
                        <div className="aspect-square bg-slate-950/40 rounded-2xl mb-4 overflow-hidden relative border border-slate-800/20">
                          {item.photoUrl ? (
                            <img src={item.photoUrl} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center opacity-10"><Package size={32}/></div>
                          )}
                          <div className="absolute top-2 left-2 bg-slate-900/80 backdrop-blur px-2 py-0.5 rounded-lg text-[6px] font-black text-white uppercase">{item.location}</div>
                          {isSelected && <div className="absolute inset-0 bg-brand-600/30 flex items-center justify-center backdrop-blur-sm"><CheckCircle2 className="text-white" size={32}/></div>}
                        </div>
                        
                        <h4 className="font-black text-xs md:text-sm uppercase truncate mb-1">{item.name}</h4>
                        <div className="flex items-center gap-2 mb-3">
                           <span className={`text-[7px] font-black px-1.5 py-0.5 rounded-md uppercase ${darkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>{item.department}</span>
                           <span className="text-[7px] font-bold text-slate-500 uppercase">{item.unit}</span>
                        </div>

                        <div className="flex items-center justify-between pt-3 border-t border-slate-800/20">
                          <div className="flex flex-col">
                            <span className={`text-2xl md:text-3xl font-black tracking-tighter ${item.currentStock <= item.minStock ? 'text-red-500' : 'text-slate-200'}`}>{item.currentStock}</span>
                            <span className="text-[6px] font-black text-slate-500 uppercase">SALDO</span>
                          </div>
                          <div className="flex gap-1 md:opacity-0 group-hover:opacity-100 transition-opacity">
                             <button onClick={(e) => { e.stopPropagation(); setMovementItemId(item.id); setMovementType('IN'); setIsMovementModalOpen(true); }} className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg"><Plus size={14}/></button>
                             <button onClick={(e) => { e.stopPropagation(); setMovementItemId(item.id); setMovementType('OUT'); setIsMovementModalOpen(true); }} className="p-2 bg-orange-500/10 text-orange-500 rounded-lg"><TrendingDown size={14}/></button>
                             <button onClick={(e) => { e.stopPropagation(); setEditingItem(item); setFormData(item); setIsItemModalOpen(true); }} className="p-2 bg-slate-800 text-slate-400 rounded-lg"><Edit3 size={14}/></button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {currentView === AppView.USERS && (
              <div className="space-y-6 animate-in slide-in-from-bottom-4">
                <h3 className="text-xl font-black uppercase tracking-tighter">Colaboradores ({allUsers.length})</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {allUsers.map(u => (
                    <div key={u.badgeId} className={`p-5 rounded-3xl border flex items-center gap-4 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white shadow-sm'}`}>
                      <div className="w-12 h-12 rounded-xl bg-brand-600/5 flex items-center justify-center overflow-hidden border border-brand-500/20">
                        {u.photoUrl ? <img src={u.photoUrl} className="w-full h-full object-cover" /> : <UserIcon className="text-brand-500" size={20}/>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-xs uppercase truncate">{u.name}</p>
                        <p className="text-[8px] font-bold text-slate-500 tracking-widest">ID: {u.badgeId}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {currentView === AppView.DASHBOARD && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8">
                 <div className={`p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white shadow-sm'}`}>
                    <Box className="text-brand-500 mb-4" size={24}/>
                    <p className="text-[8px] md:text-[10px] font-black uppercase text-slate-500 tracking-widest">Ativos</p>
                    <h3 className="text-4xl md:text-7xl font-black tracking-tighter">{items.length}</h3>
                 </div>
                 <div className={`p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] border ${darkMode ? 'bg-red-500/10 border-red-500/20' : 'bg-red-50 border-red-100'}`}>
                    <AlertTriangle className="text-red-500 mb-4" size={24}/>
                    <p className="text-[8px] md:text-[10px] font-black uppercase text-red-500 tracking-widest">Reposição</p>
                    <h3 className="text-4xl md:text-7xl font-black tracking-tighter text-red-500">{items.filter(i => i.currentStock <= i.minStock).length}</h3>
                 </div>
                 <div className={`p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] border ${darkMode ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-emerald-50 border-emerald-100'}`}>
                    <Activity className="text-emerald-500 mb-4" size={24}/>
                    <p className="text-[8px] md:text-[10px] font-black uppercase text-emerald-500 tracking-widest">Eventos</p>
                    <h3 className="text-4xl md:text-7xl font-black tracking-tighter text-emerald-500">{movements.length}</h3>
                 </div>
              </div>
            )}
          </div>
        </div>

        {/* Floating Help / Tools */}
        {currentView === AppView.INVENTORY && (
           <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-40">
             <button onClick={() => setIsImportHelpOpen(true)} className="w-12 h-12 rounded-full bg-slate-800 text-white flex items-center justify-center shadow-xl border border-white/10"><Info size={20}/></button>
             <button onClick={handleExportExcel} className="w-12 h-12 rounded-full bg-brand-600 text-white flex items-center justify-center shadow-xl border border-white/10"><FileSpreadsheet size={20}/></button>
             <label className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-xl border border-white/10 cursor-pointer">
                <Upload size={20}/>
                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImportExcel} />
             </label>
           </div>
        )}
      </main>

      {/* MODAL AJUDA EXCEL */}
      {isImportHelpOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl">
          <div className={`rounded-3xl w-full max-w-sm p-8 border border-slate-800 text-center ${darkMode ? 'bg-slate-900' : 'bg-white'}`}>
            <h3 className="text-xl font-black uppercase tracking-tighter mb-4">Mapeamento de Colunas</h3>
            <p className="text-[10px] text-slate-500 mb-6 uppercase tracking-widest leading-relaxed">Sua planilha deve ter as colunas abaixo na linha 1:</p>
            <div className="grid grid-cols-2 gap-2 mb-8">
              {["Material", "Setor", "Localizacao", "Saldo", "EstoqueMin", "Unidade"].map(col => (
                <div key={col} className={`p-3 rounded-xl flex items-center justify-between font-black uppercase text-[8px] tracking-widest border ${darkMode ? 'bg-slate-950/50 border-slate-800' : 'bg-slate-50'}`}>
                  {col} <Check size={10} className="text-emerald-500" />
                </div>
              ))}
            </div>
            <button onClick={() => setIsImportHelpOpen(false)} className="w-full py-4 bg-brand-600 text-white font-black rounded-2xl uppercase text-[10px]">FECHAR</button>
          </div>
        </div>
      )}

      {/* MODAL PERFIL */}
      {isProfileModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-2xl">
          <div className={`rounded-[2.5rem] w-full max-w-sm border border-slate-800 shadow-2xl ${darkMode ? 'bg-slate-900' : 'bg-white'}`}>
            <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-brand-600 text-white">
              <h3 className="text-lg font-black uppercase tracking-tighter">Ajustar Perfil</h3>
              <button onClick={() => setIsProfileModalOpen(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleUpdateProfile} className="p-8 space-y-6 text-center">
              <div className="relative group mx-auto w-32 h-32">
                <div className="w-32 h-32 rounded-3xl bg-slate-950 border-4 border-slate-800 overflow-hidden shadow-2xl">
                  {profileFormData.photoUrl ? <img src={profileFormData.photoUrl} className="w-full h-full object-cover" /> : <UserIcon size={40} className="text-slate-700 m-auto mt-10" />}
                </div>
                <button type="button" onClick={() => profileFileInputRef.current?.click()} className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl flex flex-col items-center justify-center text-white">
                  <Camera size={20}/>
                  <span className="text-[8px] font-black mt-1 uppercase">MUDAR</span>
                </button>
                <input type="file" accept="image/*" capture="user" ref={profileFileInputRef} className="hidden" onChange={(e) => handlePhotoUpload(e, true)} />
              </div>
              <input required className={`w-full p-4 rounded-2xl font-black text-center uppercase shadow-inner outline-none ${darkMode ? 'bg-slate-950 text-white focus:border-brand-500' : 'bg-slate-50'}`} value={profileFormData.name} onChange={e => setProfileFormData({...profileFormData, name: e.target.value})} placeholder="SEU NOME" />
              <button type="submit" className="w-full py-5 bg-brand-600 text-white rounded-2xl font-black uppercase text-xs shadow-xl active:scale-95 transition-all">SALVAR PERFIL</button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL MATERIAL */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-2xl">
          <div className={`rounded-[2.5rem] w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border border-slate-800 ${darkMode ? 'bg-slate-900' : 'bg-white'}`}>
            <div className="p-6 border-b border-slate-800 flex justify-between items-center px-8">
              <h3 className="text-xl font-black uppercase tracking-tighter">{editingItem ? 'EDITAR' : 'NOVO'} MATERIAL</h3>
              <button onClick={() => setIsItemModalOpen(false)}><X size={28} /></button>
            </div>
            <form onSubmit={handleSaveItem} className="p-8 space-y-6 overflow-y-auto">
               <div className="flex flex-col md:flex-row gap-8">
                  <div className="w-full md:w-56 space-y-4 flex flex-col items-center">
                    <div className="aspect-square w-full rounded-3xl bg-slate-950 border-2 border-slate-800 overflow-hidden relative group">
                      {formData.photoUrl ? <img src={formData.photoUrl} className="w-full h-full object-cover" /> : <Package size={40} className="m-auto mt-14 opacity-20" />}
                      <button type="button" onClick={() => fileInputRef.current?.click()} className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white">
                        <Camera size={24}/>
                        <span className="text-[8px] font-black mt-2 uppercase">FOTO</span>
                      </button>
                    </div>
                    <input type="file" accept="image/*" capture="environment" ref={fileInputRef} className="hidden" onChange={handlePhotoUpload} />
                  </div>
                  <div className="flex-1 space-y-4">
                    <input required className={`w-full p-4 rounded-xl font-black text-center uppercase shadow-inner outline-none focus:border-brand-500 border-2 border-transparent ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50'}`} value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="NOME DO MATERIAL" />
                    <div className="grid grid-cols-2 gap-4">
                      <input className={`w-full p-4 rounded-xl font-bold text-center uppercase shadow-inner outline-none ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50'}`} value={formData.department || ''} onChange={e => setFormData({...formData, department: e.target.value})} placeholder="SETOR" />
                      <input className={`w-full p-4 rounded-xl font-bold text-center uppercase shadow-inner outline-none ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50'}`} value={formData.location || ''} onChange={e => setFormData({...formData, location: e.target.value})} placeholder="LOCAL" />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <input className={`w-full p-4 rounded-xl font-bold text-center uppercase shadow-inner ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50'}`} value={formData.unit || 'UND'} onChange={e => setFormData({...formData, unit: e.target.value})} placeholder="UND" />
                      <input type="number" className={`w-full p-4 rounded-xl font-bold text-center uppercase shadow-inner ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50'}`} value={formData.minStock || 0} onChange={e => setFormData({...formData, minStock: Number(e.target.value)})} placeholder="MIN" />
                      <input type="number" disabled={!!editingItem} className={`w-full p-4 rounded-xl font-bold text-center uppercase shadow-inner disabled:opacity-20 ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50'}`} value={formData.currentStock || 0} onChange={e => setFormData({...formData, currentStock: Number(e.target.value)})} placeholder="SALDO" />
                    </div>
                  </div>
               </div>
               <button type="submit" disabled={isSyncing} className="w-full py-6 bg-brand-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl flex items-center justify-center gap-3">
                 {isSyncing ? <Loader2 className="animate-spin" /> : 'CONCLUIR'}
               </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL MOVIMENTAÇÃO */}
      {isMovementModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-3xl animate-in fade-in">
           <div className={`rounded-[2.5rem] w-full max-w-sm overflow-hidden border border-slate-800 ${darkMode ? 'bg-slate-900' : 'bg-white'}`}>
              <div className={`p-8 text-center ${movementType === 'IN' ? 'bg-emerald-600' : 'bg-orange-600'} text-white`}>
                 <h3 className="text-4xl font-black uppercase tracking-tighter">{movementType === 'IN' ? 'Entrada' : 'Retirada'}</h3>
                 <p className="text-[8px] mt-2 font-black uppercase tracking-widest opacity-80 truncate px-4">{items.find(i => i.id === movementItemId)?.name}</p>
              </div>
              <form onSubmit={async (e) => {
                e.preventDefault();
                const item = items.find(i => i.id === movementItemId);
                if (!item || !user) return;
                setIsSyncing(true);
                const qty = Number(moveData.quantity);
                const newStock = movementType === 'IN' ? item.currentStock + qty : item.currentStock - qty;
                try {
                  const { error: upError } = await supabase.from('inventory_items').update({ current_stock: newStock, last_updated: new Date().toISOString(), last_updated_by: user.name, last_updated_by_badge: user.badgeId }).eq('id', item.id);
                  if (upError) throw upError;
                  await supabase.from('movements').insert({ item_id: item.id, item_name: item.name, type: movementType, quantity: qty, user_badge_id: user.badgeId, user_name: user.name, timestamp: new Date().toISOString(), reason: moveData.reason });
                  setIsMovementModalOpen(false);
                  setMoveData({ quantity: 1, reason: '' });
                  fetchData(false);
                } catch (err) { alert("Erro ao processar movimentação."); } 
                finally { setIsSyncing(false); }
              }} className="p-8 space-y-6 text-center">
                 <div className="space-y-2">
                   <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest">QTD</label>
                   <input type="number" min="1" required autoFocus className={`w-full text-7xl font-black text-center p-4 rounded-2xl outline-none shadow-inner border-2 border-transparent focus:border-brand-500 transition-all ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'}`} value={moveData.quantity} onChange={e => setMoveData({...moveData, quantity: Number(e.target.value)})} />
                 </div>
                 <input type="text" placeholder="JUSTIFICATIVA" className={`w-full p-4 rounded-xl font-black text-center uppercase shadow-inner text-xs outline-none ${darkMode ? 'bg-slate-950 text-white focus:border-brand-500' : 'bg-slate-50'}`} value={moveData.reason} onChange={e => setMoveData({...moveData, reason: e.target.value})} />
                 <button type="submit" disabled={isSyncing} className={`w-full py-6 text-white text-lg font-black rounded-2xl shadow-xl uppercase active:scale-95 transition-all ${movementType === 'IN' ? 'bg-emerald-600' : 'bg-orange-600'}`}>
                   {isSyncing ? <Loader2 className="animate-spin" /> : 'CONFIRMAR'}
                 </button>
                 <button type="button" onClick={() => setIsMovementModalOpen(false)} className="w-full text-[8px] font-black text-slate-500 uppercase">CANCELAR</button>
              </form>
           </div>
        </div>
      )}
    </div>
  );
}
