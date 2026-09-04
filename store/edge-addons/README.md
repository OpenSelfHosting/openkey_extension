# رفع OpenKey إلى Microsoft Edge Add-ons

لوحة الشريك: https://partner.microsoft.com/dashboard/microsoftedge/overview

Edge يقبل إضافات **MV3** بنفس حزمة Chrome تقريباً. النصوص في [`card-details/`](card-details/).

## ملاحظات هذا التطبيق

نفس حزمة Chrome MV3. برّر nativeMessaging وautofill كما في كروم.

## 1) الحساب

1. حساب Microsoft في [Partner Center](https://partner.microsoft.com) → Microsoft Edge.
2. سجّل الناشر (OpenSelfHosting) وأكمل التحقق إن طُلب.

## 2) الحزمة

ابنِ نفس `dist/` المستخدم لكروم:

```bash
npm ci
npm test
npm run build
cd dist && zip -r ../openkey-extension-edge.zip .
```

يمكنك أيضاً من لوحة Edge اختيار **Import from Chrome Web Store** بعد قبول كروم، ثم تكمّل بطاقة Edge.

## 3) بطاقة المتجر

نفس حقول كروم تقريباً: الاسم، وصف قصير، وصف طويل، أيقونة 128، لقطات، سياسة الخصوصية https://openselfhosting.com/privacy.

اللغات `en` `ar`. برّر الصلاحيات والجسر الأصلي كما في دليل كروم.

## 4) الإرسال

Submit for certification. بعد القبول تظهر في microsoftedge.microsoft.com/addons.

كروميوم الآخر (Brave، Opera، Vivaldi) يمكنه غالباً تثبيت إضافة كروم بعد قبول Chrome Web Store.

الدعم: security@openselfhosting.com
