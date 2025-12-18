
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  LayoutDashboard, Package, Plus, Search, Trash2, Moon, Sun, Menu, X, 
  Camera, AlertTriangle, Loader2, RefreshCw, TrendingDown, Box, 
  History, Activity, Edit3, Users, FileSpreadsheet, 
  Upload, CheckCircle2, User as UserIcon, LogOut, ChevronRight,
  Info, Check, Database, ShieldCheck, Settings, Download, Filter,
  Sparkles, BrainCircuit
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
        supabase.from('movements').select('*').order('timestamp', { ascending: false }).limit(100),
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

  // AI Generation Feature
  const handleAIAssistant = async () => {
    if (!formData.name) return alert("Informe o nome do material para gerar insights.");
    setIsSyncing(true);
    const insights = await generateProductInsights(formData.name, formData.department || 'GERAL');
    if (insights) {
      setFormData(prev => ({
        ...prev,
        description: insights.description
      }));
    } else {
      alert("Não foi possível conectar ao assistente de IA no momento.");
    }
    setIsSyncing(false);
  };

  // Unique Departments for Filtering
  const departments = useMemo(() => {
    const deps = new Set(items.map(i => i.department).filter(Boolean));
    return ['TODOS', ...Array.from(deps)].sort();
  }, [items]);

  // Selection Handler
  const toggleItemSelection = (id: string) => {
    setSelectedItemIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // Image Upload Handler
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

  // Save Item (Create/Update)
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
        reason: isNew ? 'Cadastro de novo material' : 'Alteração cadastral'
      });

      setIsItemModalOpen(false);
      setEditingItem(null);
      setFormData({});
      await fetchData(false);
    } catch (err: any) {
      alert("Falha na persistência de dados. Tente novamente.");
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

        setItems(prev => prev.filter(i => i.id !== itemToDelete.id));
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
              reason: 'Exclusão em massa autorizada'
            });
          }
        }
        const { error } = await supabase.from('inventory_items').delete().in('id', selectedItemIds);
        if (error) throw error;

        setItems(prev => prev.filter(i => !selectedItemIds.includes(i.id)));
        setSelectedItemIds([]);
      }
      
      setIsDeleteConfirmOpen(false);
      setItemToDelete(null);
      await fetchData(false);
    } catch (err: any) {
      alert("Não foi possível processar a exclusão.");
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
      alert("Estoque insuficiente para a saída solicitada.");
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
        reason: moveData.reason || (movementType === 'IN' ? 'Entrada Operacional' : 'Saída Operacional')
      });

      setIsMovementModalOpen(false);
      setMoveData({ quantity: 1, reason: '' });
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, current_stock: newStock } : i));
      await fetchData(false);
    } catch (err: any) {
      alert("Falha ao atualizar saldo via Supabase.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExportExcel = () => {
    if (items.length === 0) return alert("Não há dados para exportação.");
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
    XLSX.writeFile(wb, `CONTROLE_AG_ESTOQUE_${new Date().toISOString().split('T')[0]}.xlsx`);
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
          name: (row["Material"] || "NÃO IDENTIFICADO").toString().toUpperCase(),
          department: (row["Setor"] || "PADRÃO").toString().toUpperCase(),
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
        
        alert(`${toUpsert.length} materiais sincronizados.`);
        await fetchData(false);
      } catch (err) {
        alert("Planilha incompatível.");
      } finally {
        setIsSyncing(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const filteredItems = useMemo(() => {
    let result = items;
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      result = result.filter(i => 
        i.name.toLowerCase().includes(s) || 
        i.location.toLowerCase().includes(s) || 
        i.department.toLowerCase().includes(s)
      );
    }
    if (selectedDepartment !== 'TODOS') {
      result = result.filter(i => i.department === selectedDepartment);
    }
    return result;
  }, [items, searchTerm, selectedDepartment]);

  if (isLoading) return (
    <div className="h-screen flex flex-col items-center justify-center bg-white dark:bg-[#020617] transition-colors">
      <Logo className="w-24 h-24 animate-pulse" />
      <div className="mt-10 flex flex-col items-center gap-4">
        <Loader2 className="animate-spin text-brand-600" size={48} />
        <span className="text-[12px] font-black text-slate-500 uppercase tracking-[0.5em]">Inicializando Ecossistema...</span>
      </div>
    </div>
  );

  if (!user) return (
    <div className="h-screen flex items-center justify-center p-6 bg-slate-100 dark:bg-[#020617]">
      <div className="w-full max-w-[400px] p-12 rounded-[3rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl animate-in zoom-in duration-500">
        <div className="flex flex-col items-center mb-12 text-center">
          <Logo className="w-20 h-20 mb-6" />
          <h1 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">CONTROLE AG</h1>
          <p className="text-[11px] font-black text-brand-500 uppercase tracking-[0.4em] mt-3">Segurança e Precisão</p>
        </div>
        <form onSubmit={async (e) => {
          e.preventDefault();
          const badge = (e.target as any).badge.value;
          const { data } = await supabase.from('users').select('*').eq('badge_id', badge).single();
          if (data) {
            setUser({ badgeId: data.badge_id, name: data.name, role: data.role, photoUrl: data.photo_url });
          } else {
            const name = prompt("Matrícula não cadastrada. Digite seu nome completo:");
            if (name) {
              await supabase.from('users').insert({ badge_id: badge, name: name.toUpperCase(), role: 'Colaborador' });
              setUser({ badgeId: badge, name: name.toUpperCase(), role: 'Colaborador' });
            }
          }
        }} className="space-y-5">
          <input name="badge" required placeholder="DIGITE SUA MATRÍCULA" className="w-full py-6 rounded-3xl font-black text-center uppercase outline-none border-2 border-transparent focus:border-brand-500 text-sm bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white transition-all shadow-inner" />
          <button className="w-full py-6 bg-brand-600 text-white font-black rounded-3xl uppercase tracking-widest active:scale-95 transition-all text-xs shadow-2xl shadow-brand-500/40">ACESSAR SISTEMA</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="h-screen flex flex-col lg:flex-row font-sans bg-slate-50 dark:bg-[#020617] text-slate-900 dark:text-white transition-colors duration-500 overflow-hidden">
      
      {/* Sidebar - Design Refinado */}
      <aside className={`fixed lg:static inset-y-0 left-0 w-72 z-50 transform transition-transform duration-500 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex flex-col h-full p-8">
          <div className="flex items-center justify-between mb-12">
            <div className="flex items-center gap-4">
              <Logo className="w-10 h-10" />
              <span className="font-black text-2xl tracking-tighter">AG ESTOQUE</span>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2 text-slate-400 hover:text-red-500"><X size={28}/></button>
          </div>
          
          <nav className="flex-1 space-y-3">
            {[
              { id: AppView.DASHBOARD, icon: LayoutDashboard, label: 'Painel Central' },
              { id: AppView.INVENTORY, icon: Package, label: 'Gestão de Estoque' },
              { id: AppView.MOVEMENTS, icon: History, label: 'Rastreabilidade' },
              { id: AppView.USERS, icon: Users, label: 'Equipe AG' },
              { id: AppView.SETTINGS, icon: Settings, label: 'Configurações' }
            ].map(v => (
              <button 
                key={v.id} 
                onClick={() => { setCurrentView(v.id); setIsSidebarOpen(false); setSelectedItemIds([]); }} 
                className={`w-full flex items-center gap-5 p-5 rounded-3xl font-bold text-[12px] transition-all ${currentView === v.id ? 'bg-brand-600 text-white shadow-2xl shadow-brand-600/30 scale-[1.03]' : 'text-slate-400 hover:bg-brand-500/10 hover:text-brand-500'}`}
              >
                <v.icon size={20} /> {v.label}
              </button>
            ))}
          </nav>

          <div className="mt-auto pt-8 border-t border-slate-200 dark:border-slate-800">
             <div className="p-5 rounded-[2rem] bg-slate-50 dark:bg-slate-950 flex items-center gap-4 border border-slate-200 dark:border-slate-800 shadow-inner">
              <div className="w-12 h-12 rounded-2xl bg-brand-600 flex items-center justify-center overflow-hidden border-2 border-brand-500/30">
                {user.photoUrl ? <img src={user.photoUrl} className="w-full h-full object-cover" /> : <UserIcon className="text-white" size={24}/>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-black text-[12px] truncate uppercase leading-none">{user.name}</p>
                <p className="text-[10px] text-brand-500 font-bold uppercase mt-2 tracking-tighter">{user.role}</p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setDarkMode(!darkMode)} className="flex-1 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex justify-center text-slate-500 hover:text-brand-500 transition-all shadow-sm">
                {darkMode ? <Sun size={22}/> : <Moon size={22}/>}
              </button>
              <button onClick={() => setUser(null)} className="flex-1 p-4 bg-red-500/10 text-red-500 rounded-2xl font-black text-[11px] uppercase hover:bg-red-500 hover:text-white transition-all shadow-sm">SAIR</button>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="h-24 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-10 bg-white/60 dark:bg-[#020617]/60 backdrop-blur-3xl sticky top-0 z-30">
          <div className="flex items-center gap-6">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-3 text-slate-500 hover:text-brand-500"><Menu size={28}/></button>
            <h2 className="font-black text-[12px] uppercase tracking-[0.5em] text-slate-900 dark:text-white opacity-80">{currentView}</h2>
          </div>
          
          <div className="flex gap-4">
            {selectedItemIds.length > 0 && (
              <button onClick={() => { setDeleteTarget('BATCH'); setIsDeleteConfirmOpen(true); }} className="bg-red-500 text-white px-6 py-3 rounded-2xl font-black text-[12px] flex items-center gap-3 shadow-2xl animate-in slide-in-from-top-6 active:scale-95 transition-all">
                <Trash2 size={18}/> EXCLUIR ({selectedItemIds.length})
              </button>
            )}
            {currentView === AppView.INVENTORY && (
              <button onClick={() => { setEditingItem(null); setFormData({}); setIsItemModalOpen(true); }} className="bg-brand-600 text-white px-8 py-4 rounded-[1.5rem] font-black text-[12px] flex items-center gap-4 shadow-2xl active:scale-95 transition-all uppercase tracking-[0.2em]">
                <Plus size={20}/> NOVO MATERIAL
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 lg:p-12 custom-scrollbar">
          <div className="max-w-7xl mx-auto space-y-10">
            
            {/* INVENTORY VIEW */}
            {currentView === AppView.INVENTORY && (
              <div className="space-y-10 animate-in fade-in duration-700">
                <div className="flex flex-col xl:flex-row gap-6">
                  <div className="flex-1 p-5 px-10 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-6 shadow-xl focus-within:border-brand-500 transition-all group">
                    <Search className="text-slate-400 group-focus-within:text-brand-500 transition-colors" size={24}/>
                    <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="PESQUISAR POR NOME, LOCALIZAÇÃO OU SETOR..." className="flex-1 bg-transparent border-none outline-none font-bold text-md uppercase dark:text-white placeholder-slate-500" />
                  </div>
                  
                  <div className="flex items-center gap-4 overflow-x-auto pb-4 xl:pb-0 custom-scrollbar scroll-smooth">
                    <div className="bg-white dark:bg-slate-900 p-2 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-2">
                       <Filter size={20} className="text-brand-500 ml-2" />
                       <span className="text-[10px] font-black uppercase text-slate-400 mr-2 tracking-widest border-r border-slate-100 dark:border-slate-800 pr-4">Setores</span>
                       <div className="flex gap-2">
                        {departments.map(dept => (
                          <button
                            key={dept}
                            onClick={() => setSelectedDepartment(dept)}
                            className={`px-6 py-3 rounded-xl font-black text-[11px] uppercase whitespace-nowrap transition-all border ${selectedDepartment === dept ? 'bg-brand-600 border-brand-600 text-white shadow-xl scale-105' : 'bg-slate-50 dark:bg-slate-950 border-transparent text-slate-500 hover:border-brand-500'}`}
                          >
                            {dept}
                          </button>
                        ))}
                       </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-10">
                  {filteredItems.map(item => {
                    const isSelected = selectedItemIds.includes(item.id);
                    return (
                      <div 
                        key={item.id} 
                        className={`group p-6 rounded-[3rem] border transition-all cursor-pointer relative overflow-hidden ${isSelected ? 'border-brand-500 bg-brand-500/5 dark:bg-brand-500/10 scale-95 shadow-inner' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] hover:border-brand-500/50'}`}
                        onClick={() => toggleItemSelection(item.id)}
                      >
                        <div className="aspect-square bg-slate-50 dark:bg-slate-950/60 rounded-[2.5rem] mb-6 overflow-hidden relative border border-slate-200 dark:border-slate-800/10 shadow-inner group-hover:scale-[1.02] transition-transform">
                          {item.photo_url ? <img src={item.photo_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center opacity-10"><Package size={56}/></div>}
                          <div className="absolute top-5 left-5 bg-slate-900/90 backdrop-blur-xl px-4 py-2 rounded-2xl text-[9px] font-black text-white uppercase border border-white/10 shadow-2xl">{item.location}</div>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setItemToDelete(item); setDeleteTarget('SINGLE'); setIsDeleteConfirmOpen(true); }} 
                            className="absolute top-5 right-5 p-3 bg-red-500 text-white rounded-2xl opacity-0 group-hover:opacity-100 transition-all hover:scale-110 shadow-xl"
                          >
                            <Trash2 size={20}/>
                          </button>
                        </div>
                        
                        <h4 className="font-black text-[14px] uppercase truncate mb-2 text-slate-900 dark:text-white tracking-tight leading-tight">{item.name}</h4>
                        <div className="flex items-center gap-2 mb-6">
                           <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.department}</span>
                           {item.current_stock <= item.min_stock && <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>}
                        </div>
                        
                        <div className="flex items-center justify-between pt-6 border-t border-slate-100 dark:border-slate-800/40">
                          <div className="flex flex-col">
                            <span className={`text-4xl font-black tracking-tighter ${item.current_stock <= item.min_stock ? 'text-red-500 animate-pulse' : 'text-slate-900 dark:text-slate-200'}`}>{item.current_stock}</span>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">ESTOQUE ({item.unit})</span>
                          </div>
                          <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                             <button onClick={() => { setMovementItemId(item.id); setMovementType('IN'); setIsMovementModalOpen(true); }} className="p-4 bg-emerald-500/10 text-emerald-500 rounded-3xl hover:bg-emerald-500 hover:text-white transition-all shadow-sm"><Plus size={22}/></button>
                             <button onClick={() => { setMovementItemId(item.id); setMovementType('OUT'); setIsMovementModalOpen(true); }} className="p-4 bg-orange-500/10 text-orange-500 rounded-3xl hover:bg-orange-500 hover:text-white transition-all shadow-sm"><TrendingDown size={22}/></button>
                             <button onClick={() => { setEditingItem(item); setFormData(item); setIsItemModalOpen(true); }} className="p-4 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-3xl hover:bg-brand-600 hover:text-white transition-all shadow-sm"><Edit3 size={22}/></button>
                          </div>
                        </div>
                        
                        {isSelected && (
                          <div className="absolute inset-0 border-4 border-brand-500 rounded-[3rem] pointer-events-none">
                            <div className="absolute top-6 right-6 bg-brand-500 text-white p-2 rounded-full shadow-2xl">
                              <Check size={16} strokeWidth={4} />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* DASHBOARD VIEW */}
            {currentView === AppView.DASHBOARD && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-10 animate-in slide-in-from-bottom-10 duration-700">
                <div className="p-14 rounded-[4rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl flex flex-col items-center justify-center text-center group relative overflow-hidden transition-all hover:scale-[1.02]">
                  <Box className="text-brand-500 mb-8 transition-transform group-hover:scale-110 relative z-10" size={72}/>
                  <p className="text-[13px] font-black uppercase text-slate-400 tracking-[0.4em] relative z-10">Patrimônio em Estoque</p>
                  <h3 className="text-8xl font-black text-slate-900 dark:text-white mt-4 tracking-tighter relative z-10">{items.length}</h3>
                  <div className="absolute top-0 right-0 p-12 opacity-[0.03] text-brand-500 pointer-events-none">
                    <Package size={240} />
                  </div>
                </div>
                <div className="p-14 rounded-[4rem] border border-red-100 dark:border-red-900/30 bg-red-50/50 dark:bg-red-500/5 shadow-2xl flex flex-col items-center justify-center text-center group relative overflow-hidden transition-all hover:scale-[1.02]">
                  <AlertTriangle className="text-red-500 mb-8 transition-transform group-hover:animate-bounce relative z-10" size={72}/>
                  <p className="text-[13px] font-black uppercase text-red-500 tracking-[0.4em] relative z-10">Níveis de Alerta</p>
                  <h3 className="text-8xl font-black text-red-600 mt-4 tracking-tighter relative z-10">{items.filter(i => i.current_stock <= i.min_stock).length}</h3>
                  <div className="absolute top-0 right-0 p-12 opacity-[0.03] text-red-500 pointer-events-none">
                    <AlertTriangle size={240} />
                  </div>
                </div>
                <div className="p-14 rounded-[4rem] border border-emerald-100 dark:border-emerald-900/30 bg-emerald-50/50 dark:bg-emerald-500/5 shadow-2xl flex flex-col items-center justify-center text-center group relative overflow-hidden transition-all hover:scale-[1.02]">
                  <Activity className="text-emerald-500 mb-8 transition-transform group-hover:rotate-12 relative z-10" size={72}/>
                  <p className="text-[13px] font-black uppercase text-emerald-500 tracking-[0.4em] relative z-10">Auditorias Recentes</p>
                  <h3 className="text-8xl font-black text-emerald-600 mt-4 tracking-tighter relative z-10">{movements.length}</h3>
                  <div className="absolute top-0 right-0 p-12 opacity-[0.03] text-emerald-500 pointer-events-none">
                    <History size={240} />
                  </div>
                </div>
              </div>
            )}

            {/* TEAM VIEW (EQUIPE) */}
            {currentView === AppView.USERS && (
              <div className="max-w-5xl mx-auto space-y-10 animate-in slide-in-from-bottom-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex flex-col">
                    <h3 className="text-xl font-black uppercase tracking-[0.3em] flex items-center gap-4"><Users size={28} className="text-brand-500"/> Equipe Registrada</h3>
                    <p className="text-[11px] text-slate-400 font-bold uppercase mt-2">Colaboradores autorizados no sistema AG</p>
                  </div>
                  <button onClick={() => { setEditingUser(null); setUserFormData({ badge_id: '', name: '', role: '', photo_url: '' }); setIsUserEditModalOpen(true); }} className="bg-brand-600 text-white px-8 py-4 rounded-[1.5rem] text-[12px] font-black uppercase shadow-2xl active:scale-95 transition-all flex items-center gap-3">
                    <Plus size={20}/> Novo Integrante
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-6">
                  {allUsers.map(u => (
                    <div key={u.badge_id} className="p-8 rounded-[3rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 flex items-center gap-8 hover:border-brand-500 transition-all group shadow-sm relative overflow-hidden">
                      <div className="w-24 h-24 rounded-[2.2rem] bg-brand-600/10 flex items-center justify-center overflow-hidden border-2 border-brand-500/20 shadow-inner group-hover:scale-110 transition-transform relative z-10">
                        {u.photo_url ? <img src={u.photo_url} className="w-full h-full object-cover" /> : <UserIcon className="text-brand-500" size={36}/>}
                      </div>
                      <div className="min-w-0 flex-1 relative z-10">
                        <p className="font-black text-lg uppercase truncate text-slate-900 dark:text-white leading-tight">{u.name}</p>
                        <div className="flex items-center gap-3 mt-3">
                          <span className="bg-brand-600/10 text-brand-600 px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest">{u.role}</span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Matrícula: {u.badge_id}</span>
                        </div>
                      </div>
                      <ChevronRight size={24} className="text-slate-200 group-hover:text-brand-500 transition-colors relative z-10" />
                      <div className="absolute right-0 bottom-0 p-8 opacity-[0.02] text-brand-500 pointer-events-none">
                        <ShieldCheck size={120} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SETTINGS VIEW */}
            {currentView === AppView.SETTINGS && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10 animate-in slide-in-from-bottom-8">
                <div className="p-12 rounded-[4rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl relative overflow-hidden">
                  <div className="flex items-center gap-5 mb-10">
                    <Database className="text-brand-500" size={32} />
                    <h3 className="text-md font-black uppercase tracking-[0.3em]">Integridade de Dados</h3>
                  </div>
                  <div className="space-y-6">
                    <div className="flex justify-between items-center p-8 rounded-[2rem] bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 shadow-inner">
                      <div className="flex flex-col gap-1">
                        <span className="text-[12px] font-black text-slate-500 uppercase tracking-widest leading-none">Status Supabase</span>
                        <span className="text-[10px] text-slate-400 font-bold uppercase">Conexão em Tempo Real</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className={`w-4 h-4 rounded-full ${connStatus === 'online' ? 'bg-emerald-500 animate-pulse shadow-[0_0_20px_rgba(16,185,129,0.6)]' : 'bg-red-500'}`} />
                        <span className={`text-[12px] font-black uppercase ${connStatus === 'online' ? 'text-emerald-500' : 'text-red-500'}`}>{connStatus === 'online' ? 'Operacional' : 'Offline'}</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center p-8 rounded-[2rem] bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 shadow-inner">
                      <div className="flex flex-col gap-1">
                        <span className="text-[12px] font-black text-slate-500 uppercase tracking-widest leading-none">Sincronismo</span>
                        <span className="text-[10px] text-slate-400 font-bold uppercase">Último Checkpoint</span>
                      </div>
                      <span className="text-[12px] font-black uppercase text-slate-900 dark:text-white">{lastSync ? lastSync.toLocaleString() : 'Pendente'}</span>
                    </div>
                    <button onClick={() => fetchData(true)} className="w-full py-6 bg-brand-600/10 text-brand-600 font-black rounded-3xl uppercase text-[11px] transition-all hover:bg-brand-600 hover:text-white active:scale-95 flex items-center justify-center gap-5 border-2 border-brand-500/20 shadow-sm">
                       <RefreshCw size={22} className={isSyncing ? "animate-spin" : ""} /> FORÇAR SINCRONIZAÇÃO COMPLETA
                    </button>
                  </div>
                  <div className="absolute -right-16 -bottom-16 text-brand-500/5 rotate-12 pointer-events-none"><ShieldCheck size={300}/></div>
                </div>

                <div className="p-12 rounded-[4rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl flex flex-col justify-center items-center text-center group">
                   <div className="w-28 h-28 rounded-full bg-brand-600/10 flex items-center justify-center mb-10 shadow-inner group-hover:scale-110 transition-transform">
                      <Settings className="text-brand-500 animate-[spin_12s_linear_infinite]" size={56} />
                   </div>
                   <h3 className="text-md font-black uppercase tracking-[0.5em] mb-4">Experiência Visual</h3>
                   <p className="text-[12px] text-slate-500 uppercase font-bold max-w-[280px] mb-12 leading-relaxed opacity-70">Ajuste o contraste da interface para melhor ergonomia visual.</p>
                   <button onClick={() => setDarkMode(!darkMode)} className="flex items-center gap-5 px-12 py-6 rounded-[2.5rem] bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black uppercase text-[12px] shadow-2xl transition-all active:scale-90 hover:shadow-brand-500/20">
                      {darkMode ? <Sun size={24}/> : <Moon size={24}/>}
                      {darkMode ? 'MUDAR PARA INTERFACE CLARA' : 'MUDAR PARA INTERFACE ESCURA'}
                   </button>
                </div>
              </div>
            )}

            {/* HISTORY VIEW */}
            {currentView === AppView.MOVEMENTS && (
               <div className="space-y-4 max-w-5xl mx-auto animate-in slide-in-from-bottom-8">
                 {movements.map(m => (
                   <div key={m.id} className="p-8 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 flex items-center justify-between hover:bg-white dark:hover:bg-slate-900 transition-all shadow-sm group border-l-8 border-l-transparent hover:border-l-brand-500">
                     <div className="flex gap-8 items-center">
                       <div className={`p-5 rounded-3xl shadow-inner ${m.type === 'IN' ? 'bg-emerald-500/20 text-emerald-500' : m.type === 'OUT' ? 'bg-orange-500/20 text-orange-500' : m.type === 'DELETE' ? 'bg-red-500/20 text-red-500' : 'bg-brand-500/20 text-brand-500'}`}>
                          {m.type === 'IN' ? <Plus size={28}/> : m.type === 'OUT' ? <TrendingDown size={28}/> : m.type === 'DELETE' ? <Trash2 size={28}/> : <Edit3 size={28}/>}
                       </div>
                       <div>
                         <p className="font-black text-md uppercase text-slate-900 dark:text-white tracking-tight">{m.item_name}</p>
                         <p className="text-[11px] text-slate-500 uppercase font-bold mt-2.5">{new Date(m.timestamp).toLocaleString()} • <span className="text-brand-500 tracking-widest">{m.user_name}</span></p>
                       </div>
                     </div>
                     <div className="text-right">
                        <p className={`font-black text-3xl tracking-tighter ${m.type === 'IN' ? 'text-emerald-500' : m.type === 'OUT' ? 'text-orange-500' : m.type === 'DELETE' ? 'text-red-500' : 'text-brand-400'}`}>{m.type === 'IN' ? '+' : m.type === 'OUT' ? '-' : ''}{m.quantity}</p>
                        {m.reason && <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mt-2 opacity-50 group-hover:opacity-100 transition-opacity">{m.reason}</p>}
                     </div>
                   </div>
                 ))}
               </div>
            )}
          </div>
        </div>

        {/* Floating Action Menu */}
        {currentView === AppView.INVENTORY && (
           <div className="fixed bottom-14 right-14 flex flex-col gap-6 z-40">
             <button onClick={() => setIsImportHelpOpen(true)} className="w-18 h-18 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center shadow-2xl transition-all active:scale-90 border border-white/10 group relative">
               <Info size={28} className="group-hover:rotate-12 transition-transform"/>
               <span className="absolute right-full mr-6 bg-slate-900 text-white text-[11px] font-black px-5 py-3 rounded-2xl opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap border border-white/10 pointer-events-none translate-x-4 group-hover:translate-x-0 shadow-2xl">REQUISITOS DA PLANILHA</span>
             </button>
             <button onClick={handleExportExcel} className="w-18 h-18 rounded-full bg-brand-600 text-white flex items-center justify-center shadow-2xl transition-all active:scale-90 group relative">
               <Download size={30}/>
               <span className="absolute right-full mr-6 bg-brand-600 text-white text-[11px] font-black px-5 py-3 rounded-2xl opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap pointer-events-none translate-x-4 group-hover:translate-x-0 shadow-2xl">GERAR RELATÓRIO EXCEL</span>
             </button>
             <label className="w-18 h-18 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-2xl transition-all active:scale-90 cursor-pointer group relative">
                <Upload size={30}/>
                <span className="absolute right-full mr-6 bg-emerald-600 text-white text-[11px] font-black px-5 py-3 rounded-2xl opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap pointer-events-none translate-x-4 group-hover:translate-x-0 shadow-2xl">IMPORTAR DADOS EM LOTE</span>
                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImportExcel} />
             </label>
           </div>
        )}
      </main>

      {/* MODAL MOVIMENTAÇÃO */}
      {isMovementModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/95 backdrop-blur-3xl animate-in fade-in duration-300">
           <div className="rounded-[4.5rem] w-full max-w-[380px] overflow-hidden border border-white/10 bg-white dark:bg-slate-900 shadow-2xl transform animate-in zoom-in-95">
              <div className={`p-12 text-center ${movementType === 'IN' ? 'bg-emerald-600 shadow-[0_20px_50px_rgba(16,185,129,0.5)]' : 'bg-orange-600 shadow-[0_20px_50px_rgba(234,88,12,0.5)]'} text-white`}>
                 <h3 className="text-5xl font-black uppercase tracking-[0.2em]">{movementType === 'IN' ? 'Entrada' : 'Saída'}</h3>
                 <p className="text-[11px] mt-6 font-black uppercase opacity-80 tracking-widest line-clamp-2 px-8 leading-relaxed border-t border-white/20 pt-6">{items.find(i => i.id === movementItemId)?.name}</p>
              </div>
              <form onSubmit={handleMovement} className="p-12 space-y-10 text-center">
                 <div className="space-y-4">
                   <label className="text-[12px] font-black text-slate-400 uppercase tracking-[0.5em]">Volume da Operação</label>
                   <input type="number" min="1" required autoFocus className="w-full text-8xl font-black text-center p-10 rounded-[3rem] outline-none bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white border-2 border-transparent focus:border-brand-500 transition-all shadow-inner" value={moveData.quantity} onChange={e => setMoveData({...moveData, quantity: Number(e.target.value)})} />
                 </div>
                 <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Referência / Justificativa</label>
                    <input placeholder="NF, REQUISIÇÃO, NOME CLIENTE..." className="w-full p-6 rounded-3xl text-center uppercase text-[12px] bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none font-bold border border-transparent focus:border-brand-500 transition-all shadow-inner" value={moveData.reason} onChange={e => setMoveData({...moveData, reason: e.target.value})} />
                 </div>
                 <button type="submit" disabled={isSyncing} className={`w-full py-7 text-white font-black rounded-[2.5rem] uppercase text-xs shadow-2xl active:scale-95 transition-all ${movementType === 'IN' ? 'bg-emerald-600 shadow-emerald-500/50' : 'bg-orange-600 shadow-orange-500/50'}`}>
                   {isSyncing ? <Loader2 className="animate-spin m-auto" size={28}/> : 'REGISTRAR AGORA'}
                 </button>
                 <button type="button" onClick={() => setIsMovementModalOpen(false)} className="w-full text-[11px] font-black text-slate-400 uppercase tracking-[0.6em] hover:text-red-500 transition-colors">IGNORAR</button>
              </form>
           </div>
        </div>
      )}

      {/* ITEM MODAL (CADASTRO COM IA) */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in zoom-in duration-300">
          <div className="rounded-[4rem] w-full max-w-lg max-h-[96vh] overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl">
            <div className="p-12 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center px-14">
              <h3 className="text-sm font-black uppercase tracking-[0.4em] text-brand-600">{editingItem ? 'Editando Material' : 'Cadastro de Inventário'}</h3>
              <button onClick={() => setIsItemModalOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors"><X size={42} /></button>
            </div>
            <form onSubmit={handleSaveItem} className="p-14 space-y-12 overflow-y-auto custom-scrollbar">
               <div className="flex flex-col items-center gap-10">
                  <div className="w-44 h-44 rounded-[4rem] bg-slate-50 dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 overflow-hidden relative group shadow-inner">
                    {formData.photo_url ? <img src={formData.photo_url} className="w-full h-full object-cover" /> : <Package size={72} className="m-auto mt-16 opacity-10" />}
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="absolute inset-0 bg-brand-600/90 flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all backdrop-blur-sm"><Camera size={40}/><span className="text-[12px] font-black mt-4">FOTOGRAFAR</span></button>
                  </div>
                  <input type="file" accept="image/*" capture="environment" ref={fileInputRef} className="hidden" onChange={(e) => handlePhotoUpload(e, 'item')} />
                  <div className="w-full space-y-4">
                    <label className="text-[12px] font-black text-slate-400 uppercase tracking-[0.3em] ml-2">Denominação do Material</label>
                    <div className="relative">
                      <input required className="w-full p-8 rounded-[2rem] font-black text-center uppercase outline-none focus:border-brand-500 border-2 border-transparent text-md bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white transition-all shadow-inner pr-20" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="NOME TÉCNICO" />
                      <button type="button" onClick={handleAIAssistant} className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-brand-500 text-white rounded-2xl shadow-lg hover:scale-110 active:scale-95 transition-all group" title="Gerar com IA">
                        <BrainCircuit size={24} className="group-hover:rotate-12 transition-transform"/>
                      </button>
                    </div>
                  </div>
               </div>
               
               <div className="space-y-4">
                  <label className="text-[12px] font-black text-slate-400 uppercase tracking-[0.3em] ml-2">Descrição / Notas de IA</label>
                  <textarea className="w-full p-8 rounded-[2rem] font-bold text-center uppercase text-[12px] bg-slate-50 dark:bg-slate-950 shadow-inner border-2 border-transparent focus:border-brand-500 outline-none h-32 custom-scrollbar resize-none" value={formData.description || ''} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="INSIGHTS SOBRE O MATERIAL..." />
               </div>

               <div className="grid grid-cols-2 gap-10">
                  <div className="space-y-3">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Setor</label>
                    <input className="w-full p-7 rounded-[1.8rem] font-bold text-center uppercase text-[13px] bg-slate-50 dark:bg-slate-950/50 outline-none focus:border-brand-500 border-2 border-transparent transition-all shadow-inner" value={formData.department || ''} onChange={e => setFormData({...formData, department: e.target.value})} placeholder="EX: PRODUÇÃO" />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Localização</label>
                    <input className="w-full p-7 rounded-[1.8rem] font-bold text-center uppercase text-[13px] bg-slate-50 dark:bg-slate-950/50 outline-none focus:border-brand-500 border-2 border-transparent transition-all shadow-inner" value={formData.location || ''} onChange={e => setFormData({...formData, location: e.target.value})} placeholder="EX: BOX-05" />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Unid. Medida</label>
                    <input className="w-full p-7 rounded-[1.8rem] font-bold text-center uppercase text-[13px] bg-slate-50 dark:bg-slate-950/50 outline-none focus:border-brand-500 border-2 border-transparent transition-all shadow-inner" value={formData.unit || 'UND'} onChange={e => setFormData({...formData, unit: e.target.value})} placeholder="EX: KG, PC" />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Limite Crítico</label>
                    <input type="number" className="w-full p-7 rounded-[1.8rem] font-black text-center text-md bg-slate-50 dark:bg-slate-950/50 outline-none focus:border-brand-500 border-2 border-transparent transition-all shadow-inner" value={formData.min_stock || 0} onChange={e => setFormData({...formData, min_stock: Number(e.target.value)})} />
                  </div>
               </div>
               {!editingItem && (
                 <div className="space-y-4">
                    <label className="text-[12px] font-black text-slate-400 uppercase tracking-[0.3em] ml-2">Saldo Inicial de Auditoria</label>
                    <input type="number" className="w-full p-8 rounded-[2rem] font-black text-center text-3xl bg-brand-500/5 dark:bg-brand-500/10 border-2 border-brand-500/30 outline-none focus:border-brand-500 transition-all shadow-inner" value={formData.current_stock || 0} onChange={e => setFormData({...formData, current_stock: Number(e.target.value)})} />
                 </div>
               )}
               <button type="submit" disabled={isSyncing} className="w-full py-8 bg-brand-600 text-white rounded-[2.5rem] font-black uppercase text-xs shadow-2xl hover:bg-brand-700 active:scale-95 transition-all flex items-center justify-center gap-6">
                 {isSyncing ? <Loader2 className="animate-spin" size={32}/> : <CheckCircle2 size={32}/>}
                 {editingItem ? 'CONCLUIR ATUALIZAÇÃO' : 'FINALIZAR CADASTRO NO BANCO'}
               </button>
            </form>
          </div>
        </div>
      )}

      {/* DELETE MODAL */}
      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-8 bg-black/95 backdrop-blur-3xl animate-in fade-in">
           <div className="rounded-[4.5rem] w-full max-w-[420px] p-16 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl text-center scale-in-center">
              <div className="w-32 h-32 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-12 animate-pulse shadow-[0_0_60px_rgba(239,68,68,0.3)] border-2 border-red-500/20">
                <Trash2 size={56} />
              </div>
              <h3 className="text-4xl font-black uppercase tracking-tighter mb-6 text-slate-900 dark:text-white">Ação Terminal</h3>
              <p className="text-[14px] text-slate-500 mb-14 uppercase tracking-[0.1em] font-bold leading-relaxed px-4">
                {deleteTarget === 'SINGLE' 
                  ? `Deseja realmente remover "${itemToDelete?.name}"? Esta ação deletará o material do inventário AG permanentemente.`
                  : `Confirma a remoção definitiva dos ${selectedItemIds.length} materiais selecionados?`}
              </p>
              <div className="space-y-6">
                <button onClick={executeDelete} disabled={isSyncing} className="w-full py-7 bg-red-600 text-white font-black rounded-[2.5rem] uppercase text-xs shadow-2xl active:scale-95 transition-all">
                  {isSyncing ? <Loader2 className="animate-spin m-auto" /> : 'SIM, EXCLUIR DEFINITIVAMENTE'}
                </button>
                <button onClick={() => setIsDeleteConfirmOpen(false)} className="w-full py-5 text-slate-400 font-black rounded-[2.5rem] uppercase text-[12px] tracking-[0.3em] hover:text-slate-900 dark:hover:text-white transition-colors">ABORTAR</button>
              </div>
           </div>
        </div>
      )}

      {/* IMPORT HELP MODAL */}
      {isImportHelpOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-8 bg-black/80 backdrop-blur-3xl animate-in fade-in duration-300">
          <div className="rounded-[4.5rem] w-full max-w-sm p-14 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl text-center">
            <h3 className="text-3xl font-black uppercase tracking-tighter mb-10 text-slate-900 dark:text-white">Estrutura Excel</h3>
            <p className="text-[13px] text-slate-500 mb-12 uppercase tracking-widest leading-relaxed font-bold opacity-70">Cabeçalho mandatório (Linha 1):</p>
            <div className="grid grid-cols-1 gap-3 mb-14">
              {["Material", "Setor", "Localizacao", "Saldo", "EstoqueMin", "Unidade", "Descricao"].map(col => (
                <div key={col} className="p-5 rounded-3xl flex items-center justify-between font-black uppercase text-[12px] tracking-widest border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 shadow-sm">
                  {col} <CheckCircle2 size={24} className="text-emerald-500" />
                </div>
              ))}
            </div>
            <button onClick={() => setIsImportHelpOpen(false)} className="w-full py-7 bg-brand-600 text-white font-black rounded-[2rem] uppercase text-xs shadow-2xl active:scale-95 transition-all">ENTENDIDO</button>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #3b82f6; border-radius: 20px; border: 2px solid transparent; background-clip: padding-box; opacity: 0.1; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #2563eb; }
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
        @keyframes scale-in-center { 0% { transform: scale(0); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
        .scale-in-center { animation: scale-in-center 0.5s cubic-bezier(0.250, 0.460, 0.450, 0.940) both; }
        * { transition-property: background-color, border-color, color, transform, box-shadow, filter; transition-duration: 300ms; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); }
      `}</style>
    </div>
  );
}
