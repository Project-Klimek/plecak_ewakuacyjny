import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { z } from 'zod';

const createBackpackSchema = z.object({
  name: z.string().min(1, 'Nazwa jest wymagana').max(100),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Nieprawidłowy format koloru').optional(),
  icon: z.string().optional(),
});

// GET - Pobierz wszystkie plecaki użytkownika
export async function GET() {
  const user = await getCurrentUser();
  
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Nie zalogowano' },
      { status: 401 }
    );
  }
  
  // Pobierz własne plecaki i udostępnione
  const ownBackpacks = await db.backpack.findMany({
    where: { userId: user.id },
    include: {
      items: true,
      sharedWith: {
        include: {
          user: {
            select: { id: true, email: true, name: true },
          },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });
  
  const sharedBackpacks = await db.sharedBackpack.findMany({
    where: { userId: user.id },
    include: {
      backpack: {
        include: {
          items: true,
          user: {
            select: { id: true, email: true, name: true },
          },
        },
      },
    },
  });
  
  return NextResponse.json({
    success: true,
    data: {
      own: ownBackpacks,
      shared: sharedBackpacks.map(s => ({
        ...s.backpack,
        permission: s.permission,
        sharedBy: s.backpack.user,
      })),
    },
  });
}

// POST - Utwórz nowy plecak
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Nie zalogowano' },
      { status: 401 }
    );
  }
  
  try {
    const body = await request.json();
    const validatedData = createBackpackSchema.parse(body);
    
    const backpack = await db.backpack.create({
      data: {
        name: validatedData.name,
        description: validatedData.description,
        color: validatedData.color || '#3b82f6',
        icon: validatedData.icon || 'backpack',
        userId: user.id,
      },
      include: {
        items: true,
      },
    });
    
    return NextResponse.json({ success: true, data: backpack });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.issues[0]?.message || 'Nieprawidlowe dane' },
        { status: 400 }
      );
    }
    
    console.error('Create backpack error:', error);
    return NextResponse.json(
      { success: false, error: 'Wystąpił błąd podczas tworzenia plecaka' },
      { status: 500 }
    );
  }
}
