import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser, createSession } from '@/lib/auth';
import { checkRateLimit, resetRateLimit } from '@/lib/rate-limit';
import { readValidatedJson } from '@/lib/api-validation';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('Nieprawidłowy format email'),
  password: z.string().min(1, 'Hasło jest wymagane'),
});

export async function POST(request: NextRequest) {
  try {
    const limit = checkRateLimit(request, 'auth:login', {
      max: 10,
      windowMs: 15 * 60 * 1000,
    });

    if (!limit.allowed) {
      return NextResponse.json(
        { success: false, error: 'Za duzo prob logowania. Sprobuj ponownie za kilka minut.' },
        {
          status: 429,
          headers: { 'Retry-After': String(limit.retryAfterSeconds) },
        }
      );
    }

    const parsed = await readValidatedJson(request, loginSchema);
    if (!parsed.ok) return parsed.response;
    const validatedData = parsed.data;
    
    const result = await authenticateUser(validatedData.email, validatedData.password);
    
    if (result.error) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 401 }
      );
    }
    
    await createSession(result.user!.id, result.user!.email);
    resetRateLimit(request, 'auth:login');
    
    return NextResponse.json({
      success: true,
      user: result.user,
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { success: false, error: 'Wystąpił błąd podczas logowania' },
      { status: 500 }
    );
  }
}
