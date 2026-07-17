# פריסת CRM_YE לשרת VPS עם CloudPanel

מדריך צעד-אחר-צעד לפריסה בכתובת **https://casepoint.ghsystems.work** על פורט **3006**.

---

## שלב 0 — דרישות מוקדמות

- VPS עם CloudPanel מותקן ופועל
- גישת SSH לשרת
- Node.js 20 או 22 על השרת (CloudPanel מנהל זאת עבור אתרי Node.js)
- pm2 מותקן גלובלית (אם חסר: `npm install -g pm2`)

## שלב 1 — DNS

אצל ספק הדומיין של `ghsystems.work`, הוסף רשומת **A**:

| Type | Name | Value |
|------|------|-------|
| A | `crmye` | כתובת ה-IP של ה-VPS |

המתן שהרשומה תתפשט (בדיקה: `ping casepoint.ghsystems.work`).

## שלב 2 — יצירת האתר ב-CloudPanel

1. היכנס ל-CloudPanel (בדרך כלל `https://<server-ip>:8443`).
2. **Sites → Add Site → Create a Node.js Site**.
3. מלא:
   - **Domain Name:** `casepoint.ghsystems.work`
   - **Node.js Version:** 20 (או 22)
   - **App Port:** `3006`
   - **Site User / Password:** צור משתמש (למשל `crmye`)
4. לחץ **Create**.

CloudPanel יוצר vhost של nginx שמפנה את הדומיין ל-`127.0.0.1:3006`.

## שלב 3 — הורדת הקוד לשרת

התחבר ב-SSH כמשתמש האתר (או `su - crmye`):

```bash
ssh crmye@<server-ip>
cd ~/htdocs/casepoint.ghsystems.work

# הסר קבצי ברירת מחדל אם קיימים, ואז שכפל את הריפו לתוך התיקייה
rm -rf * .[!.]* 2>/dev/null || true
git clone https://github.com/gad29/CRM_YE.git .
```

## שלב 4 — קובץ סביבה לפרודקשן

```bash
cp .env.production.example .env.production.local
nano .env.production.local
```

חובה למלא:

```ini
ADMIN_PASSWORD=<סיסמה חזקה>
ADMIN_SESSION_SECRET=<מחרוזת אקראית — openssl rand -hex 32>
APP_BASE_URL=https://casepoint.ghsystems.work
```

אופציונלי (כשמחברים n8n): `N8N_WEBHOOK_BASE_URL`, `CRMYE_API_TOKEN`.

יצירת סודות אקראיים:

```bash
openssl rand -hex 32   # להריץ פעמיים — פעם לכל סוד
```

## שלב 5 — התקנה ובנייה

```bash
npm install
npm run build
```

(ה-postinstall מעתיק אוטומטית את ה-pdf worker ל-public/.)

## שלב 6 — הפעלה עם pm2

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup   # הרץ את הפקודה שהוא מדפיס (פעם אחת, כ-root) כדי שיעלה אחרי ריסטארט
```

בדיקה:

```bash
pm2 status crmye
curl -I http://127.0.0.1:3006   # אמור להחזיר 307 → /login
```

## שלב 7 — SSL (Let's Encrypt)

ב-CloudPanel: **Sites → casepoint.ghsystems.work → SSL/TLS → Actions → New Let's Encrypt Certificate** → צור והפעל.

מעכשיו `https://casepoint.ghsystems.work` מוגש עם HTTPS (חשוב — עוגיית ההתחברות מסומנת Secure בפרודקשן).

## שלב 8 — הגדלת מגבלת העלאת קבצים ב-nginx

ברירת המחדל של nginx היא ~10MB והמערכת מאפשרת עד 25MB למסמך.

ב-CloudPanel: **Sites → casepoint.ghsystems.work → Vhost**, ובתוך בלוק ה-`server {}` הוסף:

```nginx
client_max_body_size 30M;
```

שמור — CloudPanel יטען מחדש את nginx.

## שלב 9 — בדיקה סופית

1. גלוש אל https://casepoint.ghsystems.work — אמור להופיע מסך "כניסת מנהל".
2. התחבר עם הסיסמה שהגדרת.
3. צור לקוח בדיקה, פתח תיק, העלה מסמך ופתח אותו בעורך.

## גיבויים — חשוב!

כל הנתונים (בסיס הנתונים + מסמכי הלקוחות) נמצאים בתיקייה אחת:

```
~/htdocs/casepoint.ghsystems.work/data/
```

מומלץ cron יומי, למשל:

```bash
crontab -e
# גיבוי יומי ב-02:30 לתיקיית backups עם שמירת 14 ימים
30 2 * * * tar -czf ~/backups/crmye-data-$(date +\%F).tar.gz -C ~/htdocs/casepoint.ghsystems.work data && find ~/backups -name 'crmye-data-*.tar.gz' -mtime +14 -delete
```

(צור קודם את התיקייה: `mkdir -p ~/backups`.)

## עדכון גרסה (אחרי push חדש ל-GitHub)

```bash
cd ~/htdocs/casepoint.ghsystems.work
git pull
npm install
npm run build
pm2 restart crmye
```

## פתרון תקלות

| בעיה | בדיקה |
|---|---|
| האתר לא עולה | `pm2 logs crmye` — שגיאות build/env |
| 502 מ-nginx | האם האפליקציה מאזינה? `curl -I http://127.0.0.1:3006` ; ודא ש-App Port באתר = 3006 |
| לא מצליח להתחבר | ודא `ADMIN_PASSWORD` ב-`.env.production.local` ואז `pm2 restart crmye` |
| העלאת קובץ נכשלת (413) | שלב 8 — `client_max_body_size` |
| n8n לא מקבל אירועים | `N8N_WEBHOOK_BASE_URL` מוגדר? בדוק `pm2 logs` להודעות `[CRM_YE Store] n8n event` |
