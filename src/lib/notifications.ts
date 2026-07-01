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
        OR: [
          {
            expiryDate: {
              gte: startDate,
              lte: targetDate,
            },
          },
          {
            batches: {
              some: {
                expiryDate: {
                  gte: startDate,
                  lte: targetDate,
                },
              },
            },
          },
        ],
      },
      include: {
        batches: {
          orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }],
        },
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
      const matchingBatch = item.batches.find((batch) => {
        if (!batch.expiryDate) return false;
        return batch.expiryDate >= startDate && batch.expiryDate <= targetDate;
      });
      const expiryDate = matchingBatch?.expiryDate || item.expiryDate;
      const batchText = matchingBatch ? ` (${matchingBatch.quantity} szt. z partii)` : '';

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
          message: `"${item.name}"${batchText} w plecaku "${item.backpack.name}" konczy sie ${new Date(expiryDate!).toLocaleDateString('pl-PL')}`,
          itemId: item.id,
        },
      });

      for (const share of item.backpack.sharedWith) {
        await db.notification.create({
          data: {
            userId: share.userId,
            type: 'expiry_warning',
            title: `Przedmiot konczy sie za ${days} dni`,
            message: `"${item.name}"${batchText} w udostepnionym plecaku "${item.backpack.name}" konczy sie ${new Date(expiryDate!).toLocaleDateString('pl-PL')}`,
            itemId: item.id,
          },
        });
      }
    }
  }
}
