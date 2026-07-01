import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { readValidatedJson } from '@/lib/api-validation';
import { z } from 'zod';

const updateItemSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  quantity: z.number().int().min(0).optional(),
  desiredQuantity: z.number().int().min(0).optional().nullable(),
  category: z.enum(['food', 'water', 'medical', 'tools', 'documents', 'clothes', 'electronics', 'other']).optional(),
  expiryDate: z.string().optional().nullable(),
  barcode: z.string().max(50).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  batches: z.array(z.object({
    quantity: z.number().int().min(1),
    expiryDate: z.string().optional().nullable(),
    note: z.string().max(300).optional().nullable(),
  })).optional(),
});

// Helper - sprawdzanie dostępu do przedmiotu
async function checkItemAccess(itemId: string, userId: string, requireWrite = false) {
  const item = await db.item.findUnique({
    where: { id: itemId },
    include: {
      batches: true,
      backpack: {
        include: {
          sharedWith: { where: { userId } },
        },
      },
    },
  });
  
  if (!item) return { access: false, item: null };
  
  const isOwner = item.backpack.userId === userId;
  const sharedEntry = item.backpack.sharedWith[0];
  const hasReadAccess = isOwner || !!sharedEntry;
  const hasWriteAccess = isOwner || (sharedEntry?.permission === 'edit');
  
  if (requireWrite) {
    return { access: hasWriteAccess, item, isOwner };
  }
  
  return { access: hasReadAccess, item, isOwner };
}

// GET - Pobierz szczegóły przedmiotu
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
  const { access, item } = await checkItemAccess(id, user.id);
  
  if (!access || !item) {
    return NextResponse.json(
      { success: false, error: 'Przedmiot nie został znaleziony' },
      { status: 404 }
    );
  }
  
  return NextResponse.json({ success: true, data: item });
}

// PUT - Aktualizuj przedmiot
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
  const { access, item } = await checkItemAccess(id, user.id, true);
  
  if (!access || !item) {
    return NextResponse.json(
      { success: false, error: 'Brak uprawnień do edycji tego przedmiotu' },
      { status: 403 }
    );
  }
  
  try {
    const parsed = await readValidatedJson(request, updateItemSchema);
    if (!parsed.ok) return parsed.response;
    const validatedData = parsed.data;
    const batchQuantity = validatedData.batches?.reduce((sum, batch) => sum + batch.quantity, 0);
    
    const updatedItem = await db.item.update({
      where: { id },
      data: {
        ...validatedData,
        quantity: batchQuantity !== undefined ? batchQuantity : validatedData.quantity,
        batches: undefined,
        expiryDate: validatedData.expiryDate !== undefined 
          ? (validatedData.expiryDate ? new Date(validatedData.expiryDate) : null)
          : undefined,
      },
      include: {
        batches: {
          orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    if (validatedData.batches !== undefined) {
      await db.$transaction([
        db.itemBatch.deleteMany({ where: { itemId: id } }),
        ...validatedData.batches.map((batch) =>
          db.itemBatch.create({
            data: {
              itemId: id,
              quantity: batch.quantity,
              expiryDate: batch.expiryDate ? new Date(batch.expiryDate) : null,
              note: batch.note,
            },
          })
        ),
      ]);

      const itemWithBatches = await db.item.findUnique({
        where: { id },
        include: {
          batches: {
            orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }],
          },
        },
      });

      return NextResponse.json({ success: true, data: itemWithBatches });
    }
    
    return NextResponse.json({ success: true, data: updatedItem });
  } catch (error) {
    console.error('Update item error:', error);
    return NextResponse.json(
      { success: false, error: 'Wystąpił błąd podczas aktualizacji przedmiotu' },
      { status: 500 }
    );
  }
}

// DELETE - Usuń przedmiot
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
  const { access, item } = await checkItemAccess(id, user.id, true);
  
  if (!access || !item) {
    return NextResponse.json(
      { success: false, error: 'Brak uprawnień do usunięcia tego przedmiotu' },
      { status: 403 }
    );
  }
  
  await db.item.delete({
    where: { id },
  });
  
  return NextResponse.json({ success: true });
}
