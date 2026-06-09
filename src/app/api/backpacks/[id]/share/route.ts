import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { readValidatedJson } from '@/lib/api-validation';
import { z } from 'zod';

const shareSchema = z.object({
  email: z.string().email('Nieprawidłowy format email'),
  permission: z.enum(['read', 'edit']).default('read'),
});

// POST - Udostępnij plecak
export async function POST(
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
  
  const { id: backpackId } = await params;
  
  // Sprawdź czy użytkownik jest właścicielem
  const backpack = await db.backpack.findUnique({
    where: { id: backpackId },
  });
  
  if (!backpack || backpack.userId !== user.id) {
    return NextResponse.json(
      { success: false, error: 'Tylko właściciel może udostępniać plecak' },
      { status: 403 }
    );
  }
  
  try {
    const parsed = await readValidatedJson(request, shareSchema);
    if (!parsed.ok) return parsed.response;
    const validatedData = parsed.data;
    
    // Znajdź użytkownika do udostępnienia
    const targetUser = await db.user.findUnique({
      where: { email: validatedData.email.toLowerCase() },
      select: { id: true, email: true, name: true },
    });
    
    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: 'Nie znaleziono użytkownika z tym emailem' },
        { status: 404 }
      );
    }
    
    if (targetUser.id === user.id) {
      return NextResponse.json(
        { success: false, error: 'Nie możesz udostępnić plecaka samemu sobie' },
        { status: 400 }
      );
    }
    
    // Sprawdź czy już udostępniono
    const existingShare = await db.sharedBackpack.findUnique({
      where: {
        backpackId_userId: { backpackId, userId: targetUser.id },
      },
    });
    
    if (existingShare) {
      // Aktualizuj uprawnienia
      const updated = await db.sharedBackpack.update({
        where: { id: existingShare.id },
        data: { permission: validatedData.permission },
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      });
      
      return NextResponse.json({
        success: true,
        data: updated,
        message: 'Zaktualizowano uprawnienia',
      });
    }
    
    // Utwórz udostępnienie
    const share = await db.sharedBackpack.create({
      data: {
        backpackId,
        userId: targetUser.id,
        permission: validatedData.permission,
      },
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    });
    
    // Utwórz powiadomienie
    await db.notification.create({
      data: {
        userId: targetUser.id,
        type: 'share_received',
        title: 'Udostępniono plecak',
        message: `Użytkownik ${user.name || user.email} udostępnił Ci plecak "${backpack.name}"`,
      },
    });
    
    return NextResponse.json({ success: true, data: share });
  } catch (error) {
    console.error('Share backpack error:', error);
    return NextResponse.json(
      { success: false, error: 'Wystąpił błąd podczas udostępniania' },
      { status: 500 }
    );
  }
}

// GET - Pobierz listę udostępnień
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
  
  const { id: backpackId } = await params;
  
  const backpack = await db.backpack.findUnique({
    where: { id: backpackId },
  });
  
  if (!backpack || backpack.userId !== user.id) {
    return NextResponse.json(
      { success: false, error: 'Tylko właściciel może zarządzać udostępnianiem' },
      { status: 403 }
    );
  }
  
  const shares = await db.sharedBackpack.findMany({
    where: { backpackId },
    include: {
      user: { select: { id: true, email: true, name: true } },
    },
  });
  
  return NextResponse.json({ success: true, data: shares });
}

// DELETE - Usuń udostępnienie
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
  
  const { id: backpackId } = await params;
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  
  if (!userId) {
    return NextResponse.json(
      { success: false, error: 'Brak ID użytkownika' },
      { status: 400 }
    );
  }
  
  const backpack = await db.backpack.findUnique({
    where: { id: backpackId },
  });
  
  // Właściciel może usunąć każde udostępnienie
  // Użytkownik może usunąć swoje udostępnienie
  if (backpack?.userId !== user.id && userId !== user.id) {
    return NextResponse.json(
      { success: false, error: 'Brak uprawnień' },
      { status: 403 }
    );
  }
  
  await db.sharedBackpack.delete({
    where: {
      backpackId_userId: { backpackId, userId },
    },
  });
  
  return NextResponse.json({ success: true });
}
