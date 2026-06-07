# Plecak Ewakuacyjny

Aplikacja PWA do zarzadzania plecakami ewakuacyjnymi, przedmiotami, datami waznosci i praca offline.

## Start lokalny

```bash
npm install
npx prisma generate
npx prisma db push
npm run dev
```

Domyslny adres lokalny:

```text
http://localhost:3000
```

## Konfiguracja

Skopiuj `.env.example` do `.env` i ustaw wlasny `JWT_SECRET`.

```env
DATABASE_URL="file:./db/custom.db"
JWT_SECRET="dlugi-losowy-sekret"
NODE_ENV="production"
```

Nie commituj pliku `.env` ani bazy danych.
