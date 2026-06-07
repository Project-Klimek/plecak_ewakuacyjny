'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/store';
import { authApi, backpacksApi, itemsApi, scanApi, exportApi, notificationsApi, syncApi } from '@/lib/api';
import type { Backpack, Item, ItemCategory } from '@/types';
import { ITEM_CATEGORIES } from '@/types';
import {
  saveBackpackLocal,
  saveItemLocal,
  getBackpacksLocal,
  getItemsLocal,
  deleteBackpackLocal,
  deleteItemLocal,
  generateId,
  saveAllDataLocal,
  addPendingChange,
  getPendingChanges,
  clearPendingChanges,
  setLastSync,
  registerBackgroundSync,
} from '@/lib/offline';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';

import { 
  Backpack, Plus, Trash2, LogOut,
  Utensils, Droplet, Heart, Wrench, FileText, Shirt, Smartphone, Package,
  Camera, Download, Moon, Sun, RefreshCw, 
  ChevronRight, AlertTriangle, X, Check, Search, Minus
} from 'lucide-react';

const categoryIcons: Record<ItemCategory, React.ReactNode> = {
  food: <Utensils className="h-5 w-5" />,
  water: <Droplet className="h-5 w-5" />,
  medical: <Heart className="h-5 w-5" />,
  tools: <Wrench className="h-5 w-5" />,
  documents: <FileText className="h-5 w-5" />,
  clothes: <Shirt className="h-5 w-5" />,
  electronics: <Smartphone className="h-5 w-5" />,
  other: <Package className="h-5 w-5" />,
};

const categoryColors: Record<ItemCategory, string> = {
  food: 'bg-amber-500',
  water: 'bg-blue-500',
  medical: 'bg-red-500',
  tools: 'bg-gray-500',
  documents: 'bg-yellow-500',
  clothes: 'bg-purple-500',
  electronics: 'bg-cyan-500',
  other: 'bg-slate-500',
};

