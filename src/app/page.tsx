'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/store';
import { authApi, backpacksApi, itemsApi, scanApi, exportApi, notificationsApi, importantInfoApi, syncApi } from '@/lib/api';
import type { Backpack, Item, ItemCategory, ImportantInfo } from '@/types';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';

import { 
  Backpack, Plus, Trash2, LogOut,
  Utensils, Droplet, Heart, Wrench, FileText, Shirt, Smartphone, Package,
  Camera, Download, Moon, Sun, RefreshCw, 
  ChevronRight, AlertTriangle, X, Check, Search, Minus, ShoppingCart, Menu, Printer
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

type BackpackAudience = 'adult' | 'child' | 'pet' | 'dependent';

const backpackAudiences: { value: BackpackAudience; label: string; description: string; icon: React.ReactNode }[] = [
  { value: 'adult', label: 'Dorosly', description: 'Standardowy plecak 72h', icon: <Backpack className="h-4 w-4" /> },
  { value: 'child', label: 'Dziecko', description: 'Plecak dla dziecka', icon: <Shirt className="h-4 w-4" /> },
  { value: 'pet', label: 'Zwierzak', description: 'Rzeczy dla zwierzecia', icon: <Package className="h-4 w-4" /> },
  { value: 'dependent', label: 'Opieka', description: 'Osoba pod opieka', icon: <Heart className="h-4 w-4" /> },
];

type ViewState = 'backpacks' | 'categories' | 'items' | 'expiring' | 'expired' | 'shopping' | 'info';

interface ShoppingItem {
  id: string;
  name: string;
  category: ItemCategory;
  quantity: number;
  checked: boolean;
  source: 'expired' | 'expiring' | 'manual';
  originalItemId?: string;
  addedAt: string;
}

type ImportantNote = Pick<ImportantInfo, 'id' | 'title' | 'content' | 'createdAt'> & {
  userId?: string;
  updatedAt?: Date | string;
};

const SHOPPING_LIST_KEY = 'shoppingList';
const SHOPPING_IGNORE_KEY = 'shoppingIgnoredItemIds';
const IMPORTANT_INFO_KEY = 'importantInfoNotes';
const AUDIENCE_ICON_PREFIX = 'audience:';

const GENERAL_IMPORTANT_INFO = [
  {
    title: 'Plan kontaktu',
    content: 'Ustal, kto do kogo dzwoni, gdzie spotykacie sie po ewakuacji i jaki jest kontakt zapasowy poza miejscem zamieszkania.',
  },
  {
    title: 'Dokumenty i kopie',
    content: 'Trzymaj kopie dokumentow, polis, recept i waznych numerow w wodoszczelnej kopercie oraz w bezpiecznej kopii cyfrowej.',
  },
  {
    title: 'Zdrowie',
    content: 'Zapisz leki stale, dawki, alergie, choroby przewlekle oraz kontakt do lekarza. To moze byc kluczowe przy udzielaniu pomocy.',
  },
  {
    title: 'Dom i media',
    content: 'Zapisz, gdzie sa zawory wody, gazu, bezpieczniki, latarka awaryjna i zapasowe klucze.',
  },
];

const getBackpackAudience = (icon?: string | null): BackpackAudience => {
  const value = icon?.startsWith(AUDIENCE_ICON_PREFIX)
    ? icon.slice(AUDIENCE_ICON_PREFIX.length)
    : 'adult';

  return backpackAudiences.some(audience => audience.value === value)
    ? value as BackpackAudience
    : 'adult';
};

const getBackpackAudienceMeta = (icon?: string | null) => {
  const audience = getBackpackAudience(icon);
  return backpackAudiences.find(item => item.value === audience) || backpackAudiences[0];
};

type StarterChecklistItem = {
  name: string;
  category: ItemCategory;
  quantity: number;
  notes: string;
};

const BASE_STARTER_CHECKLIST: StarterChecklistItem[] = [
  { name: 'Woda butelkowana 1,5 l', category: 'water', quantity: 3, notes: 'Minimum 9 l na osobe na 72h. Do plecaka wez 2-3 butelki 1,5 l na start; reszte transportuj osobno, jesli masz samochod.' },
  { name: 'Tabletki do uzdatniania wody', category: 'water', quantity: 1, notes: 'Do awaryjnego uzdatniania wody.' },
  { name: 'Konserwy', category: 'food', quantity: 3, notes: 'Mieso, ryby, gulasz lub podobne gotowe jedzenie.' },
  { name: 'Batony energetyczne', category: 'food', quantity: 6, notes: 'Szybki zapas energii, najlepiej batony zbozowe lub energetyczne.' },
  { name: 'Posilki suszone lub liofilizowane', category: 'food', quantity: 3, notes: 'Lekkie posilki awaryjne, np. zupy instant lub dania liofilizowane.' },
  { name: 'Czekolada lub karmelki', category: 'food', quantity: 1, notes: 'Szybkie zrodlo energii i poprawa nastroju.' },
  { name: 'Otwieracz do konserw', category: 'tools', quantity: 1, notes: 'Kluczowy, jesli w plecaku sa puszki.' },
  { name: 'Kubek, talerz i sztucce', category: 'tools', quantity: 1, notes: 'Najlepiej plastikowe lub metalowe, wielorazowe.' },
  { name: 'Apteczka pierwszej pomocy', category: 'medical', quantity: 1, notes: 'Plastry, bandaz elastyczny, srodek do dezynfekcji ran i podstawowe opatrunki.' },
  { name: 'Leki stale', category: 'medical', quantity: 1, notes: 'Zapas minimum na 3-5 dni, szczegolnie przy chorobach przewleklych.' },
  { name: 'Leki przeciwbolowe', category: 'medical', quantity: 1, notes: 'Np. paracetamol lub ibuprofen, zgodnie z potrzebami domownikow.' },
  { name: 'Mydlo', category: 'medical', quantity: 1, notes: 'Mydlo w plynie lub kostka.' },
  { name: 'Plyn do dezynfekcji rak', category: 'medical', quantity: 1, notes: 'Maly pojemnik do plecaka.' },
  { name: 'Recznik papierowy lub sciereczki', category: 'medical', quantity: 1, notes: 'Mala rolka albo sciereczki wielorazowe.' },
  { name: 'Pasta i szczoteczka do zebow', category: 'medical', quantity: 1, notes: 'Podstawowa higiena na 72h.' },
  { name: 'Papier toaletowy', category: 'medical', quantity: 4, notes: 'Np. mala zgrzewka 4 rolek.' },
  { name: 'Latarka czolowa', category: 'tools', quantity: 1, notes: 'Czolowa zostawia wolne rece; dodaj zapas baterii.' },
  { name: 'Zapas baterii', category: 'electronics', quantity: 1, notes: 'Do latarki, radia i innych urzadzen.' },
  { name: 'Radio przenosne', category: 'electronics', quantity: 1, notes: 'Najlepiej na korbke lub z panelem slonecznym, do odbioru komunikatow.' },
  { name: 'Zapalki lub zapalniczka', category: 'tools', quantity: 1, notes: 'Trzymaj w wodoszczelnym opakowaniu.' },
  { name: 'Noz wielofunkcyjny lub scyzoryk', category: 'tools', quantity: 1, notes: 'Do napraw, przygotowania jedzenia i drobnych prac.' },
  { name: 'Kompas', category: 'tools', quantity: 1, notes: 'Awaryjna orientacja w terenie.' },
  { name: 'Tasma klejaca srebrna', category: 'tools', quantity: 1, notes: 'Uniwersalna do napraw i zabezpieczania.' },
  { name: 'Folia NRC', category: 'tools', quantity: 1, notes: 'Koc ratunkowy chroni przed utrata ciepla i zajmuje malo miejsca.' },
  { name: 'Gotowka', category: 'documents', quantity: 1, notes: 'Male nominaly, kwota na 3 dni pobytu i podstawowe zakupy.' },
  { name: 'Kserokopie dokumentow', category: 'documents', quantity: 1, notes: 'Dowod, paszport, polisy, numery kont - w wodoszczelnej torebce.' },
  { name: 'Spis telefonow', category: 'documents', quantity: 1, notes: 'Telefony do bliskich, lekarzy i sluzb ratunkowych na kartce.' },
  { name: 'Solidne buty', category: 'clothes', quantity: 1, notes: 'Wygodne, najlepiej za kostke.' },
  { name: 'Bielizna i skarpety', category: 'clothes', quantity: 4, notes: '3-4 pary skarpetek oraz bielizna osobista.' },
  { name: 'Ubranie zapasowe', category: 'clothes', quantity: 1, notes: 'Dluga koszula i spodnie, najlepiej szybkoschnace.' },
  { name: 'Kurtka przeciwdeszczowa lub peleryna', category: 'clothes', quantity: 1, notes: 'Ochrona przed deszczem i wiatrem.' },
  { name: 'Czapka', category: 'clothes', quantity: 1, notes: 'Dostosuj do pory roku: zimowa albo przeciwsloneczna.' },
  { name: 'Rekawice robocze', category: 'clothes', quantity: 1, notes: 'Do ochrony dloni przy przenoszeniu i pracy.' },
  { name: 'Biblia drukowana', category: 'documents', quantity: 1, notes: 'Male wydanie drukowane.' },
  { name: 'Telefon z ladowarka', category: 'electronics', quantity: 1, notes: 'Naladowany telefon, ladowarka, przydatna aplikacja JW Library.' },
  { name: 'Powerbank', category: 'electronics', quantity: 1, notes: 'Naladowany, do telefonu i drobnej elektroniki.' },
  { name: 'Mleko modyfikowane lub kaszki', category: 'food', quantity: 1, notes: 'Dla rodzin z dziecmi: zapas na 3 dni.' },
  { name: 'Pieluchy jednorazowe', category: 'other', quantity: 20, notes: 'Dla rodzin z dziecmi: ok. 15-20 sztuk na 3 dni.' },
  { name: 'Chusteczki nawilzane', category: 'medical', quantity: 1, notes: 'Dla dzieci i higieny w drodze.' },
  { name: 'Ulubiona zabawka lub pluszak', category: 'other', quantity: 1, notes: 'Pomaga dziecku w uspokojeniu.' },
];

const AUDIENCE_STARTER_ADDITIONS: Record<BackpackAudience, StarterChecklistItem[]> = {
  adult: [],
  child: [],
  pet: [],
  dependent: [],
};

const getStarterChecklistForAudience = (audience: BackpackAudience) => [
  ...BASE_STARTER_CHECKLIST,
  ...AUDIENCE_STARTER_ADDITIONS[audience],
];

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
  const [newBackpack, setNewBackpack] = useState({
    name: '',
    description: '',
    color: '#f97316',
    audience: 'adult' as BackpackAudience,
  });
  const [includeStarterChecklist, setIncludeStarterChecklist] = useState(true);
  const [newItem, setNewItem] = useState<Partial<Item>>({ name: '', quantity: 1, category: 'other' });
  const [showAddBackpack, setShowAddBackpack] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ barcode: string | null; expiryDate: string | null; productName: string | null } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [shoppingList, setShoppingList] = useState<ShoppingItem[]>([]);
  const [shoppingIgnoredItemIds, setShoppingIgnoredItemIds] = useState<string[]>([]);
  const [shoppingStorageLoaded, setShoppingStorageLoaded] = useState(false);
  const [showAddShoppingItem, setShowAddShoppingItem] = useState(false);
  const [newShoppingItem, setNewShoppingItem] = useState({ name: '', quantity: 1, category: 'other' as ItemCategory });
  const [importantNotes, setImportantNotes] = useState<ImportantNote[]>([]);
  const [infoStorageLoaded, setInfoStorageLoaded] = useState(false);
  const [showAddImportantNote, setShowAddImportantNote] = useState(false);
  const [newImportantNote, setNewImportantNote] = useState({ title: '', content: '' });
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

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

  const activeShoppingCount = shoppingList.filter(item => !item.checked).length;
  const checkedShoppingCount = shoppingList.length - activeShoppingCount;
  const shoppingItemsByCategory = shoppingList.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<ItemCategory, ShoppingItem[]>);
  const totalIssueCount = expiringItems.length + expiredItems.length;

  const categoryItems = selectedCategory 
    ? backpackItems.filter(i => i.category === selectedCategory)
    : [];

  const getShoppingSourceForItem = useCallback((item: Item): ShoppingItem['source'] | null => {
    if (!item.expiryDate) return null;
    const expDate = new Date(item.expiryDate);
    const now = new Date();
    const diffDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (expDate < now) return 'expired';
    if (diffDays <= 7 && diffDays >= 0) return 'expiring';
    return null;
  }, []);

  const getSourceBadge = (source: ShoppingItem['source']) => {
    if (source === 'expired') {
      return <Badge className="bg-red-100 text-red-700 dark:bg-red-800 dark:text-red-200 text-xs">Po terminie</Badge>;
    }
    if (source === 'expiring') {
      return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-800 dark:text-amber-200 text-xs">Konczy sie</Badge>;
    }
    return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-200 text-xs">Recznie</Badge>;
  };

  const refreshPendingSyncCount = useCallback(async () => {
    try {
      const pendingChanges = await getPendingChanges();
      setPendingSyncCount(pendingChanges.length);
    } catch {
      setPendingSyncCount(0);
    }
  }, []);

  const queueOfflineChange = async (type: string, data: Record<string, unknown>) => {
    await addPendingChange(type, data);
    await refreshPendingSyncCount();
    try {
      await registerBackgroundSync();
    } catch {
      // Browser background sync is optional; queued changes still sync on reconnect.
    }
  };

  const isBrowserOnline = () => typeof navigator === 'undefined' || navigator.onLine;

  const syncPendingChanges = useCallback(async () => {
    const pendingChanges = await getPendingChanges();
    setPendingSyncCount(pendingChanges.length);
    if (pendingChanges.length === 0) return true;

    setIsSyncing(true);
    try {
      const response = await syncApi.sync(pendingChanges);
      const syncResult = response.data as { errors?: string[] } | undefined;

      if (response.success && (!syncResult?.errors || syncResult.errors.length === 0)) {
        await clearPendingChanges();
        await refreshPendingSyncCount();
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
    } finally {
      setIsSyncing(false);
      await refreshPendingSyncCount();
    }
  }, [refreshPendingSyncCount]);

  useEffect(() => {
    try {
      const savedShoppingList = localStorage.getItem(SHOPPING_LIST_KEY);
      const savedIgnoredIds = localStorage.getItem(SHOPPING_IGNORE_KEY);

      if (savedShoppingList) {
        setShoppingList(JSON.parse(savedShoppingList));
      }
      if (savedIgnoredIds) {
        setShoppingIgnoredItemIds(JSON.parse(savedIgnoredIds));
      }
    } catch (e) {
      console.error('Failed to load shopping list:', e);
    } finally {
      setShoppingStorageLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!shoppingStorageLoaded) return;
    localStorage.setItem(SHOPPING_LIST_KEY, JSON.stringify(shoppingList));
    localStorage.setItem(SHOPPING_IGNORE_KEY, JSON.stringify(shoppingIgnoredItemIds));
  }, [shoppingList, shoppingIgnoredItemIds, shoppingStorageLoaded]);

  useEffect(() => {
    try {
      const savedNotes = localStorage.getItem(IMPORTANT_INFO_KEY);
      if (savedNotes) {
        setImportantNotes(JSON.parse(savedNotes));
      }
    } catch (e) {
      console.error('Failed to load important notes:', e);
    } finally {
      setInfoStorageLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!infoStorageLoaded) return;
    localStorage.setItem(IMPORTANT_INFO_KEY, JSON.stringify(importantNotes));
  }, [importantNotes, infoStorageLoaded]);

  useEffect(() => {
    if (!shoppingStorageLoaded) return;

    setShoppingList((currentList) => {
      const existingAutoIds = new Set(
        currentList
          .filter(item => item.source !== 'manual' && item.originalItemId)
          .map(item => item.originalItemId)
      );
      const ignoredIds = new Set(shoppingIgnoredItemIds);
      const additions: ShoppingItem[] = [];

      items.forEach((item) => {
        if (existingAutoIds.has(item.id) || ignoredIds.has(item.id)) return;

        const source = getShoppingSourceForItem(item);
        if (!source) return;

        additions.push({
          id: generateId(),
          name: item.name,
          category: item.category,
          quantity: Math.max(1, item.quantity),
          checked: false,
          source,
          originalItemId: item.id,
          addedAt: new Date().toISOString(),
        });
      });

      return additions.length > 0 ? [...currentList, ...additions] : currentList;
    });
  }, [getShoppingSourceForItem, items, shoppingIgnoredItemIds, shoppingStorageLoaded]);

  useEffect(() => {
    const init = async () => {
      try {
        const localBackpacks = await getBackpacksLocal();
        const localItems = await getItemsLocal();
        await refreshPendingSyncCount();
        
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
  }, [refreshPendingSyncCount, syncPendingChanges]);

  const loadData = async () => {
    try {
      const [backpacksRes, notifRes, importantInfoRes] = await Promise.all([
        backpacksApi.getAll(),
        notificationsApi.getAll(),
        importantInfoApi.getAll(),
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

      if (importantInfoRes.success && importantInfoRes.data) {
        let notes = importantInfoRes.data;
        const savedNotes = localStorage.getItem(IMPORTANT_INFO_KEY);

        if (savedNotes) {
          try {
            const localNotes = JSON.parse(savedNotes) as ImportantNote[];
            const existing = new Set(notes.map(note => `${note.title.trim()}|${note.content.trim()}`));
            const notesToMigrate = localNotes.filter(note =>
              note?.title?.trim() &&
              note?.content?.trim() &&
              !existing.has(`${note.title.trim()}|${note.content.trim()}`)
            );

            if (notesToMigrate.length > 0) {
              const migrated = [];
              for (const note of notesToMigrate) {
                const response = await importantInfoApi.create({
                  title: note.title.trim(),
                  content: note.content.trim(),
                });
                if (response.success && response.data) migrated.push(response.data);
              }
              notes = [...migrated, ...notes];
            }
          } catch (error) {
            console.error('Failed to migrate important notes:', error);
          }
        }

        setImportantNotes(notes);
        setInfoStorageLoaded(true);
      }
    } catch (error) {
      console.error('Failed to load data from server:', error);
    }
  };

  const handleManualSync = async () => {
    if (!isBrowserOnline()) {
      toast({ title: 'Offline', description: 'Polacz sie z internetem, aby wyslac zmiany' });
      return;
    }

    const synced = await syncPendingChanges();
    if (synced) await loadData();
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
        await loadData();
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

  const addStarterShoppingItems = (starterItems: Item[]) => {
    const shoppingItems: ShoppingItem[] = starterItems.map((item) => ({
      id: generateId(),
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      checked: false,
      source: 'manual',
      originalItemId: item.id,
      addedAt: new Date().toISOString(),
    }));

    setShoppingList(prev => [...prev, ...shoppingItems]);
  };

  const createStarterChecklistItems = async (backpackId: string, audience: BackpackAudience, mode: 'server' | 'queued') => {
    const now = new Date();
    const audienceLabel = backpackAudiences.find(item => item.value === audience)?.label || 'Dorosly';
    const localItems: Item[] = getStarterChecklistForAudience(audience).map((template) => ({
      id: generateId(),
      name: template.name,
      quantity: template.quantity,
      category: template.category,
      backpackId,
      expiryDate: null,
      barcode: null,
      notes: `[${audienceLabel}] ${template.notes}`,
      imageUrl: null,
      createdAt: now,
      updatedAt: now,
    }));

    for (const item of localItems) {
      addItem(item);
      await saveItemLocal(item);
    }

    addStarterShoppingItems(localItems);

    if (mode === 'queued') {
      for (const item of localItems) {
        await queueOfflineChange('create_item', item as unknown as Record<string, unknown>);
      }
      return;
    }

    for (const item of localItems) {
      try {
        const response = await itemsApi.create({
          name: item.name,
          quantity: item.quantity,
          category: item.category,
          backpackId,
          expiryDate: null,
          barcode: null,
          notes: item.notes,
          imageUrl: null,
        });

        if (response.success && response.data) {
          const serverItem = response.data as Item;
          removeItem(item.id);
          await deleteItemLocal(item.id);
          addItem(serverItem);
          await saveItemLocal(serverItem);
        } else {
          await queueOfflineChange('create_item', item as unknown as Record<string, unknown>);
        }
      } catch {
        await queueOfflineChange('create_item', item as unknown as Record<string, unknown>);
      }
    }
  };

  const handleCreateBackpack = async () => {
    if (!newBackpack.name.trim()) return;
    const shouldAddStarterChecklist = includeStarterChecklist;
    const selectedAudience = newBackpack.audience;
    const backpackPayload = {
      name: newBackpack.name,
      description: newBackpack.description,
      color: newBackpack.color,
      icon: `${AUDIENCE_ICON_PREFIX}${selectedAudience}`,
    };
    
    const localBackpack: Backpack = {
      id: generateId(),
      name: backpackPayload.name,
      description: backpackPayload.description || '',
      color: backpackPayload.color || '#f97316',
      icon: backpackPayload.icon,
      userId: user?.id || 'local',
      items: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const finishLocalBackpackCreate = async () => {
      addBackpack(localBackpack);
      await saveBackpackLocal(localBackpack);
      await queueOfflineChange('create_backpack', localBackpack as unknown as Record<string, unknown>);
      if (shouldAddStarterChecklist) {
        await createStarterChecklistItems(localBackpack.id, selectedAudience, 'queued');
      }
      setShowAddBackpack(false);
      setNewBackpack({ name: '', description: '', color: '#f97316', audience: 'adult' });
      setIncludeStarterChecklist(true);
      toast({
        title: 'Sukces',
        description: shouldAddStarterChecklist
          ? 'Plecak i checklista 72h utworzone lokalnie'
          : 'Plecak utworzony lokalnie (offline)',
      });
    };

    if (!isBrowserOnline()) {
      await finishLocalBackpackCreate();
      return;
    }

    addBackpack(localBackpack);
    await saveBackpackLocal(localBackpack);
    setShowAddBackpack(false);
    setNewBackpack({ name: '', description: '', color: '#f97316', audience: 'adult' });
    setIncludeStarterChecklist(true);
    
    try {
      const response = await backpacksApi.create(backpackPayload);
      if (response.success && response.data) {
        removeBackpack(localBackpack.id);
        await deleteBackpackLocal(localBackpack.id);
        addBackpack(response.data);
        await saveBackpackLocal(response.data);
        if (shouldAddStarterChecklist) {
          await createStarterChecklistItems(response.data.id, selectedAudience, 'server');
        }
        toast({
          title: 'Sukces',
          description: shouldAddStarterChecklist
            ? 'Plecak utworzony z checklista 72h'
            : 'Plecak utworzony!',
        });
      } else {
        await queueOfflineChange('create_backpack', localBackpack as unknown as Record<string, unknown>);
        if (shouldAddStarterChecklist) {
          await createStarterChecklistItems(localBackpack.id, selectedAudience, 'queued');
        }
        toast({ title: 'Sukces', description: 'Plecak utworzony lokalnie, zsynchronizuje sie pozniej' });
      }
    } catch {
      await queueOfflineChange('create_backpack', localBackpack as unknown as Record<string, unknown>);
      if (shouldAddStarterChecklist) {
        await createStarterChecklistItems(localBackpack.id, selectedAudience, 'queued');
      }
      toast({ title: 'Sukces', description: 'Plecak utworzony lokalnie (offline)' });
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

    addItem(localItem);
    await saveItemLocal(localItem);
    finishAddItem();
    
    try {
      const response = await itemsApi.create({
        ...newItem,
        backpackId: selectedBackpackId,
        quantity: newItem.quantity || 1,
        category: newItem.category || 'other',
      });
      if (response.success && response.data) {
        removeItem(localItem.id);
        await deleteItemLocal(localItem.id);
        addItem(response.data);
        await saveItemLocal(response.data);
        toast({ title: 'Dodano!', description: 'Przedmiot dodany do plecaka' });
      } else {
        await queueOfflineChange('create_item', localItem as unknown as Record<string, unknown>);
        toast({ title: 'Blad', description: response.error || 'Nie udalo sie dodac przedmiotu', variant: 'destructive' });
      }
    } catch {
      await queueOfflineChange('create_item', localItem as unknown as Record<string, unknown>);
      toast({ title: 'Dodano!', description: 'Przedmiot dodany lokalnie (offline)' });
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

  const toggleShoppingItem = (id: string) => {
    setShoppingList(prev => prev.map(item =>
      item.id === id ? { ...item, checked: !item.checked } : item
    ));
  };

  const removeShoppingItem = (id: string) => {
    const removedItem = shoppingList.find(item => item.id === id);
    if (removedItem?.originalItemId) {
      setShoppingIgnoredItemIds(ids => (
        ids.includes(removedItem.originalItemId!) ? ids : [...ids, removedItem.originalItemId!]
      ));
    }
    setShoppingList(prev => prev.filter(item => item.id !== id));
  };

  const addManualShoppingItem = () => {
    if (!newShoppingItem.name.trim()) return;

    const item: ShoppingItem = {
      id: generateId(),
      name: newShoppingItem.name.trim(),
      category: newShoppingItem.category,
      quantity: Math.max(1, newShoppingItem.quantity || 1),
      checked: false,
      source: 'manual',
      addedAt: new Date().toISOString(),
    };

    setShoppingList(prev => [...prev, item]);
    setNewShoppingItem({ name: '', quantity: 1, category: 'other' });
    setShowAddShoppingItem(false);
    toast({ title: 'Dodano', description: 'Pozycja dodana do listy zakupow' });
  };

  const clearCheckedShoppingItems = () => {
    const checkedOriginalIds = shoppingList
      .filter(item => item.checked && item.originalItemId)
      .map(item => item.originalItemId!);

    if (checkedOriginalIds.length > 0) {
      setShoppingIgnoredItemIds(ids => Array.from(new Set([...ids, ...checkedOriginalIds])));
    }

    setShoppingList(prev => prev.filter(item => !item.checked));
    toast({ title: 'Wyczyszczono', description: 'Kupione pozycje usuniete z listy' });
  };

  const exportShoppingList = () => {
    const text = shoppingList
      .map(item => {
        const category = ITEM_CATEGORIES.find(cat => cat.value === item.category)?.label || item.category;
        return `${item.checked ? '[x]' : '[ ]'} ${item.name} x${item.quantity} (${category})`;
      })
      .join('\n');
    const blob = new Blob([`Lista zakupow - ${new Date().toLocaleDateString('pl-PL')}\n\n${text}`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lista-zakupow-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({ title: 'Wyeksportowano', description: 'Lista zakupow pobrana' });
  };

  const printEmergencyReport = () => {
    const escapeHtml = (value: unknown) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    const formatDate = (value: Date | string | null | undefined) => {
      if (!value) return '';
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pl-PL');
    };

    const categoryLabel = (category: ItemCategory | string) =>
      ITEM_CATEGORIES.find(cat => cat.value === category)?.label || String(category);

    const backpackSections = backpacks.map((backpack) => {
      const audience = getBackpackAudienceMeta(backpack.icon);
      const backpackItemsForPrint = items
        .filter(item => item.backpackId === backpack.id)
        .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

      const rows = backpackItemsForPrint.length > 0
        ? backpackItemsForPrint.map(item => `
          <tr>
            <td>${escapeHtml(item.name)}</td>
            <td>${escapeHtml(categoryLabel(item.category))}</td>
            <td>${escapeHtml(item.quantity)}</td>
            <td>${escapeHtml(formatDate(item.expiryDate))}</td>
            <td>${escapeHtml(item.notes)}</td>
          </tr>
        `).join('')
        : '<tr><td colspan="5" class="muted">Brak przedmiotow</td></tr>';

      return `
        <section>
          <h2>${escapeHtml(backpack.name)}</h2>
          <p class="muted">${escapeHtml(audience.label)}${backpack.description ? ` | ${escapeHtml(backpack.description)}` : ''}</p>
          <table>
            <thead>
              <tr><th>Przedmiot</th><th>Kategoria</th><th>Ilosc</th><th>Data</th><th>Notatki</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </section>
      `;
    }).join('');

    const shoppingRows = shoppingList.length > 0
      ? shoppingList.map(item => `
        <tr>
          <td>${item.checked ? '[x]' : '[ ]'}</td>
          <td>${escapeHtml(item.name)}</td>
          <td>${escapeHtml(categoryLabel(item.category))}</td>
          <td>${escapeHtml(item.quantity)}</td>
        </tr>
      `).join('')
      : '<tr><td colspan="4" class="muted">Lista zakupow jest pusta</td></tr>';

    const generalInfo = GENERAL_IMPORTANT_INFO.map(info => `
      <article class="note">
        <h3>${escapeHtml(info.title)}</h3>
        <p>${escapeHtml(info.content)}</p>
      </article>
    `).join('');

    const personalInfo = importantNotes.length > 0
      ? importantNotes.map(note => `
        <article class="note">
          <h3>${escapeHtml(note.title)}</h3>
          <p>${escapeHtml(note.content)}</p>
        </article>
      `).join('')
      : '<p class="muted">Brak wlasnych informacji.</p>';

    const reportHtml = `<!doctype html>
      <html lang="pl">
        <head>
          <meta charset="utf-8" />
          <title>Raport awaryjny</title>
          <style>
            body { font-family: Arial, sans-serif; color: #111; margin: 24px; line-height: 1.35; }
            h1 { font-size: 24px; margin: 0 0 4px; }
            h2 { font-size: 18px; margin: 24px 0 4px; border-bottom: 1px solid #ddd; padding-bottom: 6px; }
            h3 { font-size: 15px; margin: 0 0 4px; }
            .muted { color: #666; }
            .meta { margin-bottom: 24px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
            th, td { border: 1px solid #ddd; padding: 6px; vertical-align: top; text-align: left; }
            th { background: #f3f4f6; }
            .note { border: 1px solid #ddd; padding: 10px; margin: 8px 0; border-radius: 6px; }
            @media print {
              body { margin: 12mm; }
              section { break-inside: avoid; }
              .note { break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <h1>Raport awaryjny</h1>
          <p class="meta muted">Wygenerowano: ${escapeHtml(new Date().toLocaleString('pl-PL'))}</p>
          <section>
            <h2>Plecaki i przedmioty</h2>
            ${backpackSections || '<p class="muted">Brak plecakow.</p>'}
          </section>
          <section>
            <h2>Lista zakupow</h2>
            <table>
              <thead><tr><th>Status</th><th>Pozycja</th><th>Kategoria</th><th>Ilosc</th></tr></thead>
              <tbody>${shoppingRows}</tbody>
            </table>
          </section>
          <section>
            <h2>Wazne informacje ogolne</h2>
            ${generalInfo}
          </section>
          <section>
            <h2>Moje wazne informacje</h2>
            ${personalInfo}
          </section>
        </body>
      </html>`;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({ title: 'Blad', description: 'Przegladarka zablokowala okno drukowania', variant: 'destructive' });
      return;
    }

    printWindow.opener = null;
    printWindow.document.open();
    printWindow.document.write(reportHtml);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const addImportantNote = async () => {
    if (!newImportantNote.title.trim() || !newImportantNote.content.trim()) return;

    const localNote: ImportantNote = {
      id: generateId(),
      title: newImportantNote.title.trim(),
      content: newImportantNote.content.trim(),
      createdAt: new Date().toISOString(),
    };

    setNewImportantNote({ title: '', content: '' });
    setShowAddImportantNote(false);

    if (!isBrowserOnline()) {
      setImportantNotes(prev => [localNote, ...prev]);
      toast({ title: 'Dodano lokalnie', description: 'Informacja zapisze sie na serwerze po synchronizacji' });
      return;
    }

    try {
      const response = await importantInfoApi.create({
        title: localNote.title,
        content: localNote.content,
      });

      if (response.success && response.data) {
        setImportantNotes(prev => [response.data!, ...prev]);
        toast({ title: 'Dodano', description: 'Informacja zostala zapisana' });
      } else {
        setImportantNotes(prev => [localNote, ...prev]);
        toast({ title: 'Dodano lokalnie', description: response.error || 'Serwer zapisze informacje pozniej' });
      }
    } catch {
      setImportantNotes(prev => [localNote, ...prev]);
      toast({ title: 'Dodano lokalnie', description: 'Informacja zapisze sie na serwerze pozniej' });
    }
  };

  const removeImportantNote = async (id: string) => {
    const noteToRemove = importantNotes.find(note => note.id === id);

    if (!isBrowserOnline()) {
      if (noteToRemove && !noteToRemove.userId) {
        setImportantNotes(prev => prev.filter(note => note.id !== id));
        toast({ title: 'Usunieto', description: 'Lokalna informacja zostala usunieta' });
        return;
      }

      toast({ title: 'Offline', description: 'Polacz sie z internetem, aby usunac informacje' });
      return;
    }

    const previousNotes = importantNotes;
    setImportantNotes(prev => prev.filter(note => note.id !== id));

    try {
      const response = await importantInfoApi.delete(id);
      if (response.success) {
        toast({ title: 'Usunieto', description: 'Informacja zostala usunieta' });
      } else {
        setImportantNotes(previousNotes);
        toast({ title: 'Blad', description: response.error || 'Nie udalo sie usunac informacji', variant: 'destructive' });
      }
    } catch {
      setImportantNotes(previousNotes);
      toast({ title: 'Blad', description: 'Nie udalo sie usunac informacji', variant: 'destructive' });
    }
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

  const handleExportCsv = async () => {
    if (!selectedBackpackId) return;
    try {
      await exportApi.exportCsv(selectedBackpackId);
      toast({ title: 'Pobrano CSV' });
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
    } else if (view === 'categories' || view === 'expiring' || view === 'expired' || view === 'shopping' || view === 'info') {
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
    <div className="min-h-screen bg-neutral-100 text-neutral-950 dark:bg-neutral-950 dark:text-neutral-50">
      <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/95 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center">
            {view !== 'backpacks' && (
              <Button variant="ghost" size="icon" onClick={goBack} className="mr-2">
                <ChevronRight className="h-6 w-6 rotate-180" />
              </Button>
            )}
            <h1 className="text-lg font-semibold tracking-normal truncate">
              {view === 'backpacks' && 'Moje plecaki'}
              {view === 'categories' && selectedBackpack?.name}
              {view === 'items' && `${selectedBackpack?.name} - ${ITEM_CATEGORIES.find(c => c.value === selectedCategory)?.label}`}
              {view === 'expiring' && 'Konczace sie'}
              {view === 'expired' && 'Przeterminowane'}
              {view === 'shopping' && 'Lista zakupow'}
              {view === 'info' && 'Wazne informacje'}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {isOffline && (
              <Badge variant="outline" className="border-amber-500/40 bg-amber-50 text-amber-700 text-xs dark:bg-amber-950/30 dark:text-amber-200">
                Offline
              </Badge>
            )}
            <Button variant="ghost" size="icon" onClick={() => setShowSearch(!showSearch)}>
              <Search className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={toggleDarkMode}>
              {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Menu akcji">
                  <Menu className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-lg">
                <DropdownMenuLabel>Akcje</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => setShowAddBackpack(true)}>
                  <Plus className="h-4 w-4" />
                  Nowy plecak
                </DropdownMenuItem>
                {view === 'info' && (
                  <DropdownMenuItem onSelect={() => setShowAddImportantNote(true)}>
                    <FileText className="h-4 w-4" />
                    Dodaj informacje
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={printEmergencyReport}>
                  <Printer className="h-4 w-4" />
                  Drukuj raport
                </DropdownMenuItem>
                {!isOffline && pendingSyncCount > 0 && (
                  <DropdownMenuItem onSelect={handleManualSync} disabled={isSyncing}>
                    <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                    Synchronizuj
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={handleLogout} variant="destructive">
                  <LogOut className="h-4 w-4" />
                  Wyloguj
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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

        {(isOffline || pendingSyncCount > 0 || isSyncing) && (
          <div className="px-4 pb-3">
            <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-100">
              <RefreshCw className={`h-4 w-4 shrink-0 ${isSyncing ? 'animate-spin' : ''}`} />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">
                  {isSyncing && 'Wysylanie zmian...'}
                  {!isSyncing && isOffline && pendingSyncCount > 0 && `${pendingSyncCount} zmian czeka na wyslanie`}
                  {!isSyncing && isOffline && pendingSyncCount === 0 && 'Tryb offline - dane zapisuja sie lokalnie'}
                  {!isSyncing && !isOffline && pendingSyncCount > 0 && `${pendingSyncCount} zmian czeka na synchronizacje`}
                </p>
              </div>
              {!isOffline && pendingSyncCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-lg bg-white/70 px-3 text-amber-900 hover:bg-white dark:bg-amber-950/40 dark:text-amber-100"
                  onClick={handleManualSync}
                  disabled={isSyncing}
                >
                  Synchronizuj
                </Button>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="px-4 py-4 pb-28">
        {view === 'backpacks' && (
          <div className="space-y-4">
            <Card className="rounded-lg border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">Status operacyjny</p>
                    <p className="text-xl font-semibold">
                      {totalIssueCount > 0 ? `${totalIssueCount} spraw do kontroli` : 'Wszystko pod kontrola'}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={totalIssueCount > 0
                      ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200'
                      : 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200'
                    }
                  >
                    {totalIssueCount > 0 ? 'Uwaga' : 'Gotowe'}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-3 gap-3">
              <Card
                className="rounded-lg border-amber-200 bg-white shadow-sm cursor-pointer active:scale-[0.98] transition-transform dark:border-amber-900/60 dark:bg-neutral-900"
                onClick={() => setView('expiring')}
              >
                <CardContent className="p-3">
                  <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-md bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <p className="text-2xl font-semibold text-neutral-950 dark:text-neutral-50">{expiringItems.length}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Konczy sie</p>
                </CardContent>
              </Card>
              <Card
                className="rounded-lg border-red-200 bg-white shadow-sm cursor-pointer active:scale-[0.98] transition-transform dark:border-red-900/60 dark:bg-neutral-900"
                onClick={() => setView('expired')}
              >
                <CardContent className="p-3">
                  <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-md bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300">
                    <Trash2 className="h-4 w-4" />
                  </div>
                  <p className="text-2xl font-semibold text-neutral-950 dark:text-neutral-50">{expiredItems.length}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Po terminie</p>
                </CardContent>
              </Card>
              <Card
                className="rounded-lg border-emerald-200 bg-white shadow-sm cursor-pointer active:scale-[0.98] transition-transform dark:border-emerald-900/60 dark:bg-neutral-900"
                onClick={() => setView('shopping')}
              >
                <CardContent className="p-3">
                  <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                    <ShoppingCart className="h-4 w-4" />
                  </div>
                  <p className="text-2xl font-semibold text-neutral-950 dark:text-neutral-50">{activeShoppingCount}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Do kupienia</p>
                </CardContent>
              </Card>
            </div>

            {backpacks.length === 0 ? (
              <Card className="rounded-lg border-dashed p-8 text-center shadow-sm">
                <Backpack className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">Nie masz jeszcze plecakow</p>
                <p className="text-sm text-gray-400 mt-1">Otworz menu akcji i dodaj pierwszy plecak</p>
              </Card>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {backpacks.map((backpack) => {
                  const itemCount = items.filter(i => i.backpackId === backpack.id).length;
                  const backpackExpiredCount = expiredItems.filter(i => i.backpackId === backpack.id).length;
                  const backpackExpiringCount = expiringItems.filter(i => i.backpackId === backpack.id).length;
                  const backpackIssueCount = backpackExpiredCount + backpackExpiringCount;
                  const audienceMeta = getBackpackAudienceMeta(backpack.icon);
                  const isDeleting = deleteConfirm === backpack.id;
                  
                  return (
                    <Card
                      key={backpack.id}
                      className="relative overflow-hidden rounded-lg border-neutral-200 bg-white shadow-sm active:scale-[0.98] transition-transform cursor-pointer dark:border-neutral-800 dark:bg-neutral-900"
                      onClick={() => !isDeleting && navigateToItems(backpack.id)}
                    >
                      <div className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: backpack.color }} />
                      <CardContent className="p-3 pl-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-neutral-100 dark:bg-neutral-800">
                              <Backpack className="h-5 w-5" style={{ color: backpack.color }} />
                            </div>
                            <p className="font-semibold text-base truncate">{backpack.name}</p>
                            <p className="text-sm text-neutral-500 dark:text-neutral-400">{itemCount} przedmiotow</p>
                            <p className="mt-1 text-xs text-neutral-400">{audienceMeta.label}</p>
                          </div>
                          {isDeleting ? (
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 w-7 p-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteBackpack(backpack.id);
                                }}
                              >
                                <Check className="h-4 w-4 text-green-600" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 w-7 p-0"
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
                              variant="ghost"
                              className="h-8 w-8 shrink-0 p-0 text-neutral-400 hover:text-red-500"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirm(backpack.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        <div className="mt-4 flex items-center justify-between">
                          <Badge
                            variant="outline"
                            className={backpackIssueCount > 0
                              ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200'
                              : 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200'
                            }
                          >
                            {backpackIssueCount > 0 ? `${backpackIssueCount} uwaga` : 'OK'}
                          </Badge>
                          <div className="flex h-8 w-8 items-center justify-center text-neutral-400">
                            <ChevronRight className="h-4 w-4" />
                          </div>
                        </div>
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
              <Button variant="outline" className="flex-1 h-12 rounded-xl" onClick={handleExportCsv}>
                <Download className="h-5 w-5 mr-2" />
                CSV
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

        {view === 'shopping' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                className="flex-1 h-12 rounded-xl bg-green-600 hover:bg-green-700"
                onClick={() => setShowAddShoppingItem(true)}
              >
                <Plus className="h-5 w-5 mr-2" />
                Dodaj pozycje
              </Button>
              <Button
                variant="outline"
                className="h-12 rounded-xl px-4"
                onClick={exportShoppingList}
                disabled={shoppingList.length === 0}
              >
                <Download className="h-5 w-5" />
              </Button>
            </div>

            <Card className="rounded-2xl border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-green-600 text-white flex items-center justify-center">
                    <ShoppingCart className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-semibold text-lg">{activeShoppingCount} pozycji</p>
                    <p className="text-sm text-gray-500">do kupienia</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500">{checkedShoppingCount} kupione</p>
                  {checkedShoppingCount > 0 && (
                    <Button variant="ghost" size="sm" className="text-red-500 text-xs h-7 px-2" onClick={clearCheckedShoppingItems}>
                      Wyczysc
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {shoppingList.length === 0 ? (
              <Card className="rounded-2xl p-8 text-center">
                <ShoppingCart className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">Lista zakupow jest pusta</p>
                <p className="text-sm text-gray-400 mt-1">Produkty do wymiany dodadza sie automatycznie</p>
              </Card>
            ) : (
              <div className="space-y-4">
                {Object.entries(shoppingItemsByCategory).map(([category, categoryItems]) => {
                  const itemCategory = category as ItemCategory;
                  const label = ITEM_CATEGORIES.find(cat => cat.value === itemCategory)?.label || category;

                  return (
                    <div key={category} className="space-y-2">
                      <div className="flex items-center gap-2 px-1">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white ${categoryColors[itemCategory]}`}>
                          {categoryIcons[itemCategory]}
                        </div>
                        <h2 className="font-semibold">{label}</h2>
                        <Badge variant="outline" className="ml-auto">{categoryItems.length}</Badge>
                      </div>

                      {categoryItems.map((item) => (
                        <Card key={item.id} className="rounded-xl">
                          <div className="flex items-center gap-3 p-3">
                            <button
                              type="button"
                              onClick={() => toggleShoppingItem(item.id)}
                              className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                item.checked
                                  ? 'bg-green-500 border-green-500 text-white'
                                  : 'border-gray-300 dark:border-gray-600'
                              }`}
                              aria-label={item.checked ? 'Odznacz' : 'Odhacz'}
                            >
                              {item.checked && <Check className="h-4 w-4" />}
                            </button>

                            <button
                              type="button"
                              className="flex-1 min-w-0 text-left"
                              onClick={() => toggleShoppingItem(item.id)}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <p className={`font-medium truncate ${item.checked ? 'line-through text-gray-400' : ''}`}>
                                  {item.name}
                                </p>
                                <Badge variant="outline" className="text-xs shrink-0">x{item.quantity}</Badge>
                              </div>
                              <div className="mt-1">
                                {getSourceBadge(item.source)}
                              </div>
                            </button>

                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-500 shrink-0"
                              onClick={() => removeShoppingItem(item.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </Card>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {view === 'info' && (
          <div className="space-y-4">
            <Card className="rounded-lg border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">Lokalne notatki awaryjne</p>
                    <p className="text-lg font-semibold">Wazne informacje</p>
                    <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                      Wlasne wpisy sa zapisane tylko na tym urzadzeniu.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="rounded-lg bg-neutral-950 hover:bg-neutral-800 dark:bg-orange-500 dark:hover:bg-orange-600"
                    onClick={() => setShowAddImportantNote(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Dodaj
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              {GENERAL_IMPORTANT_INFO.map((info) => (
                <Card key={info.title} className="rounded-lg border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                  <CardContent className="p-4">
                    <div className="flex gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-semibold">{info.title}</p>
                        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{info.content}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h2 className="font-semibold">Moje informacje</h2>
                <Badge variant="outline">{importantNotes.length}</Badge>
              </div>

              {importantNotes.length === 0 ? (
                <Card className="rounded-lg border-dashed p-6 text-center shadow-sm">
                  <FileText className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-500">Brak wlasnych informacji</p>
                  <p className="text-sm text-gray-400 mt-1">Dodaj np. alergie, kontakty lub instrukcje dla domownikow</p>
                </Card>
              ) : (
                importantNotes.map((note) => (
                  <Card key={note.id} className="rounded-lg border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold break-words">{note.title}</p>
                          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-neutral-600 dark:text-neutral-400">{note.content}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-neutral-400 hover:text-red-500"
                          onClick={() => removeImportantNote(note.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
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

      <nav className="fixed bottom-3 left-3 right-3 z-50 rounded-lg border border-neutral-200 bg-white/95 p-1 shadow-lg backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95">
        <div className="grid grid-cols-5 h-14 gap-1">
          <button
            className={`flex flex-col items-center justify-center rounded-md ${view === 'backpacks' ? 'bg-neutral-100 text-neutral-950 dark:bg-neutral-800 dark:text-white' : 'text-neutral-500'}`}
            onClick={() => { setView('backpacks'); setSelectedBackpackId(null); }}
          >
            <Backpack className="h-5 w-5" />
            <span className="text-xs mt-1">Plecaki</span>
          </button>
          <button
            className={`flex flex-col items-center justify-center rounded-md relative ${view === 'shopping' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'text-neutral-500'}`}
            onClick={() => setView('shopping')}
          >
            <ShoppingCart className="h-5 w-5" />
            {activeShoppingCount > 0 && (
              <span className="absolute top-0 right-1/4 min-w-4 h-4 px-1 bg-emerald-500 text-white text-[10px] rounded-full flex items-center justify-center">
                {activeShoppingCount}
              </span>
            )}
            <span className="text-xs mt-1">Zakupy</span>
          </button>
          <button
            className={`flex flex-col items-center justify-center rounded-md relative ${view === 'expiring' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' : 'text-neutral-500'}`}
            onClick={() => setView('expiring')}
          >
            <AlertTriangle className="h-5 w-5" />
            {expiringItems.length > 0 && (
              <span className="absolute top-0 right-1/4 min-w-4 h-4 px-1 bg-amber-500 text-white text-[10px] rounded-full flex items-center justify-center">
                {expiringItems.length}
              </span>
            )}
            <span className="text-[10px] mt-1">Koncza</span>
          </button>
          <button
            className={`flex flex-col items-center justify-center rounded-md ${view === 'info' ? 'bg-neutral-100 text-neutral-950 dark:bg-neutral-800 dark:text-white' : 'text-neutral-500'}`}
            onClick={() => setView('info')}
          >
            <FileText className="h-5 w-5" />
            <span className="text-xs mt-1">Info</span>
          </button>
          <button
            className={`flex flex-col items-center justify-center rounded-md relative ${view === 'expired' ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300' : 'text-neutral-500'}`}
            onClick={() => setView('expired')}
          >
            <Trash2 className="h-5 w-5" />
            {expiredItems.length > 0 && (
              <span className="absolute top-0 right-1/4 min-w-4 h-4 px-1 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
                {expiredItems.length}
              </span>
            )}
            <span className="text-[10px] mt-1">Po terminie</span>
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
              <Label className="text-base">Dla kogo?</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {backpackAudiences.map((audience) => (
                  <button
                    key={audience.value}
                    type="button"
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      newBackpack.audience === audience.value
                        ? 'border-neutral-950 bg-neutral-100 dark:border-neutral-100 dark:bg-neutral-800'
                        : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'
                    }`}
                    onClick={() => setNewBackpack({ ...newBackpack, audience: audience.value })}
                  >
                    <span className="flex items-center gap-2 font-medium">
                      {audience.icon}
                      {audience.label}
                    </span>
                    <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">
                      {audience.description}
                    </span>
                  </button>
                ))}
              </div>
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
            <div className="flex items-start gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900">
              <Checkbox
                id="starter-checklist"
                checked={includeStarterChecklist}
                onCheckedChange={(checked) => setIncludeStarterChecklist(checked === true)}
                className="mt-1"
              />
              <div className="space-y-1">
                <Label htmlFor="starter-checklist" className="text-base font-medium">
                  Dodaj checkliste 72h
                </Label>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  Utworzy bazowa liste 72h dla wybranego profilu i doda ja do zakupow do odhaczenia.
                </p>
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

      <Sheet open={showAddShoppingItem} onOpenChange={setShowAddShoppingItem}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader>
            <SheetTitle className="text-xl flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Dodaj do zakupow
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label className="text-base">Nazwa *</Label>
              <Input
                placeholder="np. baterie AA"
                value={newShoppingItem.name}
                onChange={(e) => setNewShoppingItem({ ...newShoppingItem, name: e.target.value })}
                className="h-12 rounded-xl text-base"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-base">Ilosc</Label>
                <Input
                  type="number"
                  min="1"
                  value={newShoppingItem.quantity}
                  onChange={(e) => setNewShoppingItem({ ...newShoppingItem, quantity: parseInt(e.target.value) || 1 })}
                  className="h-12 rounded-xl text-base"
                />
              </div>
              <div>
                <Label className="text-base">Kategoria</Label>
                <Select
                  value={newShoppingItem.category}
                  onValueChange={(v) => setNewShoppingItem({ ...newShoppingItem, category: v as ItemCategory })}
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

            <div className="flex gap-2 pt-2">
              <Button onClick={addManualShoppingItem} className="flex-1 h-12 rounded-xl bg-green-600 hover:bg-green-700">
                <Plus className="h-5 w-5 mr-2" />
                Dodaj
              </Button>
              <Button variant="outline" onClick={() => setShowAddShoppingItem(false)} className="h-12 rounded-xl">
                Anuluj
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={showAddImportantNote} onOpenChange={setShowAddImportantNote}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader>
            <SheetTitle className="text-xl flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Dodaj wazna informacje
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label className="text-base">Tytul *</Label>
              <Input
                placeholder="np. Alergie, kontakt awaryjny"
                value={newImportantNote.title}
                onChange={(e) => setNewImportantNote({ ...newImportantNote, title: e.target.value })}
                className="h-12 rounded-xl text-base"
              />
            </div>
            <div>
              <Label className="text-base">Tresc *</Label>
              <Textarea
                placeholder="Wpisz informacje, ktore maja byc dostepne w sytuacji awaryjnej..."
                value={newImportantNote.content}
                onChange={(e) => setNewImportantNote({ ...newImportantNote, content: e.target.value })}
                className="min-h-32 rounded-xl"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={addImportantNote} className="flex-1 h-12 rounded-xl bg-neutral-950 hover:bg-neutral-800 dark:bg-orange-500 dark:hover:bg-orange-600">
                <Plus className="h-5 w-5 mr-2" />
                Dodaj
              </Button>
              <Button variant="outline" onClick={() => setShowAddImportantNote(false)} className="h-12 rounded-xl">
                Anuluj
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Toaster />
    </div>
  );
}
