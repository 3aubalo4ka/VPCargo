# VPCargo (JavaScript)

Сайт полностью переделан на **Node.js + Express + MySQL**.

## Запуск в один клик

```bash
./run.sh
```

После запуска сайт доступен на `http://localhost:3000`.

## Что поднимется
- `app` — Node.js приложение
- `db` — MySQL 8 с авто-инициализацией из `database/vpcargo.sql`

## Тестовые аккаунты
- admin / admin123
- client1 / client123
- client2 / client123

## Без Docker (локально)
```bash
npm install
DB_HOST=127.0.0.1 DB_USER=root DB_PASS= DB_NAME=vpcargo npm start
```
