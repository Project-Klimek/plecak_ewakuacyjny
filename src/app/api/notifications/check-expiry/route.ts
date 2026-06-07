import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { checkExpiryDates } from '@/lib/notifications';

export async function POST() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Nie zalogowano' },
      { status: 401 }
    );
  }

  await checkExpiryDates();

  return NextResponse.json({ success: true });
}
