import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import * as XLSX from 'xlsx';

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Nie zalogowano' },
      { status: 401 }
    );
  }
  
  try {
    const body = await request.json();
    const { backpackId } = body;
    
    if (!backpackId) {
      return NextResponse.json(
        { success: false, error: 'Brak ID plecaka' },
        { status: 400 }
      );
    }
    
    // Sprawdź dostęp i pobierz dane
    const backpack = await db.backpack.findUnique({
      where: { id: backpackId },
      include: {
        items: {
          orderBy: [{ category: 'asc' }, { name: 'asc' }],
        },
        user: {
          select: { name: true, email: true },
        },
      },
    });
    
    if (!backpack) {
      return NextResponse.json(
        { success: false, error: 'Plecak nie został znaleziony' },
        { status: 404 }
      );
    }
    
    // Sprawdź dostęp
    const isOwner = backpack.userId === user.id;
    const shared = await db.sharedBackpack.findUnique({
      where: { backpackId_userId: { backpackId, userId: user.id } },
    });
    
    if (!isOwner && !shared) {
      return NextResponse.json(
        { success: false, error: 'Brak dostępu do tego plecaka' },
        { status: 403 }
      );
    }
    
    // Kategorie po polsku
    const categoryLabels: Record<string, string> = {
      food: 'Jedzenie',
      water: 'Woda',
      medical: 'Apteczka',
      tools: 'Narzędzia',
      documents: 'Dokumenty',
      clothes: 'Ubrania',
      electronics: 'Elektronika',
      other: 'Inne',
    };
    
    // Przygotuj dane do eksportu
    const data = backpack.items.map(item => ({
      'Nazwa': item.name,
      'Kategoria': categoryLabels[item.category] || item.category,
      'Ilość': item.quantity,
      'Data ważności': item.expiryDate 
        ? new Date(item.expiryDate).toLocaleDateString('pl-PL')
        : '',
      'Kod kreskowy': item.barcode || '',
      'Notatki': item.notes || '',
      'Dodano': new Date(item.createdAt).toLocaleDateString('pl-PL'),
    }));
    
    // Dodaj wiersz podsumowania
    data.push({
      'Nazwa': 'RAZEM PRZEDMIOTÓW:',
      'Kategoria': '',
      'Ilość': backpack.items.reduce((sum, i) => sum + i.quantity, 0),
      'Data ważności': '',
      'Kod kreskowy': '',
      'Notatki': '',
      'Dodano': '',
    });
    
    // Utwórz workbook
    const wb = XLSX.utils.book_new();
    
    // Arkusz z przedmiotami
    const ws = XLSX.utils.json_to_sheet(data);
    
    // Ustaw szerokości kolumn
    ws['!cols'] = [
      { wch: 30 }, // Nazwa
      { wch: 12 }, // Kategoria
      { wch: 8 },  // Ilość
      { wch: 12 }, // Data ważności
      { wch: 15 }, // Kod kreskowy
      { wch: 40 }, // Notatki
      { wch: 12 }, // Dodano
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, 'Przedmioty');
    
    // Arkusz z informacjami o plecaku
    const infoData = [
      { 'Pole': 'Nazwa plecaka', 'Wartość': backpack.name },
      { 'Pole': 'Opis', 'Wartość': backpack.description || '' },
      { 'Pole': 'Właściciel', 'Wartość': backpack.user.name || backpack.user.email },
      { 'Pole': 'Data utworzenia', 'Wartość': new Date(backpack.createdAt).toLocaleDateString('pl-PL') },
      { 'Pole': 'Ostatnia aktualizacja', 'Wartość': new Date(backpack.updatedAt).toLocaleDateString('pl-PL') },
      { 'Pole': 'Liczba przedmiotów', 'Wartość': backpack.items.length },
      { 'Pole': 'Suma sztuk', 'Wartość': backpack.items.reduce((sum, i) => sum + i.quantity, 0) },
    ];
    
    const wsInfo = XLSX.utils.json_to_sheet(infoData);
    wsInfo['!cols'] = [{ wch: 20 }, { wch: 50 }];
    XLSX.utils.book_append_sheet(wb, wsInfo, 'Informacje');
    
    // Wygeneruj plik
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${backpack.name.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx"`,
      },
    });
  } catch (error) {
    console.error('Export Excel error:', error);
    return NextResponse.json(
      { success: false, error: 'Wystąpił błąd podczas eksportu Excel' },
      { status: 500 }
    );
  }
}
