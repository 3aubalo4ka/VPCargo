const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { normalizePhone } = require('../lib/format');

async function createClient({ login, password, phone }) {
  const hash = await bcrypt.hash(password, 12);
  const normalizedPhone = normalizePhone(phone);
  await db.execute('INSERT INTO users(login, password, phone, role) VALUES(?,?,?,?)', [login, hash, normalizedPhone, 'client']);
}

async function findUserByLoginOrPhone(value) {
  const normalized = normalizePhone(value);
  const [rows] = normalized
    ? await db.execute('SELECT id FROM users WHERE phone = ? LIMIT 1', [normalized])
    : await db.execute('SELECT id FROM users WHERE login = ? LIMIT 1', [value]);
  return rows[0] || null;
}

module.exports = { createClient, findUserByLoginOrPhone };