const backpackColors = [
  { name: 'Pomaranczowy', value: '#f97316' },
  { name: 'Niebieski', value: '#3b82f6' },
  { name: 'Zielony', value: '#22c55e' },
  { name: 'Czerwony', value: '#ef4444' },
  { name: 'Fioletowy', value: '#8b5cf6' },
  { name: 'Rozowy', value: '#ec4899' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Indygo', value: '#6366f1' },
];

type ViewState = 'backpacks' | 'categories' | 'items' | 'expiring' | 'expired';

export default function Page() {
  const {
    user, isLoading, isInitialized,
    backpacks, items, isOffline,
    setUser, setLoading, setInitialized,
    setBackpacks, setSharedBackpacks, setItems, setNotifications, setUnreadNotifications,
    setIsOffline,
    addBackpack, removeBackpack,
    addItem, removeItem, updateItem,
    logout,
  } = useAppStore();

  const [isDarkMode, setIsDarkMode] = useState(false);
  const [view, setView] = useState<ViewState>('backpacks');
  const [selectedBackpackId, setSelectedBackpackId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<ItemCategory | null>(null);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ email: '', password: '', name: '' });
  const [newBackpack, setNewBackpack] = useState({ name: '', description: '', color: '#f97316' });
  const [newItem, setNewItem] = useState<Partial<Item>>({ name: '', quantity: 1, category: 'other' });
  const [showAddBackpack, setShowAddBackpack] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ barcode: string | null; expiryDate: string | null; productName: string | null } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const selectedBackpack = selectedBackpackId 
    ? backpacks.find(b => b.id === selectedBackpackId)
    : null;

  const filteredItems = items.filter(item => {
    if (!searchQuery) return true;
    return item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
           item.barcode?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const backpackItems = selectedBackpackId 
    ? filteredItems.filter(i => i.backpackId === selectedBackpackId)
    : [];

  const itemsByCategory = backpackItems.reduce((acc, item) => {
    const cat = item.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, Item[]>);

  const expiringItems = filteredItems.filter(i => {
    if (!i.expiryDate) return false;
    const expDate = new Date(i.expiryDate);
    const now = new Date();
    const diffDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays <= 7 && diffDays >= 0;
  });

  const expiredItems = filteredItems.filter(i => {
    if (!i.expiryDate) return false;
    const expDate = new Date(i.expiryDate);
    return expDate < new Date();
  });

  const categoryItems = selectedCategory 
    ? backpackItems.filter(i => i.category === selectedCategory)
    : [];

  const queueOfflineChange = async (type: string, data: Record<string, unknown>) => {
    await addPendingChange(type, data);
    try {
      await registerBackgroundSync();
    } catch {
      // Browser background sync is optional; queued changes still sync on reconnect.
    }
  };

  const isBrowserOnline = () => typeof navigator === 'undefined' || navigator.onLine;

  const syncPendingChanges = useCallback(async () => {
    const pendingChanges = await getPendingChanges();
    if (pendingChanges.length === 0) return true;

    try {
      const response = await syncApi.sync(pendingChanges);
      const syncResult = response.data as { errors?: string[] } | undefined;

      if (response.success && (!syncResult?.errors || syncResult.errors.length === 0)) {
        await clearPendingChanges();
        await setLastSync(new Date());
        toast({ title: 'Synchronizacja', description: 'Zmiany offline zostaly wyslane' });
        return true;
      }

      toast({
        title: 'Synchronizacja',
        description: 'Nie wszystkie zmiany offline zostaly wyslane',
        variant: 'destructive',
      });
      return false;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        const localBackpacks = await getBackpacksLocal();
        const localItems = await getItemsLocal();
        
        if (localBackpacks.length > 0) {
          setBackpacks(localBackpacks);
          setItems(localItems);
        }
      } catch (e) {
        console.error('Failed to load local data:', e);
      }
      
      try {
        const response = await authApi.me();
        if (response.success && response.user) {
          setUser(response.user);
          const synced = await syncPendingChanges();
          if (synced) await loadData();
        }
      } catch {
        console.log('Working offline or not logged in');
      } finally {
        setLoading(false);
        setInitialized(true);
      }
    };
    
    init();
    
    const handleOnline = async () => {
      setIsOffline(false);
      const synced = await syncPendingChanges();
      if (synced) loadData();
    };
    const handleOffline = () => setIsOffline(true);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOffline(!navigator.onLine);
    
    const savedDarkMode = localStorage.getItem('darkMode') === 'true';
    setIsDarkMode(savedDarkMode);
    document.documentElement.classList.toggle('dark', savedDarkMode);
    
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(console.error);
    }
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncPendingChanges]);

  const loadData = async () => {
    try {
      const [backpacksRes, notifRes] = await Promise.all([
        backpacksApi.getAll(),
        notificationsApi.getAll(),
      ]);
      
      if (backpacksRes.success && backpacksRes.data) {
        setBackpacks(backpacksRes.data.own);
        setSharedBackpacks(backpacksRes.data.shared);
        const allItems = [...backpacksRes.data.own, ...backpacksRes.data.shared].flatMap(b => b.items || []);
        setItems(allItems);
        await saveAllDataLocal(backpacksRes.data.own, allItems);
      }
      
      if (notifRes.success && notifRes.data) {
        setNotifications(notifRes.data.notifications || []);
        setUnreadNotifications(notifRes.data.unreadCount || 0);
      }
    } catch (error) {
      console.error('Failed to load data from server:', error);
    }
  };

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    localStorage.setItem('darkMode', String(newMode));
    document.documentElement.classList.toggle('dark', newMode);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await authApi.login(loginForm.email, loginForm.password);
      if (response.success && response.user) {
        setUser(response.user);
        await loadData();
        setLoginForm({ email: '', password: '' });
      } else {
        toast({ title: 'Blad', description: response.error || 'Nie udalo sie zalogowac', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Blad', description: 'Wystapil blad podczas logowania', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await authApi.register(registerForm.email, registerForm.password, registerForm.name);
      if (response.success && response.user) {
        setUser(response.user);
        setRegisterForm({ email: '', password: '', name: '' });
      } else {
        toast({ title: 'Blad', description: response.error || 'Nie udalo sie zarejestrowac', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Blad', description: 'Wystapil blad podczas rejestracji', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await authApi.logout();
    logout();
    setView('backpacks');
  };

  const handleCreateBackpack = async () => {
    if (!newBackpack.name.trim()) return;
    
    const localBackpack: Backpack = {
      id: generateId(),
      name: newBackpack.name,
      description: newBackpack.description || '',
      color: newBackpack.color || '#f97316',
      icon: 'backpack',
      userId: user?.id || 'local',
      items: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const finishLocalBackpackCreate = async () => {
      addBackpack(localBackpack);
      await saveBackpackLocal(localBackpack);
      await queueOfflineChange('create_backpack', localBackpack as unknown as Record<string, unknown>);
      setShowAddBackpack(false);
      setNewBackpack({ name: '', description: '', color: '#f97316' });
      toast({ title: 'Sukces', description: 'Plecak utworzony lokalnie (offline)' });
    };

    if (!isBrowserOnline()) {
      await finishLocalBackpackCreate();
      return;
    }
    
    try {
      const response = await backpacksApi.create(newBackpack);
      if (response.success && response.data) {
        addBackpack(response.data);
        await saveBackpackLocal(response.data);
        setShowAddBackpack(false);
        setNewBackpack({ name: '', description: '', color: '#f97316' });
        toast({ title: 'Sukces', description: 'Plecak utworzony!' });
      } else {
        toast({ title: 'Blad', description: response.error || 'Nie udalo sie utworzyc plecaka', variant: 'destructive' });
      }
    } catch {
      await finishLocalBackpackCreate();
    }
  };

  const handleDeleteBackpack = async (id: string) => {
    if (!isBrowserOnline()) {
      await queueOfflineChange('delete_backpack', { id });
    } else {
      try {
        const response = await backpacksApi.delete(id);
        if (!response.success) {
          await queueOfflineChange('delete_backpack', { id });
        }
      } catch {
        await queueOfflineChange('delete_backpack', { id });
      }
    }
    removeBackpack(id);
    await deleteBackpackLocal(id);
    setDeleteConfirm(null);
    toast({ title: 'Usunieto', description: 'Plecak zostal usuniety' });
  };

  const handleCreateItem = async () => {
    if (!newItem.name?.trim() || !selectedBackpackId) return;
    
    const localItem: Item = {
      id: generateId(),
      name: newItem.name,
      quantity: newItem.quantity || 1,
      category: newItem.category || 'other',
      backpackId: selectedBackpackId,
      expiryDate: newItem.expiryDate || null,
      barcode: newItem.barcode || null,
      notes: newItem.notes || null,
      photo: newItem.photo || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const finishAddItem = () => {
      setShowAddItem(false);
      setNewItem({ name: '', quantity: 1, category: 'other' });
      setScanResult(null);
    };

    const finishLocalItemCreate = async () => {
      addItem(localItem);
      await saveItemLocal(localItem);
      await queueOfflineChange('create_item', localItem as unknown as Record<string, unknown>);
      finishAddItem();
      toast({ title: 'Dodano!', description: 'Przedmiot dodany lokalnie (offline)' });
    };

    if (!isBrowserOnline()) {
      await finishLocalItemCreate();
      return;
    }
    
    try {
      const response = await itemsApi.create({
        ...newItem,
        backpackId: selectedBackpackId,
        quantity: newItem.quantity || 1,
        category: newItem.category || 'other',
      });
      if (response.success && response.data) {
        addItem(response.data);
        await saveItemLocal(response.data);
        finishAddItem();
        toast({ title: 'Dodano!', description: 'Przedmiot dodany do plecaka' });
      } else {
        toast({ title: 'Blad', description: response.error || 'Nie udalo sie dodac przedmiotu', variant: 'destructive' });
      }
    } catch {
      await finishLocalItemCreate();
    }
  };

  const handleUpdateItemQuantity = async (item: Item, delta: number) => {
    const newQuantity = Math.max(0, item.quantity + delta);
    if (newQuantity === 0) {
      await handleDeleteItem(item.id);
      return;
    }
    
    const updatedItem = { ...item, quantity: newQuantity, updatedAt: new Date() };
    updateItem(item.id, { quantity: newQuantity });
    await saveItemLocal(updatedItem);
    
    if (!isBrowserOnline()) {
      await queueOfflineChange('update_item', { id: item.id, quantity: newQuantity });
      return;
    }

    try {
      const response = await itemsApi.update(item.id, { quantity: newQuantity });
      if (!response.success) {
        await queueOfflineChange('update_item', { id: item.id, quantity: newQuantity });
      }
    } catch {
      await queueOfflineChange('update_item', { id: item.id, quantity: newQuantity });
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!isBrowserOnline()) {
      await queueOfflineChange('delete_item', { id });
    } else {
      try {
        const response = await itemsApi.delete(id);
        if (!response.success) {
          await queueOfflineChange('delete_item', { id });
        }
      } catch {
        await queueOfflineChange('delete_item', { id });
      }
    }
    removeItem(id);
    await deleteItemLocal(id);
    toast({ title: 'Usunieto', description: 'Przedmiot usuniety' });
  };

  const handleScan = useCallback(async (file: File) => {
    setScanning(true);
    setScanResult(null);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target?.result as string;
        const response = await scanApi.scanImage(base64);
        if (response.success && response.data) {
          setScanResult(response.data);
          if (response.data.barcode) setNewItem(prev => ({ ...prev, barcode: response.data.barcode }));
          if (response.data.expiryDate) setNewItem(prev => ({ ...prev, expiryDate: response.data.expiryDate }));
          if (response.data.productName) setNewItem(prev => ({ ...prev, name: response.data.productName }));
          toast({ title: 'Zeskanowano!', description: 'Dane rozpoznane' });
        }
        setScanning(false);
      };
      reader.readAsDataURL(file);
    } catch {
      setScanning(false);
      toast({ title: 'Blad', description: 'Nie udalo sie rozpoznac', variant: 'destructive' });
    }
  }, []);

  const handleExportPdf = async () => {
    if (!selectedBackpackId) return;
    try {
      await exportApi.exportPdf(selectedBackpackId);
      toast({ title: 'Pobrano PDF' });
    } catch {
      toast({ title: 'Blad', description: 'Eksport nieudany', variant: 'destructive' });
    }
  };

  const handleExportExcel = async () => {
    if (!selectedBackpackId) return;
    try {
      await exportApi.exportExcel(selectedBackpackId);
      toast({ title: 'Pobrano Excel' });
    } catch {
      toast({ title: 'Blad', description: 'Eksport nieudany', variant: 'destructive' });
    }
  };

  const navigateToItems = (backpackId: string) => {
    setSelectedBackpackId(backpackId);
    setSelectedCategory(null);
    setView('categories');
  };

  const navigateToCategory = (category: ItemCategory) => {
    setSelectedCategory(category);
    setView('items');
  };

  const goBack = () => {
    if (view === 'items') {
      setSelectedCategory(null);
      setView('categories');
    } else if (view === 'categories' || view === 'expiring' || view === 'expired') {
      setSelectedBackpackId(null);
      setView('backpacks');
    }
  };

  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-400 to-red-500">
        <div className="text-center text-white">
          <Backpack className="h-20 w-20 mx-auto animate-bounce" />
          <p className="mt-6 text-xl font-semibold">Plecak Ewakuacyjny</p>
          <p className="mt-2 opacity-80">Ladowanie...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-400 to-red-500 p-4">
        <div className="max-w-md mx-auto pt-12">
          <div className="text-center mb-8">
            <div className="w-24 h-24 bg-white rounded-3xl mx-auto flex items-center justify-center shadow-xl">
              <Backpack className="h-14 w-14 text-orange-500" />
            </div>
            <h1 className="mt-6 text-2xl font-bold text-white">Plecak Ewakuacyjny</h1>
            <p className="text-white/80 mt-2">Zarzadzaj swoim plecakiem offline</p>
          </div>

          <Card className="rounded-3xl shadow-2xl overflow-hidden">
            <CardContent className="p-0">
              <Tabs defaultValue="login" className="w-full">
                <TabsList className="grid w-full grid-cols-2 rounded-none h-14">
                  <TabsTrigger value="login" className="rounded-none text-base">Logowanie</TabsTrigger>
                  <TabsTrigger value="register" className="rounded-none text-base">Rejestracja</TabsTrigger>
                </TabsList>
                
                <div className="p-6">
                  <TabsContent value="login" className="mt-0">
                    <form onSubmit={handleLogin} className="space-y-4">
                      <div>
                        <Label className="text-base">Email</Label>
                        <Input
                          type="email"
                          placeholder="twoj@email.pl"
                          value={loginForm.email}
                          onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                          className="h-12 rounded-xl text-base"
                          required
                        />
                      </div>
                      <div>
                        <Label className="text-base">Haslo</Label>
                        <Input
                          type="password"
                          value={loginForm.password}
                          onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                          className="h-12 rounded-xl text-base"
                          required
                        />
                      </div>
                      <Button type="submit" className="w-full h-12 rounded-xl text-base bg-orange-500 hover:bg-orange-600" disabled={isLoading}>
                        {isLoading ? 'Logowanie...' : 'Zaloguj sie'}
                      </Button>
                    </form>
                  </TabsContent>
                  
                  <TabsContent value="register" className="mt-0">
                    <form onSubmit={handleRegister} className="space-y-4">
                      <div>
                        <Label className="text-base">Imie</Label>
                        <Input
                          type="text"
                          placeholder="Jak sie nazywasz?"
                          value={registerForm.name}
                          onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
                          className="h-12 rounded-xl text-base"
                          required
                        />
                      </div>
                      <div>
                        <Label className="text-base">Email</Label>
                        <Input
                          type="email"
                          placeholder="twoj@email.pl"
                          value={registerForm.email}
                          onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                          className="h-12 rounded-xl text-base"
                          required
                        />
                      </div>
                      <div>
                        <Label className="text-base">Haslo</Label>
                        <Input
                          type="password"
                          placeholder="Min. 6 znakow"
                          value={registerForm.password}
                          onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                          className="h-12 rounded-xl text-base"
                          required
                        />
                      </div>
                      <Button type="submit" className="w-full h-12 rounded-xl text-base bg-orange-500 hover:bg-orange-600" disabled={isLoading}>
                        {isLoading ? 'Rejestracja...' : 'Utworz konto'}
                      </Button>
                    </form>
                  </TabsContent>
                </div>
              </Tabs>
            </CardContent>
          </Card>
        </div>
        <Toaster />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <header className="sticky top-0 z-40 bg-white dark:bg-gray-800 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center">
            {view !== 'backpacks' && (
              <Button variant="ghost" size="icon" onClick={goBack} className="mr-2">
                <ChevronRight className="h-6 w-6 rotate-180" />
              </Button>
            )}
            <h1 className="text-lg font-bold truncate">
              {view === 'backpacks' && 'Moje plecaki'}
              {view === 'categories' && selectedBackpack?.name}
              {view === 'items' && `${selectedBackpack?.name} - ${ITEM_CATEGORIES.find(c => c.value === selectedCategory)?.label}`}
              {view === 'expiring' && 'Konczace sie'}
              {view === 'expired' && 'Przeterminowane'}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {isOffline && (
              <Badge variant="outline" className="text-amber-600 border-amber-600 text-xs">
                Offline
              </Badge>
            )}
            <Button variant="ghost" size="icon" onClick={() => setShowSearch(!showSearch)}>
              <Search className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={toggleDarkMode}>
              {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
          </div>
        </div>
        
        {showSearch && (
          <div className="px-4 pb-3">
            <Input
              placeholder="Szukaj..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 rounded-xl"
            />
          </div>
        )}
      </header>

      <main className="px-4 py-4 pb-24">
        {view === 'backpacks' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Card 
                className="rounded-2xl cursor-pointer active:scale-[0.98] transition-transform"
                onClick={() => setView('expiring')}
              >
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-amber-500">{expiringItems.length}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Konczy sie (7 dni)</p>
                </CardContent>
              </Card>
              <Card 
                className="rounded-2xl cursor-pointer active:scale-[0.98] transition-transform"
                onClick={() => setView('expired')}
              >
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-red-500">{expiredItems.length}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Przeterminowane</p>
                </CardContent>
              </Card>
            </div>

            <Button 
              className="w-full h-14 rounded-2xl bg-orange-500 hover:bg-orange-600 text-lg"
              onClick={() => setShowAddBackpack(true)}
            >
              <Plus className="h-6 w-6 mr-2" />
              Nowy plecak
            </Button>

            {backpacks.length === 0 ? (
              <Card className="rounded-2xl p-8 text-center">
                <Backpack className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">Nie masz jeszcze plecakow</p>
                <p className="text-sm text-gray-400 mt-1">Kliknij Nowy plecak aby dodac</p>
              </Card>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {backpacks.map((backpack) => {
                  const itemCount = items.filter(i => i.backpackId === backpack.id).length;
                  const isDeleting = deleteConfirm === backpack.id;
                  
                  return (
                    <Card 
                      key={backpack.id} 
                      className="rounded-2xl overflow-hidden active:scale-[0.98] transition-transform cursor-pointer"
                      onClick={() => !isDeleting && navigateToItems(backpack.id)}
                    >
                      <div 
                        className="h-20 flex items-center justify-center relative"
                        style={{ backgroundColor: backpack.color }}
                      >
                        <Backpack className="h-10 w-10 text-white/90" />
                        
                        {isDeleting ? (
                          <div className="absolute top-2 right-2 flex gap-1">
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-7 w-7 p-0 bg-white/90"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteBackpack(backpack.id);
                              }}
                            >
                              <Check className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-7 w-7 p-0 bg-white/90"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirm(null);
                              }}
                            >
                              <X className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="absolute top-2 right-2 h-7 w-7 p-0 bg-white/20 hover:bg-white/40 border-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirm(backpack.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-white" />
                          </Button>
                        )}
                      </div>
                      <CardContent className="p-3">
                        <p className="font-semibold text-base truncate">{backpack.name}</p>
                        <p className="text-sm text-gray-500">{itemCount} przedmiotow</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {view === 'categories' && selectedBackpackId && (
          <div className="space-y-4">
            <Button 
              className="w-full h-12 rounded-xl bg-orange-500 hover:bg-orange-600"
              onClick={() => setShowAddItem(true)}
            >
              <Plus className="h-5 w-5 mr-2" />
              Dodaj przedmiot
            </Button>

            {Object.keys(itemsByCategory).length === 0 ? (
              <Card className="rounded-2xl p-8 text-center">
                <Package className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">Plecak jest pusty</p>
                <p className="text-sm text-gray-400 mt-1">Dodaj pierwszy przedmiot</p>
              </Card>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {ITEM_CATEGORIES.map((cat) => {
                  const catItems = itemsByCategory[cat.value] || [];
                  if (catItems.length === 0) return null;
                  
                  return (
                    <Card 
                      key={cat.value}
                      className="rounded-2xl overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
                      onClick={() => navigateToCategory(cat.value)}
                    >
                      <div className={`h-16 flex items-center justify-center ${categoryColors[cat.value]}`}>
                        {categoryIcons[cat.value]}
                      </div>
                      <CardContent className="p-3">
                        <p className="font-semibold text-base">{cat.label}</p>
                        <p className="text-sm text-gray-500">{catItems.length} przedmiotow</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <Button variant="outline" className="flex-1 h-12 rounded-xl" onClick={handleExportPdf}>
                <Download className="h-5 w-5 mr-2" />
                PDF
              </Button>
              <Button variant="outline" className="flex-1 h-12 rounded-xl" onClick={handleExportExcel}>
                <Download className="h-5 w-5 mr-2" />
                Excel
              </Button>
            </div>
          </div>
        )}

        {view === 'items' && selectedCategory && (
          <div className="space-y-2">
            {categoryItems.map((item) => {
              const isExpiring = item.expiryDate && (() => {
                const diff = Math.ceil((new Date(item.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                return diff <= 7 && diff >= 0;
              })();
              const isExpired = item.expiryDate && new Date(item.expiryDate) < new Date();
              
              return (
                <Card key={item.id} className={`rounded-xl ${isExpiring ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20' : ''} ${isExpired ? 'border-red-400 bg-red-50 dark:bg-red-900/20' : ''}`}>
                  <div className="flex items-center p-3">
                    <div className="flex-1">
                      <p className="font-medium">{item.name}</p>
                      <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                        {item.expiryDate && (
                          <span className={isExpiring ? 'text-amber-600 font-medium' : isExpired ? 'text-red-600 font-medium' : ''}>
                            {new Date(item.expiryDate).toLocaleDateString('pl-PL')}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 rounded-lg"
                        onClick={() => handleUpdateItemQuantity(item, -1)}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="w-8 text-center font-semibold">{item.quantity}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 rounded-lg"
                        onClick={() => handleUpdateItemQuantity(item, 1)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {view === 'expiring' && (
          <div className="space-y-2">
            {expiringItems.length === 0 ? (
              <Card className="rounded-2xl p-8 text-center">
                <Check className="h-16 w-16 mx-auto text-green-500 mb-4" />
                <p className="text-gray-500">Zaden przedmiot nie konczy sie w ciagu 7 dni</p>
              </Card>
            ) : (
              expiringItems.map((item) => {
                const backpack = backpacks.find(b => b.id === item.backpackId);
                return (
                  <Card key={item.id} className="rounded-xl border-amber-400 bg-amber-50 dark:bg-amber-900/20">
                    <div className="flex items-center p-3">
                      <div className="flex-1">
                        <p className="font-medium">{item.name}</p>
                        <p className="text-sm text-gray-500">
                          {backpack?.name} - x{item.quantity}
                        </p>
                        <p className="text-sm text-amber-600 font-medium mt-1">
                          {new Date(item.expiryDate!).toLocaleDateString('pl-PL')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 rounded-lg"
                          onClick={() => handleUpdateItemQuantity(item, -1)}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="w-8 text-center font-semibold">{item.quantity}</span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 rounded-lg"
                          onClick={() => handleUpdateItemQuantity(item, 1)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        )}

        {view === 'expired' && (
          <div className="space-y-2">
            {expiredItems.length === 0 ? (
              <Card className="rounded-2xl p-8 text-center">
                <Check className="h-16 w-16 mx-auto text-green-500 mb-4" />
                <p className="text-gray-500">Brak przeterminowanych przedmiotow</p>
              </Card>
            ) : (
              expiredItems.map((item) => {
                const backpack = backpacks.find(b => b.id === item.backpackId);
                return (
                  <Card key={item.id} className="rounded-xl border-red-400 bg-red-50 dark:bg-red-900/20">
                    <div className="flex items-center p-3">
                      <div className="flex-1">
                        <p className="font-medium">{item.name}</p>
                        <p className="text-sm text-gray-500">
                          {backpack?.name} - x{item.quantity}
                        </p>
                        <p className="text-sm text-red-600 font-medium mt-1">
                          Wygaslo: {new Date(item.expiryDate!).toLocaleDateString('pl-PL')}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteItem(item.id)}
                        className="text-red-500"
                      >
                        <Trash2 className="h-5 w-5" />
                      </Button>
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-50">
        <div className="grid grid-cols-4 h-16">
          <button
            className={`flex flex-col items-center justify-center ${view === 'backpacks' ? 'text-orange-500' : 'text-gray-500'}`}
            onClick={() => { setView('backpacks'); setSelectedBackpackId(null); }}
          >
            <Backpack className="h-5 w-5" />
            <span className="text-xs mt-1">Plecaki</span>
          </button>
          <button
            className={`flex flex-col items-center justify-center relative ${view === 'expiring' ? 'text-orange-500' : 'text-gray-500'}`}
            onClick={() => setView('expiring')}
          >
            <AlertTriangle className="h-5 w-5" />
            {expiringItems.length > 0 && (
              <span className="absolute top-1 right-1/4 w-4 h-4 bg-amber-500 text-white text-[10px] rounded-full flex items-center justify-center">
                {expiringItems.length}
              </span>
            )}
            <span className="text-xs mt-1">Koncza sie</span>
          </button>
          <button
            className={`flex flex-col items-center justify-center relative ${view === 'expired' ? 'text-orange-500' : 'text-gray-500'}`}
            onClick={() => setView('expired')}
          >
            <Trash2 className="h-5 w-5" />
            {expiredItems.length > 0 && (
              <span className="absolute top-1 right-1/4 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
                {expiredItems.length}
              </span>
            )}
            <span className="text-xs mt-1">Przeterminowane</span>
          </button>
          <button
            className="flex flex-col items-center justify-center text-gray-500"
            onClick={handleLogout}
          >
            <LogOut className="h-5 w-5" />
            <span className="text-xs mt-1">Wyloguj</span>
          </button>
        </div>
      </nav>

      <Dialog open={showAddBackpack} onOpenChange={setShowAddBackpack}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl">Nowy plecak</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-base">Nazwa</Label>
              <Input
                placeholder="np. Plecak domowy"
                value={newBackpack.name}
                onChange={(e) => setNewBackpack({ ...newBackpack, name: e.target.value })}
                className="h-12 rounded-xl text-base"
              />
            </div>
            <div>
              <Label className="text-base">Opis</Label>
              <Textarea
                placeholder="Opis zawartosci..."
                value={newBackpack.description}
                onChange={(e) => setNewBackpack({ ...newBackpack, description: e.target.value })}
                className="rounded-xl"
              />
            </div>
            <div>
              <Label className="text-base">Kolor</Label>
              <div className="grid grid-cols-4 gap-2 mt-1">
                {backpackColors.map((color) => (
                  <button
                    key={color.value}
                    className={`w-full aspect-square rounded-xl ${newBackpack.color === color.value ? 'ring-2 ring-offset-2 ring-orange-500' : ''}`}
                    style={{ backgroundColor: color.value }}
                    onClick={() => setNewBackpack({ ...newBackpack, color: color.value })}
                    title={color.name}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCreateBackpack} className="w-full h-12 rounded-xl bg-orange-500 hover:bg-orange-600">
              Utworz plecak
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={showAddItem} onOpenChange={setShowAddItem}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader>
            <SheetTitle className="text-xl">Dodaj przedmiot</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-4 max-h-[60vh] overflow-y-auto">
            <Input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              id="scanner-input"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleScan(file);
              }}
            />
            <Button 
              variant="outline" 
              className="w-full h-14 rounded-xl text-base"
              onClick={() => document.getElementById('scanner-input')?.click()}
              disabled={scanning}
            >
              {scanning ? <RefreshCw className="h-5 w-5 mr-2 animate-spin" /> : <Camera className="h-5 w-5 mr-2" />}
              {scanning ? 'Skanowanie...' : 'Zeskanuj kod/date'}
            </Button>

            {scanResult && (
              <Card className="bg-green-50 dark:bg-green-900/20 rounded-xl">
                <CardContent className="p-3 text-sm">
                  <p className="font-semibold text-green-700 dark:text-green-300">Rozpoznano:</p>
                  {scanResult.productName && <p>Nazwa: {scanResult.productName}</p>}
                  {scanResult.barcode && <p>Kod: {scanResult.barcode}</p>}
                  {scanResult.expiryDate && <p>Data: {scanResult.expiryDate}</p>}
                </CardContent>
              </Card>
            )}

            <div>
              <Label className="text-base">Nazwa *</Label>
              <Input
                placeholder="Nazwa przedmiotu"
                value={newItem.name || ''}
                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                className="h-12 rounded-xl text-base"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-base">Ilosc</Label>
                <Input
                  type="number"
                  min="1"
                  value={newItem.quantity || 1}
                  onChange={(e) => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 1 })}
                  className="h-12 rounded-xl text-base"
                />
              </div>
              <div>
                <Label className="text-base">Kategoria</Label>
                <Select
                  value={newItem.category || 'other'}
                  onValueChange={(v) => setNewItem({ ...newItem, category: v as ItemCategory })}
                >
                  <SelectTrigger className="h-12 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ITEM_CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        <div className="flex items-center gap-2">
                          {categoryIcons[cat.value]}
                          {cat.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-base">Data waznosci</Label>
                <Input
                  type="date"
                  value={newItem.expiryDate ? new Date(newItem.expiryDate).toISOString().split('T')[0] : ''}
                  onChange={(e) => setNewItem({ ...newItem, expiryDate: e.target.value ? new Date(e.target.value) : null })}
                  className="h-12 rounded-xl"
                />
              </div>
              <div>
                <Label className="text-base">Kod kreskowy</Label>
                <Input
                  placeholder="EAN"
                  value={newItem.barcode || ''}
                  onChange={(e) => setNewItem({ ...newItem, barcode: e.target.value })}
                  className="h-12 rounded-xl"
                />
              </div>
            </div>

            <div>
              <Label className="text-base">Notatki</Label>
              <Textarea
                placeholder="Dodatkowe informacje..."
                value={newItem.notes || ''}
                onChange={(e) => setNewItem({ ...newItem, notes: e.target.value })}
                className="rounded-xl"
              />
            </div>

            <Button onClick={handleCreateItem} className="w-full h-12 rounded-xl bg-orange-500 hover:bg-orange-600">
              <Check className="h-5 w-5 mr-2" />
              Dodaj przedmiot
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Toaster />
    </div>
  );
}
