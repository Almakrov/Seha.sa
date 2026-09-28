require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.ADMIN_PASSWORD) {
  console.warn('تحذير: لم يتم ضبط ADMIN_PASSWORD في متغيرات البيئة!');
}

// الاتصال بقاعدة البيانات (Railway يوفر DATABASE_URL تلقائياً عند ربط خدمة Postgres)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// إنشاء الجدول تلقائياً إذا لم يكن موجوداً
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS certificates (
      id SERIAL PRIMARY KEY,
      service_code VARCHAR(50) UNIQUE NOT NULL,
      national_id VARCHAR(50) NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      issue_date DATE NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      duration_days INTEGER NOT NULL,
      doctor_name VARCHAR(255) NOT NULL,
      job_title VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_lookup ON certificates (service_code, national_id);
  `);
  console.log('قاعدة البيانات جاهزة.');
}

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 } // صلاحية الجلسة: 8 ساعات
}));

function requireAuth(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  return res.redirect('/login');
}

// ---------- تسجيل الدخول ----------
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', (req, res) => {
  const { password } = req.body;
  if (password && process.env.ADMIN_PASSWORD && password === process.env.ADMIN_PASSWORD) {
    req.session.loggedIn = true;
    return res.redirect('/');
  }
  res.render('login', { error: 'كلمة المرور غير صحيحة' });
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// ---------- الصفحة الرئيسية (إدخال البيانات) ----------
app.get('/', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT * FROM certificates ORDER BY created_at DESC LIMIT 50');
  res.render('dashboard', { records: result.rows, success: null, error: null });
});

app.post('/submit', requireAuth, async (req, res) => {
  try {
    const { service_code, national_id, full_name, issue_date, start_date, end_date, doctor_name, job_title } = req.body;

    if (!service_code || !national_id || !full_name || !issue_date || !start_date || !end_date || !doctor_name || !job_title) {
      const result = await pool.query('SELECT * FROM certificates ORDER BY created_at DESC LIMIT 50');
      return res.render('dashboard', { records: result.rows, success: null, error: 'الرجاء تعبئة كل الحقول' });
    }

    const start = new Date(start_date);
    const end = new Date(end_date);
    const duration = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;

    if (duration < 1) {
      const result = await pool.query('SELECT * FROM certificates ORDER BY created_at DESC LIMIT 50');
      return res.render('dashboard', { records: result.rows, success: null, error: 'تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية' });
    }

    // التحقق من أن رمز الخدمة غير مستخدم من قبل
    const check = await pool.query('SELECT 1 FROM certificates WHERE service_code=$1', [service_code]);
    if (check.rowCount > 0) {
      const result = await pool.query('SELECT * FROM certificates ORDER BY created_at DESC LIMIT 50');
      return res.render('dashboard', { records: result.rows, success: null, error: 'رمز الخدمة هذا مستخدم من قبل، الرجاء اختيار رمز آخر' });
    }

    await pool.query(
      `INSERT INTO certificates
       (service_code, national_id, full_name, issue_date, start_date, end_date, duration_days, doctor_name, job_title)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [service_code, national_id, full_name, issue_date, start_date, end_date, duration, doctor_name, job_title]
    );

    const result = await pool.query('SELECT * FROM certificates ORDER BY created_at DESC LIMIT 50');
    res.render('dashboard', {
      records: result.rows,
      success: `تم الحفظ بنجاح ✅ — رمز الخدمة: ${service_code}`,
      error: null
    });
  } catch (err) {
    console.error(err);
    const result = await pool.query('SELECT * FROM certificates ORDER BY created_at DESC LIMIT 50');
    res.render('dashboard', { records: result.rows, success: null, error: 'حدث خطأ أثناء الحفظ' });
  }
});

app.post('/delete/:id', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM certificates WHERE id=$1', [req.params.id]);
  res.redirect('/');
});

initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`السيرفر يعمل على المنفذ ${PORT}`));
  })
  .catch((err) => {
    console.error('فشل الاتصال بقاعدة البيانات:', err);
    process.exit(1);
  });
