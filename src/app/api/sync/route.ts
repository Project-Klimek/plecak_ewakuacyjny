import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import type { SyncData } from '@/types';

function pickBackpackUpdateData(data: Record<string, unknown>) {
  return {
    ...(typeof data.name === 'string' && { name: data.name }),
    ...(typeof data.description === 'string' || data.description === null
      ? { description: data.description as string | null }
      : {}),
    ...(typeof data.color === 'string' && { color: data.color }),
    ...(typeof data.icon === 'string' && { icon: data.icon }),
  };
}

function pickItemUpdateData(data: Record<string, unknown>) {
  return {
    ...(typeof data.name === 'string' && { name: data.name }),
    ...(typeof data.quantity === 'number' && { quantity: data.quantity }),
    ...(typeof data.category === 'string' && { category: data.category }),
    ...(data.expiryDate !== undefined
      ? { expiryDate: data.expiryDate ? new Date(String(data.expiryDate)) : null }
      : {}),
    ...(typeof data.barcode === 'string' || data.barcode === null
      ? { barcode: data.barcode as string | null }
      : {}),
    ...(typeof data.notes === 'string' || data.notes === null
      ? { notes: data.notes as string | null }
      : {}),
    ...(typeof data.imageUrl === 'string' || data.imageUrl === null
      ? { imageUrl: data.imageUrl as string | null }
      : {}),
  };
}

// GET - Pobierz dane do synchronizacji
export async function GET() {
  const user = await getCurrentUser();
  
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Nie zalogowano' },
      { status: 401 }
    );
  }
  
  // Pobierz wszystkie plecaki użytkownika
  const ownBackpacks = await db.backpack.findMany({
    where: { userId: user.id },
    include: { items: true },
  });
  
  const sharedBackpacks = await db.sharedBackpack.findMany({
    where: { userId: user.id },
    include: {
      backpack: { include: { items: true } },
    },
  });
  
  const allBackpacks = [
    ...ownBackpacks,
    ...sharedBackpacks.map(s => s.backpack),
  ];
  
  const allItems = allBackpacks.flatMap(b => b.items);
  
  const syncData: SyncData = {
    backpacks: allBackpacks,
    items: allItems,
    lastSync: new Date().toISOString(),
  };
  
  return NextResponse.json({
    success: true,
    data: syncData,
  });
}

// POST - Synchronizuj dane offline
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
    const { changes } = body;
    
    const results = {
      created: 0,
      updated: 0,
      deleted: 0,
      errors: [] as string[],
    };
    
    for (const change of changes || []) {
      try {
        switch (change.type) {
          case 'create_backpack': {
            // Sprawdź czy już istnieje
            const existing = await db.backpack.findUnique({
              where: { id: change.data.id },
            });
            
            if (!existing) {
              await db.backpack.create({
                data: {
                  id: change.data.id,
                  name: change.data.name,
                  description: change.data.description,
                  color: change.data.color,
                  icon: change.data.icon,
                  userId: user.id,
                },
              });
              results.created++;
            }
            break;
          }
          
          case 'update_backpack': {
            const backpack = await db.backpack.findUnique({
              where: { id: change.data.id },
            });
            
            if (backpack && backpack.userId === user.id) {
              await db.backpack.update({
                where: { id: change.data.id },
                data: pickBackpackUpdateData(change.data),
              });
              results.updated++;
            }
            break;
          }
          
          case 'delete_backpack': {
            const backpack = await db.backpack.findUnique({
              where: { id: change.data.id },
            });
            
            if (backpack && backpack.userId === user.id) {
              await db.backpack.delete({
                where: { id: change.data.id },
              });
              results.deleted++;
            }
            break;
          }
          
          case 'create_item': {
            const existing = await db.item.findUnique({
              where: { id: change.data.id },
            });
            
            if (!existing) {
              // Sprawdź dostęp do plecaka
              const backpack = await db.backpack.findUnique({
                where: { id: change.data.backpackId },
              });
              
              if (backpack && backpack.userId === user.id) {
                await db.item.create({
                  data: {
                    id: change.data.id,
                    name: change.data.name,
                    quantity: change.data.quantity,
                    category: change.data.category,
                    expiryDate: change.data.expiryDate ? new Date(change.data.expiryDate) : null,
                    barcode: change.data.barcode,
                    notes: change.data.notes,
                    backpackId: change.data.backpackId,
                  },
                });
                results.created++;
              }
            }
            break;
          }
          
          case 'update_item': {
            const item = await db.item.findUnique({
              where: { id: change.data.id },
              include: { backpack: true },
            });
            
            if (item && item.backpack.userId === user.id) {
              await db.item.update({
                where: { id: change.data.id },
                data: pickItemUpdateData(change.data),
              });
              results.updated++;
            }
            break;
          }
          
          case 'delete_item': {
            const item = await db.item.findUnique({
              where: { id: change.data.id },
              include: { backpack: true },
            });
            
            if (item && item.backpack.userId === user.id) {
              await db.item.delete({
                where: { id: change.data.id },
              });
              results.deleted++;
            }
            break;
          }
        }
      } catch (err) {
        results.errors.push(`Błąd przy ${change.type}: ${err}`);
      }
    }
    
    return NextResponse.json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json(
      { success: false, error: 'Wystąpił błąd podczas synchronizacji' },
      { status: 500 }
    );
  }
}
