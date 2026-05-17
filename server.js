
const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const dayjs = require('dayjs');

const db = require('./db');
const { attachUser } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev_only_secret';

db.init();

// Ensure uploads
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// View & static
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({ secret: SESSION_SECRET, resave: false, saveUninitialized: false }));

// Expose helpers
app.use((req, res, next) => {
  res.locals.formatCurrency = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n || 0);
  res.locals.formatDate = (s) => s ? dayjs(s).format('DD MMM YYYY HH:mm') : '';
  next();
});

app.use(attachUser);

// Routes
app.use('/', require('./routes/main'));
app.use('/auth', require('./routes/auth'));
app.use('/workers', require('./routes/workers'));
app.use('/marketplace', require('./routes/marketplace'));
app.use('/orders', require('./routes/orders'));
app.use('/admin', require('./routes/admin'));

app.use((req, res) => {
  res.status(404).render('partials/404', { title: '404' });
});

app.listen(PORT, () => console.log(`eJasa v2 running at http://localhost:${PORT}`));
