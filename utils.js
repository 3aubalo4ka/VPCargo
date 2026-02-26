const ALLOWED_STATUSES = ['в пути', 'готов к выдаче на ФФ', 'получен'];
const ALLOWED_PAYMENTS = ['не оплачен', 'оплачен'];

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D+/g, '');
  if (!digits) return null;
  let normalized = digits;
  if (normalized.length === 11 && normalized.startsWith('8')) {
    normalized = `7${normalized.slice(1)}`;
  }
  if (normalized.length !== 11 || !normalized.startsWith('7')) return null;
  return `+${normalized}`;
}

function validLogin(v) {
  return /^[a-zA-Z0-9._-]{3,64}$/.test(String(v || '').trim());
}

function validCargo(v) {
  return /^[A-Za-z0-9_\-/]{3,64}$/.test(String(v || '').trim());
}

function validDateOrNull(v) {
  if (!v) return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
}

module.exports = {
  ALLOWED_STATUSES,
  ALLOWED_PAYMENTS,
  normalizePhone,
  validLogin,
  validCargo,
  validDateOrNull
};
