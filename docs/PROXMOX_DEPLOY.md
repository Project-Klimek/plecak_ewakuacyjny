# Proxmox deploy

Adres dzialajacej instancji podczas audytu:

```text
http://192.168.100.106:3000/
```

Wykryty problem: aplikacja dzialala jako `next dev`, czyli tryb developerski. Produkcyjnie powinna dzialac z buildu Next standalone oraz PM2.

## Pierwsze wdrozenie z GitHuba

Na serwerze:

```bash
cd /home/admin
git clone https://github.com/Project-Klimek/plecak_ewakuacyjny.git plecak-ewakuacyjny-new
cd plecak-ewakuacyjny-new
cp .env.example .env
nano .env
npm install
npx prisma generate
npx prisma db push
npm run build
npm run pm2:start
pm2 save
```

Dla lokalnego dostepu po zwyklym HTTP, np. `http://192.168.100.106:3000`, ustaw w `.env`:

```env
COOKIE_SECURE="false"
DATABASE_URL="file:/home/admin/plecak-ewakuacyjny/db/custom.db"
```

Dla HTTPS zostaw:

```env
COOKIE_SECURE="true"
```

## Aktualizacja istniejacej instalacji

Jezeli aplikacja juz istnieje w `/home/admin/plecak-ewakuacyjny`, najprosciej uzyc skryptu:

```bash
cd /home/admin/plecak-ewakuacyjny
bash scripts/proxmox-deploy.sh
```

Jesli katalog nie jest jeszcze repozytorium Git, odpal skrypt z pobranego repo i ustaw `APP_DIR`:

```bash
cd /home/admin
git clone https://github.com/Project-Klimek/plecak_ewakuacyjny.git plecak-deploy
cd plecak-deploy
APP_DIR=/home/admin/plecak-ewakuacyjny bash scripts/proxmox-deploy.sh
```

Skrypt przed zmianami zapisuje backup w:

```text
/home/admin/plecak-backups/
```

## Kontrola po wdrozeniu

```bash
pm2 status
pm2 logs plecak-ewakuacyjny
```

W przegladarce HTML nie powinien juz zawierac:

```text
dev_hmr-client
next-devtools
```

## Cofniecie awaryjne

Backup `.env` i bazy jest w katalogu `/home/admin/plecak-backups/<data>`.
Jesli skrypt przeniosl stara aplikacje, zostawi ja jako:

```text
/home/admin/plecak-ewakuacyjny.pre-git-<data>
```
