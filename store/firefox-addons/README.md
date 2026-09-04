# رفع OpenKey إلى Firefox Add-ons (AMO)

لوحة المطوّر: https://addons.mozilla.org/developers/

النصوص في [`card-details/`](card-details/).

## ملاحظات هذا التطبيق

AMO قد يطلب مراجعة المصدر. اشرح الجسر الأصلي مع تطبيق سطح المكتب.

## 1) الحساب

1. حساب Mozilla → [Developer Hub](https://addons.mozilla.org/developers/).
2. فعّل 2FA. أكمل ملف الناشر باسم OpenSelfHosting إن أمكن.

## 2) الحزمة والمصدر

```bash
npm ci
npm test
npm run build
```

اختبر في `about:debugging` → This Firefox → Load Temporary Add-on (اختر `dist/manifest.json`).

AMO غالباً يطلب **المصدر** مع تعليمات البناء إن كانت الحزمة مُصغَّرة:

1. ارفع ZIP الناتج من `dist/` كحزمة Listed.
2. أرفق أرشيف المصدر (`git archive` أو نسخة نظيفة) وملف يوضح:

```
npm ci
npm run build
```

`browser_specific_settings.gecko.id` في الـ manifest يبقى ثابتاً بعد أول قبول. زد `version` في كل رفع.

## 3) بطاقة المتجر

| حقل | حد |
|---|---:|
| Name | 50 |
| Summary | 250 |
| Description | 10 000 |

اللغات `en` `ar`. سياسة الخصوصية https://openselfhosting.com/privacy. أيقونة 128×128 ولقطات حسب إرشاد AMO.

اختر **Listed** للتوزيع العام.

في استبيان الصلاحيات اشرح الجسر المحلي / native messaging إن وُجد: التطبيق الرسمي على الجهاز، بلا رفع لصفحات المستخدم إلى OpenSelfHosting.

## 4) الإرسال

Submit. المراجعة اليدوية شائعة على فايرفوكس. بعد القبول حدّث رابط AMO في موقع التوثيق.

الدعم: security@openselfhosting.com
