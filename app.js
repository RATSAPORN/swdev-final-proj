const express = require('express');
const path = require('path');
const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'same-origin');
  res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.is('application/json')) {
    return res.status(415).json({ success: false, message: 'Use application/json' });
  }
  next();
});
app.use(express.json({ limit: '16kb' }));
app.use(require('cookie-parser')());
app.use('/api/v1/auth', require('./routes/auth'));
app.use('/api/v1/shops', require('./routes/shops'));
app.use('/api/v1/reservations', require('./routes/reservations'));
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));
app.use((error, req, res, next) => {
  let status = error.status || 500;
  let message = error.message;
  if (error.name === 'ValidationError') { status = 400; message = Object.values(error.errors).map(e => e.message).join('; '); }
  if (error.name === 'CastError') { status = 400; message = 'Invalid value'; }
  if (error.code === 11000) { status = 409; message = 'That email or shop name is already registered'; }
  if (error.type === 'entity.parse.failed') { status = 400; message = 'Invalid JSON'; }
  if (status >= 500) { console.error(error.name); message = 'Server error. Please try again'; }
  res.status(status).json({ success: false, message });
});
module.exports = app;
