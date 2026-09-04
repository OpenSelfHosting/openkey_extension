# رفع OpenKey إلى Chrome Web Store

لوحة المطوّر: https://chrome.google.com/webstore/devconsole

النصوص في [`card-details/`](card-details/).

## ملاحظات هذا التطبيق

برّر autofill وclipboard وnativeMessaging. لا remote code. الخزنة مشفّرة محلياً.

## 1) الحساب

1. حساب Google عليه **Chrome Web Store Developer Dashboard** (رسوم تسجيل لمرة واحدة).
2. فعّل 2FA. إن كان النشر باسم **OpenSelfHosting** أكمل التحقق كحساب مطوّر / publisher.
3. اقبل سياسات المتجر. لا تفعّل مدفوعات داخل الإضافة ما لم تضفها فعلاً.

## 2) البناء محلياً قبل الرفع

من مجلد الإضافة (مثلاً `OpenKey_extension`):

```bash
npm ci
npm test
npm run build
```

حمّل `dist/` مؤقتاً في `chrome://extensions` → Developer mode → **Load unpacked** وجرّب التدفق الحقيقي (تعبئة، حفظ، جسر التطبيق إن وُجد).

ارفع **ZIP لمحتويات `dist/`** وليس مجلد المشروع:

```bash
cd dist
zip -r ../openkey-extension-chrome.zip .
```

لا تُدخل `node_modules` ولا مفاتيح. زد `version` في `manifest.json` في **كل** رفع (مثل `0.1.5`).

## 3) بطاقة المتجر

| حقل | حد |
|---|---:|
| Name | 75 |
| Short description | 132 |
| Detailed description | 16 000 |

1. اللغة الافتراضية English ثم أضف `en` `ar`.
2. أيقونات 128×128 (و16/48 في الـ manifest).
3. لقطات 1280×800 أو 640×400 — واحدة على الأقل، ويفضّل 3–5.
4. **Privacy policy:** https://openselfhosting.com/privacy
5. **Homepage:** https://openselfhosting.com
6. تبرير كل permission في Privacy practices:
   `tabs`، `storage`، `downloads`، `nativeMessaging`، `clipboardRead`، `scripting`، `<all_urls>`.
7. **Remote code:** ممنوع. لا CDN لسكربتات. كل المنطق داخل الحزمة.
8. إن كان هناك native messaging: اشرح أن المضيف هو تطبيق سطح المكتب الرسمي على جهاز المستخدم.

## 4) الإرسال والمراجعة

1. Dashboard → New item (أول مرة) أو Upload new package.
2. Distribution: **Public**.
3. Submit for review.

المراجعة قد تستغرق أياماً. رفض شائع: صلاحيات أوسع من الوصف، `<all_urls>` بلا تبرير، كود بعيد.

الدعم: security@openselfhosting.com
