
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  LayoutDashboard, 
  Package, 
  Plus, 
  Search, 
  Trash2, 
  Moon, 
  Sun, 
  Menu,
  X,
  Camera,
  AlertTriangle,
  Loader2,
  RefreshCw,
  LayoutGrid,
  List as ListIcon,
  TrendingDown,
  Box,
  Sparkles,
  History,
  Activity,
  Edit3,
  Users as UsersGroup,
  FileSpreadsheet,
  Upload
} from 'lucide-react';
import { InventoryItem, MovementLog, UserSession, AppView } from './types';
import { Logo } from './components/Logo';
import { supabase } from './services/supabaseClient';
import { saveOfflineData, loadOfflineData } from './services/offlineStorage';
import { generateProductInsights } from './services/geminiService';

// Biblioteca SheetJS carregada via index.html
declare const XLSX: any;

export default function App() {
  const [darkMode, setDarkMode] = useState<boolean>(true);
  const [user, setUser] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<MovementLog[]>([]);
  
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  const [inventoryDisplay, setInventoryDisplay] = useState<'GRID' | 'LIST'>('LIST');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [movementType, setMovementType] = useState<'IN' | 'OUT'>('IN');
  const [movementItemId, setMovementItemId] = useState<string>('');
  const [formData, setFormData] = useState<Partial<InventoryItem>>({});
  const [moveData, setMoveData] = useState({ quantity: 1, reason: '' });
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);

  // Mapeamento para o Banco (Colunas em snake_case)
  const mapToDB = (i: InventoryItem) => ({
    id: i.id, 
    name: i.name, 
    unit: i.unit, 
    min_stock: i.minStock,
    current_stock: i.currentStock, 
    location: i.location, 
    department: i.department,
    photo_url: i.photoUrl, 
    description: i.description, 
    last_updated: i.lastUpdated,
    last_updated_by: i.lastUpdatedBy,
    last_updated_by_badge: i.lastUpdatedByBadge
  });

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
      // Busca itens com limite para evitar timeout
      const { data: itData, error: itError } = await supabase
        .from('inventory_items')
        .select('*')
        .order('name')
        .limit(1000);

      if (itError) throw itError;

      const { data: movData } = await supabase
        .from('movements')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(50);

      const mappedItems = itData ? itData.map(mapFromDB) : [];
      setItems(mappedItems);
      
      if (movData) {
        setMovements(movData.map(m => ({
          id: String(m.id), itemId: m.item_id, itemName: m.item_name, type: m.type as any,
          quantity: m.quantity, userBadgeId: m.user_badge_id, userName: m.user_name,
          timestamp: m.timestamp, reason: m.reason
        })));
      }
      saveOfflineData(mappedItems, [], [], []);
    } catch (err: any) {
      console.error("Erro na carga:", err);
      const offline = loadOfflineData();
      if (offline.items.length > 0) setItems(offline.items);
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  }, []);

  // EXPORTAR EXCEL REAL (.xlsx)
  const handleExportInventory = () => {
    if (items.length === 0) return alert("Sem dados.");
    try {
      const data = items.map(i => ({
        "Material": i.name,
        "Setor": i.department,
        "Endereço": i.location,
        "Saldo": i.currentStock,
        "Estoque Min": i.minStock,
        "Unidade": i.unit,
        "Observação": i.description,
        "Atualizado em": new Date(i.lastUpdated).toLocaleString()
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Inventario");
      XLSX.writeFile(wb, `Estoque_CARPA_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (e) {
      alert("Erro ao gerar Excel.");
    }
  };

  // IMPORTAR EXCEL REAL (.xlsx)
  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        
        setIsSyncing(true);
        const toSave = json.map((item: any) => ({
          id: Math.random().toString(36).substr(2, 9),
          name: (item["Material"] || "NOVO").toString().toUpperCase(),
          department: (item["Setor"] || "ESTOQUE").toString().toUpperCase(),
          location: (item["Endereço"] || "P-01").toString().toUpperCase(),
          current_stock: Number(item["Saldo"] || 0),
          min_stock: Number(item["Estoque Min"] || 0),
          unit: (item["Unidade"] || "UND").toString().toUpperCase(),
          description: item["Observação"] || "",
          last_updated: new Date().toISOString(),
          last_updated_by: user.name,
          last_updated_by_badge: user.badgeId
        }));

        const { error } = await supabase.from('inventory_items').upsert(toSave);
        if (error) throw error;
        
        alert("Importação concluída com sucesso!");
        fetchData(false);
      } catch (err) {
        alert("Planilha inválida. Verifique as colunas.");
      } finally {
        setIsSyncing(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  // SALVAR E APARECER NO ESTOQUE (Optimistic UI + Force Fetch)
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !user) return;

    setIsSyncing(true);
    const itemToSave: InventoryItem = {
      id: editingItem?.id || Date.now().toString(),
      name: formData.name.toUpperCase(),
      unit: (formData.unit || 'UND').toUpperCase(),
      minStock: Number(formData.minStock) || 0,
      currentStock: Number(formData.currentStock) || 0,
      location: (formData.location || '').toUpperCase(),
      department: (formData.department || '').toUpperCase(),
      photoUrl: formData.photoUrl,
      description: formData.description || '',
      lastUpdated: new Date().toISOString(),
      lastUpdatedBy: user.name,
      lastUpdatedByBadge: user.badgeId
    };

    // Atualização instantânea na tela
    setItems(prev => {
      const filtered = prev.filter(i => i.id !== itemToSave.id);
      return [itemToSave, ...filtered].sort((a, b) => a.name.localeCompare(b.name));
    });

    try {
      const { error } = await supabase.from('inventory_items').upsert(mapToDB(itemToSave));
      if (error) throw error;

      await supabase.from('movements').insert({
        item_id: itemToSave.id,
        item_name: itemToSave.name,
        type: editingItem ? 'EDIT' : 'CREATE',
        quantity: 0,
        user_badge_id: user.badgeId,
        user_name: user.name,
        timestamp: itemToSave.lastUpdated,
        reason: editingItem ? 'Ajuste de Cadastro' : 'Novo Registro'
      });

      setIsItemModalOpen(false);
      setEditingItem(null);
      setFormData({});
      fetchData(false); // Sincroniza estado final
    } catch (err) {
      alert("Erro ao salvar no banco. Verifique as tabelas.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleStockAction = async (e: React.FormEvent) => {
    e.preventDefault();
    const item = items.find(i => i.id === movementItemId);
    if (!item || !user) return;

    setIsSyncing(true);
    const qty = Number(moveData.quantity);
    const newStock = movementType === 'IN' ? item.currentStock + qty : item.currentStock - qty;
    
    try {
      await supabase.from('inventory_items').update({ 
        current_stock: newStock, 
        last_updated: new Date().toISOString(), 
        last_updated_by: user.name,
        last_updated_by_badge: user.badgeId
      }).eq('id', item.id);

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
    } catch (err) {
      alert("Erro na movimentação.");
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredItems = useMemo(() => {
    if (!searchTerm) return items;
    const s = searchTerm.toLowerCase();
    return items.filter(i => i.name.toLowerCase().includes(s) || i.location.toLowerCase().includes(s));
  }, [items, searchTerm]);

  // LOGIN CENTRALIZADO
  const LoginView = () => {
    const [badge, setBadge] = useState('');
    const [name, setName] = useState('');
    const [isReg, setIsReg] = useState(false);
    const [localLoading, setLocalLoading] = useState(false);

    const onLoginSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!badge) return;
      setLocalLoading(true);
      try {
        const { data } = await supabase.from('users').select('*').eq('badge_id', badge).single();
        if (data) {
          setUser({ badgeId: data.badge_id, name: data.name, role: data.role as any });
        } else {
          setIsReg(true);
        }
      } catch (err) {
        setIsReg(true);
      } finally {
        setLocalLoading(false);
      }
    };

    const onRegSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!badge || !name) return;
      setLocalLoading(true);
      await supabase.from('users').insert({ badge_id: badge, name, role: 'staff' });
      setUser({ badgeId: badge, name, role: 'staff' });
      setLocalLoading(false);
    };

    return (
      <div className={`h-screen flex items-center justify-center p-6 ${darkMode ? 'bg-[#020617]' : 'bg-slate-100'}`}>
        <div className={`w-full max-w-[440px] p-12 rounded-[4rem] shadow-2xl border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} backdrop-blur-xl animate-in zoom-in`}>
          <div className="flex flex-col items-center mb-10 text-center">
            <Logo className="w-20 h-20 mb-6" />
            <h1 className={`text-4xl font-black tracking-tighter mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>CARPA</h1>
            <p className="text-[10px] font-black text-brand-500 uppercase tracking-widest">Sistema de Inventário</p>
          </div>
          
          <form onSubmit={isReg ? onRegSubmit : onLoginSubmit} className="space-y-8">
            <div className="text-center">
              <label className="text-[10px] font-black text-slate-400 uppercase mb-4 block tracking-widest">ID da Matrícula</label>
              <input 
                type="text" value={badge} onChange={e => setBadge(e.target.value)} 
                placeholder="DIGITE SEU ID" 
                className={`w-full py-6 rounded-[2rem] font-black outline-none text-2xl text-center uppercase shadow-inner ${darkMode ? 'bg-slate-950 text-white focus:border-brand-500 border-2 border-transparent' : 'bg-slate-50 border-2 border-transparent focus:border-brand-500'}`} 
              />
            </div>
            {isReg && (
              <div className="text-center animate-in slide-in-from-top-4">
                <label className="text-[10px] font-black text-slate-400 uppercase mb-4 block tracking-widest">Nome Completo</label>
                <input 
                  type="text" value={name} onChange={e => setName(e.target.value)} 
                  placeholder="NOME COMPLETO" 
                  className={`w-full py-6 rounded-[2rem] font-black outline-none text-xl text-center uppercase shadow-inner ${darkMode ? 'bg-slate-950 text-white border-2 border-transparent focus:border-brand-500' : 'bg-slate-50'}`} 
                />
              </div>
            )}
            <button disabled={localLoading} className="w-full py-6 bg-brand-600 text-white font-black rounded-[2.5rem] shadow-xl hover:bg-brand-700 active:scale-95 transition-all text-lg tracking-widest flex justify-center items-center">
              {localLoading ? <Loader2 className="animate-spin" /> : 'ACESSAR UNIDADE'}
            </button>
          </form>
        </div>
      </div>
    );
  };

  if (isLoading) return (
    <div className={`h-screen flex flex-col items-center justify-center ${darkMode ? 'bg-[#020617]' : 'bg-white'}`}>
      <Logo className="w-24 h-24 mb-8 animate-pulse" />
      <Loader2 className="animate-spin text-brand-600" size={40} />
    </div>
  );

  if (!user) return <LoginView />;

  return (
    <div className={`h-screen flex font-sans transition-colors duration-500 ${darkMode ? 'bg-[#020617] text-white' : 'bg-slate-50 text-slate-900'}`}>
      <aside className={`fixed lg:static inset-y-0 left-0 w-80 z-50 transform transition-transform duration-500 border-r ${darkMode ? 'bg-slate-900/40 border-slate-800' : 'bg-white border-slate-200'} backdrop-blur-3xl ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex flex-col h-full p-10">
          <div className="flex items-center gap-5 mb-16">
            <Logo className="w-14 h-14" />
            <span className="font-black text-3xl tracking-tighter">CARPA</span>
          </div>
          <nav className="flex-1 space-y-3">
            {[
              { id: AppView.DASHBOARD, icon: LayoutDashboard, label: 'Painel' },
              { id: AppView.INVENTORY, icon: Package, label: 'Estoque' },
              { id: AppView.MOVEMENTS, icon: History, label: 'Histórico' }
            ].map(v => (
              <button 
                key={v.id} 
                onClick={() => { setCurrentView(v.id); setIsSidebarOpen(false); }} 
                className={`w-full flex items-center gap-5 p-6 rounded-[2rem] font-black text-sm transition-all ${currentView === v.id ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/20' : 'text-slate-400 hover:bg-brand-500/10'}`}
              >
                <v.icon size={22} /> {v.label}
              </button>
            ))}
          </nav>
          <div className="mt-auto border-t border-slate-800 pt-6">
             <button onClick={() => setDarkMode(!darkMode)} className="w-full py-4 rounded-xl border border-slate-800 mb-4 flex justify-center">{darkMode ? <Sun size={20}/> : <Moon size={20}/>}</button>
             <button onClick={() => setUser(null)} className="w-full py-4 bg-red-500/10 text-red-500 rounded-xl font-black text-[10px] uppercase">Encerrar Turno</button>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-24 border-b flex items-center justify-between px-10">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden"><Menu/></button>
            <h2 className="font-black text-2xl uppercase tracking-tighter">{currentView}</h2>
          </div>
          <button onClick={() => { setEditingItem(null); setFormData({}); setIsItemModalOpen(true); }} className="bg-brand-600 text-white px-8 py-4 rounded-2xl font-black text-xs flex items-center gap-2 shadow-xl hover:bg-brand-700 active:scale-95 transition-all"><Plus size={18}/> NOVO ATIVO</button>
        </header>

        <div className="flex-1 overflow-y-auto p-10">
          <div className="max-w-7xl mx-auto space-y-10">
            {currentView === AppView.INVENTORY && (
              <div className="space-y-8">
                <div className={`p-8 rounded-[3.5rem] border flex flex-col lg:flex-row gap-6 items-center ${darkMode ? 'bg-slate-900/40 border-slate-800' : 'bg-white border-slate-200'}`}>
                   <div className="relative flex-1 w-full text-center">
                    <Search className="absolute left-1/2 -translate-x-32 top-1/2 -translate-y-1/2 text-slate-500" size={20}/>
                    <input 
                      value={searchTerm} onChange={e => setSearchTerm(e.target.value)} 
                      placeholder="PESQUISAR..." 
                      className={`w-full py-5 rounded-[2rem] outline-none font-black text-lg text-center uppercase shadow-inner ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50'}`} 
                    />
                  </div>
                  <div className="flex gap-3">
                    <label className="px-6 py-5 bg-emerald-600/10 text-emerald-500 rounded-2xl font-black text-[10px] flex items-center gap-2 cursor-pointer border border-emerald-500/20"><Upload size={18}/> IMPORTAR <input type="file" className="hidden" onChange={handleImportExcel} /></label>
                    <button onClick={handleExportInventory} className="px-6 py-5 bg-brand-600 text-white rounded-2xl font-black text-[10px] flex items-center gap-2 shadow-lg"><FileSpreadsheet size={18}/> EXPORTAR EXCEL</button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 animate-in fade-in duration-500">
                  {filteredItems.map(item => (
                    <div key={item.id} className={`p-8 rounded-[3.5rem] border transition-all hover:scale-[1.02] ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white shadow-sm border-slate-100'}`}>
                      <div className="aspect-square bg-slate-950/50 rounded-[2.5rem] mb-6 overflow-hidden relative border border-slate-800">
                        {item.photoUrl ? <img src={item.photoUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center opacity-10"><Package size={60}/></div>}
                        <div className="absolute top-4 left-4 bg-brand-600 px-3 py-1 rounded-full text-[8px] font-black text-white uppercase">{item.location}</div>
                      </div>
                      <h4 className="font-black text-xl uppercase truncate tracking-tighter">{item.name}</h4>
                      <p className="text-[10px] font-black text-slate-500 uppercase mb-6 truncate">{item.department || 'ESTOQUE GERAL'}</p>
                      <div className="flex items-center justify-between border-t border-slate-800/30 pt-6">
                        <span className={`text-5xl font-black tracking-tighter ${item.currentStock <= item.minStock ? 'text-red-600' : 'text-slate-200'}`}>{item.currentStock}</span>
                        <div className="flex gap-2">
                           <button onClick={() => { setMovementItemId(item.id); setMovementType('IN'); setIsMovementModalOpen(true); }} className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl hover:bg-emerald-600 hover:text-white transition-all"><Plus size={20}/></button>
                           <button onClick={() => { setMovementItemId(item.id); setMovementType('OUT'); setIsMovementModalOpen(true); }} className="p-3 bg-orange-500/10 text-orange-500 rounded-xl hover:bg-orange-600 hover:text-white transition-all"><TrendingDown size={20}/></button>
                           <button onClick={() => { setEditingItem(item); setFormData(item); setIsItemModalOpen(true); }} className="p-3 bg-slate-800 text-slate-400 rounded-xl hover:text-white transition-all"><Edit3 size={20}/></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {currentView === AppView.DASHBOARD && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 animate-in slide-in-from-bottom-6">
                 <div className={`p-10 rounded-[3rem] border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white'}`}>
                    <Box className="text-brand-500 mb-6" size={32}/>
                    <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Itens Totais</p>
                    <h3 className="text-7xl font-black tracking-tighter">{items.length}</h3>
                 </div>
                 <div className={`p-10 rounded-[3rem] border ${darkMode ? 'bg-red-500/10 border-red-500/20' : 'bg-red-50 border-red-100'}`}>
                    <AlertTriangle className="text-red-500 mb-6" size={32}/>
                    <p className="text-[10px] font-black uppercase text-red-500 tracking-widest">Reposição Crítica</p>
                    <h3 className="text-7xl font-black tracking-tighter text-red-500">{items.filter(i => i.currentStock <= i.minStock).length}</h3>
                 </div>
                 <div className={`p-10 rounded-[3rem] border ${darkMode ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-emerald-50 border-emerald-100'}`}>
                    <Activity className="text-emerald-500 mb-6" size={32}/>
                    <p className="text-[10px] font-black uppercase text-emerald-500 tracking-widest">Logs de Atividade</p>
                    <h3 className="text-7xl font-black tracking-tighter text-emerald-500">{movements.length}</h3>
                 </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* MODAL NOVO ITEM */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-xl animate-in fade-in">
          <div className={`rounded-[4rem] w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border border-slate-800 ${darkMode ? 'bg-slate-900' : 'bg-white'}`}>
            <div className="p-10 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-3xl font-black uppercase tracking-tighter">{editingItem ? 'Editar Ativo' : 'Novo Registro'}</h3>
              <button onClick={() => setIsItemModalOpen(false)} className="hover:text-red-500 transition-all"><X size={32} /></button>
            </div>
            <form onSubmit={handleSaveItem} className="p-12 space-y-8 overflow-y-auto text-center">
               <input required className={`w-full p-6 rounded-[2rem] font-black text-3xl text-center uppercase shadow-inner outline-none focus:border-brand-500 border-4 border-transparent transition-all ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'}`} value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="NOME DO MATERIAL" />
               <div className="grid grid-cols-2 gap-4">
                  <input className={`w-full p-5 rounded-xl font-bold text-center uppercase shadow-inner outline-none ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50'}`} value={formData.department || ''} onChange={e => setFormData({...formData, department: e.target.value})} placeholder="SETOR" />
                  <input className={`w-full p-5 rounded-xl font-bold text-center uppercase shadow-inner outline-none ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50'}`} value={formData.location || ''} onChange={e => setFormData({...formData, location: e.target.value})} placeholder="ENDEREÇO" />
               </div>
               <div className="grid grid-cols-3 gap-4">
                  <input className={`w-full p-5 rounded-xl font-bold text-center uppercase shadow-inner outline-none ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50'}`} value={formData.unit || 'UND'} onChange={e => setFormData({...formData, unit: e.target.value})} placeholder="UND" />
                  <input type="number" className={`w-full p-5 rounded-xl font-bold text-center uppercase shadow-inner outline-none ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50'}`} value={formData.minStock || 0} onChange={e => setFormData({...formData, minStock: Number(e.target.value)})} placeholder="MIN" />
                  <input type="number" disabled={!!editingItem} className={`w-full p-5 rounded-xl font-bold text-center uppercase shadow-inner outline-none disabled:opacity-30 ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50'}`} value={formData.currentStock || 0} onChange={e => setFormData({...formData, currentStock: Number(e.target.value)})} placeholder="SALDO" />
               </div>
               <button type="submit" className="w-full py-7 bg-brand-600 text-white rounded-[2.5rem] font-black uppercase tracking-widest shadow-2xl hover:bg-brand-700 active:scale-95 transition-all">FINALIZAR SALVAMENTO</button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL MOVIMENTAÇÃO */}
      {isMovementModalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-8 bg-slate-950/95 backdrop-blur-2xl animate-in fade-in">
           <div className={`rounded-[4rem] w-full max-w-lg overflow-hidden border border-slate-800 ${darkMode ? 'bg-slate-900' : 'bg-white'}`}>
              <div className={`p-12 text-center ${movementType === 'IN' ? 'bg-emerald-600' : 'bg-orange-600'} text-white`}>
                 <h3 className="text-5xl font-black uppercase tracking-tighter">{movementType === 'IN' ? 'Entrada' : 'Retirada'}</h3>
              </div>
              <form onSubmit={handleStockAction} className="p-14 space-y-10 text-center">
                 <input 
                    type="number" min="1" required autoFocus 
                    className={`w-full text-9xl font-black text-center p-8 rounded-[3rem] outline-none shadow-inner ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'}`} 
                    value={moveData.quantity} 
                    onChange={e => setMoveData({...moveData, quantity: Number(e.target.value)})} 
                 />
                 <button type="submit" className={`w-full py-8 text-white text-2xl font-black rounded-[3rem] shadow-2xl uppercase tracking-widest active:scale-95 transition-all ${movementType === 'IN' ? 'bg-emerald-600' : 'bg-orange-600'}`}>
                   CONFIRMAR
                 </button>
                 <button type="button" onClick={() => setIsMovementModalOpen(false)} className="w-full text-[10px] font-black text-slate-500 uppercase tracking-widest">CANCELAR OPERAÇÃO</button>
              </form>
           </div>
        </div>
      )}
    </div>
  );
}
