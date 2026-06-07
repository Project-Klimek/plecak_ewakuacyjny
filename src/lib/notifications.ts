import { db } from './db';

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
      const existingNotification = await db.notification.findFirst({
        where: {
          itemId: item.id,
          type: 'expiry_warning',
          createdAt: {
            gte: new Date(now.getTime() - 24 * 60 * 60 * 1000),
          },
        },
      });

      if (existingNotification) continue;

      await db.notification.create({
        data: {
          userId: item.backpack.userId,
          type: 'expiry_warning',
          title: `Przedmiot konczy sie za ${days} dni`,
          message: `"${item.name}" w plecaku "${item.backpack.name}" konczy sie ${new Date(item.expiryDate!).toLocaleDateString('pl-PL')}`,
          itemId: item.id,
        },
      });

      for (const share of item.backpack.sharedWith) {
        await db.notification.create({
          data: {
            userId: share.userId,
            type: 'expiry_warning',
            title: `Przedmiot konczy sie za ${days} dni`,
            message: `"${item.name}" w udostepnionym plecaku "${item.backpack.name}" konczy sie ${new Date(item.expiryDate!).toLocaleDateString('pl-PL')}`,
            itemId: item.id,
          },
        });
      }
    }
  }
}
