const express = require('express');
const multer = require('multer');
const fs = require('fs');
const db = require('../config/db');
const { requireAdmin } = require('../middleware/auth');
const { ALLOWED_PAYMENTS, ALLOWED_STATUSES } = require('../lib/constants');
const { sanitizeReturnQuery } = require('../lib/format');
const { validCargo, validDateOrNull, validLogin, validMoney, validPayment, validStatus } = require('../validators/common');
const { createClient, findUserByLoginOrPhone } = require('../services/adminService');
const { importOrders, readRowsFromFile } = require('../services/importService');

const router = express.Router();
const upload = multer({ dest: 'uploads/', limits: { fileSize: 10 * 1024 * 1024 } });

router.get('/admin', requireAdmin, async (req, res) => {
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
  const [countRows] = await db.execute(`SELECT COUNT(*) AS total FROM orders o JOIN users u ON u.id = o.user_id${whereSql}`, params);
  const totalPages = Math.max(1, Math.ceil(Number(countRows[0].total) / perPage));

  const [orders] = await db.execute(
    `SELECT o.*, u.login, u.phone FROM orders o JOIN users u ON u.id = o.user_id${whereSql} ORDER BY o.id DESC LIMIT ? OFFSET ?`,
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

router.post('/admin/users', requireAdmin, async (req, res) => {
  const returnQuery = sanitizeReturnQuery(req.body.return_query);
  const login = String(req.body.login || '').trim();
  const password = String(req.body.password || '');
  const phone = String(req.body.phone || '').trim();

  if (!validLogin(login) || password.length < 6) {
    req.flash('error', 'Проверьте корректность логина, пароля и телефона.');
    return res.redirect(`/admin${returnQuery}`);
  }

  try {
    await createClient({ login, password, phone });
    req.flash('success', 'Пользователь создан.');
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      req.flash('error', String(error.message).includes('users.login') ? 'Логин уже занят' : 'Телефон уже используется');
    } else {
      req.flash('error', 'Не удалось создать пользователя.');
    }
  }

  res.redirect(`/admin${returnQuery}`);
});

router.post('/admin/orders', requireAdmin, async (req, res) => {
  const returnQuery = sanitizeReturnQuery(req.body.return_query);
  const client = String(req.body.client || '').trim();
  const cargoNumber = String(req.body.cargo_number || '').trim();

  if (!validCargo(cargoNumber)) {
    req.flash('error', 'Некорректный номер груза.');
    return res.redirect(`/admin${returnQuery}`);
  }

  const user = await findUserByLoginOrPhone(client);
  if (!user) {
    req.flash('error', 'Клиент не найден.');
    return res.redirect(`/admin${returnQuery}`);
  }

  try {
    await db.execute(
      'INSERT INTO orders(user_id, cargo_number, status, payment_status, date_sent, cost) VALUES (?,?,?,?,?,?)',
      [user.id, cargoNumber, 'в пути', 'не оплачен', null, 0]
    );
    req.flash('success', 'Заказ добавлен.');
  } catch (error) {
    req.flash('error', error.code === 'ER_DUP_ENTRY' ? 'Номер уже существует' : 'Не удалось добавить заказ.');
  }

  res.redirect(`/admin${returnQuery}`);
});

router.post('/admin/orders/:id/update', requireAdmin, async (req, res) => {
  const returnQuery = sanitizeReturnQuery(req.body.return_query);
  const status = String(req.body.status || '');
  const paymentStatus = String(req.body.payment_status || '');
  const dateSent = String(req.body.date_sent || '').trim();
  const cost = String(req.body.cost || '').trim();

  if (!validStatus(status) || !validPayment(paymentStatus) || !validDateOrNull(dateSent) || !validMoney(cost)) {
    req.flash('error', 'Некорректные данные заказа.');
    return res.redirect(`/admin${returnQuery}`);
  }

  await db.execute('UPDATE orders SET status=?, payment_status=?, date_sent=?, cost=? WHERE id=?', [
    status,
    paymentStatus,
    dateSent || null,
    Number(cost).toFixed(2),
    Number(req.params.id)
  ]);

  req.flash('success', 'Заказ обновлен.');
  res.redirect(`/admin${returnQuery}`);
});

router.post('/admin/orders/:id/delete', requireAdmin, async (req, res) => {
  const returnQuery = sanitizeReturnQuery(req.body.return_query);
  await db.execute('DELETE FROM orders WHERE id=?', [Number(req.params.id)]);
  req.flash('success', 'Заказ удален.');
  res.redirect(`/admin${returnQuery}`);
});

router.post('/upload', requireAdmin, upload.single('import_file'), async (req, res) => {
  const returnQuery = sanitizeReturnQuery(req.body.return_query);

  if (!req.file) {
    req.flash('error', 'Файл не загружен.');
    return res.redirect(`/admin${returnQuery}`);
  }

  try {
    const rows = readRowsFromFile(req.file.path, req.file.originalname);
    const result = await importOrders(rows);
    const message = `Импорт завершен. Успешно: ${result.success}. Ошибок: ${result.errors.length}.`;
    const details = result.errors.slice(0, 5).join(' | ');
    req.flash(result.errors.length ? 'error' : 'success', details ? `${message} ${details}` : message);
  } catch (error) {
    if (String(error.message) === 'BAD_EXTENSION') {
      req.flash('error', 'Допустимы только CSV и XLSX.');
    } else {
      req.flash('error', 'Ошибка импорта. Проверьте формат файла и попробуйте снова.');
    }
  } finally {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
  }

  res.redirect(`/admin${returnQuery}`);
});

module.exports = router;
