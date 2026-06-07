import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from './db';
import type { User } from '@/types';

const JWT_SECRET = process.env.JWT_SECRET;
const COOKIE_SECURE = process.env.COOKIE_SECURE
  ? process.env.COOKIE_SECURE === 'true'
  : process.env.NODE_ENV === 'production';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET must be set before starting the application.');
}

export interface JWTPayload {
  userId: string;
  email: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

export async function createSession(userId: string, email: string): Promise<void> {
  const token = generateToken({ userId, email });
  const cookieStore = await cookies();
  
  cookieStore.set('auth-token', token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  });
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete('auth-token');
}

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth-token')?.value;
  
  if (!token) return null;
  
  const payload = verifyToken(token);
  if (!payload) {
    await clearSession();
    return null;
  }
  
  const user = await db.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      name: true,
      avatar: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  
  return user;
}

export async function authenticateUser(email: string, password: string): Promise<{ user: User; error?: never } | { user?: never; error: string }> {
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  
  if (!user) {
    return { error: 'Nieprawidłowy email lub hasło' };
  }
  
  const isValid = await verifyPassword(password, user.password);
  if (!isValid) {
    return { error: 'Nieprawidłowy email lub hasło' };
  }
  
  const { password: _, ...userWithoutPassword } = user;
  return { user: userWithoutPassword };
}
