const crypto = require('crypto');

function generateCsrfToken() {
  return crypto.randomBytes(24).toString('hex');
}

function csrfMiddleware(req, res, next) {
  if (!req.session.csrfToken) req.session.csrfToken = generateCsrfToken();
  res.locals.csrfToken = req.session.csrfToken;

  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();

  const token = req.body?._csrf || req.headers['x-csrf-token'];
  if (!token || token !== req.session.csrfToken) {
    req.flash('error', 'Сессия устарела. Обновите страницу и повторите.');
    return res.redirect('back');
  }

  next();
}

module.exports = { csrfMiddleware };
