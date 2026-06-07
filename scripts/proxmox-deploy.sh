#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/home/admin/plecak-ewakuacyjny}"
REPO_URL="${REPO_URL:-https://github.com/Project-Klimek/plecak_ewakuacyjny.git}"
BRANCH="${BRANCH:-main}"
BACKUP_ROOT="${BACKUP_ROOT:-/home/admin/plecak-backups}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="$BACKUP_ROOT/$TIMESTAMP"

echo "== Plecak Ewakuacyjny deploy =="
echo "App dir: $APP_DIR"
echo "Repo:    $REPO_URL"
echo "Branch:  $BRANCH"

mkdir -p "$BACKUP_DIR"

if [ -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env" "$BACKUP_DIR/.env"
fi

if [ -d "$APP_DIR/db" ]; then
  mkdir -p "$BACKUP_DIR/db"
  cp -a "$APP_DIR/db/." "$BACKUP_DIR/db/"
fi

if [ -f "$APP_DIR/prisma/dev.db" ]; then
  mkdir -p "$BACKUP_DIR/prisma"
  cp "$APP_DIR/prisma/dev.db" "$BACKUP_DIR/prisma/dev.db"
fi

echo "Backup saved in: $BACKUP_DIR"

if [ ! -d "$APP_DIR/.git" ]; then
  LEGACY_DIR="${APP_DIR}.pre-git-${TIMESTAMP}"
  echo "Existing app is not a Git checkout. Moving it to: $LEGACY_DIR"
  mv "$APP_DIR" "$LEGACY_DIR"
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"

  if [ -f "$BACKUP_DIR/.env" ]; then
    cp "$BACKUP_DIR/.env" "$APP_DIR/.env"
  fi

  if [ -d "$BACKUP_DIR/db" ]; then
    mkdir -p "$APP_DIR/db"
    cp -a "$BACKUP_DIR/db/." "$APP_DIR/db/"
  fi
else
  cd "$APP_DIR"
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
fi

cd "$APP_DIR"

if [ ! -f ".env" ]; then
  echo "Missing .env. Copy .env.example to .env and set JWT_SECRET before starting."
  exit 1
fi

mkdir -p logs db

npm install
npx prisma generate
npx prisma db push
npm run build

if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe plecak-ewakuacyjny >/dev/null 2>&1; then
    npm run pm2:restart
  else
    npm run pm2:start
  fi
  pm2 save
else
  echo "PM2 is not installed. Install it with: npm install -g pm2"
  echo "You can test production start with: npm start"
  exit 1
fi

echo "Deploy finished."
echo "Check: pm2 status"
