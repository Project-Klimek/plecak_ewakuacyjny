import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET - Pobierz powiadomienia użytkownika
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Nie zalogowano' },
      { status: 401 }
    );
  }
  
  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get('unreadOnly') === 'true';
  
  const notifications = await db.notification.findMany({
    where: {
      userId: user.id,
      ...(unreadOnly && { isRead: false }),
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  
  const unreadCount = await db.notification.count({
    where: {
      userId: user.id,
      isRead: false,
    },
  });
  
  return NextResponse.json({
    success: true,
    data: notifications,
    unreadCount,
  });
}

// POST - Oznacz jako przeczytane
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Nie zalogowano' },
      { status: 401 }
    );
  }
  
  const body = await request.json();
  const { notificationId, markAllRead } = body;
  
  if (markAllRead) {
    await db.notification.updateMany({
      where: {
        userId: user.id,
        isRead: false,
      },
      data: { isRead: true },
    });
    
    return NextResponse.json({ success: true });
  }
  
  if (notificationId) {
    await db.notification.update({
      where: {
        id: notificationId,
        userId: user.id,
      },
      data: { isRead: true },
    });
    
    return NextResponse.json({ success: true });
  }
  
  return NextResponse.json(
    { success: false, error: 'Brak parametrów' },
    { status: 400 }
  );
}

// Funkcja do sprawdzania kończących się dat ważności (można wywoływać z cron job)
export async function checkExpiryDates() {
  const now = new Date();
  const warningDays = [7, 3, 1];
  
  for (const days of warningDays) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + days);
    targetDate.setHours(23, 59, 59, 999);
    
    const startDate = new Date(targetDate);
    startDate.setHours(0, 0, 0, 0);
    
    const expiringItems = await db.item.findMany({
      where: {
        expiryDate: {
          gte: startDate,
          lte: targetDate,
        },
      },
      include: {
        backpack: {
          include: {
            user: true,
            sharedWith: {
              include: { user: true },
            },
          },
        },
      },
    });
    
    for (const item of expiringItems) {
      // Sprawdź czy powiadomienie już istnieje
      const existingNotification = await db.notification.findFirst({
        where: {
          itemId: item.id,
          type: 'expiry_warning',
          createdAt: {
            gte: new Date(now.getTime() - 24 * 60 * 60 * 1000), // ostatnie 24h
          },
        },
      });
      
      if (existingNotification) continue;
      
      // Utwórz powiadomienie dla właściciela
      await db.notification.create({
        data: {
          userId: item.backpack.userId,
          type: 'expiry_warning',
          title: `Przedmiot kończy się za ${days} dni`,
          message: `"${item.name}" w plecaku "${item.backpack.name}" kończy się ${new Date(item.expiryDate!).toLocaleDateString('pl-PL')}`,
          itemId: item.id,
        },
      });
      
      // Utwórz powiadomienia dla użytkowników z udostępnieniem
      for (const share of item.backpack.sharedWith) {
        await db.notification.create({
          data: {
            userId: share.userId,
            type: 'expiry_warning',
            title: `Przedmiot kończy się za ${days} dni`,
            message: `"${item.name}" w udostępnionym plecaku "${item.backpack.name}" kończy się ${new Date(item.expiryDate!).toLocaleDateString('pl-PL')}`,
            itemId: item.id,
          },
        });
      }
    }
  }
}
