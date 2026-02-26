const { ALLOWED_PAYMENTS, ALLOWED_STATUSES } = require('../lib/constants');

function validLogin(v) {
  return /^[a-zA-Z0-9._-]{3,64}$/.test(String(v || '').trim());
}

function validCargo(v) {
  return /^[A-Za-z0-9_\-/]{3,64}$/.test(String(v || '').trim());
}

function validDateOrNull(v) {
  if (!v) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v);
  return !Number.isNaN(d.getTime());
}

function validMoney(v) {
  return Number.isFinite(Number(v)) && Number(v) >= 0;
}

function validStatus(v) {
  return ALLOWED_STATUSES.includes(v);
}

function validPayment(v) {
  return ALLOWED_PAYMENTS.includes(v);
}

module.exports = { validLogin, validCargo, validDateOrNull, validMoney, validStatus, validPayment };
