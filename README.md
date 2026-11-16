# Nova Store Bot 🌌

متجر + ترحيب بصورة + تذاكر احترافية + لوقات + أوامر إدارة + مستويات، وكلها تتحكم فيها من الداشبورد.

## التشغيل
1. `cp .env.example .env` وعبّي القيم
2. `npm install`
3. فعّل من Developer Portal: Server Members Intent + Message Content Intent
4. `npm start`  ثم افتح `http://localhost:3000`
5. اعط البوت صلاحية Administrator، ورتّب رتبته فوق رتب الأعضاء

## أول إعداد من الداشبورد
- ⚙️ عام: رتبة الستاف
- 👋 الترحيب: روم الترحيب (تظهر صورة NOVA تلقائياً)
- 🎫 التذاكر: روم الطلبات + الكاتيجوري + اللوق
- 📜 اللوقات: اختر روم لكل نوع
- 📢 البانلات: أرسل بانل المتجر وبانل التذاكر

## أوامر سلاش
/store-panel  /ticket-panel  /prices  /my-orders  /order  /top-staff
## أوامر الإدارة (بادئة ! والاختصارات من الداشبورد)
ban unban kick mute unmute warn warns clearwarns clear lock unlock slowmode say nick role userinfo serverinfo avatar rank top help

## الصور
الافتراضية في مجلد `assets/` (مصنوعة من لوجو NOVA). غيّرها بروابط من الإعدادات.
الخط العربي: صور الترحيب والرانك تستخدم `assets/fonts/font-bold.ttf` (DejaVu، يدعم العربي).
