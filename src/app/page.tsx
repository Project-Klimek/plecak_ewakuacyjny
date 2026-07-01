'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/store';
import { authApi, backpacksApi, itemsApi, scanApi, productsApi, exportApi, notificationsApi, importantInfoApi, syncApi } from '@/lib/api';
import type { Backpack, Item, ItemBatch, ItemCategory, ImportantInfo } from '@/types';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
  Backpack as BackpackIcon, Plus, Trash2, LogOut,
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
  { value: 'adult', label: 'Dorosły', description: 'Standardowy plecak 72h', icon: <BackpackIcon className="h-4 w-4" /> },
  { value: 'child', label: 'Dziecko', description: 'Plecak dla dziecka', icon: <Shirt className="h-4 w-4" /> },
  { value: 'pet', label: 'Zwierzak', description: 'Rzeczy dla zwierzęcia', icon: <Package className="h-4 w-4" /> },
  { value: 'dependent', label: 'Opieka', description: 'Osoba pod opieką', icon: <Heart className="h-4 w-4" /> },
];

type ViewState = 'backpacks' | 'categories' | 'items' | 'deadlines' | 'shopping' | 'info';

interface ShoppingItem {
  id: string;
  name: string;
  category: ItemCategory;
  quantity: number;
  checked: boolean;
  source: 'missing' | 'expired' | 'expiring' | 'manual';
  originalItemId?: string;
  addedAt: string;
}

type ImportantNote = Pick<ImportantInfo, 'id' | 'title' | 'content' | 'createdAt'> & {
  userId?: string;
  updatedAt?: Date | string;
};

type NewItemForm = Partial<Omit<Item, 'expiryDate' | 'batches'>> & {
  expiryDate?: string | null;
  batches?: ItemBatchForm[];
};

type ItemBatchForm = Pick<ItemBatch, 'id' | 'note'> & {
  quantity?: number;
  expiryDate?: string | null;
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
    content: 'Trzymaj kopie dokumentów, polis, recept i ważnych numerów w wodoszczelnej kopercie oraz w bezpiecznej kopii cyfrowej.',
  },
  {
    title: 'Zdrowie',
    content: 'Zapisz leki stałe, dawki, alergie, choroby przewlekłe oraz kontakt do lekarza. To może być kluczowe przy udzielaniu pomocy.',
  },
  {
    title: 'Dom i media',
    content: 'Zapisz, gdzie są zawory wody, gazu, bezpieczniki, latarka awaryjna i zapasowe klucze.',
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
  { name: 'Woda butelkowana 1,5 l', category: 'water', quantity: 3, notes: 'Minimum 9 l na osobę na 72h. Do plecaka weź 2-3 butelki 1,5 l na start; resztę transportuj osobno, jeśli masz samochód.' },
  { name: 'Tabletki do uzdatniania wody', category: 'water', quantity: 1, notes: 'Do awaryjnego uzdatniania wody.' },
  { name: 'Konserwy', category: 'food', quantity: 3, notes: 'Mięso, ryby, gulasz lub podobne gotowe jedzenie.' },
  { name: 'Batony energetyczne', category: 'food', quantity: 6, notes: 'Szybki zapas energii, najlepiej batony zbożowe lub energetyczne.' },
  { name: 'Posiłki suszone lub liofilizowane', category: 'food', quantity: 3, notes: 'Lekkie posiłki awaryjne, np. zupy instant lub dania liofilizowane.' },
  { name: 'Czekolada lub karmelki', category: 'food', quantity: 1, notes: 'Szybkie źródło energii i poprawa nastroju.' },
  { name: 'Otwieracz do konserw', category: 'tools', quantity: 1, notes: 'Kluczowy, jeśli w plecaku są puszki.' },
  { name: 'Kubek, talerz i sztucce', category: 'tools', quantity: 1, notes: 'Najlepiej plastikowe lub metalowe, wielorazowe.' },
  { name: 'Apteczka pierwszej pomocy', category: 'medical', quantity: 1, notes: 'Plastry, bandaż elastyczny, środek do dezynfekcji ran i podstawowe opatrunki.' },
  { name: 'Leki stałe', category: 'medical', quantity: 1, notes: 'Zapas minimum na 3-5 dni, szczególnie przy chorobach przewlekłych.' },
  { name: 'Leki przeciwbólowe', category: 'medical', quantity: 1, notes: 'Np. paracetamol lub ibuprofen, zgodnie z potrzebami domowników.' },
  { name: 'Mydło', category: 'medical', quantity: 1, notes: 'Mydło w płynie lub kostka.' },
  { name: 'Płyn do dezynfekcji rąk', category: 'medical', quantity: 1, notes: 'Mały pojemnik do plecaka.' },
  { name: 'Ręcznik papierowy lub ściereczki', category: 'medical', quantity: 1, notes: 'Mała rolka albo ściereczki wielorazowe.' },
  { name: 'Pasta i szczoteczka do zębów', category: 'medical', quantity: 1, notes: 'Podstawowa higiena na 72h.' },
  { name: 'Papier toaletowy', category: 'medical', quantity: 4, notes: 'Np. mała zgrzewka 4 rolek.' },
  { name: 'Latarka czołowa', category: 'tools', quantity: 1, notes: 'Czołowa zostawia wolne ręce; dodaj zapas baterii.' },
  { name: 'Zapas baterii', category: 'electronics', quantity: 1, notes: 'Do latarki, radia i innych urządzeń.' },
  { name: 'Radio przenośne', category: 'electronics', quantity: 1, notes: 'Najlepiej na korbkę lub z panelem słonecznym, do odbioru komunikatów.' },
  { name: 'Zapałki lub zapalniczka', category: 'tools', quantity: 1, notes: 'Trzymaj w wodoszczelnym opakowaniu.' },
  { name: 'Nóż wielofunkcyjny lub scyzoryk', category: 'tools', quantity: 1, notes: 'Do napraw, przygotowania jedzenia i drobnych prac.' },
  { name: 'Kompas', category: 'tools', quantity: 1, notes: 'Awaryjna orientacja w terenie.' },
  { name: 'Taśma klejąca srebrna', category: 'tools', quantity: 1, notes: 'Uniwersalna do napraw i zabezpieczania.' },
  { name: 'Folia NRC', category: 'tools', quantity: 1, notes: 'Koc ratunkowy chroni przed utratą ciepła i zajmuje mało miejsca.' },
  { name: 'Gotówka', category: 'documents', quantity: 1, notes: 'Małe nominały, kwota na 3 dni pobytu i podstawowe zakupy.' },
  { name: 'Kserokopie dokumentów', category: 'documents', quantity: 1, notes: 'Dowód, paszport, polisy, numery kont - w wodoszczelnej torebce.' },
  { name: 'Spis telefonów', category: 'documents', quantity: 1, notes: 'Telefony do bliskich, lekarzy i służb ratunkowych na kartce.' },
  { name: 'Solidne buty', category: 'clothes', quantity: 1, notes: 'Wygodne, najlepiej za kostkę.' },
  { name: 'Bielizna i skarpety', category: 'clothes', quantity: 4, notes: '3-4 pary skarpetek oraz bielizna osobista.' },
  { name: 'Ubranie zapasowe', category: 'clothes', quantity: 1, notes: 'Długa koszula i spodnie, najlepiej szybkoschnące.' },
  { name: 'Kurtka przeciwdeszczowa lub peleryna', category: 'clothes', quantity: 1, notes: 'Ochrona przed deszczem i wiatrem.' },
  { name: 'Czapka', category: 'clothes', quantity: 1, notes: 'Dostosuj do pory roku: zimowa albo przeciwsłoneczna.' },
  { name: 'Rękawice robocze', category: 'clothes', quantity: 1, notes: 'Do ochrony dłoni przy przenoszeniu i pracy.' },
  { name: 'Biblia drukowana', category: 'documents', quantity: 1, notes: 'Male wydanie drukowane.' },
  { name: 'Telefon z ładowarką', category: 'electronics', quantity: 1, notes: 'Naładowany telefon, ładowarka, przydatna aplikacja JW Library.' },
  { name: 'Powerbank', category: 'electronics', quantity: 1, notes: 'Naładowany, do telefonu i drobnej elektroniki.' },
];

