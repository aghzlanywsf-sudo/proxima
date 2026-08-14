# Proxima — دليل الربط الكامل (Setup Guide)

هاذ الدليل يوريك بالضبط، خطوة بخطوة، كيفاش تربط الموقع بـ Supabase (قاعدة
البيانات) + Stripe (الدفع، test mode) + Resend (الإيميل الحقيقي). كل
الخدمات فيها free tier تكفي لهاذ المرحلة.

الوقت المتوقع: 2-4 ساعات لأول مرة.

---

## 1) Supabase — قاعدة البيانات

1. روح لـ https://supabase.com وسجل حساب مجاني.
2. اضغط **New Project**. اختار اسم، باسوورد لقاعدة البيانات (احفظه)،
   والمنطقة الأقرب لك.
3. من القائمة الجانبية: **SQL Editor** → **New query**.
4. افتح ملف `supabase/schema.sql` من هاذ الباكاج، كوبي المحتوى كامل،
   لصقو فالمحرر، واضغط **Run**.
5. من **Project Settings → API**، خذ هاذوك القيم (تحتاجهم بعد):
   - **Project URL** → مثال: `https://abcxyz.supabase.co`
   - **anon public key**
   - **service_role key** (خاص بالسيرفر برك، ماشي للفرونت إند — احفظه بجانب، لازمك فالخطوة 3)

---

## 2) Stripe — الدفع (Test Mode)

1. روح لـ https://stripe.com وسجل حساب.
2. تأكد إنك فـ **Test mode** (فيه switch فالأعلى/الجانب فالـ dashboard).
3. من **Developers → API keys**، خذ:
   - **Publishable key** (يبدا بـ `pk_test_...`)
   - **Secret key** (يبدا بـ `sk_test_...`) — لازمك فالخطوة 3

بطاقة تجربة جاهزة تقدر تستعملها فالموقع: `4242 4242 4242 4242`،
أي تاريخ فالمستقبل، أي CVC.

---

## 3) نشر الـ Edge Functions

هاذي الأكواد اللي تخدم كـ "سيرفر صغير" — تتكلم مع Stripe والإيميل
بأمان (المفاتيح السرية ما تظهرش فالمتصفح أبداً).

### تنصيب Supabase CLI (مرة واحدة)
```bash
npm install -g supabase
```

### تسجيل الدخول وربط المشروع
```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```
(`YOUR_PROJECT_REF` هو الجزء من Project URL، مثلاً من
`https://abcxyz.supabase.co` هو `abcxyz`)

### ضبط الأسرار (secrets)
```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_xxxxxxxx
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=eyJxxxxxxxx
supabase secrets set RESEND_API_KEY=re_xxxxxxxx
```
(SUPABASE_URL يتوفر تلقائياً، ماشي حاجة تزيدها)

### نشر الفنكشنز
```bash
supabase functions deploy create-payment-intent
supabase functions deploy release-escrow
```

---

## 4) Resend — الإيميل الحقيقي

1. روح لـ https://resend.com وسجل حساب مجاني (100 إيميل/يوم مجاناً).
2. من **API Keys**، أنشئ مفتاح جديد وخذ القيمة (`re_...`).
3. زيدها فـ secrets (كيما فالخطوة 3 فوق، إذا ماشي زدتها).

**ملاحظة:** فالبداية، Resend يسمحلك ترسل غير للإيميل المسجل بحسابك
(sandbox mode) حتى توثق دومين حقيقي. للتجربة، استعمل نفس الإيميل اللي
سجلت بيه فـ Resend فخانة "Email for confirmation" فالموقع.

---

## 5) ربط الموقع بالمفاتيح

افتح `index.html`، ولّح على هاذ الجزء وبدل القيم:

```js
window.PX_CONFIG = {
  SUPABASE_URL: "https://YOUR_PROJECT_REF.supabase.co",
  SUPABASE_ANON_KEY: "eyJ... (anon public key)",
  STRIPE_PUBLISHABLE_KEY: "pk_test_...",
};
```

⚠️ استعمل غير **anon key** و **publishable key** هنا — أبداً ماشي
service_role key أو secret key (هاذوك يخصهم السيرفر برك).

---

## 6) نشر الموقع (Vercel)

1. روح لـ https://vercel.com وسجل بحساب GitHub.
2. رفع هاذ المجلد كامل لـ repo جديد فـ GitHub.
3. فـ Vercel، اضغط **New Project**، اختار الـ repo، واضغط **Deploy**.
4. بعد دقيقة، يعطيك رابط مباشر (مثلاً `proxima.vercel.app`).

---

## 6.5) محاكاة كاملة للمنصة (بلا حاجة لأي إعداد)

زدنا widget جديد: **platform-simulation-widget.js**. زر "▶ Watch how
Proxima works" (فالأسفل فالوسط) يشغّل محاكاة تفصيلية كاملة تعرض،
خطوة بخطوة، كل ما يحدث فالمنصة:

تسجيل النجم → إنشاء المزاد → فتح المزايدات → مزايدات متعددة → تمديد
anti-snipe → نهاية المزاد → إعلام الفائز → حجز الدفع (escrow) → تأكيد
اللقاء → تحرير الأرباح (تقسيم 90/10 حقيقي) → إرسال الإيميل → تحديث
الـ Analytics.

**هذا widget تجريبي فقط (simulation)** — بيانات ووهمية، ما يتصلش
بـ Stripe/Supabase/Resend الحقيقيين، ما يكلفك أو يغير شي حقيقي. مفيد
باش توري المشروع لمستثمر أو فريق بلا الحاجة لأي إعداد مسبق. يخدم من
أول ما تفتح index.html، حتى قبل ما تربط أي مفتاح.

## 7) اختبار كامل

1. افتح الموقع، اضغط **🔒 Escrow Vault**.
2. عمر التفاصيل (عنوان، اسم النجم، مبلغ، إيميلك المسجل فـ Resend).
3. فخانة البطاقة، استعمل `4242 4242 4242 4242` + تاريخ مستقبلي + أي CVC.
4. اضغط **Confirm and hold... in escrow** → لازم يبان "authorized and held".
5. اضغط **Confirm: the meeting took place** → لازم يبان الـ split
   الحقيقي (90/10) وتوصلك إيميل حقيقي.
6. افتح **📊 Insights** → لازم تبان المزايدة اللي دخلتها للتو.

---

## استكشاف الأخطاء (Troubleshooting)

| المشكلة | الحل |
|---|---|
| "This widget isn't connected yet" | تأكد بدلت المفاتيح الثلاثة فـ index.html، ماشي تركتهم كيما هوما |
| خطأ فـ create-payment-intent | تأكد `STRIPE_SECRET_KEY` مضبوط عبر `supabase secrets set` والفنكشن منشور |
| ما توصلش الإيميل | تأكد استعملت نفس الإيميل المسجل فحسابك بـ Resend (sandbox mode) |
| خطأ "row-level security" عند الحفظ | تأكد شغلت `schema.sql` كامل بلا أخطاء فـ SQL Editor |
| المشروع "متوقف" فـ Supabase | Free tier يوقف المشروع بعد 7 أيام بلا نشاط — دخل للوحة التحكم وفعّلو |

---

## الخطوة الجاية (لما تكون جاهز لفلوس حقيقية)

- بدّل Stripe من test mode لـ live mode (يحتاج توثيق حساب/شركة).
- وثّق دومين حقيقي فـ Resend (بدل `onboarding@resend.dev`).
- راجع الجانب القانوني/الامتثال قبل استقبال مستخدمين حقيقيين.
