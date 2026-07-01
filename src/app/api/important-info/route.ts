import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { readValidatedJson } from '@/lib/api-validation';
import { z } from 'zod';

const importantInfoSchema = z.object({
  title: z.string().trim().min(1, 'Tytuł jest wymagany').max(120, 'Tytuł jest za długi'),
  content: z.string().trim().min(1, 'Treść jest wymagana').max(3000, 'Treść jest za długa'),
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
      { success: false, error: 'Wystąpił błąd podczas zapisywania informacji' },
      { status: 500 }
    );
  }
}
