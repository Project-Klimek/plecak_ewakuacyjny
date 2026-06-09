import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

export async function readValidatedJson<TSchema extends z.ZodType>(
  request: NextRequest,
  schema: TSchema
): Promise<ValidationResult<z.infer<TSchema>>> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'Nieprawidlowy format danych' },
        { status: 400 }
      ),
    };
  }

  const result = schema.safeParse(body);

  if (!result.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: result.error.issues[0]?.message || 'Nieprawidlowe dane' },
        { status: 400 }
      ),
    };
  }

  return { ok: true, data: result.data };
}
