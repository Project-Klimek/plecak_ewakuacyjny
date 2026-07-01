import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { readValidatedJson } from '@/lib/api-validation';
import { z } from 'zod';

const exportSchema = z.object({
  backpackId: z.string().min(1, 'Brak ID plecaka'),
});

function csvValue(value: string | number | null | undefined) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function csvRow(values: Array<string | number | null | undefined>) {
  return values.map(csvValue).join(';');
}

function itemQuantityLabel(item: { quantity: number; desiredQuantity: number | null }) {
  return item.desiredQuantity !== null
    ? `${item.quantity}/${item.desiredQuantity}`
    : String(item.quantity);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Nie zalogowano' },
      { status: 401 }
    );
  }
  
  try {
    const parsed = await readValidatedJson(request, exportSchema);
    if (!parsed.ok) return parsed.response;
    const { backpackId } = parsed.data;
    
    const backpack = await db.backpack.findUnique({
      where: { id: backpackId },
      include: {
        items: {
          include: {
            batches: {
              orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }],
            },
          },
          orderBy: [{ category: 'asc' }, { name: 'asc' }],
        },
        user: {
          select: { name: true, email: true },
        },
      },
    });
    
    if (!backpack) {
      return NextResponse.json(
        { success: false, error: 'Plecak nie zostal znaleziony' },
        { status: 404 }
      );
    }
    
    const isOwner = backpack.userId === user.id;
    const shared = await db.sharedBackpack.findUnique({
      where: { backpackId_userId: { backpackId, userId: user.id } },
    });
    
    if (!isOwner && !shared) {
      return NextResponse.json(
        { success: false, error: 'Brak dostepu do tego plecaka' },
        { status: 403 }
      );
    }
    
    const categoryLabels: Record<string, string> = {
      food: 'Jedzenie',
      water: 'Woda',
      medical: 'Apteczka',
      tools: 'Narzedzia',
      documents: 'Dokumenty',
      clothes: 'Ubrania',
      electronics: 'Elektronika',
      other: 'Inne',
    };
    
    const itemExpiryDate = (item: typeof backpack.items[number]) => {
      const timestamps = item.batches
        .map(batch => batch.expiryDate ? new Date(batch.expiryDate).getTime() : Number.NaN)
        .filter(timestamp => !Number.isNaN(timestamp));
      if (timestamps.length > 0) return new Date(Math.min(...timestamps));
      return item.expiryDate;
    };

    const itemBatchSummary = (item: typeof backpack.items[number]) =>
      item.batches.length > 0
        ? item.batches.map(batch => `${batch.quantity} szt. ${batch.expiryDate ? new Date(batch.expiryDate).toLocaleDateString('pl-PL') : 'bez daty'}`).join('; ')
        : '';

    const rows = [
      csvRow(['Nazwa', 'Kategoria', 'Stan / cel', 'Data waznosci', 'Kod kreskowy', 'Notatki', 'Dodano']),
      ...backpack.items.map((item) =>
        csvRow([
          item.name,
          categoryLabels[item.category] || item.category,
          itemQuantityLabel(item),
          itemExpiryDate(item) ? new Date(itemExpiryDate(item)!).toLocaleDateString('pl-PL') : '',
          item.barcode || '',
          [item.notes || '', itemBatchSummary(item)].filter(Boolean).join(' | '),
          new Date(item.createdAt).toLocaleDateString('pl-PL'),
        ])
      ),
      csvRow([
        'RAZEM PRZEDMIOTOW:',
        '',
        backpack.items.reduce((sum, item) => sum + item.quantity, 0),
        '',
        '',
        '',
        '',
      ]),
      '',
      csvRow(['Informacje o plecaku', '']),
      csvRow(['Nazwa plecaka', backpack.name]),
      csvRow(['Opis', backpack.description || '']),
      csvRow(['Wlasciciel', backpack.user.name || backpack.user.email]),
      csvRow(['Data utworzenia', new Date(backpack.createdAt).toLocaleDateString('pl-PL')]),
      csvRow(['Ostatnia aktualizacja', new Date(backpack.updatedAt).toLocaleDateString('pl-PL')]),
      csvRow(['Liczba przedmiotow', backpack.items.length]),
      csvRow(['Suma sztuk', backpack.items.reduce((sum, item) => sum + item.quantity, 0)]),
    ];

    const csv = `\uFEFF${rows.join('\r\n')}`;
    const filename = backpack.name.replace(/[^a-zA-Z0-9]/g, '_') || 'plecak';
    
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}.csv"`,
      },
    });
  } catch (error) {
    console.error('Export CSV error:', error);
    return NextResponse.json(
      { success: false, error: 'Wystapil blad podczas eksportu CSV' },
      { status: 500 }
    );
  }
}
