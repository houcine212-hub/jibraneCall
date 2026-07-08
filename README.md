# Family Call

تطبيق ويب مخصص للعائلة: تسجيل بالاسم + صورة بروفيل، لائحة الأعضاء، واتصالات فيديو حقيقية (WebRTC) بين المستخدمين، مع نظام Call/Cancel/Accept.

## المتطلبات

- **Node.js** (v18 أو أكثر)
- **MySQL** (v8 أو MariaDB)

## خطوات التشغيل

### 1. تجهيز قاعدة البيانات

دخل لـ MySQL وشغّل ملف الـ schema:

```bash
mysql -u root -p < backend/db/schema.sql
```

هادشي غادي يخلق قاعدة البيانات `family_call_db` والجداول `users` و `call_logs`.

### 2. تجهيز متغيرات البيئة

```bash
cd backend
cp .env.example .env
```

بدّل فـ `.env` القيم ديال `DB_USER`, `DB_PASSWORD` باش تكون مطابقة لإعدادات MySQL ديالك.

### 3. تثبيت الحزم (dependencies)

```bash
npm install
```

### 4. تشغيل السيرفر

```bash
npm start
```

السيرفر غادي يخدم على: **http://localhost:3000**

الواجهة الأمامية (frontend) متصوبة كاملة بجوج داخل نفس السيرفر — ماخصكش تشغل حاجة زايدة.

## بنية المشروع

```
familycall/
├── backend/
│   ├── server.js          # Express + Socket.IO signaling server
│   ├── package.json
│   ├── .env.example
│   ├── db/
│   │   ├── schema.sql     # SQL باش تخلق القاعدة والجداول
│   │   └── pool.js        # MySQL connection pool
│   ├── routes/
│   │   └── users.js       # API: تسجيل + لائحة المستخدمين
│   └── uploads/           # صور البروفيل (كتتخلق تلقائيا)
└── frontend/
    ├── index.html
    ├── css/style.css      # تصميم أسود احترافي
    └── js/app.js           # منطق التسجيل + WebRTC + Socket.IO
```

## كيفاش خدام

1. **التسجيل**: كل مستخدم كيدخل اسمو وصورة بروفيل (اختيارية)، وكيتسجل فـ MySQL.
2. **لائحة الأعضاء**: كل مستخدم مسجل وكيدخل للتطبيق كيبان فـ real-time (Socket.IO) عند الآخرين كـ "متصل".
3. **الاتصال**: فاش كتضغط على زر الفيديو جنب اسم شخص، كيتصاوب اتصال WebRTC حقيقي (peer-to-peer)، وكيوصل popup "كيتصل بيك" عند الطرف الآخر بشكل فوري.
4. **القبول/الرفض/الإلغاء**: 
   - الطرف التاني يقدر "يقبل" (Accept) → كيبدا الفيديو call مباشرة.
   - يقدر "يرفض" (Decline).
   - اللي كيتصل يقدر "يلغي" (Cancel) المكالمة قبل ما يجاوب حد.
5. **أثناء المكالمة**: كاين أزرار لكتم الميكروفون، كتم الكاميرا، وإنهاء المكالمة.

## ملاحظات تقنية

- **WebRTC** كيخدم بـ STUN servers ديال Google للـ NAT traversal. إلا كنتوا فشبكات معقدة بزاف (خلف firewalls قاسحين)، يمكن تحتاجو TURN server زيادة.
- **Socket.IO** كيستعمل غير باش يوصل الـ signaling (offer/answer/ICE candidates) والإشعارات ديال المكالمات — الفيديو والصوت ديال المكالمة كيمشيو مباشرة بين الجهازين (peer-to-peer)، ماشي عبر السيرفر.
- الصور ديال البروفيل كيتخزنو فـ `backend/uploads/` وكيتسجل الـ path ديالهم فـ MySQL.
- التطبيق مصوب باش يخدم على الشبكة المحلية (LAN) أو عبر الإنترنت إلا صوبتو hosting وHTTPS (WebRTC كيحتاج HTTPS فالإنتاج، ماعدا `localhost`).