const AUDIENCE_STARTER_ADDITIONS: Record<BackpackAudience, StarterChecklistItem[]> = {
  adult: [],
  child: [
    { name: 'Mleko modyfikowane lub kaszki', category: 'food', quantity: 1, notes: 'Zapas na 3 dni, dopasowany do wieku dziecka.' },
    { name: 'Pieluchy jednorazowe', category: 'other', quantity: 20, notes: 'Ok. 15-20 sztuk na 3 dni, jeśli dziecko ich używa.' },
    { name: 'Chusteczki nawilżane', category: 'medical', quantity: 1, notes: 'Do higieny dziecka i szybkiego oczyszczania rąk.' },
    { name: 'Ulubiona zabawka lub pluszak', category: 'other', quantity: 1, notes: 'Pomaga dziecku uspokoić się w stresie.' },
    { name: 'Karta danych dziecka', category: 'documents', quantity: 1, notes: 'Imię, alergie, leki, kontakt do opiekunów i zgoda/opis potrzeb zdrowotnych.' },
  ],
  pet: [
    { name: 'Karma dla zwierzaka', category: 'food', quantity: 1, notes: 'Porcje na minimum 3 dni, najlepiej w szczelnym opakowaniu.' },
    { name: 'Miska skladana', category: 'water', quantity: 1, notes: 'Do wody i karmy w drodze.' },
    { name: 'Smycz, szelki lub kaganiec', category: 'tools', quantity: 1, notes: 'Dopasuj do zwierzęcia i lokalnych wymagań transportu.' },
    { name: 'Transporter lub worek transportowy', category: 'other', quantity: 1, notes: 'Bezpieczny transport zwierzęcia podczas ewakuacji.' },
    { name: 'Dokumenty i książeczka zdrowia zwierzaka', category: 'documents', quantity: 1, notes: 'Szczepienia, chip, kontakt do weterynarza i numer właściciela.' },
    { name: 'Woreczki lub podklady higieniczne', category: 'medical', quantity: 1, notes: 'Do utrzymania higieny podczas drogi i postoju.' },
  ],
  dependent: [
    { name: 'Rozpiska leków i dawkowania', category: 'medical', quantity: 1, notes: 'Aktualna lista leków, dawki, godziny podawania, alergie i choroby przewlekłe.' },
    { name: 'Dokumentacja medyczna', category: 'documents', quantity: 1, notes: 'Kopie wypisów, recept, orzeczeń, danych lekarza i numerów alarmowych.' },
    { name: 'Zapas środków higienicznych', category: 'medical', quantity: 1, notes: 'Podkłady, pieluchomajtki, rękawiczki, chusteczki lub inne potrzebne środki.' },
    { name: 'Sprzęt pomocniczy', category: 'tools', quantity: 1, notes: 'Okulary, aparat słuchowy, baterie, laska, drobne elementy zapasowe.' },
    { name: 'Karta opiekuna', category: 'documents', quantity: 1, notes: 'Dane opiekuna, relacja, telefony kontaktowe i informacje o codziennej pomocy.' },
  ],
};

const getStarterChecklistForAudience = (audience: BackpackAudience) => [
  ...BASE_STARTER_CHECKLIST,
  ...AUDIENCE_STARTER_ADDITIONS[audience],
];

