import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { z } from 'zod';

const updateBackpackSchema = z.object({
  name: z.string().min(1, 'Nazwa jest wymagana').max(100).optional(),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Nieprawidłowy format koloru').optional(),
  icon: z.string().optional(),
});

// Sprawdź dostęp do plecaka
async function checkBackpackAccess(backpackId: string, userId: string, requireEdit = false) {
  const backpack = await db.backpack.findUnique({
    where: { id: backpackId },
  });
  
  if (!backpack) return { access: false, backpack: null };
  
  // Właściciel ma pełny dostęp
  if (backpack.userId === userId) {
    return { access: true, backpack, isOwner: true };
  }
  
  // Sprawdź udostępnienie
  const shared = await db.sharedBackpack.findUnique({
    where: { backpackId_userId: { backpackId, userId } },
  });
  
  if (!shared) return { access: false, backpack: null };
  
  if (requireEdit && shared.permission !== 'edit') {
    return { access: false, backpack, isOwner: false };
  }
  
  return { access: true, backpack, isOwner: false, permission: shared.permission };
}

// GET - Pobierz szczegóły plecaka
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Nie zalogowano' },
      { status: 401 }
    );
  }
  
  const { id } = await params;
  const { access, backpack, isOwner, permission } = await checkBackpackAccess(id, user.id);
  
  if (!access || !backpack) {
    return NextResponse.json(
      { success: false, error: 'Plecak nie został znaleziony' },
      { status: 404 }
    );
  }
  
  const fullBackpack = await db.backpack.findUnique({
    where: { id },
    include: {
      items: {
        orderBy: { category: 'asc' },
      },
      sharedWith: {
        include: {
          user: {
            select: { id: true, email: true, name: true },
          },
        },
      },
      user: {
        select: { id: true, email: true, name: true },
      },
    },
  });
  
  return NextResponse.json({
    success: true,
    data: {
      ...fullBackpack,
      isOwner,
      permission: isOwner ? 'edit' : permission,
    },
  });
}

// PUT - Aktualizuj plecak
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Nie zalogowano' },
      { status: 401 }
    );
  }
  
  const { id } = await params;
  const { access, backpack, isOwner } = await checkBackpackAccess(id, user.id, true);
  
  if (!access || !backpack) {
    return NextResponse.json(
      { success: false, error: 'Brak uprawnień do edycji tego plecaka' },
      { status: 403 }
    );
  }
  
  // Tylko właściciel może edytować szczegóły plecaka
  if (!isOwner) {
    return NextResponse.json(
      { success: false, error: 'Tylko właściciel może edytować szczegóły plecaka' },
      { status: 403 }
    );
  }
  
  try {
    const body = await request.json();
    const validatedData = updateBackpackSchema.parse(body);
    
    const updatedBackpack = await db.backpack.update({
      where: { id },
      data: validatedData,
      include: {
        items: true,
      },
    });
    
    return NextResponse.json({ success: true, data: updatedBackpack });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.issues[0]?.message || 'Nieprawidlowe dane' },
        { status: 400 }
      );
    }
    
    console.error('Update backpack error:', error);
    return NextResponse.json(
      { success: false, error: 'Wystąpił błąd podczas aktualizacji plecaka' },
      { status: 500 }
    );
  }
}

// DELETE - Usuń plecak
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Nie zalogowano' },
      { status: 401 }
    );
  }
  
  const { id } = await params;
  const { access, backpack, isOwner } = await checkBackpackAccess(id, user.id);
  
  if (!access || !backpack) {
    return NextResponse.json(
      { success: false, error: 'Plecak nie został znaleziony' },
      { status: 404 }
    );
  }
  
  if (!isOwner) {
    return NextResponse.json(
      { success: false, error: 'Tylko właściciel może usunąć plecak' },
      { status: 403 }
    );
  }
  
  await db.backpack.delete({
    where: { id },
  });
  
  return NextResponse.json({ success: true });
}
