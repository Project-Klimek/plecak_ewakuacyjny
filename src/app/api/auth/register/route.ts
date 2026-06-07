import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, createSession } from '@/lib/auth';
import { z } from 'zod';

const registerSchema = z.object({
  email: z.string().email('Nieprawidłowy format email'),
  password: z.string().min(6, 'Hasło musi mieć minimum 6 znaków'),
  name: z.string().min(2, 'Imię musi mieć minimum 2 znaki'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = registerSchema.parse(body);
    
    // Check if user exists
    const existingUser = await db.user.findUnique({
      where: { email: validatedData.email.toLowerCase() },
    });
    
    if (existingUser) {
      return NextResponse.json(
        { success: false, error: 'Użytkownik z tym emailem już istnieje' },
        { status: 400 }
      );
    }
    
    // Hash password and create user
    const hashedPassword = await hashPassword(validatedData.password);
    
    const user = await db.user.create({
      data: {
        email: validatedData.email.toLowerCase(),
        password: hashedPassword,
        name: validatedData.name,
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    
    // Create session
    await createSession(user.id, user.email);
    
    return NextResponse.json({
      success: true,
      user,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.errors[0].message },
        { status: 400 }
      );
    }
    
    console.error('Register error:', error);
    return NextResponse.json(
      { success: false, error: 'Wystąpił błąd podczas rejestracji' },
      { status: 500 }
    );
  }
}
