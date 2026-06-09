import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { readValidatedJson } from '@/lib/api-validation';
import ZAI from 'z-ai-web-dev-sdk';
import type { ScanResult } from '@/types';
import { z } from 'zod';

const MAX_IMAGE_LENGTH = 6_000_000;

const scanSchema = z.object({
  image: z.string().min(1, 'Brak obrazu do analizy'),
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
    const parsed = await readValidatedJson(request, scanSchema);
    if (!parsed.ok) return parsed.response;
    const { image } = parsed.data;

    if (image.length > MAX_IMAGE_LENGTH) {
      return NextResponse.json(
        { success: false, error: 'Obraz jest za duzy do analizy' },
        { status: 413 }
      );
    }

    if (image.startsWith('data:') && !image.startsWith('data:image/')) {
      return NextResponse.json(
        { success: false, error: 'Nieprawidlowy format obrazu' },
        { status: 400 }
      );
    }
    
    // Użyj VLM do analizy obrazu
    const zai = await ZAI.create();
    
    const response = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `Jesteś asystentem do analizy zdjęć produktów spożywczych i innych przedmiotów. 
Twoim zadaniem jest rozpoznać na zdjęciu:
1. Kod kreskowy EAN (jeśli jest widoczny) - zwróć tylko same cyfry
2. Datę ważności produktu - zwróć w formacie YYYY-MM-DD
3. Nazwę produktu (jeśli jest widoczna)

Odpowiadaj TYLKO w formacie JSON:
{
  "barcode": "kod_kreskowy_lub_null",
  "expiryDate": "YYYY-MM-DD_lub_null",
  "productName": "nazwa_produktu_lub_null",
  "confidence": 0.0-1.0
}

Jeśli nie rozpoznasz któregoś elementu, zwróć null dla tego pola.
Confidence to pewność rozpoznania od 0 do 1.`
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`,
              },
            },
            {
              type: 'text',
              text: 'Przeanalizuj to zdjęcie produktu i rozpoznaj kod kreskowy, datę ważności oraz nazwę produktu.',
            },
          ] as unknown as string,
        },
      ],
    });
    
    const content = response.choices[0]?.message?.content;
    
    if (!content) {
      return NextResponse.json(
        { success: false, error: 'Nie udało się przeanalizować obrazu' },
        { status: 500 }
      );
    }
    
    // Parsuj odpowiedź JSON
    let result: ScanResult;
    try {
      // Usuń ewentualne znaczniki markdown
      const jsonContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      result = JSON.parse(jsonContent);
    } catch {
      console.error('Failed to parse VLM response:', content);
      return NextResponse.json({
        success: true,
        data: {
          barcode: null,
          expiryDate: null,
          productName: null,
          confidence: 0,
          rawResponse: content,
        },
      });
    }
    
    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Scan error:', error);
    return NextResponse.json(
      { success: false, error: 'Wystąpił błąd podczas skanowania' },
      { status: 500 }
    );
  }
}
