#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "❌ Docker не найден. Установите Docker Desktop / Docker Engine и повторите."
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose)
else
  echo "❌ Docker Compose не найден."
  exit 1
fi

echo "▶ Запуск VPCargo (app + db) ..."
"${COMPOSE_CMD[@]}" up -d --build

echo "⏳ Ожидание готовности приложения..."
for _ in {1..40}; do
  if curl -fsS "http://127.0.0.1:3000/" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -fsS "http://127.0.0.1:3000/" >/dev/null 2>&1; then
  echo "⚠️ Приложение не ответило на http://127.0.0.1:3000"
  echo "Проверьте логи: ${COMPOSE_CMD[*]} logs -f"
  exit 1
fi

echo "✅ Готово: http://localhost:3000"
echo "Тестовые аккаунты: admin/admin123, client1/client123, client2/client123"
echo "Остановить: ${COMPOSE_CMD[*]} down"

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://localhost:3000" >/dev/null 2>&1 || true
elif command -v open >/dev/null 2>&1; then
  open "http://localhost:3000" >/dev/null 2>&1 || true
fi
