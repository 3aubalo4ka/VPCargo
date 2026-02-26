# VPCargo (Modern JS Edition)

Полностью переписанный проект на современном Node.js стеке:
- **Express 4 + EJS SSR**
- **MySQL 8 (mysql2/promise)**
- Безопасность: `helmet`, rate limit, custom CSRF, secure session cookie
- Импорт заказов из **CSV/XLSX** с частичной обработкой ошибок
- Docker one-click запуск

## Запуск в один клик

```bash
./run.sh
```

Сайт: `http://localhost:3000`

## Тестовые аккаунты
- `admin / admin123`
- `client1 / client123`
- `client2 / client123`

## Локальный запуск без Docker

```bash
npm ci
DB_HOST=127.0.0.1 DB_USER=root DB_PASS= DB_NAME=vpcargo npm start
```

## Архитектура

- `src/app.js` — композиция приложения, middleware, роуты
- `src/routes/*` — маршруты (auth, admin, client)
- `src/services/*` — бизнес-логика и импорт
- `src/config/*` — окружение и БД
- `src/lib/*` — CSRF, форматирование, константы
- `src/validators/*` — серверные проверки
- `views/*` + `public/*` — UI
