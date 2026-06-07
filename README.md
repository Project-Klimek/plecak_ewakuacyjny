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

## Start produkcyjny na Proxmox

Na serwerze aplikacja powinna dzialac jako build produkcyjny, nie przez `npm run dev`.

```bash
npm install
npx prisma generate
npx prisma db push
npm run build
npm run pm2:start
pm2 save
```

Po zmianach w kodzie:

```bash
git pull
npm install
npx prisma generate
npx prisma db push
npm run build
npm run pm2:restart
```

Podstawowa kontrola:

```bash
pm2 status
npm run pm2:logs
```

Po starcie produkcyjnym strona nie powinna ladowac plikow `dev_hmr-client` ani `next-devtools`.

Szczegolowy opis i skrypt pierwszego wdrozenia sa w `docs/PROXMOX_DEPLOY.md`.
