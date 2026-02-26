const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const helmet = require('helmet');
const csrf = require('csurf');
const methodOverride = require('method-override');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const XLSX = require('xlsx');

const db = require('./db');
const {
  ALLOWED_STATUSES,
  ALLOWED_PAYMENTS,
  normalizePhone,
  validLogin,
  validCargo,
  validDateOrNull
} = require('./utils');

const app = express();
const upload = multer({ dest: 'uploads/', limits: { fileSize: 10 * 1024 * 1024 } });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(methodOverride('_method'));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'vpcargo-dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax' }
  })
);
app.use(flash());
app.use(csrf());

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.csrfToken = req.csrfToken();
  res.locals.flashError = req.flash('error');
  res.locals.flashSuccess = req.flash('success');
  next();
});

function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  return next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  if (req.session.user.role !== 'admin') return res.status(403).send('Доступ запрещен');
  return next();
}

function safeReturnQuery(raw) {
  const parsed = new URLSearchParams(String(raw || '').replace(/^\?/, ''));
  const safe = new URLSearchParams();
  ['page', 'per_page', 'status', 'payment_status', 'search'].forEach((k) => {
    if (parsed.has(k)) safe.set(k, parsed.get(k));
  });
  const qs = safe.toString();
  return qs ? `?${qs}` : '';
}

app.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect(req.session.user.role === 'admin' ? '/admin' : '/client');
  }
  return res.render('index');
});

app.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect(req.session.user.role === 'admin' ? '/admin' : '/client');
  }
  return res.render('login');
});

app.post('/login', async (req, res) => {
  const login = String(req.body.login || '').trim();
  const password = String(req.body.password || '');
  if (!validLogin(login) || password.length < 6) {
    req.flash('error', 'Проверьте логин и пароль.');
    return res.redirect('/login');
  }

  const [rows] = await db.execute('SELECT * FROM users WHERE login = ? LIMIT 1', [login]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password))) {
    req.flash('error', 'Неверный логин или пароль.');
    return res.redirect('/login');
  }

  req.session.regenerate(() => {
    req.session.user = { id: user.id, login: user.login, role: user.role };
    res.redirect(user.role === 'admin' ? '/admin' : '/client');
  });
});

app.post('/logout', requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
});

app.get('/client', requireAuth, async (req, res) => {
  const [orders] = await db.execute(
    'SELECT cargo_number,status,payment_status,date_sent,cost,created_at FROM orders WHERE user_id=? ORDER BY id DESC',
    [req.session.user.id]
  );
  res.render('client', { orders });
});

app.get('/admin', requireAdmin, async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const perPage = [25, 50, 100].includes(Number(req.query.per_page)) ? Number(req.query.per_page) : 50;
  const offset = (page - 1) * perPage;

  const where = [];
  const params = [];
  const status = String(req.query.status || '').trim();
  const payment = String(req.query.payment_status || '').trim();
  const search = String(req.query.search || '').trim();

  if (ALLOWED_STATUSES.includes(status)) {
    where.push('o.status = ?');
    params.push(status);
  }
  if (ALLOWED_PAYMENTS.includes(payment)) {
    where.push('o.payment_status = ?');
    params.push(payment);
  }
  if (search) {
    where.push('(o.cargo_number LIKE ? OR u.login LIKE ? OR u.phone LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const [countRows] = await db.execute(`SELECT COUNT(*) as total FROM orders o JOIN users u ON u.id=o.user_id${whereSql}`, params);
  const total = countRows[0].total;
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const [orders] = await db.execute(
    `SELECT o.*,u.login,u.phone FROM orders o JOIN users u ON u.id=o.user_id${whereSql} ORDER BY o.id DESC LIMIT ? OFFSET ?`,
    [...params, perPage, offset]
  );

  res.render('admin', {
    orders,
    page,
    perPage,
    totalPages,
    filters: { status, payment_status: payment, search },
    allowedStatuses: ALLOWED_STATUSES,
    allowedPayments: ALLOWED_PAYMENTS,
    returnQuery: req.originalUrl.includes('?') ? `?${req.originalUrl.split('?')[1]}` : ''
  });
});

app.post('/admin/users', requireAdmin, async (req, res) => {
  const returnQuery = safeReturnQuery(req.body.return_query);
  const login = String(req.body.login || '').trim();
  const password = String(req.body.password || '');
  const phone = normalizePhone(req.body.phone || '');

  if (!validLogin(login) || password.length < 6 || !phone) {
    req.flash('error', 'Проверьте корректность логина, пароля и телефона.');
    return res.redirect(`/admin${returnQuery}`);
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    await db.execute('INSERT INTO users(login,password,phone,role) VALUES (?,?,?,?)', [login, hash, phone, 'client']);
    req.flash('success', 'Пользователь создан.');
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      req.flash('error', e.message.includes('users.login') ? 'Логин уже занят' : 'Телефон уже используется');
    } else {
      req.flash('error', 'Не удалось создать пользователя.');
    }
  }

  res.redirect(`/admin${returnQuery}`);
});