export default function Page() {
  const {
    user, isLoading, isInitialized,
    backpacks, sharedBackpacks, items, isOffline,
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
  const [newItem, setNewItem] = useState<NewItemForm>({ name: '', quantity: 1, category: 'other' });
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [editItemForm, setEditItemForm] = useState<NewItemForm>({ name: '', quantity: 0, category: 'other' });
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
  const [newShoppingItem, setNewShoppingItem] = useState<{ name: string; quantity?: number; category: ItemCategory }>({ name: '', quantity: 1, category: 'other' });
  const [importantNotes, setImportantNotes] = useState<ImportantNote[]>([]);
  const [infoStorageLoaded, setInfoStorageLoaded] = useState(false);
  const [showAddImportantNote, setShowAddImportantNote] = useState(false);
  const [newImportantNote, setNewImportantNote] = useState({ title: '', content: '' });
  const [importantNotePendingDelete, setImportantNotePendingDelete] = useState<ImportantNote | null>(null);
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

  const getEarliestBatchExpiryDate = (item: Item) => {
    const timestamps = (item.batches || [])
      .map(batch => batch.expiryDate ? new Date(batch.expiryDate).getTime() : Number.NaN)
      .filter(timestamp => !Number.isNaN(timestamp));

    if (timestamps.length === 0) return null;
    return new Date(Math.min(...timestamps));
  };

  const getItemEffectiveExpiryDate = (item: Item) =>
    getEarliestBatchExpiryDate(item) || item.expiryDate;

  const getItemExpiryLabel = (item: Item) => {
    const expiryDate = getItemEffectiveExpiryDate(item);
    if (!expiryDate) return null;
    const suffix = (item.batches || []).length > 0 ? 'najblizsza partia' : 'data';
    return `${new Date(expiryDate).toLocaleDateString('pl-PL')} (${suffix})`;
  };

  const expiringItems = filteredItems.filter(i => {
    const expiryDate = getItemEffectiveExpiryDate(i);
    if (!expiryDate) return false;
    const expDate = new Date(expiryDate);
    const now = new Date();
    const diffDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays <= 7 && diffDays >= 0;
  });

  const expiredItems = filteredItems.filter(i => {
    const expiryDate = getItemEffectiveExpiryDate(i);
    if (!expiryDate) return false;
    const expDate = new Date(expiryDate);
    return expDate < new Date();
  });

  const getMissingQuantityForItem = useCallback((item: Item) => {
    const desiredQuantity = item.desiredQuantity ?? null;
    if (desiredQuantity === null) return 0;
    return Math.max(0, desiredQuantity - item.quantity);
  }, []);

  const missingChecklistItems = filteredItems.filter(item => getMissingQuantityForItem(item) > 0);
  const activeShoppingCount = shoppingList.filter(item => !item.checked).length;
  const checkedShoppingCount = shoppingList.length - activeShoppingCount;
  const shoppingItemsByCategory = shoppingList.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<ItemCategory, ShoppingItem[]>);
  const totalIssueCount = expiringItems.length + expiredItems.length + missingChecklistItems.length;

  const categoryItems = selectedCategory 
    ? backpackItems.filter(i => i.category === selectedCategory)
    : [];

  const getShoppingSourceForItem = useCallback((item: Item): ShoppingItem['source'] | null => {
    if (getMissingQuantityForItem(item) > 0) return 'missing';
    const expiryDate = getItemEffectiveExpiryDate(item);
    if (!expiryDate) return null;
    const expDate = new Date(expiryDate);
    const now = new Date();
    const diffDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (expDate < now) return 'expired';
    if (diffDays <= 7 && diffDays >= 0) return 'expiring';
    return null;
  }, [getMissingQuantityForItem]);

  const getShoppingQuantityForItem = useCallback((item: Item, source: ShoppingItem['source']) => {
    if (source === 'missing') return getMissingQuantityForItem(item);
    return Math.max(1, item.quantity);
  }, [getMissingQuantityForItem]);

  const getSourceBadge = (source: ShoppingItem['source']) => {
    if (source === 'missing') {
      return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-200 text-xs">Brakuje</Badge>;
    }
    if (source === 'expired') {
      return <Badge className="bg-red-100 text-red-700 dark:bg-red-800 dark:text-red-200 text-xs">Po terminie</Badge>;
    }
    if (source === 'expiring') {
      return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-800 dark:text-amber-200 text-xs">Kończy się</Badge>;
    }
    return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-200 text-xs">Ręcznie</Badge>;
  };

  const getItemQuantityLabel = (item: Item) => {
    return item.desiredQuantity !== null && item.desiredQuantity !== undefined
      ? `${item.quantity}/${item.desiredQuantity}`
      : String(item.quantity);
  };

  const formatDateInputValue = (value: Date | string | null | undefined) => {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
  };

  const parseOptionalNonNegativeInt = (value: string) => {
    if (value === '') return undefined;
    return Math.max(0, parseInt(value, 10) || 0);
  };

  const parseRequiredPositiveInt = (value: string) => {
    if (value === '') return undefined;
    return Math.max(1, parseInt(value, 10) || 1);
  };

  const addEditItemBatch = () => {
    setEditItemForm((current) => ({
      ...current,
      batches: [
        ...(current.batches || []),
        {
          id: generateId(),
          quantity: 1,
          expiryDate: current.expiryDate || null,
          note: null,
        },
      ],
    }));
  };

  const updateEditItemBatch = (batchId: string, data: Partial<ItemBatchForm>) => {
    setEditItemForm((current) => ({
      ...current,
      batches: (current.batches || []).map((batch) =>
        batch.id === batchId ? { ...batch, ...data } : batch
      ),
    }));
  };

  const removeEditItemBatch = (batchId: string) => {
    setEditItemForm((current) => ({
      ...current,
      batches: (current.batches || []).filter((batch) => batch.id !== batchId),
    }));
  };

  const openEditItem = (item: Item) => {
    setEditingItem(item);
    setEditItemForm({
      ...item,
      desiredQuantity: item.desiredQuantity ?? null,
      expiryDate: formatDateInputValue(item.expiryDate),
      batches: (item.batches || []).map((batch) => ({
        id: batch.id,
        quantity: batch.quantity,
        expiryDate: formatDateInputValue(batch.expiryDate),
        note: batch.note,
      })),
    });
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
        toast({ title: 'Synchronizacja', description: 'Zmiany offline zostały wysłane' });
        return true;
      }

      toast({
        title: 'Synchronizacja',
        description: 'Nie wszystkie zmiany offline zostały wysłane',
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
      const ignoredIds = new Set(shoppingIgnoredItemIds);
      const generatedItems = new Map<string, ShoppingItem>();

      items.forEach((item) => {
        const source = getShoppingSourceForItem(item);
        if (!source) return;
        if (source !== 'missing' && ignoredIds.has(item.id)) return;

        generatedItems.set(item.id, {
          id: generateId(),
          name: item.name,
          category: item.category,
          quantity: getShoppingQuantityForItem(item, source),
          checked: false,
          source,
          originalItemId: item.id,
          addedAt: new Date().toISOString(),
        });
      });

      let changed = false;
      const nextList: ShoppingItem[] = [];

      currentList.forEach((shoppingItem) => {
        if (!shoppingItem.originalItemId) {
          nextList.push(shoppingItem);
          return;
        }

        const generatedItem = generatedItems.get(shoppingItem.originalItemId);
        if (!generatedItem) {
          changed = true;
          return;
        }

        generatedItems.delete(shoppingItem.originalItemId);

        const updatedItem = {
          ...shoppingItem,
          name: generatedItem.name,
          category: generatedItem.category,
          quantity: generatedItem.quantity,
          source: generatedItem.source,
        };

        if (
          updatedItem.name !== shoppingItem.name ||
          updatedItem.category !== shoppingItem.category ||
          updatedItem.quantity !== shoppingItem.quantity ||
          updatedItem.source !== shoppingItem.source
        ) {
          changed = true;
        }

        nextList.push(updatedItem);
      });

      generatedItems.forEach((shoppingItem) => {
        nextList.push(shoppingItem);
        changed = true;
      });

      return changed ? nextList : currentList;
    });
  }, [getShoppingQuantityForItem, getShoppingSourceForItem, items, shoppingIgnoredItemIds, shoppingStorageLoaded]);

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
              const migrated: ImportantInfo[] = [];
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
      toast({ title: 'Offline', description: 'Połącz się z internetem, aby wysłać zmiany' });
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
        toast({ title: 'Błąd', description: response.error || 'Nie udało się zalogować', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Błąd', description: 'Wystąpił błąd podczas logowania', variant: 'destructive' });
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
        toast({ title: 'Błąd', description: response.error || 'Nie udało się zarejestrować', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Błąd', description: 'Wystąpił błąd podczas rejestracji', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await authApi.logout();
    logout();
    setView('backpacks');
  };

  const createStarterChecklistItems = async (backpackId: string, audience: BackpackAudience, mode: 'server' | 'queued') => {
    const now = new Date();
    const audienceLabel = backpackAudiences.find(item => item.value === audience)?.label || 'Dorosly';
    const localItems: Item[] = getStarterChecklistForAudience(audience).map((template) => ({
      id: generateId(),
      name: template.name,
      quantity: 0,
      desiredQuantity: template.quantity,
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
          desiredQuantity: item.desiredQuantity,
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
            ? 'Plecak utworzony z checklistą 72h'
            : 'Plecak utworzony!',
        });
      } else {
        await queueOfflineChange('create_backpack', localBackpack as unknown as Record<string, unknown>);
        if (shouldAddStarterChecklist) {
          await createStarterChecklistItems(localBackpack.id, selectedAudience, 'queued');
        }
        toast({ title: 'Sukces', description: 'Plecak utworzony lokalnie, zsynchronizuje się później' });
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
    toast({ title: 'Usunięto', description: 'Plecak został usunięty' });
  };

  const handleCreateItem = async () => {
    if (!newItem.name?.trim() || !selectedBackpackId) return;
    
    const localItem: Item = {
      id: generateId(),
      name: newItem.name,
      quantity: newItem.quantity ?? 1,
      category: newItem.category || 'other',
      backpackId: selectedBackpackId,
      expiryDate: newItem.expiryDate ? new Date(newItem.expiryDate) : null,
      barcode: newItem.barcode || null,
      notes: newItem.notes || null,
      imageUrl: newItem.imageUrl || null,
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
        name: localItem.name,
        backpackId: selectedBackpackId,
        quantity: localItem.quantity,
        category: localItem.category,
        expiryDate: localItem.expiryDate,
        barcode: localItem.barcode,
        notes: localItem.notes,
        imageUrl: localItem.imageUrl,
      });
      if (response.success && response.data) {
        removeItem(localItem.id);
        await deleteItemLocal(localItem.id);
        addItem(response.data);
        await saveItemLocal(response.data);
        toast({ title: 'Dodano!', description: 'Przedmiot dodany do plecaka' });
      } else {
        await queueOfflineChange('create_item', localItem as unknown as Record<string, unknown>);
        toast({ title: 'Błąd', description: response.error || 'Nie udało się dodać przedmiotu', variant: 'destructive' });
      }
    } catch {
      await queueOfflineChange('create_item', localItem as unknown as Record<string, unknown>);
      toast({ title: 'Dodano!', description: 'Przedmiot dodany lokalnie (offline)' });
    }
  };

  const handleUpdateItemQuantity = async (item: Item, delta: number) => {
    const newQuantity = Math.max(0, item.quantity + delta);
    
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

  const handleUpdateItemDetails = async () => {
    if (!editingItem || !editItemForm.name?.trim()) return;

    const desiredQuantityValue = editItemForm.desiredQuantity;
    const normalizedBatches = (editItemForm.batches || [])
      .map((batch) => ({
        quantity: Math.max(1, Number(batch.quantity || 1)),
        expiryDate: batch.expiryDate || null,
        note: batch.note?.trim() || null,
      }))
      .filter((batch) => batch.quantity > 0);
    const batchQuantity = normalizedBatches.reduce((sum, batch) => sum + batch.quantity, 0);
    const updatePayload = {
      name: editItemForm.name.trim(),
      quantity: normalizedBatches.length > 0
        ? batchQuantity
        : Math.max(0, Number(editItemForm.quantity ?? 0)),
      desiredQuantity:
        desiredQuantityValue === null || desiredQuantityValue === undefined
          ? null
          : Math.max(0, Number(desiredQuantityValue)),
      category: editItemForm.category || 'other',
      expiryDate: editItemForm.expiryDate || null,
      barcode: editItemForm.barcode?.trim() || null,
      notes: editItemForm.notes?.trim() || null,
      imageUrl: editItemForm.imageUrl || null,
      batches: normalizedBatches,
    };

    const updatedItem: Item = {
      ...editingItem,
      ...updatePayload,
      expiryDate: updatePayload.expiryDate ? new Date(updatePayload.expiryDate) : null,
      batches: normalizedBatches.map((batch) => ({
        id: generateId(),
        itemId: editingItem.id,
        quantity: batch.quantity,
        expiryDate: batch.expiryDate,
        note: batch.note,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      updatedAt: new Date(),
    };

    updateItem(editingItem.id, updatedItem);
    await saveItemLocal(updatedItem);
    setEditingItem(null);
    setEditItemForm({ name: '', quantity: 0, category: 'other' });

    if (!isBrowserOnline()) {
      await queueOfflineChange('update_item', { id: editingItem.id, ...updatePayload });
      toast({ title: 'Zapisano', description: 'Zmiany zapisane lokalnie (offline)' });
      return;
    }

    try {
      const response = await itemsApi.update(editingItem.id, updatePayload);
      if (response.success && response.data) {
        updateItem(editingItem.id, response.data);
        await saveItemLocal(response.data);
        toast({ title: 'Zapisano', description: 'Przedmiot zaktualizowany' });
      } else {
        await queueOfflineChange('update_item', { id: editingItem.id, ...updatePayload });
        toast({ title: 'Zapisano lokalnie', description: 'Zmiana zsynchronizuje się później' });
      }
    } catch {
      await queueOfflineChange('update_item', { id: editingItem.id, ...updatePayload });
      toast({ title: 'Zapisano lokalnie', description: 'Zmiana zsynchronizuje się później' });
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
    toast({ title: 'Usunięto', description: 'Przedmiot usunięty' });
  };

  const toggleShoppingItem = (id: string) => {
    setShoppingList(prev => prev.map(item =>
      item.id === id ? { ...item, checked: !item.checked } : item
    ));
  };

  const removeShoppingItem = (id: string) => {
    const removedItem = shoppingList.find(item => item.id === id);
    if (removedItem?.originalItemId && removedItem.source !== 'missing') {
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
    toast({ title: 'Dodano', description: 'Pozycja dodana do listy zakupów' });
  };

  const clearCheckedShoppingItems = () => {
    const checkedOriginalIds = shoppingList
      .filter(item => item.checked && item.originalItemId && item.source !== 'missing')
      .map(item => item.originalItemId!);

    if (checkedOriginalIds.length > 0) {
      setShoppingIgnoredItemIds(ids => Array.from(new Set([...ids, ...checkedOriginalIds])));
    }

    setShoppingList(prev => prev.filter(item => !item.checked));
    toast({ title: 'Wyczyszczono', description: 'Kupione pozycje usunięte z listy' });
  };

  const exportShoppingList = () => {
    const text = shoppingList
      .map(item => {
        const category = ITEM_CATEGORIES.find(cat => cat.value === item.category)?.label || item.category;
        return `${item.checked ? '[x]' : '[ ]'} ${item.name} x${item.quantity} (${category})`;
      })
      .join('\n');
    const blob = new Blob([`Lista zakupów - ${new Date().toLocaleDateString('pl-PL')}\n\n${text}`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lista-zakupow-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({ title: 'Wyeksportowano', description: 'Lista zakupów pobrana' });
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

    const reportBackpacks = [...backpacks, ...sharedBackpacks];
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const openShoppingCount = shoppingList.filter(item => !item.checked).length;
    const checkedShoppingCount = shoppingList.filter(item => item.checked).length;

    const itemStatus = (value: Date | string | null | undefined) => {
      if (!value) return { label: 'Bez daty', className: 'status-neutral' };
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return { label: 'Bez daty', className: 'status-neutral' };
      const days = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (days < 0) return { label: 'Po terminie', className: 'status-danger' };
      if (days <= 7) return { label: `Do ${days} dni`, className: 'status-warning' };
      return { label: 'OK', className: 'status-ok' };
    };

    const backpackSections = reportBackpacks.map((backpack) => {
      const audience = getBackpackAudienceMeta(backpack.icon);
      const isShared = sharedBackpacks.some(shared => shared.id === backpack.id);
      const backpackItemsForPrint = items
        .filter(item => item.backpackId === backpack.id)
        .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

      const rows = backpackItemsForPrint.length > 0
        ? backpackItemsForPrint.map(item => {
          const expiryDate = getItemEffectiveExpiryDate(item);
          const status = itemStatus(expiryDate);
          const batchSummary = (item.batches || []).length > 0
            ? `Partie: ${(item.batches || [])
                .map(batch => `${batch.quantity} szt. ${batch.expiryDate ? formatDate(batch.expiryDate) : 'bez daty'}`)
                .join('; ')}`
            : '';
          return `
          <tr>
            <td>${escapeHtml(item.name)}</td>
            <td>${escapeHtml(categoryLabel(item.category))}</td>
            <td>${escapeHtml(getItemQuantityLabel(item))}</td>
            <td>${escapeHtml(formatDate(expiryDate))}</td>
            <td><span class="status ${status.className}">${escapeHtml(status.label)}</span></td>
            <td>${escapeHtml([item.notes, batchSummary].filter(Boolean).join(' | '))}</td>
          </tr>
        `;
        }).join('')
        : '<tr><td colspan="6" class="muted">Brak przedmiotów</td></tr>';

      return `
        <section>
          <h2>${escapeHtml(backpack.name)}</h2>
          <p class="muted">${escapeHtml(audience.label)}${isShared ? ' | Udostępniony' : ''}${backpack.description ? ` | ${escapeHtml(backpack.description)}` : ''}</p>
          <table>
            <thead>
              <tr><th>Przedmiot</th><th>Kategoria</th><th>Stan / cel</th><th>Data</th><th>Status</th><th>Notatki</th></tr>
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
      : '<tr><td colspan="4" class="muted">Lista zakupów jest pusta</td></tr>';

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
      : '<p class="muted">Brak własnych informacji.</p>';

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
            .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 16px 0 22px; }
            .summary-item { border: 1px solid #d1d5db; border-radius: 6px; padding: 10px; }
            .summary-value { display: block; font-size: 20px; font-weight: 700; }
            .summary-label { color: #555; font-size: 11px; text-transform: uppercase; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
            th, td { border: 1px solid #ddd; padding: 6px; vertical-align: top; text-align: left; }
            th { background: #f3f4f6; }
            .note { border: 1px solid #ddd; padding: 10px; margin: 8px 0; border-radius: 6px; }
            .status { display: inline-block; border-radius: 999px; padding: 2px 7px; font-size: 11px; font-weight: 700; }
            .status-ok { background: #dcfce7; color: #166534; }
            .status-warning { background: #fef3c7; color: #92400e; }
            .status-danger { background: #fee2e2; color: #991b1b; }
            .status-neutral { background: #f3f4f6; color: #4b5563; }
            @media print {
              body { margin: 12mm; }
              section { break-inside: avoid; }
              .note { break-inside: avoid; }
              .summary { grid-template-columns: repeat(4, 1fr); }
            }
          </style>
        </head>
        <body>
          <h1>Raport awaryjny</h1>
          <p class="meta muted">Wygenerowano: ${escapeHtml(new Date().toLocaleString('pl-PL'))}${user ? ` | ${escapeHtml(user.name || user.email)}` : ''}</p>
          <div class="summary">
            <div class="summary-item"><span class="summary-value">${escapeHtml(reportBackpacks.length)}</span><span class="summary-label">Plecaki</span></div>
            <div class="summary-item"><span class="summary-value">${escapeHtml(items.length)}</span><span class="summary-label">Pozycje</span></div>
            <div class="summary-item"><span class="summary-value">${escapeHtml(totalQuantity)}</span><span class="summary-label">Sztuki lacznie</span></div>
            <div class="summary-item"><span class="summary-value">${escapeHtml(openShoppingCount)}</span><span class="summary-label">Do kupienia</span></div>
          </div>
          <section>
            <h2>Plecaki i przedmioty</h2>
            ${backpackSections || '<p class="muted">Brak plecaków.</p>'}
          </section>
          <section>
            <h2>Lista zakupów</h2>
            <p class="muted">Do kupienia: ${escapeHtml(openShoppingCount)} | Odhaczone: ${escapeHtml(checkedShoppingCount)}</p>
            <table>
              <thead><tr><th>Status</th><th>Pozycja</th><th>Kategoria</th><th>Ilość</th></tr></thead>
              <tbody>${shoppingRows}</tbody>
            </table>
          </section>
          <section>
            <h2>Ważne informacje ogólne</h2>
            ${generalInfo}
          </section>
          <section>
            <h2>Moje ważne informacje</h2>
            ${personalInfo}
          </section>
        </body>
      </html>`;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({ title: 'Błąd', description: 'Przeglądarka zablokowała okno drukowania', variant: 'destructive' });
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
      toast({ title: 'Dodano lokalnie', description: 'Informacja zapisze się na serwerze po synchronizacji' });
      return;
    }

    try {
      const response = await importantInfoApi.create({
        title: localNote.title,
        content: localNote.content,
      });

      if (response.success && response.data) {
        setImportantNotes(prev => [response.data!, ...prev]);
        toast({ title: 'Dodano', description: 'Informacja została zapisana' });
      } else {
        setImportantNotes(prev => [localNote, ...prev]);
        toast({ title: 'Dodano lokalnie', description: response.error || 'Serwer zapisze informacje później' });
      }
    } catch {
      setImportantNotes(prev => [localNote, ...prev]);
      toast({ title: 'Dodano lokalnie', description: 'Informacja zapisze się na serwerze później' });
    }
  };

  const removeImportantNote = async (id: string) => {
    const noteToRemove = importantNotes.find(note => note.id === id);

    if (!isBrowserOnline()) {
      if (noteToRemove && !noteToRemove.userId) {
        setImportantNotes(prev => prev.filter(note => note.id !== id));
        toast({ title: 'Usunięto', description: 'Lokalna informacja została usunięta' });
        return;
      }

      toast({ title: 'Offline', description: 'Połącz się z internetem, aby usunąć informacje' });
      return;
    }

    const previousNotes = importantNotes;
    setImportantNotes(prev => prev.filter(note => note.id !== id));

    try {
      const response = await importantInfoApi.delete(id);
      if (response.success) {
        toast({ title: 'Usunięto', description: 'Informacja została usunięta' });
      } else {
        setImportantNotes(previousNotes);
        toast({ title: 'Błąd', description: response.error || 'Nie udało się usunąć informacji', variant: 'destructive' });
      }
    } catch {
      setImportantNotes(previousNotes);
      toast({ title: 'Błąd', description: 'Nie udało się usunąć informacji', variant: 'destructive' });
    }
  };

  const enrichItemFromBarcode = useCallback(async (barcode: string) => {
    try {
      const response = await productsApi.lookupBarcode(barcode);
      const product = response.data;

      if (!response.success || !product?.found) return false;

      const productName = product.productName;
      const details = [
        product.brand ? `Marka: ${product.brand}` : null,
        product.quantity ? `Opakowanie: ${product.quantity}` : null,
      ].filter(Boolean).join('\n');

      setNewItem(prev => ({
        ...prev,
        name: productName || prev.name,
        category: prev.category && prev.category !== 'other' ? prev.category : 'food',
        imageUrl: product.imageUrl || prev.imageUrl,
        notes: prev.notes || details || prev.notes,
      }));

      toast({ title: 'Produkt znaleziony', description: productName || 'Uzupełniono dane z kodu kreskowego' });
      return true;
    } catch {
      return false;
    }
  }, []);

  const handleScan = useCallback(async (file: File) => {
    setScanning(true);
    setScanResult(null);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target?.result as string;
        const response = await scanApi.scanImage(base64);
        if (response.success && response.data) {
          const scanData = response.data;
          setScanResult(scanData);
          if (scanData.expiryDate) setNewItem(prev => ({ ...prev, expiryDate: scanData.expiryDate }));
          const productName = scanData.productName;
          if (productName) setNewItem(prev => ({ ...prev, name: productName }));
          if (scanData.barcode) {
            setNewItem(prev => ({ ...prev, barcode: scanData.barcode }));
            await enrichItemFromBarcode(scanData.barcode);
          }
          toast({ title: 'Zeskanowano!', description: 'Dane rozpoznane' });
        }
        setScanning(false);
      };
      reader.readAsDataURL(file);
    } catch {
      setScanning(false);
      toast({ title: 'Błąd', description: 'Nie udało się rozpoznać', variant: 'destructive' });
    }
  }, [enrichItemFromBarcode]);

  const handleExportPdf = async () => {
    if (!selectedBackpackId) return;
    try {
      await exportApi.exportPdf(selectedBackpackId);
      toast({ title: 'Pobrano PDF' });
    } catch {
      toast({ title: 'Błąd', description: 'Eksport nieudany', variant: 'destructive' });
    }
  };

  const handleExportCsv = async () => {
    if (!selectedBackpackId) return;
    try {
      await exportApi.exportCsv(selectedBackpackId);
      toast({ title: 'Pobrano CSV' });
    } catch {
      toast({ title: 'Błąd', description: 'Eksport nieudany', variant: 'destructive' });
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
    } else if (view === 'categories' || view === 'deadlines' || view === 'shopping' || view === 'info') {
      setSelectedBackpackId(null);
      setView('backpacks');
    }
  };

  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-400 to-red-500">
        <div className="text-center text-white">
          <BackpackIcon className="h-20 w-20 mx-auto animate-bounce" />
          <p className="mt-6 text-xl font-semibold">Plecak Ewakuacyjny</p>
          <p className="mt-2 opacity-80">Ładowanie...</p>
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
              <BackpackIcon className="h-14 w-14 text-orange-500" />
            </div>
            <h1 className="mt-6 text-2xl font-bold text-white">Plecak Ewakuacyjny</h1>
            <p className="text-white/80 mt-2">Zarządzaj swoim plecakiem offline</p>
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
                          placeholder="twój@email.pl"
                          value={loginForm.email}
                          onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                          className="h-12 rounded-xl text-base"
                          required
                        />
                      </div>
                      <div>
                        <Label className="text-base">Hasło</Label>
                        <Input
                          type="password"
                          value={loginForm.password}
                          onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                          className="h-12 rounded-xl text-base"
                          required
                        />
                      </div>
                      <Button type="submit" className="w-full h-12 rounded-xl text-base bg-orange-500 hover:bg-orange-600" disabled={isLoading}>
                        {isLoading ? 'Logowanie...' : 'Zaloguj się'}
                      </Button>
                    </form>
                  </TabsContent>
                  
                  <TabsContent value="register" className="mt-0">
                    <form onSubmit={handleRegister} className="space-y-4">
                      <div>
                        <Label className="text-base">Imię</Label>
                        <Input
                          type="text"
                          placeholder="Jak się nazywasz?"
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
                          placeholder="twój@email.pl"
                          value={registerForm.email}
                          onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                          className="h-12 rounded-xl text-base"
                          required
                        />
                      </div>
                      <div>
                        <Label className="text-base">Hasło</Label>
                        <Input
                          type="password"
                          placeholder="Min. 6 znaków"
                          value={registerForm.password}
                          onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                          className="h-12 rounded-xl text-base"
                          required
                        />
                      </div>
                      <Button type="submit" className="w-full h-12 rounded-xl text-base bg-orange-500 hover:bg-orange-600" disabled={isLoading}>
                        {isLoading ? 'Rejestracja...' : 'Utwórz konto'}
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
    <div className="app-scroll-root bg-neutral-100 text-neutral-950 dark:bg-neutral-950 dark:text-neutral-50">
      <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/95 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
        <div className="app-page-shell flex items-center justify-between gap-2 py-3">
          <div className="flex min-w-0 flex-1 items-center">
            {view !== 'backpacks' && (
              <Button variant="ghost" size="icon" onClick={goBack} className="mr-2">
                <ChevronRight className="h-6 w-6 rotate-180" />
              </Button>
            )}
            <h1 className="min-w-0 truncate text-lg font-semibold tracking-normal">
              {view === 'backpacks' && 'Moje plecaki'}
              {view === 'categories' && selectedBackpack?.name}
              {view === 'items' && `${selectedBackpack?.name} - ${ITEM_CATEGORIES.find(c => c.value === selectedCategory)?.label}`}
              {view === 'deadlines' && 'Terminy'}
              {view === 'shopping' && 'Lista zakupów'}
              {view === 'info' && 'Ważne informacje'}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
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
          <div className="app-page-shell pb-3">
            <Input
              placeholder="Szukaj..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 rounded-xl"
            />
          </div>
        )}

        {(isOffline || pendingSyncCount > 0 || isSyncing) && (
          <div className="app-page-shell pb-3">
            <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-100">
              <RefreshCw className={`h-4 w-4 shrink-0 ${isSyncing ? 'animate-spin' : ''}`} />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">
                  {isSyncing && 'Wysylanie zmian...'}
                  {!isSyncing && isOffline && pendingSyncCount > 0 && `${pendingSyncCount} zmian czeka na wyslanie`}
                  {!isSyncing && isOffline && pendingSyncCount === 0 && 'Tryb offline - dane zapisują się lokalnie'}
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

      <main className="app-main-scroll app-page-shell py-4">
        {view === 'backpacks' && (
          <div className="space-y-4">
            <Card className="rounded-lg border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
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

            <div className="grid grid-cols-3 gap-2 min-[380px]:gap-3">
              <Card
                className="rounded-lg border-amber-200 bg-white shadow-sm cursor-pointer active:scale-[0.98] transition-transform dark:border-amber-900/60 dark:bg-neutral-900"
                onClick={() => setView('deadlines')}
              >
                <CardContent className="p-3">
                  <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-md bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <p className="text-2xl font-semibold text-neutral-950 dark:text-neutral-50">{expiringItems.length}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Kończy się</p>
                </CardContent>
              </Card>
              <Card
                className="rounded-lg border-red-200 bg-white shadow-sm cursor-pointer active:scale-[0.98] transition-transform dark:border-red-900/60 dark:bg-neutral-900"
                onClick={() => setView('deadlines')}
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
              <Card className="rounded-lg border-dashed p-6 text-center shadow-sm min-[380px]:p-8">
                <BackpackIcon className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">Nie masz jeszcze plecaków</p>
                <p className="text-sm text-gray-400 mt-1">Otwórz menu akcji i dodaj pierwszy plecak</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
                {backpacks.map((backpack) => {
                  const itemCount = items.filter(i => i.backpackId === backpack.id).length;
                  const backpackExpiredCount = expiredItems.filter(i => i.backpackId === backpack.id).length;
                  const backpackExpiringCount = expiringItems.filter(i => i.backpackId === backpack.id).length;
                  const backpackMissingCount = missingChecklistItems.filter(i => i.backpackId === backpack.id).length;
                  const backpackIssueCount = backpackExpiredCount + backpackExpiringCount + backpackMissingCount;
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
                              <BackpackIcon className="h-5 w-5" style={{ color: backpack.color }} />
                            </div>
                            <p className="font-semibold text-base truncate">{backpack.name}</p>
                            <p className="text-sm text-neutral-500 dark:text-neutral-400">{itemCount} przedmiotów</p>
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
              <Card className="rounded-2xl p-6 text-center min-[380px]:p-8">
                <Package className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">Plecak jest pusty</p>
                <p className="text-sm text-gray-400 mt-1">Dodaj pierwszy przedmiot</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
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
                        <p className="truncate text-base font-semibold">{cat.label}</p>
                        <p className="text-sm text-gray-500">{catItems.length} przedmiotów</p>
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
              const effectiveExpiryDate = getItemEffectiveExpiryDate(item);
              const expiryLabel = getItemExpiryLabel(item);
              const isExpiring = effectiveExpiryDate && (() => {
                const diff = Math.ceil((new Date(effectiveExpiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                return diff <= 7 && diff >= 0;
              })();
              const isExpired = effectiveExpiryDate && new Date(effectiveExpiryDate) < new Date();
              const missingQuantity = getMissingQuantityForItem(item);
              
              return (
                <Card
                  key={item.id}
                  className={`cursor-pointer rounded-xl ${isExpiring ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20' : ''} ${isExpired ? 'border-red-400 bg-red-50 dark:bg-red-900/20' : ''}`}
                  onClick={() => openEditItem(item)}
                >
                  <div className="flex items-center gap-2 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{item.name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-500">
                        {expiryLabel && (
                          <span className={isExpiring ? 'text-amber-600 font-medium' : isExpired ? 'text-red-600 font-medium' : ''}>
                            {expiryLabel}
                          </span>
                        )}
                        {(item.batches || []).length > 0 && (
                          <span className="font-medium text-neutral-500 dark:text-neutral-400">
                            {(item.batches || []).length} partie
                          </span>
                        )}
                        {missingQuantity > 0 && (
                          <span className="font-medium text-blue-600 dark:text-blue-300">
                            brakuje {missingQuantity}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex shrink-0 items-center gap-1.5 min-[380px]:gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 rounded-lg"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleUpdateItemQuantity(item, -1);
                        }}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="w-14 text-center font-semibold">{getItemQuantityLabel(item)}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 rounded-lg"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleUpdateItemQuantity(item, 1);
                        }}
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
              <Card className="rounded-2xl p-6 text-center min-[380px]:p-8">
                <ShoppingCart className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">Lista zakupów jest pusta</p>
                <p className="text-sm text-gray-400 mt-1">Produkty do wymiany dodadzą się automatycznie</p>
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
                    <p className="text-lg font-semibold">Ważne informacje</p>
                    <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                      Własne wpisy są zapisane tylko na tym urządzeniu.
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
                  <p className="text-gray-500">Brak własnych informacji</p>
                  <p className="text-sm text-gray-400 mt-1">Dodaj np. alergie, kontakty lub instrukcje dla domowników</p>
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
                          onClick={() => setImportantNotePendingDelete(note)}
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

        {view === 'deadlines' && (
          <div className="space-y-5">
            {expiredItems.length === 0 && expiringItems.length === 0 ? (
              <Card className="rounded-2xl p-6 text-center min-[380px]:p-8">
                <Check className="h-16 w-16 mx-auto text-green-500 mb-4" />
                <p className="text-gray-500">Brak rzeczy wymagających kontroli terminu</p>
              </Card>
            ) : (
              <>
                <section className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <h2 className="font-semibold text-red-700 dark:text-red-300">Po terminie</h2>
                    <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
                      {expiredItems.length}
                    </Badge>
                  </div>
                  {expiredItems.length === 0 ? (
                    <Card className="rounded-xl border-dashed p-4 text-sm text-neutral-500">
                      Brak przeterminowanych rzeczy
                    </Card>
                  ) : (
                    expiredItems.map((item) => {
                      const backpack = backpacks.find(b => b.id === item.backpackId);
                      const expiryDate = getItemEffectiveExpiryDate(item);
                      return (
                        <Card key={item.id} className="rounded-xl border-red-400 bg-red-50 dark:bg-red-900/20">
                          <div className="flex items-center gap-2 p-3">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium">{item.name}</p>
                              <p className="text-sm text-gray-500">
                                {backpack?.name} - {getItemQuantityLabel(item)}
                              </p>
                              <p className="text-sm text-red-600 font-medium mt-1">
                                Wygasło: {expiryDate ? new Date(expiryDate).toLocaleDateString('pl-PL') : ''}
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
                </section>

                <section className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <h2 className="font-semibold text-amber-700 dark:text-amber-300">Kończą się w ciągu 7 dni</h2>
                    <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                      {expiringItems.length}
                    </Badge>
                  </div>
                  {expiringItems.length === 0 ? (
                    <Card className="rounded-xl border-dashed p-4 text-sm text-neutral-500">
                      Brak rzeczy kończących się w ciągu 7 dni
                    </Card>
                  ) : (
                    expiringItems.map((item) => {
                      const backpack = backpacks.find(b => b.id === item.backpackId);
                      const expiryDate = getItemEffectiveExpiryDate(item);
                      return (
                        <Card key={item.id} className="rounded-xl border-amber-400 bg-amber-50 dark:bg-amber-900/20">
                          <div className="flex items-center gap-2 p-3">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium">{item.name}</p>
                              <p className="text-sm text-gray-500">
                                {backpack?.name} - {getItemQuantityLabel(item)}
                              </p>
                              <p className="text-sm text-amber-600 font-medium mt-1">
                                {expiryDate ? new Date(expiryDate).toLocaleDateString('pl-PL') : ''}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5 min-[380px]:gap-2">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 rounded-lg"
                                onClick={() => handleUpdateItemQuantity(item, -1)}
                              >
                                <Minus className="h-4 w-4" />
                              </Button>
                              <span className="w-12 text-center font-semibold min-[380px]:w-14">{getItemQuantityLabel(item)}</span>
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
                </section>
              </>
            )}
          </div>
        )}
      </main>

      <nav className="app-bottom-nav fixed z-50 rounded-lg border border-neutral-200 bg-white/95 p-1 shadow-lg backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95">
        <div className="grid grid-cols-4 h-14 gap-1">
          <button
            className={`flex flex-col items-center justify-center rounded-md ${view === 'backpacks' ? 'bg-neutral-100 text-neutral-950 dark:bg-neutral-800 dark:text-white' : 'text-neutral-500'}`}
            onClick={() => { setView('backpacks'); setSelectedBackpackId(null); }}
          >
            <BackpackIcon className="h-5 w-5" />
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
            className={`flex flex-col items-center justify-center rounded-md relative ${view === 'deadlines' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' : 'text-neutral-500'}`}
            onClick={() => setView('deadlines')}
          >
            <AlertTriangle className="h-5 w-5" />
            {expiredItems.length + expiringItems.length > 0 && (
              <span className={`absolute top-0 right-1/4 min-w-4 h-4 px-1 text-white text-[10px] rounded-full flex items-center justify-center ${expiredItems.length > 0 ? 'bg-red-500' : 'bg-amber-500'}`}>
                {expiredItems.length + expiringItems.length}
              </span>
            )}
            <span className="text-xs mt-1">Terminy</span>
          </button>
          <button
            className={`flex flex-col items-center justify-center rounded-md ${view === 'info' ? 'bg-neutral-100 text-neutral-950 dark:bg-neutral-800 dark:text-white' : 'text-neutral-500'}`}
            onClick={() => setView('info')}
          >
            <FileText className="h-5 w-5" />
            <span className="text-xs mt-1">Info</span>
          </button>
        </div>
      </nav>

      <Dialog open={showAddBackpack} onOpenChange={setShowAddBackpack}>
        <DialogContent className="app-modal-scroll rounded-3xl">
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
                placeholder="Opis zawartości..."
                value={newBackpack.description}
                onChange={(e) => setNewBackpack({ ...newBackpack, description: e.target.value })}
                className="rounded-xl"
              />
            </div>
            <div>
              <Label className="text-base">Dla kogo?</Label>
              <div className="mt-2 grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
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
                  Dodaj checklistę 72h
                </Label>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  Utworzy bazową listę 72h dla wybranego profilu i doda ją do zakupów do odhaczenia.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCreateBackpack} className="w-full h-12 rounded-xl bg-orange-500 hover:bg-orange-600">
              Utwórz plecak
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={showAddItem} onOpenChange={setShowAddItem}>
        <SheetContent side="bottom" className="app-sheet-scroll rounded-t-3xl">
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
              {scanning ? 'Skanowanie...' : 'Zeskanuj kod/datę'}
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

            <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
              <div>
                <Label className="text-base">Ilość</Label>
                <Input
                  type="number"
                  min="1"
                  value={newItem.quantity ?? ''}
                  onChange={(e) => setNewItem({ ...newItem, quantity: parseOptionalNonNegativeInt(e.target.value) })}
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

            <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
              <div>
                <Label className="text-base">Data ważności</Label>
                <Input
                  type="date"
                  value={newItem.expiryDate ? new Date(newItem.expiryDate).toISOString().split('T')[0] : ''}
                  onChange={(e) => setNewItem({ ...newItem, expiryDate: e.target.value || null })}
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

      <Sheet open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
        <SheetContent side="bottom" className="app-sheet-scroll rounded-t-3xl">
          <SheetHeader>
            <SheetTitle className="text-xl">Edytuj przedmiot</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-4 max-h-[70vh] overflow-y-auto">
            <div>
              <Label className="text-base">Nazwa *</Label>
              <Input
                placeholder="Nazwa przedmiotu"
                value={editItemForm.name || ''}
                onChange={(e) => setEditItemForm({ ...editItemForm, name: e.target.value })}
                className="h-12 rounded-xl text-base"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
              <div>
                <Label className="text-base">Mam</Label>
                <Input
                  type="number"
                  min="0"
                  value={editItemForm.quantity ?? ''}
                  onChange={(e) => setEditItemForm({ ...editItemForm, quantity: parseOptionalNonNegativeInt(e.target.value) })}
                  className="h-12 rounded-xl text-base"
                />
              </div>
              <div>
                <Label className="text-base">Cel</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="Brak"
                  value={editItemForm.desiredQuantity ?? ''}
                  onChange={(e) => setEditItemForm({
                    ...editItemForm,
                    desiredQuantity: e.target.value === '' ? null : parseOptionalNonNegativeInt(e.target.value),
                  })}
                  className="h-12 rounded-xl text-base"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
              <div>
                <Label className="text-base">Kategoria</Label>
                <Select
                  value={editItemForm.category || 'other'}
                  onValueChange={(v) => setEditItemForm({ ...editItemForm, category: v as ItemCategory })}
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
              <div>
                <Label className="text-base">Data ważności</Label>
                <Input
                  type="date"
                  value={formatDateInputValue(editItemForm.expiryDate)}
                  onChange={(e) => setEditItemForm({ ...editItemForm, expiryDate: e.target.value || null })}
                  className="h-12 rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label className="text-base font-medium">Partie / daty ważności</Label>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Dla kilku takich samych rzeczy z różnymi terminami.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" className="shrink-0 rounded-lg" onClick={addEditItemBatch}>
                  <Plus className="h-4 w-4 mr-1" />
                  Dodaj
                </Button>
              </div>

              {(editItemForm.batches || []).length === 0 ? (
                <p className="rounded-lg border border-dashed border-neutral-300 p-3 text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                  Brak partii. Używana jest pojedyncza data ważności powyżej.
                </p>
              ) : (
                <div className="space-y-3">
                  {(editItemForm.batches || []).map((batch, index) => (
                    <div key={batch.id} className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-medium">Partia {index + 1}</p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500"
                          onClick={() => removeEditItemBatch(batch.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
                        <div>
                          <Label className="text-sm">Ilość</Label>
                          <Input
                            type="number"
                            min="1"
                            value={batch.quantity ?? ''}
                            onChange={(e) => updateEditItemBatch(batch.id, { quantity: parseRequiredPositiveInt(e.target.value) })}
                            className="h-11 rounded-xl"
                          />
                        </div>
                        <div>
                          <Label className="text-sm">Data</Label>
                          <Input
                            type="date"
                            value={formatDateInputValue(batch.expiryDate)}
                            onChange={(e) => updateEditItemBatch(batch.id, { expiryDate: e.target.value || null })}
                            className="h-11 rounded-xl"
                          />
                        </div>
                      </div>
                      <div className="mt-2">
                        <Label className="text-sm">Notatka</Label>
                        <Input
                          placeholder="np. kupione w lipcu"
                          value={batch.note || ''}
                          onChange={(e) => updateEditItemBatch(batch.id, { note: e.target.value })}
                          className="h-11 rounded-xl"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label className="text-base">Kod kreskowy</Label>
              <Input
                placeholder="EAN"
                value={editItemForm.barcode || ''}
                onChange={(e) => setEditItemForm({ ...editItemForm, barcode: e.target.value })}
                className="h-12 rounded-xl"
              />
            </div>

            <div>
              <Label className="text-base">Notatki</Label>
              <Textarea
                placeholder="Dodatkowe informacje..."
                value={editItemForm.notes || ''}
                onChange={(e) => setEditItemForm({ ...editItemForm, notes: e.target.value })}
                className="rounded-xl"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleUpdateItemDetails} className="flex-1 h-12 rounded-xl bg-orange-500 hover:bg-orange-600">
                <Check className="h-5 w-5 mr-2" />
                Zapisz
              </Button>
              <Button
                variant="outline"
                onClick={() => setEditingItem(null)}
                className="h-12 rounded-xl"
              >
                Anuluj
              </Button>
            </div>

            {editingItem && (
              <Button
                variant="ghost"
                className="w-full h-12 rounded-xl text-red-600 hover:text-red-700"
                onClick={async () => {
                  const itemId = editingItem.id;
                  setEditingItem(null);
                  await handleDeleteItem(itemId);
                }}
              >
                <Trash2 className="h-5 w-5 mr-2" />
                Usuń przedmiot
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={showAddShoppingItem} onOpenChange={setShowAddShoppingItem}>
        <SheetContent side="bottom" className="app-sheet-scroll rounded-t-3xl">
          <SheetHeader>
            <SheetTitle className="text-xl flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Dodaj do zakupów
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

            <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
              <div>
                <Label className="text-base">Ilość</Label>
                <Input
                  type="number"
                  min="1"
                  value={newShoppingItem.quantity ?? ''}
                  onChange={(e) => setNewShoppingItem({ ...newShoppingItem, quantity: parseOptionalNonNegativeInt(e.target.value) })}
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
        <SheetContent side="bottom" className="app-sheet-scroll rounded-t-3xl">
          <SheetHeader>
            <SheetTitle className="text-xl flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Dodaj ważną informację
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label className="text-base">Tytuł *</Label>
              <Input
                placeholder="np. Alergie, kontakt awaryjny"
                value={newImportantNote.title}
                onChange={(e) => setNewImportantNote({ ...newImportantNote, title: e.target.value })}
                className="h-12 rounded-xl text-base"
              />
            </div>
            <div>
              <Label className="text-base">Treść *</Label>
              <Textarea
                placeholder="Wpisz informacje, które mają być dostępne w sytuacji awaryjnej..."
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

      <AlertDialog
        open={importantNotePendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setImportantNotePendingDelete(null);
        }}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Usunąć te informacje?</AlertDialogTitle>
            <AlertDialogDescription>
              Tej operacji nie da się cofnąć. Informacja zostanie usunięta z listy Moje informacje.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {importantNotePendingDelete?.title && (
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm font-medium text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200">
              {importantNotePendingDelete.title}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                const noteId = importantNotePendingDelete?.id;
                setImportantNotePendingDelete(null);
                if (noteId) void removeImportantNote(noteId);
              }}
            >
              Usuń
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Toaster />
    </div>
  );
}
