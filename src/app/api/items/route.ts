import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { readValidatedJson } from '@/lib/api-validation';
import { z } from 'zod';

const createItemSchema = z.object({
  name: z.string().min(1, 'Nazwa jest wymagana').max(200),
  quantity: z.number().int().min(1).default(1),
  category: z.enum(['food', 'water', 'medical', 'tools', 'documents', 'clothes', 'electronics', 'other']).default('other'),
  expiryDate: z.string().optional().nullable(),
  barcode: z.string().max(50).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  backpackId: z.string(),
});

// Helper - sprawdzanie dostępu do plecaka
async function checkBackpackWriteAccess(backpackId: string, userId: string) {
  const backpack = await db.backpack.findUnique({
    where: { id: backpackId },
  });
  
  if (!backpack) return { access: false };
  
  if (backpack.userId === userId) {
    return { access: true, isOwner: true };
  }
  
  const shared = await db.sharedBackpack.findUnique({
    where: { backpackId_userId: { backpackId, userId } },
  });
  
  if (!shared || shared.permission !== 'edit') {
    return { access: false };
  }
  
  return { access: true, isOwner: false };
}

// GET - Pobierz przedmioty (z filtrowaniem po plecaku)
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Nie zalogowano' },
      { status: 401 }
    );
  }
  
  const { searchParams } = new URL(request.url);
  const backpackId = searchParams.get('backpackId');
  const category = searchParams.get('category');
  const expiringWithin = searchParams.get('expiringWithin');
  
  // Jeśli podano backpackId, sprawdź dostęp i pobierz przedmioty
  if (backpackId) {
    const backpack = await db.backpack.findUnique({
      where: { id: backpackId },
      include: {
        user: { select: { id: true } },
        sharedWith: { where: { userId: user.id } },
      },
    });
    
    if (!backpack || (backpack.userId !== user.id && backpack.sharedWith.length === 0)) {
      return NextResponse.json(
        { success: false, error: 'Brak dostępu do tego plecaka' },
        { status: 403 }
      );
    }
    
    const items = await db.item.findMany({
      where: {
        backpackId,
        ...(category && { category }),
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    
    return NextResponse.json({ success: true, data: items });
  }
  
  // Pobierz wszystkie przedmioty użytkownika (własne + udostępnione)
  const ownBackpacks = await db.backpack.findMany({
    where: { userId: user.id },
    select: { id: true },
  });
  
  const sharedBackpacks = await db.sharedBackpack.findMany({
    where: { userId: user.id },
    select: { backpackId: true },
  });
  
  const backpackIds = [
    ...ownBackpacks.map(b => b.id),
    ...sharedBackpacks.map(s => s.backpackId),
  ];
  
  const now = new Date();
  let expiryFilter = {};
  
  if (expiringWithin) {
    const days = parseInt(expiringWithin);
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);
    
    expiryFilter = {
      expiryDate: {
        gte: now,
        lte: futureDate,
      },
    };
  }
  
  const items = await db.item.findMany({
    where: {
      backpackId: { in: backpackIds },
      ...(category && { category }),
      ...expiryFilter,
    },
    include: {
      backpack: {
        select: { id: true, name: true, color: true },
      },
    },
    orderBy: { expiryDate: 'asc' },
  });
  
  return NextResponse.json({ success: true, data: items });
}

// POST - Utwórz nowy przedmiot
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Nie zalogowano' },
      { status: 401 }
    );
  }
  
  try {
    const parsed = await readValidatedJson(request, createItemSchema);
    if (!parsed.ok) return parsed.response;
    const validatedData = parsed.data;
    
    const { access } = await checkBackpackWriteAccess(validatedData.backpackId, user.id);
    
    if (!access) {
      return NextResponse.json(
        { success: false, error: 'Brak uprawnień do dodawania przedmiotów do tego plecaka' },
        { status: 403 }
      );
    }
    
    const item = await db.item.create({
      data: {
        name: validatedData.name,
        quantity: validatedData.quantity,
        category: validatedData.category,
        expiryDate: validatedData.expiryDate ? new Date(validatedData.expiryDate) : null,
        barcode: validatedData.barcode,
        notes: validatedData.notes,
        imageUrl: validatedData.imageUrl,
        backpackId: validatedData.backpackId,
      },
    });
    
    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    console.error('Create item error:', error);
    return NextResponse.json(
      { success: false, error: 'Wystąpił błąd podczas dodawania przedmiotu' },
      { status: 500 }
    );
  }
}
