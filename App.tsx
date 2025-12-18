
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  LayoutDashboard, Package, Plus, Search, Trash2, Moon, Sun, Menu, X, 
  Camera, AlertTriangle, Loader2, RefreshCw, TrendingDown, Box, 
  History, Activity, Edit3, Users as UsersIcon, FileSpreadsheet, 
  Upload, CheckCircle2, User as UserIcon, LogOut, ChevronRight,
  Info, Check, CloudCheck, CloudOff
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
          setUser({ ...user, name: current.name, photoUrl: current.photo_url });
        }
      }
      setLastSync(new Date());
      setDbStatus('online');
    } catch (err) {
      console.error("Erro na sincronização:", err);
      setDbStatus('offline');
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
        else setFormData(prev => ({ ...prev, photo_url: base64String }));
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
        reason: editingItem ? 'Ajuste Cadastral' : 'Novo Cadastro'
      });

      setIsItemModalOpen(false);
      setEditingItem(null);
      setFormData({});
      fetchData(false);
    } catch (err: any) {
      alert("Erro ao salvar: " + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExportExcel = () => {
    if (items.length === 0) return alert("Sem dados.");
    const data = items.map(i => ({
      "Material": i.name,
      "Setor": i.department,
      "Localizacao": i.location,
      "Saldo": i.current_stock,
      "EstoqueMin": i.min_stock,
      "Unidade": i.unit,
      "Descricao": i.description
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Estoque");
    XLSX.writeFile(wb, `CARPA_Estoque.xlsx`);
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
          id: `IMP-${Math.random().toString(36).substr(2, 9)}`,
          name: (item["Material"] || "NOVO").toString().toUpperCase(),
          department: (item["Setor"] || "ESTOQUE").toString().toUpperCase(),
          location: (item["Localizacao"] || "N/A").toString().toUpperCase(),
          current_stock: Number(item["Saldo"] || 0),
          min_stock: Number(item["EstoqueMin"] || 0),
          unit: (item["Unidade"] || "UND").toString().toUpperCase(),
          description: item["Descricao"] || "",
          last_updated: new Date().toISOString(),
          last_updated_by: user.name
        }));
        const { error } = await supabase.from('inventory_items').upsert(toSave);
        if (error) throw error;
        alert("Importação concluída!");
        fetchData(false);
      } catch (err) { alert("Falha no Excel. Verifique as colunas."); }
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
      <Logo className="w-16 h-16 animate-pulse" />
      <Loader2 className="animate-spin text-brand-600 mt-4" size={32} />
    </div>
  );

  if (!user) {
    return (
      <div className={`h-screen flex items-center justify-center p-4 ${darkMode ? 'bg-[#020617]' : 'bg-slate-100'}`}>
        <div className={`w-full max-w-[360px] p-8 rounded-3xl border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-xl'}`}>
          <div className="flex flex-col items-center mb-6 text-center">
            <Logo className="w-14 h-14 mb-4" />
            <h1 className={`text-2xl font-black tracking-tighter ${darkMode ? 'text-white' : 'text-slate-900'}`}>CARPA ESTOQUE</h1>
          </div>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const badge = (e.target as any).badge.value;
            const { data } = await supabase.from('users').select('*').eq('badge_id', badge).single();
            if (data) {
              setUser({ badgeId: data.badge_id, name: data.name, role: data.role, photoUrl: data.photo_url });
            } else {
              const name = prompt("Matrícula nova. Nome:");
              if (name) {
                await supabase.from('users').insert({ badge_id: badge, name: name.toUpperCase(), role: 'staff' });
                setUser({ badgeId: badge, name: name.toUpperCase(), role: 'staff' });
              }
            }
          }} className="space-y-4">
            <input name="badge" required placeholder="MATRÍCULA" className={`w-full py-4 rounded-xl font-black text-center uppercase outline-none border-2 border-transparent focus:border-brand-500 ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50'}`} />
            <button className="w-full py-4 bg-brand-600 text-white font-black rounded-xl uppercase tracking-widest active:scale-95 transition-all">ACESSAR</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-screen flex flex-col lg:flex-row font-sans transition-colors duration-500 ${darkMode ? 'bg-[#020617] text-white' : 'bg-slate-50 text-slate-900'}`}>
      
      {/* Sidebar Desktop / Overlay Mobile */}
      <aside className={`fixed lg:static inset-y-0 left-0 w-64 z-50 transform transition-transform duration-500 border-r ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} backdrop-blur-3xl ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex flex-col h-full p-6">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2">
              <Logo className="w-8 h-8" />
              <span className="font-black text-lg tracking-tighter">CARPA</span>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-1"><X size={20}/></button>
          </div>
          
          <nav className="flex-1 space-y-1">
            {[
              { id: AppView.DASHBOARD, icon: LayoutDashboard, label: 'Resumo' },
              { id: AppView.INVENTORY, icon: Package, label: 'Materiais' },
              { id: AppView.MOVEMENTS, icon: History, label: 'Histórico' },
              { id: AppView.USERS, icon: UsersIcon, label: 'Equipe' }
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

          <div className="mt-auto space-y-3 pt-4 border-t border-slate-800/50">
            <button onClick={() => setIsProfileModalOpen(true)} className={`w-full p-2 rounded-xl border flex items-center gap-3 ${darkMode ? 'bg-slate-950/50 border-slate-800' : 'bg-white border-slate-200'}`}>
              <div className="w-8 h-8 rounded-lg bg-brand-600/10 flex items-center justify-center overflow-hidden border border-brand-500/20">
                {user.photoUrl ? <img src={user.photoUrl} className="w-full h-full object-cover" /> : <UserIcon size={14}/>}
              </div>
              <p className="font-black text-[10px] truncate flex-1 uppercase">{user.name}</p>
            </button>
            
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
            <h2 className="font-black text-xs md:text-sm uppercase tracking-tighter">{currentView}</h2>
          </div>
          
          <div className="flex gap-2">
            {currentView === AppView.INVENTORY && (
              <button onClick={() => { setEditingItem(null); setFormData({}); setIsItemModalOpen(true); }} className="bg-brand-600 text-white px-4 py-2 rounded-lg font-black text-[9px] flex items-center gap-1.5 shadow-lg active:scale-95 uppercase">
                <Plus size={12}/> NOVO
              </button>
            )}
            {selectedItemIds.length > 0 && (
              <button onClick={handleBulkDelete} className="bg-red-600 text-white px-4 py-2 rounded-lg font-black text-[9px] flex items-center gap-1.5 uppercase">
                <Trash2 size={12}/> EXCLUIR
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="max-w-6xl mx-auto space-y-4">
            
            {currentView === AppView.INVENTORY && (
              <div className="space-y-4">
                <div className={`p-2 px-4 rounded-xl border flex items-center gap-2 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white'}`}>
                  <Search className="text-slate-500" size={14}/>
                  <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="PESQUISAR..." className="flex-1 bg-transparent border-none outline-none font-bold text-center uppercase text-[10px]" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 animate-in fade-in">
                  {filteredItems.map(item => {
                    const isSelected = selectedItemIds.includes(item.id);
                    return (
                      <div key={item.id} onClick={() => { if (selectedItemIds.length > 0) setSelectedItemIds(prev => isSelected ? prev.filter(id => id !== item.id) : [...prev, item.id]); }} onContextMenu={(e) => { e.preventDefault(); setSelectedItemIds(prev => isSelected ? prev.filter(id => id !== item.id) : [...prev, item.id]); }} className={`group p-3 rounded-2xl border transition-all ${isSelected ? 'border-brand-500 bg-brand-500/5' : darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white shadow-sm'}`}>
                        <div className="aspect-square bg-slate-950/40 rounded-xl mb-3 overflow-hidden relative border border-slate-800/10">
                          {item.photo_url ? <img src={item.photo_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center opacity-10"><Package size={24}/></div>}
                          <div className="absolute top-1.5 left-1.5 bg-slate-900/80 px-2 py-0.5 rounded-md text-[6px] font-black text-white uppercase">{item.location}</div>
                          {isSelected && <div className="absolute inset-0 bg-brand-600/20 flex items-center justify-center backdrop-blur-sm"><CheckCircle2 className="text-white" size={24}/></div>}
                        </div>
                        <h4 className="font-black text-[11px] uppercase truncate mb-1">{item.name}</h4>
                        <div className="flex items-center justify-between pt-2 border-t border-slate-800/10">
                          <div className="flex flex-col">
                            <span className={`text-xl font-black ${item.current_stock <= item.min_stock ? 'text-red-500' : 'text-slate-200'}`}>{item.current_stock}</span>
                            <span className="text-[6px] font-black text-slate-500">SALDO</span>
                          </div>
                          <div className="flex gap-1">
                             <button onClick={(e) => { e.stopPropagation(); setMovementItemId(item.id); setMovementType('IN'); setIsMovementModalOpen(true); }} className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg"><Plus size={12}/></button>
                             <button onClick={(e) => { e.stopPropagation(); setMovementItemId(item.id); setMovementType('OUT'); setIsMovementModalOpen(true); }} className="p-2 bg-orange-500/10 text-orange-500 rounded-lg"><TrendingDown size={12}/></button>
                             <button onClick={(e) => { e.stopPropagation(); setEditingItem(item); setFormData(item); setIsItemModalOpen(true); }} className="p-2 bg-slate-800 text-slate-400 rounded-lg"><Edit3 size={12}/></button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {currentView === AppView.DASHBOARD && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                 <div className={`p-6 rounded-2xl border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white shadow-sm'}`}>
                    <Box className="text-brand-500 mb-2" size={18}/>
                    <p className="text-[8px] font-black uppercase text-slate-500">Total Itens</p>
                    <h3 className="text-3xl font-black">{items.length}</h3>
                 </div>
                 <div className={`p-6 rounded-2xl border ${darkMode ? 'bg-red-500/10 border-red-500/20' : 'bg-red-50 border-red-100'}`}>
                    <AlertTriangle className="text-red-500 mb-2" size={18}/>
                    <p className="text-[8px] font-black uppercase text-red-500">Reposição</p>
                    <h3 className="text-3xl font-black text-red-500">{items.filter(i => i.current_stock <= i.min_stock).length}</h3>
                 </div>
                 <div className={`p-6 rounded-2xl border ${darkMode ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-emerald-50 border-emerald-100'}`}>
                    <Activity className="text-emerald-500 mb-2" size={18}/>
                    <p className="text-[8px] font-black uppercase text-emerald-500">Movimentações</p>
                    <h3 className="text-3xl font-black text-emerald-500">{movements.length}</h3>
                 </div>
              </div>
            )}

            {currentView === AppView.MOVEMENTS && (
               <div className="space-y-3">
                 <h3 className="text-xs font-black uppercase">Atividades Recentes</h3>
                 <div className="space-y-2">
                   {movements.map(m => (
                     <div key={m.id} className={`p-3 rounded-xl border flex items-center justify-between text-[10px] ${darkMode ? 'bg-slate-900/40 border-slate-800' : 'bg-white'}`}>
                       <div className="flex gap-3 items-center">
                         <div className={`p-1.5 rounded-lg ${m.type === 'IN' ? 'bg-emerald-500/10 text-emerald-500' : m.type === 'OUT' ? 'bg-orange-500/10 text-orange-500' : 'bg-slate-500/10 text-slate-500'}`}>
                            {m.type === 'IN' ? <Plus size={14}/> : m.type === 'OUT' ? <TrendingDown size={14}/> : <Edit3 size={14}/>}
                         </div>
                         <div>
                           <p className="font-black uppercase">{m.item_name}</p>
                           <p className="text-[8px] text-slate-500">{new Date(m.timestamp).toLocaleString()} • {m.user_name}</p>
                         </div>
                       </div>
                       <p className={`font-black ${m.type === 'IN' ? 'text-emerald-500' : 'text-orange-500'}`}>{m.type === 'IN' ? '+' : '-'}{m.quantity}</p>
                     </div>
                   ))}
                 </div>
               </div>
            )}
          </div>
        </div>

        {/* Tools flutuantes para Mobile */}
        {currentView === AppView.INVENTORY && (
           <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-40">
             <button onClick={() => setIsImportHelpOpen(true)} className="w-10 h-10 rounded-full bg-slate-800 text-white flex items-center justify-center shadow-lg"><Info size={16}/></button>
             <button onClick={handleExportExcel} className="w-10 h-10 rounded-full bg-brand-600 text-white flex items-center justify-center shadow-lg"><FileSpreadsheet size={16}/></button>
             <label className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-lg cursor-pointer">
                <Upload size={16}/>
                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImportExcel} />
             </label>
           </div>
        )}
      </main>

      {/* MODAL MATERIAL */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in zoom-in">
          <div className={`rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col border border-slate-800 ${darkMode ? 'bg-slate-900' : 'bg-white'}`}>
            <div className="p-4 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-sm font-black uppercase">{editingItem ? 'EDITAR' : 'NOVO'} MATERIAL</h3>
              <button onClick={() => setIsItemModalOpen(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveItem} className="p-6 space-y-4 overflow-y-auto">
               <div className="flex flex-col items-center gap-4">
                  <div className="w-24 h-24 rounded-xl bg-slate-950 border-2 border-slate-800 overflow-hidden relative group">
                    {formData.photo_url ? <img src={formData.photo_url} className="w-full h-full object-cover" /> : <Package size={24} className="m-auto mt-8 opacity-20" />}
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100"><Camera size={16}/></button>
                  </div>
                  <input type="file" accept="image/*" capture="environment" ref={fileInputRef} className="hidden" onChange={handlePhotoUpload} />
                  <input required className={`w-full p-3 rounded-lg font-black text-center uppercase outline-none focus:border-brand-500 border-2 border-transparent ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50'}`} value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="NOME DO MATERIAL" />
               </div>
               <div className="grid grid-cols-2 gap-3">
                  <input className="p-3 rounded-lg font-bold text-center uppercase text-[10px] bg-slate-950/50" value={formData.department || ''} onChange={e => setFormData({...formData, department: e.target.value})} placeholder="SETOR" />
                  <input className="p-3 rounded-lg font-bold text-center uppercase text-[10px] bg-slate-950/50" value={formData.location || ''} onChange={e => setFormData({...formData, location: e.target.value})} placeholder="LOCAL" />
                  <input className="p-3 rounded-lg font-bold text-center uppercase text-[10px] bg-slate-950/50" value={formData.unit || 'UND'} onChange={e => setFormData({...formData, unit: e.target.value})} placeholder="UND" />
                  <div className="flex gap-2">
                    <input type="number" className="w-1/2 p-3 rounded-lg font-bold text-center text-[10px] bg-slate-950/50" value={formData.min_stock || 0} onChange={e => setFormData({...formData, min_stock: Number(e.target.value)})} placeholder="MIN" />
                    <input type="number" disabled={!!editingItem} className="w-1/2 p-3 rounded-lg font-bold text-center text-[10px] bg-slate-950/50 disabled:opacity-20" value={formData.current_stock || 0} onChange={e => setFormData({...formData, current_stock: Number(e.target.value)})} placeholder="SALDO" />
                  </div>
               </div>
               <button type="submit" disabled={isSyncing} className="w-full py-4 bg-brand-600 text-white rounded-xl font-black uppercase text-[10px] shadow-lg">
                 {isSyncing ? <Loader2 className="animate-spin m-auto" size={16}/> : 'SALVAR'}
               </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL MOVIMENTAÇÃO */}
      {isMovementModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in">
           <div className={`rounded-2xl w-full max-w-[320px] overflow-hidden border border-slate-800 ${darkMode ? 'bg-slate-900' : 'bg-white'}`}>
              <div className={`p-6 text-center ${movementType === 'IN' ? 'bg-emerald-600' : 'bg-orange-600'} text-white`}>
                 <h3 className="text-2xl font-black uppercase">{movementType === 'IN' ? 'Entrada' : 'Retirada'}</h3>
                 <p className="text-[8px] mt-1 font-black uppercase opacity-80 truncate">{items.find(i => i.id === movementItemId)?.name}</p>
              </div>
              <form onSubmit={async (e) => {
                e.preventDefault();
                const item = items.find(i => i.id === movementItemId);
                if (!item || !user) return;
                setIsSyncing(true);
                const qty = Number(moveData.quantity);
                const newStock = movementType === 'IN' ? item.current_stock + qty : item.current_stock - qty;
                try {
                  const { error: upError } = await supabase.from('inventory_items').update({ current_stock: newStock, last_updated: new Date().toISOString(), last_updated_by: user.name }).eq('id', item.id);
                  if (upError) throw upError;
                  await supabase.from('movements').insert({ item_id: item.id, item_name: item.name, type: movementType, quantity: qty, user_badge_id: user.badgeId, user_name: user.name, timestamp: new Date().toISOString(), reason: moveData.reason });
                  setIsMovementModalOpen(false);
                  setMoveData({ quantity: 1, reason: '' });
                  fetchData(false);
                } catch (err) { alert("Erro ao processar."); } 
                finally { setIsSyncing(false); }
              }} className="p-6 space-y-4 text-center">
                 <input type="number" min="1" required autoFocus className={`w-full text-5xl font-black text-center p-4 rounded-xl outline-none bg-slate-950 text-white`} value={moveData.quantity} onChange={e => setMoveData({...moveData, quantity: Number(e.target.value)})} />
                 <input placeholder="JUSTIFICATIVA" className={`w-full p-3 rounded-lg text-center uppercase text-[9px] bg-slate-950 text-white outline-none`} value={moveData.reason} onChange={e => setMoveData({...moveData, reason: e.target.value})} />
                 <button type="submit" disabled={isSyncing} className={`w-full py-4 text-white font-black rounded-xl uppercase text-xs ${movementType === 'IN' ? 'bg-emerald-600' : 'bg-orange-600'}`}>
                   {isSyncing ? <Loader2 className="animate-spin m-auto" /> : 'CONFIRMAR'}
                 </button>
                 <button type="button" onClick={() => setIsMovementModalOpen(false)} className="w-full text-[8px] font-black text-slate-500 uppercase">CANCELAR</button>
              </form>
           </div>
        </div>
      )}
    </div>
  );
}
