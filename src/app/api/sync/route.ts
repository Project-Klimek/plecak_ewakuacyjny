import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { readValidatedJson } from '@/lib/api-validation';
import type { SyncData } from '@/types';
import { z } from 'zod';

const syncChangeSchema = z.object({
  type: z.enum([
    'create_backpack',
    'update_backpack',
    'delete_backpack',
    'create_item',
    'update_item',
    'delete_item',
  ]),
  data: z.record(z.string(), z.any()),
});

const syncSchema = z.object({
  changes: z.array(syncChangeSchema).default([]),
});

type SyncChange = {
  type: z.infer<typeof syncChangeSchema>['type'];
  data: Record<string, any>;
};

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
    ...(typeof data.desiredQuantity === 'number' || data.desiredQuantity === null
      ? { desiredQuantity: data.desiredQuantity as number | null }
      : {}),
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

async function userCanEditBackpack(backpackId: string, userId: string) {
  const backpack = await db.backpack.findUnique({
    where: { id: backpackId },
    include: {
      sharedWith: {
        where: { userId },
        select: { permission: true },
      },
    },
  });

  if (!backpack) return false;
  if (backpack.userId === userId) return true;

  return backpack.sharedWith.some((share) => share.permission === 'edit');
}

async function getEditableItem(itemId: string, userId: string) {
  const item = await db.item.findUnique({
    where: { id: itemId },
    include: {
      backpack: {
        include: {
          sharedWith: {
            where: { userId },
            select: { permission: true },
          },
        },
      },
    },
  });

  if (!item) return null;

  const canEdit =
    item.backpack.userId === userId ||
    item.backpack.sharedWith.some((share) => share.permission === 'edit');

  return canEdit ? item : null;
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
    backpacks: allBackpacks as unknown as SyncData['backpacks'],
    items: allItems as unknown as SyncData['items'],
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
    const parsed = await readValidatedJson(request, syncSchema);
    if (!parsed.ok) return parsed.response;
    const changes = parsed.data.changes as SyncChange[];
    
    const results = {
      created: 0,
      updated: 0,
      deleted: 0,
      errors: [] as string[],
    };
    
    for (const change of changes) {
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
              const canEditBackpack = await userCanEditBackpack(change.data.backpackId, user.id);
              
              if (canEditBackpack) {
                await db.item.create({
                  data: {
                    id: change.data.id,
                    name: change.data.name,
                    quantity: change.data.quantity,
                    desiredQuantity: typeof change.data.desiredQuantity === 'number' ? change.data.desiredQuantity : null,
                    category: change.data.category,
                    expiryDate: change.data.expiryDate ? new Date(change.data.expiryDate) : null,
                    barcode: change.data.barcode,
                    notes: change.data.notes,
                    imageUrl: change.data.imageUrl,
                    backpackId: change.data.backpackId,
                  },
                });
                results.created++;
              }
            }
            break;
          }
          
          case 'update_item': {
            const item = await getEditableItem(change.data.id, user.id);
            
            if (item) {
              await db.item.update({
                where: { id: change.data.id },
                data: pickItemUpdateData(change.data),
              });
              results.updated++;
            }
            break;
          }
          
          case 'delete_item': {
            const item = await getEditableItem(change.data.id, user.id);
            
            if (item) {
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
