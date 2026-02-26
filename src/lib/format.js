function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D+/g, '');
  if (!digits) return null;
  let normalized = digits;
  if (normalized.length === 11 && normalized.startsWith('8')) normalized = `7${normalized.slice(1)}`;
  if (normalized.length !== 11 || !normalized.startsWith('7')) return null;
  return `+${normalized}`;
}

function sanitizeReturnQuery(raw = '') {
  const source = new URLSearchParams(String(raw).replace(/^\?/, ''));
  const out = new URLSearchParams();
  ['page', 'per_page', 'status', 'payment_status', 'search'].forEach((key) => {
    if (source.has(key)) out.set(key, source.get(key));
  });
  const query = out.toString();
  return query ? `?${query}` : '';
}

module.exports = { normalizePhone, sanitizeReturnQuery };
