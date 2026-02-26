function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  console.error(err);
  req.flash('error', 'Произошла ошибка. Попробуйте снова.');
  return res.redirect('back');
}

module.exports = { errorHandler };
