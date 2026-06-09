import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { readValidatedJson } from '@/lib/api-validation';
import jsPDF from 'jspdf';
import { z } from 'zod';

const exportSchema = z.object({
  backpackId: z.string().min(1, 'Brak ID plecaka'),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Nie zalogowano' },
      { status: 401 }
    );
  }
  
  try {
    const parsed = await readValidatedJson(request, exportSchema);
    if (!parsed.ok) return parsed.response;
    const { backpackId } = parsed.data;
    
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
    
    // Generuj PDF
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Tytuł
    doc.setFontSize(20);
    doc.setTextColor(backpack.color || '#3b82f6');
    doc.text(backpack.name, pageWidth / 2, 20, { align: 'center' });
    
    // Opis
    if (backpack.description) {
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(backpack.description, pageWidth / 2, 30, { align: 'center', maxWidth: pageWidth - 40 });
    }
    
    // Data wygenerowania
    doc.setFontSize(8);
    doc.text(`Wygenerowano: ${new Date().toLocaleString('pl-PL')}`, pageWidth / 2, 40, { align: 'center' });
    
    // Kategorie
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
    
    let y = 55;
    const categories = [...new Set(backpack.items.map(i => i.category))];
    
    for (const category of categories) {
      const items = backpack.items.filter(i => i.category === category);
      
      // Nagłówek kategorii
      doc.setFontSize(12);
      doc.setTextColor(50);
      doc.setFillColor(240, 240, 240);
      doc.rect(10, y - 5, pageWidth - 20, 8, 'F');
      doc.text(categoryLabels[category] || category, 15, y);
      y += 10;
      
      // Przedmioty
      doc.setFontSize(10);
      doc.setTextColor(80);
      
      for (const item of items) {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        
        const expiryText = item.expiryDate 
          ? ` | Ważne do: ${new Date(item.expiryDate).toLocaleDateString('pl-PL')}` 
          : '';
        const barcodeText = item.barcode ? ` | EAN: ${item.barcode}` : '';
        
        const quantityText = item.desiredQuantity !== null
          ? `${item.quantity}/${item.desiredQuantity}`
          : `x${item.quantity}`;
        doc.text(`• ${item.name} (${quantityText})${expiryText}${barcodeText}`, 15, y);
        
        if (item.notes) {
          doc.setFontSize(8);
          doc.setTextColor(120);
          doc.text(`  ${item.notes}`, 15, y + 4);
          doc.setFontSize(10);
          doc.setTextColor(80);
          y += 4;
        }
        
        y += 7;
      }
      
      y += 5;
    }
    
    // Stopka
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Plecak Ewakuacyjny - ${backpack.user.name || backpack.user.email}`, pageWidth / 2, 285, { align: 'center' });
    
    // Zwróć PDF
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${backpack.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Export PDF error:', error);
    return NextResponse.json(
      { success: false, error: 'Wystąpił błąd podczas eksportu PDF' },
      { status: 500 }
    );
  }
}
