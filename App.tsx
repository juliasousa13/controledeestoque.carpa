import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  Package, 
  ArrowRightLeft, 
  Settings, 
  Plus, 
  Search, 
  Trash2, 
  Edit, 
  Moon, 
  Sun, 
  LogOut, 
  Upload, 
  Download, 
  Menu,
  X,
  UserCheck,
  Camera,
  AlertTriangle,
  Sparkles,
  List as ListIcon,
  Grid as GridIcon,
  CheckSquare,
  Square,
  UserPlus,
  AlertCircle,
  HelpCircle,
  Loader2,
  Wifi,
  WifiOff,
  Database
} from 'lucide-react';
import { InventoryItem, MovementLog, UserSession, AppView, UserProfile } from './types';
import { Logo } from './components/Logo';
import { generateProductDescription } from './services/geminiService';
import { supabase } from './services/supabaseClient';

// --- Helper Functions for Excel/CSV ---
const exportToExcel = (items: InventoryItem[], movements: MovementLog[]) => {
  const BOM = "\uFEFF"; 
  
  // INVENTÁRIO ATUAL
  const headerInv = ['ID;Nome;Unidade;Estoque Atual;Estoque Min;Local;Depto;Descricao;Atualizado Em;Ultimo Responsavel'];
  
  const rowsInv = items.map(item => [
    item.id,
    `"${item.name.replace(/"/g, '""')}"`,
    item.unit,
    item.currentStock,
    item.minStock,
    `"${item.location}"`,
    `"${item.department}"`,
    `"${(item.description || '').replace(/"/g, '""')}"`,
    new Date(item.lastUpdated).toLocaleString('pt-BR'),
    `"${item.lastUpdatedBy || ''}"`
  ].join(';'));

  const csvContent = BOM + headerInv.join('') + '\n' + rowsInv.join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', `estoque_carpa_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// --- Main Component ---
export default function App() {
  // -- State --
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [user, setUser] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  
  // Data
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<MovementLog[]>([]);
  const [registeredUsers, setRegisteredUsers] = useState<UserProfile[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  
  // Login State
  const [badgeInput, setBadgeInput] = useState('');
  const [nameInput, setNameInput] = useState(''); 
  const [isRegistering, setIsRegistering] = useState(false);
  const [showWelcomeToast, setShowWelcomeToast] = useState(false);
  
  // Inventory UI State
  const [viewMode, setViewMode] = useState<'GRID' | 'LIST'>('LIST'); 
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [showLowStockOnly, setShowLowStockOnly] = useState(false); 
  
  // Modal States
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [movementType, setMovementType] = useState<'IN' | 'OUT'>('IN');
  const [movementItemId, setMovementItemId] = useState<string>('');
  const [isImportHelpOpen, setIsImportHelpOpen] = useState(false);
  
  // Delete Confirmation State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemsToDelete, setItemsToDelete] = useState<string[]>([]);
  
  // Sidebar Mobile
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Form States
  const [formData, setFormData] = useState<Partial<InventoryItem>>({});
  const [moveData, setMoveData] = useState({ quantity: 1, reason: '' });
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);

  // -- Supabase Data Mapping Helpers --
  const mapItemFromDB = (dbItem: any): InventoryItem => ({
    id: dbItem.id,
    name: dbItem.name,
    unit: dbItem.unit,
    minStock: Number(dbItem.min_stock),
    currentStock: Number(dbItem.current_stock),
    location: dbItem.location,
    department: dbItem.department,
    photoUrl: dbItem.photo_url,
    description: dbItem.description,
    lastUpdated: dbItem.last_updated,
    lastUpdatedBy: dbItem.last_updated_by
  });

  const mapItemToDB = (item: InventoryItem) => ({
    id: item.id,
    name: item.name,
    unit: item.unit,
    min_stock: item.minStock,
    current_stock: item.currentStock,
    location: item.location,
    department: item.department,
    photo_url: item.photoUrl,
    description: item.description,
    last_updated: item.lastUpdated,
    last_updated_by: item.lastUpdatedBy
  });

  // -- Initial Load & Realtime --
  useEffect(() => {
    const savedTheme = localStorage.getItem('carpa_theme');
    if (savedTheme === 'dark') setDarkMode(true);
    
    fetchData();

    // Subscribe to Realtime changes
    const channel = supabase.channel('db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' }, () => fetchItems())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'movements' }, () => fetchMovements())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => fetchUsers())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'departments' }, () => fetchDepartments())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('carpa_theme', darkMode ? 'dark' : 'light');
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // -- Fetch Functions --
  const fetchData = async () => {
    setIsLoading(true);
    try {
      await Promise.all([fetchItems(), fetchMovements(), fetchUsers(), fetchDepartments()]);
      setIsConnected(true);
    } catch (error) {
      console.error("Erro de conexão inicial:", error);
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchItems = async () => {
    const { data, error } = await supabase.from('inventory_items').select('*').order('name');
    if (error) throw error;
    if (data) setItems(data.map(mapItemFromDB));
  };

  const fetchMovements = async () => {
    const { data } = await supabase.from('movements').select('*').order('timestamp', { ascending: false });
    if (data) {
      setMovements(data.map(m => ({
        id: m.id,
        itemId: m.item_id,
        itemName: m.item_name,
        type: m.type as 'IN' | 'OUT',
        quantity: Number(m.quantity),
        userBadgeId: m.user_badge_id,
        userName: m.user_name,
        timestamp: m.timestamp,
        reason: m.reason
      })));
    }
  };

  const fetchUsers = async () => {
    const { data } = await supabase.from('users').select('*');
    if (data) {
      setRegisteredUsers(data.map(u => ({
        badgeId: u.badge_id,
        name: u.name,
        role: u.role as 'admin' | 'staff',
        createdAt: u.created_at
      })));
    }
  };

  const fetchDepartments = async () => {
    const { data } = await supabase.from('departments').select('name').order('name');
    if (data) setDepartments(data.map(d => d.name));
    else setDepartments(['Geral']);
  };

  // -- Computed --
  const lowStockItems = useMemo(() => {
    return items.filter(i => i.currentStock <= i.minStock);
  }, [items]);

  const filteredItems = useMemo(() => {
    let result = items;
    if (searchTerm) {
      const lowerTerm = searchTerm.toLowerCase().trim();
      result = result.filter(item => {
        const name = item.name?.toLowerCase() || '';
        const dept = item.department?.toLowerCase() || '';
        const loc = item.location?.toLowerCase() || '';
        const id = item.id?.toLowerCase() || '';
        return name.includes(lowerTerm) || dept.includes(lowerTerm) || loc.includes(lowerTerm) || id.includes(lowerTerm);
      });
    }
    if (showLowStockOnly) {
      result = result.filter(item => item.currentStock <= item.minStock);
    }
    return result;
  }, [items, searchTerm, showLowStockOnly]);

  // -- Actions --

  const checkBadge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (badgeInput.trim().length < 2) {
      alert("Matrícula muito curta.");
      return;
    }
    const existingUser = registeredUsers.find(u => u.badgeId === badgeInput);
    if (existingUser) {
      loginUser({ badgeId: existingUser.badgeId, name: existingUser.name, role: existingUser.role });
      setBadgeInput('');
    } else {
      setIsRegistering(true);
    }
  };

  const loginUser = (session: UserSession) => {
    setUser(session);
    setShowWelcomeToast(true);
    setTimeout(() => setShowWelcomeToast(false), 5000);
  };

  const handleRegisterAndLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) return;

    const newUser = {
      badge_id: badgeInput,
      name: nameInput,
      role: 'staff',
      created_at: new Date().toISOString()
    };

    const { error } = await supabase.from('users').insert(newUser);
    if (error) {
      alert("Erro ao cadastrar usuário: " + error.message);
      return;
    }

    // Local update handled by realtime subscription
    loginUser({ badgeId: newUser.badge_id, name: newUser.name, role: 'staff' });
    setBadgeInput('');
    setNameInput('');
    setIsRegistering(false);
  };

  const handleLogout = () => {
    setUser(null);
    setBadgeInput('');
    setNameInput('');
    setIsRegistering(false);
    setShowWelcomeToast(false);
    setCurrentView(AppView.DASHBOARD);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, photoUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAIAutoFill = async () => {
    if (!formData.name || !formData.department) {
      alert("Preencha o nome e o departamento para gerar uma descrição.");
      return;
    }
    setIsGeneratingDesc(true);
    const desc = await generateProductDescription(formData.name, formData.department);
    setFormData(prev => ({ ...prev, description: desc }));
    setIsGeneratingDesc(false);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;

    const newItem: InventoryItem = {
      id: editingItem ? editingItem.id : Date.now().toString(),
      name: formData.name || '',
      unit: formData.unit || 'Unid',
      minStock: Number(formData.minStock) || 0,
      currentStock: Number(formData.currentStock) || 0,
      location: formData.location || 'Geral',
      department: formData.department || 'Geral',
      photoUrl: formData.photoUrl,
      description: formData.description,
      lastUpdated: new Date().toISOString(),
      lastUpdatedBy: user?.name
    };

    const { error } = await supabase.from('inventory_items').upsert(mapItemToDB(newItem));
    if (error) {
      alert('Erro ao salvar item: ' + error.message);
      return;
    }
    
    closeItemModal();
  };

  const promptDeleteSingle = (id: string) => {
    setItemsToDelete([id]);
    setIsDeleteModalOpen(true);
  };

  const promptDeleteBulk = () => {
    if (selectedItems.size === 0) {
      alert("Nenhum item selecionado.");
      return;
    }
    setItemsToDelete(Array.from(selectedItems));
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    const { error } = await supabase.from('inventory_items').delete().in('id', itemsToDelete);
    
    if (error) {
      alert("Erro ao excluir itens: " + error.message);
    } else {
       // Clear local selection
       const newSelected = new Set(selectedItems);
       itemsToDelete.forEach(id => newSelected.delete(id));
       setSelectedItems(newSelected);
       if (editingItem && itemsToDelete.includes(editingItem.id)) {
        closeItemModal();
      }
    }
    setIsDeleteModalOpen(false);
    setItemsToDelete([]);
  };

  const handleStockMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    const item = items.find(i => i.id === movementItemId);
    if (!item) return;

    const qty = Number(moveData.quantity);
    if (movementType === 'OUT' && item.currentStock < qty) {
      alert('Estoque insuficiente para esta saída.');
      return;
    }

    const newStock = movementType === 'IN' ? item.currentStock + qty : item.currentStock - qty;

    // 1. Update Item
    const { error: itemError } = await supabase.from('inventory_items').update({
      current_stock: newStock,
      last_updated: new Date().toISOString(),
      last_updated_by: user?.name
    }).eq('id', item.id);

    if (itemError) {
      alert("Erro ao atualizar estoque: " + itemError.message);
      return;
    }

    // 2. Log Movement
    const log = {
      id: Date.now().toString(),
      item_id: item.id,
      item_name: item.name,
      type: movementType,
      quantity: qty,
      user_badge_id: user?.badgeId || 'Unknown',
      user_name: user?.name || 'Desconhecido',
      timestamp: new Date().toISOString(),
      reason: moveData.reason || ''
    };

    await supabase.from('movements').insert(log);

    setIsMovementModalOpen(false);
    setMoveData({ quantity: 1, reason: '' });
  };

  const importCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n');
      if (lines.length < 2) return;

      let count = 0;
      const newItemsDB: any[] = [];

      lines.slice(1).forEach(line => {
        if (!line.trim()) return;
        const cols = line.split(';');
        if (cols.length >= 2) {
           const dbItem = {
             id: cols[0]?.trim() || Date.now().toString() + Math.random(),
             name: cols[1]?.replace(/"/g, '')?.trim() || 'Item Importado',
             unit: cols[2]?.trim() || 'Unid',
             current_stock: Number(cols[3]) || 0,
             min_stock: Number(cols[4]) || 0,
             location: cols[5]?.replace(/"/g, '')?.trim() || 'Geral',
             department: cols[6]?.replace(/"/g, '')?.trim() || 'Geral',
             description: cols[7]?.replace(/"/g, '')?.trim() || '',
             last_updated: new Date().toISOString(),
             last_updated_by: user?.name || 'Importação'
           };
           newItemsDB.push(dbItem);
           count++;
        }
      });
      
      if (count > 0) {
        const { error } = await supabase.from('inventory_items').upsert(newItemsDB);
        if (error) alert("Erro na importação: " + error.message);
        else alert(`${count} itens importados com sucesso!`);
      } else {
        alert("Não foi possível ler o formato do arquivo.");
      }
    };
    reader.readAsText(file);
    e.target.value = ''; 
  };

  const addDepartment = async (name: string) => {
    if (!name.trim()) return;
    const { error } = await supabase.from('departments').insert({ name: name.trim() });
    if (error && error.code !== '23505') { // Ignore unique constraint error
        alert("Erro ao adicionar departamento");
    }
  };
  
  const removeDept = async (name: string) => {
      if(window.confirm(`Remover departamento "${name}"?`)) {
          const { error } = await supabase.from('departments').delete().eq('name', name);
          if(error) alert("Erro ao remover: " + error.message);
      }
  };

  // -- Render Helpers --
  const closeItemModal = () => {
    setIsItemModalOpen(false);
    setEditingItem(null);
    setFormData({});
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedItems);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedItems(newSet);
  };

  const selectAll = () => {
    if (selectedItems.size === filteredItems.length && filteredItems.length > 0) {
      setSelectedItems(new Set());
    } else {
      const newSet = new Set<string>();
      filteredItems.forEach(item => newSet.add(item.id));
      setSelectedItems(newSet);
    }
  };

  // --- Views ---

  const SettingsView = () => {
     const [newD, setNewD] = useState('');
     const handleAdd = () => { if(newD) { addDepartment(newD); setNewD(''); }};

     return (
        <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
            
            {/* System Status Card */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
               <h3 className="text-xl font-bold mb-4 text-slate-900 dark:text-white flex items-center gap-2">
                    <Database className="w-6 h-6" /> Status do Sistema
               </h3>
               <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg">
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold ${isConnected ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                      {isConnected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
                      {isConnected ? 'Sistema Online' : 'Sem Conexão / Erro BD'}
                  </div>
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                     {isConnected ? 'Conectado ao banco de dados Supabase.' : 'Verifique sua conexão ou a configuração do Supabase.'}
                  </span>
               </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                <h3 className="text-xl font-bold mb-4 text-slate-900 dark:text-white flex items-center gap-2">
                    <Settings className="w-6 h-6" /> Gestão de Departamentos
                </h3>
                <div className="flex gap-2 mb-6">
                    <input 
                        value={newD}
                        onChange={e => setNewD(e.target.value)}
                        placeholder="Novo departamento..."
                        className="flex-1 px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500 dark:text-white"
                    />
                    <button onClick={handleAdd} className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700">Adicionar</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {departments.map(d => (
                        <div key={d} className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-100 dark:border-slate-700">
                            <span className="font-medium text-slate-700 dark:text-slate-200">{d}</span>
                            <button onClick={() => removeDept(d)} className="text-red-500 hover:text-red-700 p-1"><Trash2 className="w-4 h-4" /></button>
                        </div>
                    ))}
                </div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                <h3 className="text-xl font-bold mb-4 text-slate-900 dark:text-white flex items-center gap-2">
                    <UserPlus className="w-6 h-6" /> Colaboradores Cadastrados
                </h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-700/50">
                             <tr><th className="px-4 py-2">Matrícula</th><th className="px-4 py-2">Nome</th><th className="px-4 py-2">Cadastro</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {registeredUsers.map(u => (
                                <tr key={u.badgeId}>
                                    <td className="px-4 py-2 font-mono text-slate-600 dark:text-slate-300">{u.badgeId}</td>
                                    <td className="px-4 py-2 font-medium text-slate-900 dark:text-white">{u.name}</td>
                                    <td className="px-4 py-2 text-slate-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
     );
  };

  // Same Dashboard, Inventory, and Login views structure as before, 
  // but using the updated state and functions hooked to Supabase.
  
  const DashboardView = () => {
    const totalItems = items.length;
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total de Itens</p>
                <h3 className="text-3xl font-bold text-slate-900 dark:text-white mt-2">{totalItems}</h3>
              </div>
              <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg"><Package className="w-6 h-6 text-brand-600 dark:text-brand-400" /></div>
            </div>
          </div>
          <div 
            className={`bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition ${lowStockItems.length > 0 ? 'ring-2 ring-red-500' : ''}`}
            onClick={() => { setShowLowStockOnly(true); setCurrentView(AppView.INVENTORY); }}
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Estoque Crítico</p>
                <h3 className="text-3xl font-bold text-red-600 mt-2">{lowStockItems.length}</h3>
              </div>
              <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-lg"><AlertTriangle className="w-6 h-6 text-red-600" /></div>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Movimentações (Hoje)</p>
                <h3 className="text-3xl font-bold text-slate-900 dark:text-white mt-2">
                  {movements.filter(m => new Date(m.timestamp).toDateString() === new Date().toDateString()).length}
                </h3>
              </div>
              <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg"><ArrowRightLeft className="w-6 h-6 text-emerald-600 dark:text-emerald-400" /></div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4">Movimentações Recentes</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-700/50 dark:text-slate-400">
                <tr><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Item</th><th className="px-4 py-3">Qtd</th><th className="px-4 py-3">Responsável</th><th className="px-4 py-3">Data/Hora</th></tr>
              </thead>
              <tbody>
                {movements.slice(0, 5).map(m => (
                  <tr key={m.id} className="border-b dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition">
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${m.type === 'IN' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>{m.type === 'IN' ? 'ENTRADA' : 'SAÍDA'}</span>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{m.itemName}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{m.quantity}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{m.userName}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{new Date(m.timestamp).toLocaleString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const InventoryView = () => (
    <div className="space-y-6 animate-fade-in h-full flex flex-col">
      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col md:flex-row gap-4 items-center justify-between sticky top-0 z-20">
        <div className="relative w-full md:w-96">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Search className="h-5 w-5 text-slate-400" /></div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg leading-5 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            placeholder="Buscar nome, locação, ID, depto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
           {showLowStockOnly && (
              <button onClick={() => setShowLowStockOnly(false)} className="flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-sm"><X className="w-4 h-4" /> Ver Todos</button>
           )}
          {selectedItems.size > 0 && (
            <button type="button" onClick={promptDeleteBulk} className="flex items-center justify-center gap-2 bg-red-100 text-red-700 hover:bg-red-200 px-3 py-2 rounded-lg font-medium transition text-sm"><Trash2 className="w-4 h-4" /> Excluir ({selectedItems.size})</button>
          )}
          <div className="h-6 w-px bg-slate-300 dark:bg-slate-600 mx-2 hidden md:block"></div>
          <button onClick={() => setViewMode('LIST')} className={`p-2 rounded-lg transition ${viewMode === 'LIST' ? 'bg-brand-100 text-brand-600' : 'text-slate-500'}`} title="Lista"><ListIcon className="w-5 h-5" /></button>
          <button onClick={() => setViewMode('GRID')} className={`p-2 rounded-lg transition ${viewMode === 'GRID' ? 'bg-brand-100 text-brand-600' : 'text-slate-500'}`} title="Grade"><GridIcon className="w-5 h-5" /></button>
          <div className="h-6 w-px bg-slate-300 dark:bg-slate-600 mx-2 hidden md:block"></div>
          <div className="flex items-center gap-1">
             <label className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg cursor-pointer transition" title="Importar CSV"><Upload className="w-5 h-5" /><input type="file" accept=".csv" className="hidden" onChange={importCSV} /></label>
            <button onClick={() => setIsImportHelpOpen(true)} className="p-1 text-slate-400 hover:text-brand-600 rounded-full transition" title="Ajuda Importação"><HelpCircle className="w-4 h-4" /></button>
          </div>
          <button onClick={() => exportToExcel(items, movements)} className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition" title="Exportar"><Download className="w-5 h-5" /></button>
          <button onClick={() => { setEditingItem(null); setFormData({}); setIsItemModalOpen(true); }} className="flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg font-medium transition text-sm ml-2 shadow-md hover:shadow-lg"><Plus className="w-4 h-4" /> Novo</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 rounded-xl">
        {filteredItems.length === 0 ? (
          <div className="text-center py-20">
            <Package className="w-16 h-16 mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-900 dark:text-white">Nenhum item encontrado</h3>
            <p className="text-slate-500">Tente buscar por outro termo ou adicione um novo item.</p>
            {showLowStockOnly && <button onClick={() => setShowLowStockOnly(false)} className="mt-4 text-brand-600 hover:underline">Ver todo o estoque</button>}
          </div>
        ) : viewMode === 'LIST' ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
             <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 w-10"><button onClick={selectAll} className="text-slate-400 hover:text-brand-500">{selectedItems.size > 0 && selectedItems.size === filteredItems.length ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}</button></th>
                  <th className="px-4 py-3 font-medium">Material</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">Departamento</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">Locação</th>
                  <th className="px-4 py-3 font-medium text-right">Estoque</th>
                  <th className="px-4 py-3 font-medium text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filteredItems.map(item => (
                  <tr key={item.id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/30 ${selectedItems.has(item.id) ? 'bg-blue-50 dark:bg-blue-900/10' : ''}`}>
                    <td className="px-4 py-3"><input type="checkbox" checked={selectedItems.has(item.id)} onChange={() => toggleSelect(item.id)} className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer" /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded bg-slate-100 dark:bg-slate-700 flex-shrink-0 overflow-hidden">
                           {item.photoUrl ? <img src={item.photoUrl} className="w-full h-full object-cover"/> : <Package className="w-5 h-5 m-auto text-slate-400"/>}
                        </div>
                        <div>
                          <div className="font-medium text-slate-900 dark:text-white">{item.name}</div>
                          {item.currentStock <= item.minStock && <span className="text-xs text-red-500 font-bold bg-red-50 dark:bg-red-900/20 px-1 rounded">Estoque Baixo</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 hidden md:table-cell">{item.department}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 hidden sm:table-cell">{item.location}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-bold ${item.currentStock <= item.minStock ? 'text-red-600' : 'text-brand-600 dark:text-brand-400'}`}>{item.currentStock}</span>
                      <span className="text-xs text-slate-400 ml-1">{item.unit}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button type="button" onClick={() => { setMovementItemId(item.id); setMovementType('IN'); setIsMovementModalOpen(true); }} className="p-1.5 hover:bg-emerald-100 text-emerald-600 rounded" title="Entrada"><Plus className="w-4 h-4"/></button>
                        <button type="button" onClick={() => { setMovementItemId(item.id); setMovementType('OUT'); setIsMovementModalOpen(true); }} className="p-1.5 hover:bg-orange-100 text-orange-600 rounded" title="Saída"><ArrowRightLeft className="w-4 h-4"/></button>
                        <button type="button" onClick={() => { setEditingItem(item); setFormData(item); setIsItemModalOpen(true); }} className="p-1.5 hover:bg-slate-100 text-slate-600 rounded" title="Editar"><Edit className="w-4 h-4"/></button>
                        <button type="button" onClick={() => promptDeleteSingle(item.id)} className="p-1.5 hover:bg-red-100 text-red-600 rounded" title="Excluir"><Trash2 className="w-4 h-4"/></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredItems.map(item => (
              <div key={item.id} className={`group relative bg-white dark:bg-slate-800 rounded-xl shadow-sm hover:shadow-md transition border ${selectedItems.has(item.id) ? 'border-brand-500 ring-1 ring-brand-500' : 'border-slate-200 dark:border-slate-700'}`}>
                <div className="absolute top-3 left-3 z-10"><input type="checkbox" checked={selectedItems.has(item.id)} onChange={() => toggleSelect(item.id)} className="w-5 h-5 rounded border-gray-300 text-brand-600 shadow-sm cursor-pointer"/></div>
                <div className="aspect-video w-full bg-slate-100 dark:bg-slate-900 rounded-t-xl overflow-hidden relative">
                  {item.photoUrl ? <img src={item.photoUrl} alt={item.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-400"><Package className="w-12 h-12 opacity-20" /></div>}
                  {item.currentStock <= item.minStock && <div className="absolute top-3 right-3 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded shadow-lg animate-pulse">BAIXO</div>}
                </div>
                <div className="p-4">
                  <div className="flex justify-between items-start mb-2"><div><h4 className="font-bold text-slate-900 dark:text-white line-clamp-1">{item.name}</h4><p className="text-xs text-slate-500 dark:text-slate-400">{item.department} • {item.location}</p></div></div>
                  <div className="flex items-end justify-between mt-4">
                    <div><p className="text-xs text-slate-500">Em estoque</p><p className="text-2xl font-bold text-brand-600 dark:text-brand-400">{item.currentStock} <span className="text-sm font-normal text-slate-400">{item.unit}</span></p></div>
                    <div className="flex gap-1">
                      <button onClick={() => { setMovementItemId(item.id); setMovementType('IN'); setIsMovementModalOpen(true); }} className="p-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg dark:bg-emerald-900/20"><Plus className="w-4 h-4" /></button>
                      <button onClick={() => { setMovementItemId(item.id); setMovementType('OUT'); setIsMovementModalOpen(true); }} className="p-2 bg-orange-50 text-orange-600 hover:bg-orange-100 rounded-lg dark:bg-orange-900/20"><ArrowRightLeft className="w-4 h-4" /></button>
                      <button onClick={() => { setEditingItem(item); setFormData(item); setIsItemModalOpen(true); }} className="p-2 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg dark:bg-slate-700"><Edit className="w-4 h-4" /></button>
                      <button onClick={() => promptDeleteSingle(item.id)} className="p-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg dark:bg-red-900/20"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  if (isLoading) {
    return (
       <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
          <div className="flex flex-col items-center">
             <Loader2 className="w-10 h-10 text-brand-600 animate-spin mb-4" />
             <p className="text-slate-500">Conectando ao banco de dados...</p>
          </div>
       </div>
    );
  }

  if (isConnected === false && !user) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
            <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-xl max-w-md w-full text-center">
                <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Erro de Conexão</h2>
                <p className="text-slate-600 dark:text-slate-300 mb-6">Não foi possível conectar ao Banco de Dados Supabase. Verifique se o SQL foi rodado corretamente ou sua conexão com a internet.</p>
                <button onClick={() => window.location.reload()} className="px-6 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition w-full font-bold">Tentar Novamente</button>
            </div>
          </div>
      )
  }

  if (!user) {
    return (
      <div className={`min-h-screen w-full flex items-center justify-center bg-slate-50 dark:bg-slate-900 transition-colors duration-300 ${darkMode ? 'dark' : ''}`}>
        <div className="w-full max-w-md p-8 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700">
          <div className="flex flex-col items-center mb-8">
            <Logo className="w-20 h-20 text-3xl mb-4 shadow-blue-500/20" />
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Controle de Estoque</h1>
            <p className="text-slate-500 dark:text-slate-400">CARPA Management System</p>
          </div>
          {!isRegistering ? (
            <form onSubmit={checkBadge} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Matrícula do Colaborador</label>
                <div className="relative">
                  <UserCheck className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                  <input type="text" value={badgeInput} onChange={(e) => setBadgeInput(e.target.value)} placeholder="Digite sua matrícula..." className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500 dark:text-white transition" autoFocus />
                </div>
              </div>
              <button type="submit" className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-3 rounded-lg shadow-lg shadow-brand-500/30 transition transform hover:scale-[1.02] active:scale-[0.98]">Acessar Sistema</button>
            </form>
          ) : (
            <form onSubmit={handleRegisterAndLogin} className="space-y-6 animate-fade-in">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg text-sm text-blue-700 dark:text-blue-300 mb-4">Matrícula <strong>{badgeInput}</strong> não encontrada. Por favor, complete seu cadastro inicial.</div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Nome Completo</label>
                <input type="text" value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="Ex: Júlia Sousa" className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500 dark:text-white transition" required autoFocus />
              </div>
              <div className="flex gap-3">
                 <button type="button" onClick={() => setIsRegistering(false)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300 font-bold py-3 rounded-lg transition">Voltar</button>
                <button type="submit" className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-bold py-3 rounded-lg shadow-lg shadow-brand-500/30 transition transform hover:scale-[1.02] active:scale-[0.98]">Cadastrar e Entrar</button>
              </div>
            </form>
          )}
          <div className="mt-8 flex justify-center"><button onClick={() => setDarkMode(!darkMode)} className="p-2 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 transition">{darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}</button></div>
        </div>
      </div>
    );
  }

  // -- Authenticated --
  return (
    <div className={`flex h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-300 overflow-hidden ${darkMode ? 'dark' : ''}`}>
      {showWelcomeToast && (
         <div className="fixed top-6 right-6 z-[100] bg-white dark:bg-slate-800 border-l-4 border-brand-500 shadow-2xl rounded-lg p-4 animate-fade-in flex items-center gap-3 pr-8">
             <div className="p-2 bg-brand-100 dark:bg-brand-900/30 rounded-full"><UserCheck className="w-5 h-5 text-brand-600 dark:text-brand-400" /></div>
             <div><h4 className="font-bold text-slate-900 dark:text-white">Olá, {user.name.split(' ')[0]}!</h4><p className="text-sm text-slate-500 dark:text-slate-400">Bem-vindo ao sistema CARPA.</p></div>
         </div>
      )}

      {isSidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setIsSidebarOpen(false)} />}

      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 transform transition-transform duration-200 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="h-full flex flex-col">
          <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center gap-3">
            <Logo className="w-10 h-10" />
            <div><p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Controle de Estoque</p><h2 className="font-extrabold text-2xl text-slate-900 dark:text-white leading-none tracking-tight">CARPA</h2></div>
            <button onClick={() => setIsSidebarOpen(false)} className="ml-auto lg:hidden text-slate-500"><X className="w-6 h-6" /></button>
          </div>
          <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
            <button onClick={() => { setCurrentView(AppView.DASHBOARD); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${currentView === AppView.DASHBOARD ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}><LayoutDashboard className="w-5 h-5" /> Dashboard</button>
            <button onClick={() => { setCurrentView(AppView.INVENTORY); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${currentView === AppView.INVENTORY ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}><Package className="w-5 h-5" /> Inventário</button>
            <button onClick={() => { setCurrentView(AppView.MOVEMENTS); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${currentView === AppView.MOVEMENTS ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}><ArrowRightLeft className="w-5 h-5" /> Movimentações</button>
            <button onClick={() => { setCurrentView(AppView.SETTINGS); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${currentView === AppView.SETTINGS ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}><Settings className="w-5 h-5" /> Configurações</button>
          </nav>
          <div className="p-4 border-t border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-3 px-4 py-3 mb-2">
              <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900 flex items-center justify-center text-brand-700 dark:text-brand-300 font-bold text-xs">{user.badgeId.slice(0, 2)}</div>
              <div className="flex-1 overflow-hidden"><p className="text-sm font-medium text-slate-900 dark:text-white truncate">{user.name}</p><p className="text-xs text-slate-500 dark:text-slate-400">Matrícula: {user.badgeId}</p></div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDarkMode(!darkMode)} className="flex-1 flex items-center justify-center p-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 transition text-slate-600 dark:text-slate-300">{darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}</button>
              <button onClick={handleLogout} className="flex-1 flex items-center justify-center p-2 rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 transition text-red-600 dark:text-red-400"><LogOut className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-4 lg:hidden flex items-center justify-between flex-shrink-0">
          <button onClick={() => setIsSidebarOpen(true)} className="text-slate-600 dark:text-slate-400"><Menu className="w-6 h-6" /></button>
          <h1 className="font-bold text-slate-900 dark:text-white">CARPA</h1>
          <div className="w-6" />
        </header>

        {lowStockItems.length > 0 && (
          <div onClick={() => { setShowLowStockOnly(true); setCurrentView(AppView.INVENTORY); }} className="bg-orange-500 text-white px-6 py-3 flex items-center justify-between cursor-pointer hover:bg-orange-600 transition shadow-md z-30">
             <div className="flex items-center gap-3"><AlertCircle className="w-5 h-5 animate-pulse" /><span className="font-medium text-sm md:text-base">Atenção: {lowStockItems.length} material(is) com estoque abaixo do mínimo.</span></div>
             <button className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded text-sm font-semibold transition">Verificar</button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 lg:p-8">
          <div className="max-w-7xl mx-auto h-full">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6 hidden lg:block">
              {currentView === AppView.DASHBOARD && 'Visão Geral'}
              {currentView === AppView.INVENTORY && 'Gerenciar Estoque'}
              {currentView === AppView.MOVEMENTS && 'Histórico de Movimentações'}
              {currentView === AppView.SETTINGS && 'Configurações do Sistema'}
            </h1>
            
            {currentView === AppView.DASHBOARD && <DashboardView />}
            {currentView === AppView.INVENTORY && <InventoryView />}
            {currentView === AppView.SETTINGS && <SettingsView />}
            {currentView === AppView.MOVEMENTS && (
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                    <tr><th className="px-6 py-4 font-medium">Data</th><th className="px-6 py-4 font-medium">Item</th><th className="px-6 py-4 font-medium">Ação</th><th className="px-6 py-4 font-medium">Quantidade</th><th className="px-6 py-4 font-medium">Responsável</th><th className="px-6 py-4 font-medium">Motivo</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {movements.map(m => (
                      <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                        <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{new Date(m.timestamp).toLocaleString('pt-BR')}</td>
                        <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">{m.itemName}</td>
                        <td className="px-6 py-4"><span className={`px-2 py-1 rounded-full text-xs font-semibold ${m.type === 'IN' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>{m.type === 'IN' ? 'ENTRADA' : 'SAÍDA'}</span></td>
                        <td className="px-6 py-4 text-slate-900 dark:text-white">{m.quantity}</td>
                        <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{m.userName} <span className="text-xs text-slate-400">({m.userBadgeId})</span></td>
                        <td className="px-6 py-4 text-slate-500 dark:text-slate-400 italic">{m.reason || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* --- Modals --- */}
      {isImportHelpOpen && (
         <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
             <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg p-6">
                <div className="flex justify-between items-center mb-4 border-b border-slate-100 dark:border-slate-700 pb-4">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2"><HelpCircle className="w-5 h-5 text-brand-600" /> Instruções de Importação</h3>
                    <button onClick={() => setIsImportHelpOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-300 space-y-4">
                    <p>Para importar seus dados existentes, salve sua planilha como arquivo <strong>CSV (separado por ponto e vírgula)</strong>.</p>
                    <p>A ordem das colunas deve ser exatamente:</p>
                    <ol className="list-decimal list-inside space-y-1 bg-slate-50 dark:bg-slate-900 p-4 rounded-lg font-mono text-xs">
                        <li>ID (Código único do item)</li><li>Nome do Material</li><li>Unidade (ex: Unid, Kg)</li><li>Estoque Atual (Número)</li><li>Estoque Mínimo (Número)</li><li>Localização</li><li>Departamento</li><li>Descrição (Opcional)</li>
                    </ol>
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg border border-yellow-100 dark:border-yellow-900/50"><p className="text-yellow-700 dark:text-yellow-400 font-semibold text-xs">Dica Importante:</p><p className="text-xs mt-1 text-yellow-600 dark:text-yellow-500">A primeira linha da planilha é ignorada (cabeçalho). Certifique-se de que seus dados comecem na segunda linha.</p></div>
                </div>
                <div className="mt-6 flex justify-end"><button onClick={() => setIsImportHelpOpen(false)} className="px-4 py-2 bg-brand-600 text-white rounded-lg font-medium hover:bg-brand-700 transition">Entendi</button></div>
             </div>
         </div>
      )}

      {isItemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">{editingItem ? 'Editar Material' : 'Novo Material'}</h3>
              <button onClick={closeItemModal} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X className="w-6 h-6" /></button>
            </div>
            <form onSubmit={handleSaveItem} className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="flex justify-center">
                <div className="relative group">
                  <div className="w-32 h-32 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center overflow-hidden border-2 border-dashed border-slate-300 dark:border-slate-600">
                    {formData.photoUrl ? <img src={formData.photoUrl} alt="Preview" className="w-full h-full object-cover" /> : <Camera className="w-10 h-10 text-slate-400" />}
                  </div>
                  <label className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition cursor-pointer rounded-xl text-white font-medium text-sm">Alterar Foto<input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} /></label>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nome do Material</label>
                  <input required className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500 dark:text-white" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Departamento</label>
                  <div className="flex gap-2">
                    <select className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500 dark:text-white" value={formData.department || ''} onChange={e => setFormData({...formData, department: e.target.value})}>
                        <option value="">Selecione...</option>
                        {departments.map(d => (<option key={d} value={d}>{d}</option>))}
                    </select>
                    <button type="button" onClick={() => { const newD = prompt("Nome do novo departamento:"); if(newD) { addDepartment(newD); setFormData(prev => ({...prev, department: newD})); } }} className="p-2 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600" title="Adicionar Departamento"><Plus className="w-5 h-5" /></button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Unidade de Medida</label>
                  <input className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500 dark:text-white" value={formData.unit || ''} placeholder="Ex: Unid, Kg, Cx" onChange={e => setFormData({...formData, unit: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Estoque Mínimo</label>
                  <input type="number" min="0" className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500 dark:text-white" value={formData.minStock || ''} onChange={e => setFormData({...formData, minStock: Number(e.target.value)})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Estoque Atual</label>
                  <input type="number" min="0" className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500 dark:text-white" value={formData.currentStock || ''} onChange={e => setFormData({...formData, currentStock: Number(e.target.value)})} />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Locação (Prateleira/Armário)</label>
                  <input className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500 dark:text-white" value={formData.location || ''} onChange={e => setFormData({...formData, location: e.target.value})} />
                </div>
                <div className="col-span-2">
                   <div className="flex justify-between items-center mb-1">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Descrição (Opcional)</label>
                      <button type="button" onClick={handleAIAutoFill} disabled={isGeneratingDesc} className="text-xs flex items-center gap-1 text-brand-600 hover:text-brand-700 dark:text-brand-400 font-semibold"><Sparkles className="w-3 h-3" />{isGeneratingDesc ? 'Gerando...' : 'Gerar com IA'}</button>
                   </div>
                   <textarea rows={2} className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500 dark:text-white resize-none" value={formData.description || ''} onChange={e => setFormData({...formData, description: e.target.value})} />
                </div>
              </div>
            </form>
            <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-between gap-3">
              {editingItem ? (
                 <button type="button" onClick={() => promptDeleteSingle(editingItem.id)} className="px-4 py-2 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium transition flex items-center gap-2"><Trash2 className="w-4 h-4" /> Excluir Material</button>
              ) : <div></div>}
              <div className="flex gap-3">
                  <button type="button" onClick={closeItemModal} className="px-4 py-2 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition">Cancelar</button>
                  <button onClick={handleSaveItem} className="px-6 py-2 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-lg shadow-lg shadow-brand-500/30 transition">Salvar Item</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isMovementModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className={`p-6 border-b ${movementType === 'IN' ? 'bg-emerald-600' : 'bg-orange-600'} text-white`}>
              <h3 className="text-xl font-bold flex items-center gap-2">{movementType === 'IN' ? <Plus className="w-6 h-6" /> : <ArrowRightLeft className="w-6 h-6" />} Registrar {movementType === 'IN' ? 'Entrada' : 'Saída'}</h3>
              <p className="text-white/80 text-sm mt-1">{items.find(i => i.id === movementItemId)?.name}</p>
            </div>
            <form onSubmit={handleStockMovement} className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Quantidade</label>
                <div className="flex items-center">
                  <input type="number" min="1" required className="w-full text-2xl font-bold text-center px-4 py-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500 dark:text-white" value={moveData.quantity} onChange={e => setMoveData({...moveData, quantity: Number(e.target.value)})} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Motivo / Observação (Opcional)</label>
                <input type="text" placeholder={movementType === 'IN' ? 'Ex: Compra NF-123' : 'Ex: Uso interno, Quebra...'} className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500 dark:text-white" value={moveData.reason} onChange={e => setMoveData({...moveData, reason: e.target.value})} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setIsMovementModalOpen(false)} className="flex-1 px-4 py-3 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition">Cancelar</button>
                <button type="submit" className={`flex-1 px-4 py-3 text-white font-bold rounded-lg shadow-lg transition transform active:scale-95 ${movementType === 'IN' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/30' : 'bg-orange-600 hover:bg-orange-700 shadow-orange-500/30'}`}>Confirmar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isDeleteModalOpen && (
         <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden p-6 text-center">
               <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4"><Trash2 className="w-8 h-8 text-red-600 dark:text-red-500" /></div>
               <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Excluir Material?</h3>
               <p className="text-slate-500 dark:text-slate-400 mb-6">Você está prestes a excluir permanentemente <strong>{itemsToDelete.length}</strong> item(ns). Esta ação não pode ser desfeita.</p>
               <div className="flex gap-3">
                  <button type="button" onClick={() => { setIsDeleteModalOpen(false); setItemsToDelete([]); }} className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition">Cancelar</button>
                  <button type="button" onClick={confirmDelete} className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold shadow-lg shadow-red-500/30 transition transform active:scale-95">Sim, Excluir</button>
               </div>
            </div>
         </div>
      )}
    </div>
  );
}