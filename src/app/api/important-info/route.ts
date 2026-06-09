import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { readValidatedJson } from '@/lib/api-validation';
import { z } from 'zod';

const importantInfoSchema = z.object({
  title: z.string().trim().min(1, 'Tytul jest wymagany').max(120, 'Tytul jest za dlugi'),
  content: z.string().trim().min(1, 'Tresc jest wymagana').max(3000, 'Tresc jest za dluga'),
});

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Nie zalogowano' },
      { status: 401 }
    );
  }

  const notes = await db.importantInfo.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ success: true, data: notes });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Nie zalogowano' },
      { status: 401 }
    );
  }

  try {
    const parsed = await readValidatedJson(request, importantInfoSchema);
    if (!parsed.ok) return parsed.response;

    const note = await db.importantInfo.create({
      data: {
        title: parsed.data.title,
        content: parsed.data.content,
        userId: user.id,
      },
    });

    return NextResponse.json({ success: true, data: note });
  } catch (error) {
    console.error('Create important info error:', error);
    return NextResponse.json(
      { success: false, error: 'Wystapil blad podczas zapisywania informacji' },
      { status: 500 }
    );
  }
}
