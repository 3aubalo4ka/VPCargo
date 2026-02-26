const bcrypt = require('bcryptjs');
const db = require('../config/db');

async function findUserByLogin(login) {
  const [rows] = await db.execute('SELECT id, login, password, role FROM users WHERE login = ? LIMIT 1', [login]);
  return rows[0] || null;
}

async function verifyCredentials(login, password) {
  const user = await findUserByLogin(login);
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return null;
  return { id: user.id, login: user.login, role: user.role };
}

module.exports = { verifyCredentials };