app.post('/admin/orders', requireAdmin, async (req, res) => {
  const returnQuery = safeReturnQuery(req.body.return_query);
  const client = String(req.body.client || '').trim();
  const cargo = String(req.body.cargo_number || '').trim();
  if (!validCargo(cargo)) {
    req.flash('error', 'Некорректный номер груза.');
    return res.redirect(`/admin${returnQuery}`);
  }

  const phone = normalizePhone(client);
  let rows;
  if (phone) {
    [rows] = await db.execute('SELECT id FROM users WHERE phone = ? LIMIT 1', [phone]);
  } else {
    [rows] = await db.execute('SELECT id FROM users WHERE login = ? LIMIT 1', [client]);
  }
  if (!rows[0]) {
    req.flash('error', 'Клиент не найден.');
    return res.redirect(`/admin${returnQuery}`);
  }

  try {
    await db.execute(
      'INSERT INTO orders(user_id,cargo_number,status,payment_status,date_sent,cost) VALUES (?,?,?,?,?,?)',
      [rows[0].id, cargo, 'в пути', 'не оплачен', null, 0]
    );
    req.flash('success', 'Заказ добавлен.');
  } catch (e) {
    req.flash('error', e.code === 'ER_DUP_ENTRY' ? 'Номер уже существует' : 'Не удалось добавить заказ.');
  }
  res.redirect(`/admin${returnQuery}`);
});

app.post('/admin/orders/:id/update', requireAdmin, async (req, res) => {
  const returnQuery = safeReturnQuery(req.body.return_query);
  const { status, payment_status: payment, date_sent: dateSent, cost } = req.body;
  const validCost = Number.isFinite(Number(cost)) && Number(cost) >= 0;
  if (!ALLOWED_STATUSES.includes(status) || !ALLOWED_PAYMENTS.includes(payment) || !validDateOrNull(dateSent) || !validCost) {
    req.flash('error', 'Некорректные данные заказа.');
    return res.redirect(`/admin${returnQuery}`);
  }
  await db.execute('UPDATE orders SET status=?, payment_status=?, date_sent=?, cost=? WHERE id=?', [
    status,
    payment,
    dateSent || null,
    Number(cost).toFixed(2),
    Number(req.params.id)
  ]);
  req.flash('success', 'Заказ обновлен.');
  res.redirect(`/admin${returnQuery}`);
});

app.post('/admin/orders/:id/delete', requireAdmin, async (req, res) => {
  const returnQuery = safeReturnQuery(req.body.return_query);
  await db.execute('DELETE FROM orders WHERE id=?', [Number(req.params.id)]);
  req.flash('success', 'Заказ удален.');
  res.redirect(`/admin${returnQuery}`);
});

function mapRows(rows) {
  if (!rows.length) return [];
  const header = rows[0].map((v) => String(v || '').trim().toLowerCase());
  const hasHeader = header.includes('cargo_number') || header.includes('client_phone') || header.includes('номер');
  let cargoIdx = 0;
  let phoneIdx = 1;
  if (hasHeader) {
    header.forEach((v, i) => {
      if (['cargo_number', 'номер', 'номер груза'].includes(v)) cargoIdx = i;
      if (['client_phone', 'телефон', 'phone'].includes(v)) phoneIdx = i;
    });
    rows = rows.slice(1);
  }
  return rows.map((r, idx) => ({
    row: hasHeader ? idx + 2 : idx + 1,
    cargo_number: String(r[cargoIdx] || '').trim(),
    client_phone: String(r[phoneIdx] || '').trim()
  }));
}

app.post('/upload', requireAdmin, upload.single('import_file'), async (req, res) => {
  const returnQuery = safeReturnQuery(req.body.return_query);
  if (!req.file) {
    req.flash('error', 'Файл не загружен.');
    return res.redirect(`/admin${returnQuery}`);
  }

  const ext = path.extname(req.file.originalname).toLowerCase();
  if (!['.csv', '.xlsx'].includes(ext)) {
    fs.unlinkSync(req.file.path);
    req.flash('error', 'Допустимы только CSV и XLSX.');
    return res.redirect(`/admin${returnQuery}`);
  }

  try {
    let rows = [];
    if (ext === '.csv') {
      const content = fs.readFileSync(req.file.path, 'utf8');
      const firstLine = content.split(/\r?\n/)[0] || '';
      const delimiter = firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';
      rows = parse(content, { delimiter, relax_column_count: true, skip_empty_lines: true });
    } else {
      const wb = XLSX.readFile(req.file.path);
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
    }

    const mapped = mapRows(rows);
    let success = 0;
    const errors = [];

    for (const row of mapped) {
      const cargo = row.cargo_number;
      const phone = normalizePhone(row.client_phone);
      if (!validCargo(cargo)) {
        errors.push(`Строка ${row.row}: Некорректный номер груза`);
        continue;
      }
      if (!phone) {
        errors.push(`Строка ${row.row}: Некорректный телефон`);
        continue;
      }

      const [u] = await db.execute('SELECT id FROM users WHERE phone=? LIMIT 1', [phone]);
      if (!u[0]) {
        errors.push(`Строка ${row.row}: Клиент не найден`);
        continue;
      }

      const [existing] = await db.execute('SELECT id FROM orders WHERE cargo_number=? LIMIT 1', [cargo]);
      if (existing[0]) {
        errors.push(`Строка ${row.row}: Номер уже существует`);
        continue;
      }

      await db.execute(
        'INSERT INTO orders(user_id,cargo_number,status,payment_status,date_sent,cost) VALUES (?,?,?,?,?,?)',
        [u[0].id, cargo, 'в пути', 'не оплачен', null, 0]
      );
      success += 1;
    }

    const msg = `Импорт завершен. Успешно: ${success}. Ошибок: ${errors.length}.`;
    req.flash(errors.length ? 'error' : 'success', `${msg} ${errors.slice(0, 5).join(' | ')}`.trim());
  } catch {
    req.flash('error', 'Ошибка импорта. Проверьте формат файла и попробуйте снова.');
  } finally {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
  }

  res.redirect(`/admin${returnQuery}`);
});

app.use((err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
    req.flash('error', 'Сессия устарела. Обновите страницу и повторите.');
    return res.redirect('back');
  }
  console.error(err);
  return res.status(500).send('Внутренняя ошибка сервера');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`VPCargo JS started on :${PORT}`);
});
