const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const XLSX = require('xlsx');
const db = require('../config/db');
const { normalizePhone } = require('../lib/format');
const { validCargo } = require('../validators/common');

function mapRows(rows) {
  if (!rows.length) return [];
  const header = rows[0].map((v) => String(v || '').trim().toLowerCase());
  const hasHeader = header.includes('cargo_number') || header.includes('client_phone') || header.includes('номер');

  let cargoIdx = 0;
  let phoneIdx = 1;
  if (hasHeader) {
    header.forEach((item, i) => {
      if (['cargo_number', 'номер', 'номер груза'].includes(item)) cargoIdx = i;
      if (['client_phone', 'телефон', 'phone'].includes(item)) phoneIdx = i;
    });
    rows = rows.slice(1);
  }

  return rows.map((row, idx) => ({
    row: hasHeader ? idx + 2 : idx + 1,
    cargo_number: String(row[cargoIdx] || '').trim(),
    client_phone: String(row[phoneIdx] || '').trim()
  }));
}

function readRowsFromFile(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  if (!['.csv', '.xlsx'].includes(ext)) throw new Error('BAD_EXTENSION');

  if (ext === '.csv') {
    const content = fs.readFileSync(filePath, 'utf8');
    const firstLine = content.split(/\r?\n/)[0] || '';
    const delimiter = firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';
    return mapRows(parse(content, { delimiter, skip_empty_lines: true, relax_column_count: true }));
  }

  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
  return mapRows(rows);
}

async function importOrders(rows) {
  let success = 0;
  const errors = [];

  for (const row of rows) {
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

    const [users] = await db.execute('SELECT id FROM users WHERE phone = ? LIMIT 1', [phone]);
    if (!users[0]) {
      errors.push(`Строка ${row.row}: Клиент не найден`);
      continue;
    }

    const [exists] = await db.execute('SELECT id FROM orders WHERE cargo_number = ? LIMIT 1', [cargo]);
    if (exists[0]) {
      errors.push(`Строка ${row.row}: Номер уже существует`);
      continue;
    }

    await db.execute(
      'INSERT INTO orders(user_id, cargo_number, status, payment_status, date_sent, cost) VALUES (?,?,?,?,?,?)',
      [users[0].id, cargo, 'в пути', 'не оплачен', null, 0]
    );
    success += 1;
  }

  return { success, errors };
}

module.exports = { readRowsFromFile, importOrders };
