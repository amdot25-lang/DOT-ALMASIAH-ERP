DOT ALMASIAH v24.0.2 — إصلاح نهائي لتسجيل الدخول

السبب: app.js كان يحتوي تعريفات مكررة للدوال dashboard وsalesView وusersView وlegacy وbindDetails، فرفض المتصفح تشغيل ES Module كاملًا.

ارفع الملفات الثلاثة إلى GitHub واستبدل الموجودة:
- app.js
- index.html
- sw.js
ثم Commit changes وانتظر Vercel.
