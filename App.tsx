
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  LayoutDashboard, Package, Plus, Search, Trash2, Moon, Sun, Menu, X, 
  Camera, AlertTriangle, Loader2, RefreshCw, TrendingDown, Box, 
  History, Activity, Edit3, Users as UsersIcon, FileSpreadsheet, 
  Upload, CheckCircle2, Settings, User as UserIcon, LogOut, ChevronRight,
  Info, Check, CloudCheck, CloudOff
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
      saveOfflineData(itRes.data ? itRes.data.map(mapFromDB) : [], [], [], []);
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
        .update({ name: profileFormData.name, photo_url: profileFormData.photoUrl })
        .eq('badge_id', user.badgeId);
      if (error) throw error;
      setUser({ ...user, name: profileFormData.name, photoUrl: profileFormData.photoUrl });
      setIsProfileModalOpen(false);
      fetchData(false);
    } catch (err) { alert("Erro ao atualizar perfil."); } 
    finally { setIsSyncing(false); }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Confirmar exclusão definitiva de ${selectedItemIds.length} materiais?`)) return;
    setIsSyncing(true);
    try {
      const { error } = await supabase.from('inventory_items').delete().in('id', selectedItemIds);
      if (error) throw error;
      setItems(prev => prev.filter(i => !selectedItemIds.includes(i.id)));
      setSelectedItemIds([]);
    } catch (err) { alert("Falha na exclusão."); } 
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
      location: (formData.location || 'N/A').toUpperCase(),
      department: (formData.department || 'ESTOQUE').toUpperCase(),
      photo_url: formData.photoUrl || null,
      description: formData.description || '',
      last_updated: new Date().toISOString(),
      last_updated_by: user.name,
      last_updated_by_badge: user.badgeId
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
        reason: editingItem ? 'Atualização de Cadastro' : 'Cadastro Inicial'
      });

      setIsItemModalOpen(false);
      setEditingItem(null);
      setFormData({});
      fetchData(false);
    } catch (err) {
      console.error(err);
      alert("Erro ao salvar material. Verifique a conexão.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExportExcel = () => {
    if (items.length === 0) return alert("Sem dados para exportar.");
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
    XLSX.writeFile(wb, `CARPA_Estoque_${new Date().toLocaleDateString()}.xlsx`);
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
          id: `IMP-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          name: (item["Material"] || "DESCONHECIDO").toString().toUpperCase(),
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
        alert("Importação concluída com sucesso!");
        fetchData(false);
      } catch (err) { alert("Falha ao processar planilha."); }
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
      <Logo className="w-24 h-24 mb-8 animate-pulse" />
      <Loader2 className="animate-spin text-brand-600" size={40} />
      <p className="mt-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Sincronizando Sistema...</p>
    </div>
  );

  if (!user) {
    return (
      <div className={`h-screen flex items-center justify-center p-6 ${darkMode ? 'bg-[#020617]' : 'bg-slate-100'}`}>
        <div className={`w-full max-w-[440px] p-12 rounded-[4rem] shadow-2xl border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} backdrop-blur-xl animate-in zoom-in`}>
          <div className="flex flex-col items-center mb-10 text-center">
            <Logo className="w-20 h-20 mb-6" />
            <h1 className={`text-4xl font-black tracking-tighter mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>CARPA</h1>
            <p className="text-[10px] font-black text-brand-500 uppercase tracking-widest">Identificação Necessária</p>
          </div>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const badge = (e.target as any).badge.value;
            const { data } = await supabase.from('users').select('*').eq('badge_id', badge).single();
            if (data) {
              setUser({ badgeId: data.badge_id, name: data.name, role: data.role, photoUrl: data.photo_url });
            } else {
              const name = prompt("Matrícula não cadastrada. Insira seu nome completo:");
              if (name) {
                await supabase.from('users').insert({ badge_id: badge, name, role: 'staff' });
                setUser({ badgeId: badge, name, role: 'staff' });
              }
            }
          }} className="space-y-8">
            <div className="text-center">
              <label className="text-[10px] font-black text-slate-400 uppercase mb-4 block tracking-widest">Matrícula do Colaborador</label>
              <input name="badge" required type="text" placeholder="EX: 12345" className={`w-full py-6 rounded-[2.5rem] font-black outline-none text-2xl text-center uppercase shadow-inner ${darkMode ? 'bg-slate-950 text-white focus:border-brand-500 border-2 border-transparent' : 'bg-slate-50 border-2 border-transparent focus:border-brand-500'}`} />
            </div>
            <button className="w-full py-6 bg-brand-600 text-white font-black rounded-[2.5rem] shadow-xl hover:bg-brand-700 active:scale-95 transition-all text-lg tracking-widest">ENTRAR</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-screen flex font-sans transition-colors duration-500 ${darkMode ? 'bg-[#020617] text-white' : 'bg-slate-50 text-slate-900'}`}>
      
      {/* Sidebar Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 w-80 z-50 transform transition-transform duration-500 border-r ${darkMode ? 'bg-slate-900/40 border-slate-800' : 'bg-white border-slate-200'} backdrop-blur-3xl ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex flex-col h-full p-8">
          <div className="flex items-center gap-4 mb-12">
            <Logo className="w-12 h-12" />
            <span className="font-black text-2xl tracking-tighter">CARPA</span>
          </div>
          
          <nav className="flex-1 space-y-2">
            {[
              { id: AppView.DASHBOARD, icon: LayoutDashboard, label: 'Resumo GERAL' },
              { id: AppView.INVENTORY, icon: Package, label: 'ESTOQUE Ativo' },
              { id: AppView.MOVEMENTS, icon: History, label: 'HISTÓRICO' },
              { id: AppView.USERS, icon: UsersIcon, label: 'EQUIPE' }
            ].map(v => (
              <button 
                key={v.id} 
                onClick={() => { setCurrentView(v.id); setIsSidebarOpen(false); }} 
                className={`w-full flex items-center gap-4 p-5 rounded-3xl font-bold text-sm transition-all ${currentView === v.id ? 'bg-brand-600 text-white shadow-lg' : 'text-slate-400 hover:bg-brand-500/10'}`}
              >
                <v.icon size={20} /> {v.label}
              </button>
            ))}
          </nav>

          {/* Perfil Card Sidebar */}
          <div className="mt-auto space-y-4">
            <div className={`p-1 rounded-3xl ${darkMode ? 'bg-slate-950/30' : 'bg-slate-200/50'}`}>
              <button 
                onClick={() => { setProfileFormData({ name: user.name, photoUrl: user.photoUrl || '' }); setIsProfileModalOpen(true); }}
                className={`w-full p-4 rounded-3xl border text-left transition-all hover:scale-[1.02] active:scale-95 flex items-center gap-4 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}
              >
                <div className="w-12 h-12 rounded-2xl bg-brand-600/10 flex items-center justify-center overflow-hidden border border-brand-500/30">
                  {user.photoUrl ? <img src={user.photoUrl} className="w-full h-full object-cover" /> : <UserIcon className="text-brand-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-xs truncate uppercase tracking-tighter">{user.name}</p>
                  <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">{user.badgeId}</p>
                </div>
                <Edit3 size={14} className="text-slate-600" />
              </button>
            </div>
            
            <div className="flex gap-2">
              <button onClick={() => setDarkMode(!darkMode)} className={`flex-1 p-4 rounded-2xl border flex justify-center ${darkMode ? 'border-slate-800 bg-slate-950/50' : 'border-slate-200 bg-white'}`}>
                {darkMode ? <Sun size={18}/> : <Moon size={18}/>}
              </button>
              <button onClick={() => setUser(null)} className="flex-1 p-4 bg-red-500/10 text-red-500 rounded-2xl font-black text-[10px] uppercase flex items-center justify-center gap-2 border border-red-500/20">
                <LogOut size={16}/> SAIR
              </button>
            </div>

            {/* Sync Info */}
            <div className="flex items-center justify-center gap-2 pt-2">
              {isSyncing ? <Loader2 size={12} className="animate-spin text-brand-500" /> : <CloudCheck size={12} className="text-emerald-500" />}
              <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">
                {isSyncing ? 'Sincronizando...' : `Sincronizado: ${lastSync?.toLocaleTimeString() || 'N/A'}`}
              </span>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="h-20 border-b flex items-center justify-between px-8 bg-inherit/40 backdrop-blur-xl sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2"><Menu/></button>
            <h2 className="font-black text-xl uppercase tracking-tighter flex items-center gap-3">
              {currentView}
              {isSyncing && <div className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />}
            </h2>
          </div>
          
          <div className="flex gap-3">
            {currentView === AppView.INVENTORY && (
              <>
                <div className="hidden md:flex gap-2">
                  <button onClick={() => setIsImportHelpOpen(true)} className="p-3 rounded-xl bg-slate-500/10 text-slate-500 hover:bg-slate-500/20 transition-all border border-slate-500/20"><Info size={18}/></button>
                  <label className="p-3 rounded-xl bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 cursor-pointer border border-emerald-500/20 flex items-center gap-2 font-black text-[10px] uppercase tracking-widest">
                    <Upload size={18}/> Importar
                    <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImportExcel} />
                  </label>
                  <button onClick={handleExportExcel} className="p-3 rounded-xl bg-brand-600 text-white hover:bg-brand-700 shadow-lg shadow-brand-500/20 flex items-center gap-2 font-black text-[10px] uppercase tracking-widest">
                    <FileSpreadsheet size={18}/> Exportar
                  </button>
                </div>
              </>
            )}
            {selectedItemIds.length > 0 && (
              <button onClick={handleBulkDelete} className="bg-red-600 text-white px-5 py-3 rounded-xl font-black text-[10px] flex items-center gap-2 animate-in slide-in-from-top-4 shadow-xl shadow-red-500/20 uppercase tracking-widest">
                <Trash2 size={16}/> Deletar ({selectedItemIds.length})
              </button>
            )}
            <button onClick={() => { setEditingItem(null); setFormData({}); setIsItemModalOpen(true); }} className="bg-brand-600 text-white px-6 py-3 rounded-xl font-black text-[10px] flex items-center gap-2 shadow-xl shadow-brand-500/20 active:scale-95 transition-all uppercase tracking-widest">
              <Plus size={16}/> Novo Material
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto space-y-8 pb-20">
            
            {currentView === AppView.INVENTORY && (
              <div className="space-y-6">
                <div className={`p-4 px-8 rounded-[2.5rem] border flex items-center gap-4 transition-all focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/10 ${darkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200'}`}>
                  <Search className="text-slate-500" size={20}/>
                  <input 
                    value={searchTerm} onChange={e => setSearchTerm(e.target.value)} 
                    placeholder="PESQUISAR MATERIAL, ENDEREÇO OU DEPARTAMENTO..." 
                    className="flex-1 bg-transparent border-none outline-none font-bold text-center uppercase text-sm tracking-widest" 
                  />
                  {searchTerm && <button onClick={() => setSearchTerm('')}><X size={16}/></button>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-in fade-in duration-500">
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
                        className={`group relative p-6 rounded-[3rem] border transition-all duration-300 ${isSelected ? 'border-brand-500 bg-brand-500/5 scale-[0.98]' : darkMode ? 'bg-slate-900 border-slate-800 hover:border-slate-600' : 'bg-white shadow-sm border-slate-100 hover:shadow-xl'}`}
                      >
                        <div className="aspect-square bg-slate-950/40 rounded-[2.5rem] mb-5 overflow-hidden relative border border-slate-800/40 shadow-inner">
                          {item.photoUrl ? (
                            <img src={item.photoUrl} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center opacity-10">
                              <Package size={48}/>
                            </div>
                          )}
                          <div className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur px-3 py-1 rounded-full text-[7px] font-black text-white uppercase tracking-widest border border-white/10">{item.location}</div>
                          {isSelected && <div className="absolute inset-0 bg-brand-600/30 flex items-center justify-center backdrop-blur-sm"><CheckCircle2 className="text-white" size={48}/></div>}
                        </div>
                        
                        <h4 className="font-black text-base uppercase truncate tracking-tighter mb-1">{item.name}</h4>
                        <div className="flex items-center gap-2 mb-4">
                           <span className={`text-[8px] font-black px-2 py-0.5 rounded-md uppercase ${darkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>{item.department}</span>
                           <span className="text-[8px] font-bold text-slate-500 uppercase">{item.unit}</span>
                        </div>

                        <div className="flex items-center justify-between pt-5 border-t border-slate-800/20">
                          <div className="flex flex-col">
                            <span className={`text-4xl font-black tracking-tighter ${item.currentStock <= item.minStock ? 'text-red-500' : darkMode ? 'text-slate-200' : 'text-slate-800'}`}>{item.currentStock}</span>
                            <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">SALDO EM ESTOQUE</span>
                          </div>
                          <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                             <button onClick={(e) => { e.stopPropagation(); setMovementItemId(item.id); setMovementType('IN'); setIsMovementModalOpen(true); }} className="p-3 bg-emerald-500/10 text-emerald-500 rounded-2xl hover:bg-emerald-500 hover:text-white transition-colors"><Plus size={16}/></button>
                             <button onClick={(e) => { e.stopPropagation(); setMovementItemId(item.id); setMovementType('OUT'); setIsMovementModalOpen(true); }} className="p-3 bg-orange-500/10 text-orange-500 rounded-2xl hover:bg-orange-500 hover:text-white transition-colors"><TrendingDown size={16}/></button>
                             <button onClick={(e) => { e.stopPropagation(); setEditingItem(item); setFormData(item); setIsItemModalOpen(true); }} className={`p-3 rounded-2xl transition-colors ${darkMode ? 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}><Edit3 size={16}/></button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {currentView === AppView.USERS && (
              <div className="space-y-8 animate-in slide-in-from-bottom-6">
                <div className="flex flex-col gap-2">
                  <h3 className="text-3xl font-black uppercase tracking-tighter">Colaboradores da Unidade</h3>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{allUsers.length} Membros registrados no sistema</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {allUsers.map(u => (
                    <div key={u.badgeId} className={`p-8 rounded-[3rem] border flex items-center gap-6 transition-all hover:scale-[1.02] ${darkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
                      <div className="w-20 h-20 rounded-[1.5rem] bg-brand-600/5 flex items-center justify-center overflow-hidden border border-brand-500/20 shadow-inner">
                        {u.photoUrl ? <img src={u.photoUrl} className="w-full h-full object-cover" /> : <UserIcon className="text-brand-500" size={32}/>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-xl uppercase truncate tracking-tighter">{u.name}</p>
                        <p className="text-[10px] font-bold text-slate-500 tracking-widest uppercase">ID: {u.badgeId} • {u.role}</p>
                        <div className="mt-3 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                          <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Desde {new Date(u.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {currentView === AppView.DASHBOARD && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 animate-in slide-in-from-bottom-8">
                 <div className={`p-10 rounded-[3.5rem] border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white shadow-xl shadow-slate-200/50'}`}>
                    <Box className="text-brand-500 mb-6" size={32}/>
                    <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Itens Únicos</p>
                    <h3 className="text-7xl font-black tracking-tighter">{items.length}</h3>
                 </div>
                 <div className={`p-10 rounded-[3.5rem] border ${darkMode ? 'bg-red-500/10 border-red-500/20' : 'bg-red-50 border-red-100 shadow-xl shadow-red-100'}`}>
                    <AlertTriangle className="text-red-500 mb-6" size={32}/>
                    <p className="text-[10px] font-black uppercase text-red-500 tracking-widest">Reposição Urgente</p>
                    <h3 className="text-7xl font-black tracking-tighter text-red-500">{items.filter(i => i.currentStock <= i.minStock).length}</h3>
                 </div>
                 <div className={`p-10 rounded-[3.5rem] border ${darkMode ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-emerald-50 border-emerald-100 shadow-xl shadow-emerald-100'}`}>
                    <Activity className="text-emerald-500 mb-6" size={32}/>
                    <p className="text-[10px] font-black uppercase text-emerald-500 tracking-widest">Movimentações</p>
                    <h3 className="text-7xl font-black tracking-tighter text-emerald-500">{movements.length}</h3>
                 </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* HELP IMPORT MODAL */}
      {isImportHelpOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-xl animate-in fade-in">
          <div className={`rounded-[4rem] w-full max-w-lg p-12 border border-slate-800 text-center ${darkMode ? 'bg-slate-900' : 'bg-white'}`}>
            <Info size={48} className="mx-auto mb-6 text-brand-500" />
            <h3 className="text-2xl font-black uppercase tracking-tighter mb-4">Estrutura da Planilha</h3>
            <p className="text-sm text-slate-400 mb-8 leading-relaxed font-medium">Para uma importação correta, seu arquivo Excel deve conter as seguintes colunas na primeira linha:</p>
            <div className="space-y-3 mb-10">
              {["Material", "Setor", "Localizacao", "Saldo", "EstoqueMin", "Unidade", "Descricao"].map(col => (
                <div key={col} className={`p-4 rounded-2xl flex items-center justify-between font-black uppercase text-xs tracking-widest border ${darkMode ? 'bg-slate-950/50 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <span>{col}</span>
                  <Check size={16} className="text-emerald-500" />
                </div>
              ))}
            </div>
            <button onClick={() => setIsImportHelpOpen(false)} className="w-full py-6 bg-brand-600 text-white font-black rounded-3xl uppercase tracking-widest shadow-xl">ENTENDIDO</button>
          </div>
        </div>
      )}

      {/* PROFILE MODAL */}
      {isProfileModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/95 backdrop-blur-2xl animate-in fade-in">
          <div className={`rounded-[4rem] w-full max-w-md overflow-hidden border border-slate-800 shadow-2xl ${darkMode ? 'bg-slate-900' : 'bg-white'}`}>
            <div className="p-10 border-b border-slate-800 flex justify-between items-center bg-brand-600 text-white">
              <h3 className="text-2xl font-black uppercase tracking-tighter">Perfil Profissional</h3>
              <button onClick={() => setIsProfileModalOpen(false)} className="hover:rotate-90 transition-transform"><X size={28} /></button>
            </div>
            <form onSubmit={handleUpdateProfile} className="p-12 space-y-8 text-center">
              <div className="flex flex-col items-center gap-6">
                <div className="w-40 h-40 rounded-[3.5rem] bg-slate-950 border-4 border-slate-800 overflow-hidden relative group shadow-2xl">
                  {profileFormData.photoUrl ? (
                    <img src={profileFormData.photoUrl} className="w-full h-full object-cover" />
                  ) : (
                    <UserIcon size={56} className="text-slate-700 m-auto mt-10" />
                  )}
                  <button 
                    type="button"
                    onClick={() => profileFileInputRef.current?.click()}
                    className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white"
                  >
                    <Camera size={28}/>
                    <span className="text-[10px] font-black mt-2 uppercase tracking-widest">Alterar Foto</span>
                  </button>
                  <input type="file" accept="image/*" capture="user" ref={profileFileInputRef} className="hidden" onChange={(e) => handlePhotoUpload(e, true)} />
                </div>
                <div className="space-y-1">
                  <p className="text-[12px] font-black text-brand-500 uppercase tracking-widest">ID Matrícula</p>
                  <p className="text-3xl font-black tracking-tighter">{user.badgeId}</p>
                </div>
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block text-left px-2">NOME DO COLABORADOR</label>
                <input 
                  required 
                  className={`w-full p-6 rounded-3xl font-black text-center uppercase shadow-inner outline-none transition-all ${darkMode ? 'bg-slate-950 text-white focus:border-brand-500 border-2 border-transparent' : 'bg-slate-50 border-2 border-transparent focus:border-brand-500'}`} 
                  value={profileFormData.name} 
                  onChange={e => setProfileFormData({...profileFormData, name: e.target.value.toUpperCase()})} 
                  placeholder="DIGITE SEU NOME COMPLETO" 
                />
              </div>
              <button type="submit" disabled={isSyncing} className="w-full py-7 bg-brand-600 text-white rounded-[2.5rem] font-black uppercase tracking-widest shadow-2xl flex items-center justify-center gap-3 active:scale-95 transition-all hover:bg-brand-700">
                {isSyncing ? <Loader2 className="animate-spin"/> : 'SALVAR ALTERAÇÕES'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ITEM MODAL */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-3xl animate-in zoom-in duration-300">
          <div className={`rounded-[4rem] w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border border-slate-800 shadow-2xl ${darkMode ? 'bg-slate-900' : 'bg-white'}`}>
            <div className="p-8 border-b border-slate-800 flex justify-between items-center px-12">
              <h3 className="text-3xl font-black uppercase tracking-tighter">{editingItem ? 'EDITAR Ativo' : 'NOVO Cadastro'}</h3>
              <button onClick={() => setIsItemModalOpen(false)} className="hover:text-red-500 transition-all"><X size={36} /></button>
            </div>
            <form onSubmit={handleSaveItem} className="p-12 space-y-10 overflow-y-auto">
               <div className="flex flex-col md:flex-row gap-12">
                  <div className="w-full md:w-72 space-y-6 flex flex-col items-center">
                    <div className="aspect-square w-full rounded-[4rem] bg-slate-950 border-4 border-slate-800 overflow-hidden relative group shadow-2xl">
                      {formData.photoUrl ? (
                        <img src={formData.photoUrl} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-700">
                          <Package size={64}/>
                          <span className="text-[10px] font-black mt-3 uppercase tracking-widest opacity-40">Sem Imagem</span>
                        </div>
                      )}
                      <button 
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white p-8 text-center"
                      >
                        <Camera size={36}/>
                        <span className="text-[11px] font-black mt-3 uppercase tracking-widest">Capturar Foto do Ativo</span>
                      </button>
                    </div>
                    <input type="file" accept="image/*" capture="environment" ref={fileInputRef} className="hidden" onChange={handlePhotoUpload} />
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest text-center px-4">Utilize fotos nítidas para facilitar a identificação visual no almoxarifado.</p>
                  </div>
                  <div className="flex-1 space-y-8">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-4">Nome do Material / Equipamento</label>
                      <input required className={`w-full p-7 rounded-[2.5rem] font-black text-3xl text-center uppercase shadow-inner outline-none transition-all ${darkMode ? 'bg-slate-950 text-white focus:border-brand-500 border-4 border-transparent' : 'bg-slate-50 border-4 border-transparent focus:border-brand-500'}`} value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="NOME DO MATERIAL" />
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-4">Setor Responsável</label>
                        <input className={`w-full p-5 rounded-2xl font-bold text-center uppercase shadow-inner outline-none ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50'}`} value={formData.department || ''} onChange={e => setFormData({...formData, department: e.target.value})} placeholder="SETOR / DEP." />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-4">Endereço de Armazenamento</label>
                        <input className={`w-full p-5 rounded-2xl font-bold text-center uppercase shadow-inner outline-none ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50'}`} value={formData.location || ''} onChange={e => setFormData({...formData, location: e.target.value})} placeholder="LOCALIZACAO" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-4">UND</label>
                        <input className={`w-full p-5 rounded-2xl font-bold text-center uppercase shadow-inner outline-none ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50'}`} value={formData.unit || 'UND'} onChange={e => setFormData({...formData, unit: e.target.value})} placeholder="UNIDADE" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-4">MÍN</label>
                        <input type="number" className={`w-full p-5 rounded-2xl font-bold text-center uppercase shadow-inner outline-none ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50'}`} value={formData.minStock || 0} onChange={e => setFormData({...formData, minStock: Number(e.target.value)})} placeholder="MIN" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-4">SALDO INICIAL</label>
                        <input type="number" disabled={!!editingItem} className={`w-full p-5 rounded-2xl font-bold text-center uppercase shadow-inner outline-none disabled:opacity-30 ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50'}`} value={formData.currentStock || 0} onChange={e => setFormData({...formData, currentStock: Number(e.target.value)})} placeholder="SALDO" />
                      </div>
                    </div>
                  </div>
               </div>
               <button type="submit" disabled={isSyncing} className="w-full py-8 bg-brand-600 text-white rounded-[3rem] font-black uppercase tracking-widest shadow-2xl hover:bg-brand-700 active:scale-95 transition-all flex items-center justify-center gap-4 text-xl">
                 {isSyncing ? <Loader2 className="animate-spin" size={24}/> : (editingItem ? 'SALVAR ALTERAÇÕES' : 'CONCLUIR CADASTRO')}
               </button>
            </form>
          </div>
        </div>
      )}

      {/* MOVEMENT MODAL */}
      {isMovementModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-8 bg-slate-950/95 backdrop-blur-3xl animate-in fade-in">
           <div className={`rounded-[4rem] w-full max-w-lg overflow-hidden border border-slate-800 shadow-2xl ${darkMode ? 'bg-slate-900' : 'bg-white'}`}>
              <div className={`p-14 text-center ${movementType === 'IN' ? 'bg-emerald-600' : 'bg-orange-600'} text-white shadow-xl`}>
                 <h3 className="text-6xl font-black uppercase tracking-tighter">{movementType === 'IN' ? 'Entrada' : 'Retirada'}</h3>
                 <p className="text-[11px] mt-4 font-black uppercase tracking-widest opacity-80 truncate px-6">{items.find(i => i.id === movementItemId)?.name}</p>
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
                  const { error: mvError } = await supabase.from('movements').insert({ item_id: item.id, item_name: item.name, type: movementType, quantity: qty, user_badge_id: user.badgeId, user_name: user.name, timestamp: new Date().toISOString(), reason: moveData.reason });
                  if (mvError) throw mvError;
                  setIsMovementModalOpen(false);
                  setMoveData({ quantity: 1, reason: '' });
                  fetchData(false);
                } catch (err) { alert("Erro ao processar movimentação."); } 
                finally { setIsSyncing(false); }
              }} className="p-14 space-y-10 text-center">
                 <div className="space-y-3">
                   <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">QUANTIDADE</label>
                   <input type="number" min="1" required autoFocus className={`w-full text-9xl font-black text-center p-8 rounded-[3.5rem] outline-none shadow-inner border-4 border-transparent focus:border-brand-500 transition-all ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'}`} value={moveData.quantity} onChange={e => setMoveData({...moveData, quantity: Number(e.target.value)})} />
                 </div>
                 <input type="text" placeholder="MOTIVO / JUSTIFICATIVA (OPCIONAL)" className={`w-full p-7 rounded-[2rem] font-black text-center uppercase shadow-inner outline-none transition-all ${darkMode ? 'bg-slate-950 text-white border-2 border-transparent focus:border-brand-500' : 'bg-slate-50 border-2 border-transparent focus:border-brand-500'}`} value={moveData.reason} onChange={e => setMoveData({...moveData, reason: e.target.value})} />
                 <button type="submit" disabled={isSyncing} className={`w-full py-8 text-white text-2xl font-black rounded-[3.5rem] shadow-2xl uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-4 ${movementType === 'IN' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-orange-600 hover:bg-orange-700'}`}>
                   {isSyncing ? <Loader2 className="animate-spin" /> : 'CONFIRMAR OPERAÇÃO'}
                 </button>
                 <button type="button" onClick={() => setIsMovementModalOpen(false)} className="w-full text-[11px] font-black text-slate-500 uppercase tracking-widest hover:text-red-500 transition-colors">CANCELAR E VOLTAR</button>
              </form>
           </div>
        </div>
      )}
    </div>
  );
}
