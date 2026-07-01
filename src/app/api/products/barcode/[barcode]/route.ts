import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import type { BarcodeProduct } from '@/types';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const OPEN_FOOD_FACTS_USER_AGENT =
  'PlecakEwakuacyjny/0.2 (https://github.com/Project-Klimek/plecak_ewakuacyjny)';

type CacheEntry = {
  expiresAt: number;
  product: BarcodeProduct;
};

type OpenFoodFactsProduct = {
  product_name_pl?: string;
  product_name?: string;
  generic_name_pl?: string;
  generic_name?: string;
  brands?: string;
  quantity?: string;
  image_front_url?: string;
  image_url?: string;
};

type OpenFoodFactsResponse = {
  status?: string;
  product?: OpenFoodFactsProduct;
};

const globalForBarcodeCache = globalThis as unknown as {
  barcodeProductCache?: Map<string, CacheEntry>;
};

const barcodeProductCache =
  globalForBarcodeCache.barcodeProductCache ?? new Map<string, CacheEntry>();
globalForBarcodeCache.barcodeProductCache = barcodeProductCache;

function normalizeBarcode(value: string) {
  return value.replace(/\D/g, '');
}

function getCachedProduct(barcode: string) {
  const cached = barcodeProductCache.get(barcode);
  if (!cached) return null;

  if (cached.expiresAt <= Date.now()) {
    barcodeProductCache.delete(barcode);
    return null;
  }

  return cached.product;
}

function setCachedProduct(barcode: string, product: BarcodeProduct) {
  barcodeProductCache.set(barcode, {
    product,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function pickProductName(product: OpenFoodFactsProduct | undefined) {
  return (
    product?.product_name_pl ||
    product?.product_name ||
    product?.generic_name_pl ||
    product?.generic_name ||
    null
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ barcode: string }> }
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Nie zalogowano' },
      { status: 401 }
    );
  }

  const { barcode: rawBarcode } = await params;
  const barcode = normalizeBarcode(rawBarcode);

  if (barcode.length < 8 || barcode.length > 14) {
    return NextResponse.json(
      { success: false, error: 'Nieprawidłowy kod kreskowy' },
      { status: 400 }
    );
  }

  const cached = getCachedProduct(barcode);
  if (cached) {
    return NextResponse.json({ success: true, data: cached });
  }

  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v3/product/${barcode}.json?fields=product_name_pl,product_name,generic_name_pl,generic_name,brands,quantity,image_front_url,image_url`,
      {
        headers: {
          'User-Agent': OPEN_FOOD_FACTS_USER_AGENT,
          Accept: 'application/json',
        },
        next: { revalidate: 86400 },
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: 'Nie udało się sprawdzić produktu' },
        { status: 502 }
      );
    }

    const json = await response.json() as OpenFoodFactsResponse;
    const product = json.product;
    const found = json.status !== 'product_not_found' && !!product;

    const result: BarcodeProduct = {
      barcode,
      found,
      productName: found ? pickProductName(product) : null,
      brand: found ? product?.brands || null : null,
      quantity: found ? product?.quantity || null : null,
      imageUrl: found ? product?.image_front_url || product?.image_url || null : null,
      source: 'openfoodfacts',
    };

    setCachedProduct(barcode, result);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Barcode lookup error:', error);
    return NextResponse.json(
      { success: false, error: 'Wystąpił błąd podczas sprawdzania produktu' },
      { status: 500 }
    );
  }
}
