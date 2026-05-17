
const db = require('../db');

function ensureAuth(req, res, next) {
  if (!req.session || !req.session.userId) return res.redirect('/auth/login');
  next();
}
function ensureRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.userRole || !roles.includes(req.session.userRole)) return res.status(403).send('Forbidden');
    next();
  };
}
function attachUser(req, res, next) {
  res.locals.currentUser = null;
  if (req.session && req.session.userId) {
    const u = db.getUserById(req.session.userId);
    if (u) { res.locals.currentUser = u; req.user = u; }
  }
  next();
}
module.exports = { ensureAuth, ensureRole, attachUser };
