# نظام إدخال بيانات التقارير الطبية

صفحة محمية بكلمة مرور لإدخال بيانات التقارير الطبية، مربوطة بقاعدة بيانات Postgres.
الموظف يُدخل **رمز الخدمة** يدوياً (أول حقل في النموذج) مع باقي البيانات، والموقع
الآخر يستخدم هذا الرمز مع **رقم الهوية** للاستعلام عن باقي البيانات مباشرة من
نفس قاعدة البيانات. النظام يتحقق تلقائياً أن الرمز غير مكرر قبل الحفظ.

## الحقول المخزّنة (جدول certificates)

| الحقل | الوصف |
|---|---|
| service_code | رمز الخدمة (يُدخله الموظف يدوياً، فريد لكل تقرير) |
| national_id | رقم الهوية |
| full_name | الاسم |
| issue_date | تاريخ الإصدار |
| start_date | يبدأ من |
| end_date | حتى |
| duration_days | المدة بالأيام (تُحسب تلقائياً) |
| doctor_name | اسم الطبيب |
| job_title | المسمى الوظيفي |

## خطوات النشر على Railway

1. أنشئ حساب/مشروع جديد في [railway.app](https://railway.app)
2. من داخل المشروع: **New → Database → Add PostgreSQL** — هذا ينشئ قاعدة البيانات
3. ارفع هذا الكود إلى مستودع GitHub، ثم في نفس مشروع Railway اختر
   **New → GitHub Repo** واربط المستودع (أو استخدم Railway CLI لرفع المجلد مباشرة)
4. اذهب إلى إعدادات خدمة التطبيق (وليس قاعدة البيانات) → تبويب **Variables** وأضف:
   - `ADMIN_PASSWORD` = كلمة المرور التي تريدها لصفحة الدخول
   - `SESSION_SECRET` = أي نص عشوائي طويل (مثلاً 32 حرف عشوائي)
   - **لا تحتاج تضيف `DATABASE_URL` يدوياً** — إذا كانت خدمة Postgres في نفس
     المشروع، Railway يوفرها تلقائياً كمتغير مرجعي. إن لم تظهر تلقائياً،
     أضفها يدوياً بنسخ القيمة من تبويب **Connect** في خدمة Postgres.
5. Railway سيكتشف `package.json` تلقائياً وينفذ `npm install` ثم `npm start`
6. بعد النشر، افتح الرابط الذي يعطيك إياه Railway → ستظهر صفحة تسجيل الدخول

عند أول تشغيل، السيرفر ينشئ جدول `certificates` تلقائياً إذا لم يكن موجوداً
(لا حاجة لتشغيل أي SQL يدوياً).

## ربط الموقع الآخر بقاعدة البيانات مباشرة

في Railway، افتح خدمة **Postgres** → تبويب **Connect**، وستجد:
- **رابط اتصال داخلي** (Internal URL): يُستخدم فقط إذا كان الموقع الآخر
  أيضاً مستضاف كخدمة داخل نفس مشروع Railway (أسرع وأكثر أماناً، بدون تكلفة إضافية)
- **رابط اتصال عام** (Public/External URL): يُستخدم إذا كان الموقع الآخر
  مستضاف في مكان مختلف تماماً خارج Railway

استعلام البحث الذي يحتاجه الموقع الآخر (برمز الخدمة + رقم الهوية):

```sql
SELECT full_name, national_id, issue_date, start_date, end_date,
       duration_days, doctor_name, job_title
FROM certificates
WHERE service_code = $1 AND national_id = $2;
```

مثال بلغة Node.js (باستخدام مكتبة `pg`) في الموقع الآخر:

```javascript
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const result = await pool.query(
  `SELECT full_name, national_id, issue_date, start_date, end_date,
          duration_days, doctor_name, job_title
   FROM certificates WHERE service_code = $1 AND national_id = $2`,
  [serviceCode, nationalId]
);

if (result.rowCount === 0) {
  // لا يوجد تقرير مطابق
} else {
  const record = result.rows[0];
}
```

## ملاحظات أمنية مهمة

- غيّر `ADMIN_PASSWORD` و `SESSION_SECRET` لقيم قوية وغير افتراضية قبل النشر
- لا تُشارك رابط الاتصال العام لقاعدة البيانات (Public URL) مع أي جهة غير موثوقة —
  فهو يعطي وصولاً كاملاً للقراءة والكتابة على كل البيانات
- إن أمكن، اجعل الموقع الآخر خدمة داخل نفس مشروع Railway واستخدم الرابط
  الداخلي فقط (لا يُكشف على الإنترنت العام إطلاقاً)
- فكّر لاحقاً في إنشاء مستخدم Postgres منفصل بصلاحية **قراءة فقط** (`SELECT` فقط)
  لإعطائه للموقع الآخر، بدل استخدام نفس حساب المدير

## التجربة محلياً (اختياري)

```bash
npm install
cp .env.example .env
# عدّل .env وضع بيانات قاعدة بيانات Postgres محلية أو من Railway
npm start
```

ثم افتح `http://localhost:3000`
