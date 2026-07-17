# CRM_YE

CRM_YE היא מערכת CRM למלווה פרטי שמסייע ללקוחות להגיש בקשות למשרדי ממשלה —
ביטוח לאומי, רשות האוכלוסין, רשות המסים, משרד השיכון ועוד. המערכת מלווה כל תיק
מרגע איסוף המסמכים, דרך ההגשה ומעקב אחרי הטיפול במשרד, ועד סגירת התיק והתשלום.

נבנתה על בסיס ארכיטקטורת KeyPoint (Next.js 15 + React 19), עם אחסון מקומי
בקבצי JSON ותיקיית מסמכים פיזית לכל לקוח — ללא תלות בשירותי צד שלישי.

## מה יש בפנים

- **ניהול לקוחות** — כרטיס לקוח עם פרטים, תיקים, מסמכים, תשלומים והיסטוריה
- **ניהול תיקים** — פס שלבים מלא: איסוף מסמכים → בדיקה → הגשה → טיפול המשרד →
  השלמות → החלטה → סגירה; רשימת מסמכים נדרשים (צ'קליסט) לכל תיק עם סטטוס לכל מסמך
- **תיקיית מסמכים לכל לקוח** — כל הקבצים נשמרים ב-`data/clients/<client-id>/documents`
- **עורך מסמכים מובנה** — עריכת PDF ותמונות בדפדפן: הוספת טקסט (כולל עברית),
  עט, מדגש, סיבוב תמונות. שמירה יוצרת גרסה ערוכה חדשה והמקור נשמר
- **לוח תשלומים** — שכר טרחה לכל תיק, רישום תקבולים, מי שילם / חייב / שילם חלקית
- **כניסת מנהל בלבד** — סיסמה אחת, session חתום; אין משתמשים נוספים
- **חיבור n8n** — כל אירוע (לקוח/תיק/מסמך/תשלום) נורה ל-n8n; חבילת ורקפלואים
  מוכנה לגוגל שיטס, יומן גוגל, מיילים ותזכורות תחת `n8n/workflows/`

## הפעלה מקומית

```bash
npm install
copy .env.example .env.local   # ולערוך: ADMIN_PASSWORD חובה
npm run dev
```

הכתובת: http://localhost:3000 — תופנה ל-`/login` (או ישר ללוח הבקרה אם עוד לא
הוגדרה סיסמה — מצב פיתוח בלבד).

## מסלולים עיקריים

- `/dashboard` — תמונת מצב: תיקים לפי שלב, דורשים טיפול, יתרות לגבייה
- `/clients` + `/clients/:id` — לקוחות, תיקיית מסמכים, תשלומים
- `/cases` + `/cases/:id` — תיקים, צ'קליסט מסמכים, פס שלבים, תשלומי תיק
- `/payments` — לוח גבייה כולל
- `/documents/:id/edit` — עורך המסמכים
- `/connections` — סטטוס חיבור n8n והסבר על האירועים

## API עיקרי

- `GET/POST /api/clients`, `GET/PATCH /api/clients/:id`
- `POST /api/clients/:id/documents` — העלאת קבצים (multipart)
- `GET/PATCH/DELETE /api/documents/:id`, `POST /api/documents/:id/edited`
- `GET/POST /api/cases`, `GET/PATCH /api/cases/:id`, `POST/PATCH/DELETE /api/cases/:id/checklist`
- `GET/POST /api/payments`, `DELETE /api/payments/:id`
- `GET /api/summary` — סיכום מלא ל-n8n / דוחות (עם `x-crmye-api-key`)
- `POST /api/webhooks/n8n` — שליחת אירוע מותאם ל-n8n

## אחסון

- בסיס הנתונים: קבצי JSON תחת `data/db/` (clients, cases, documents, payments, activity)
- מסמכים: `data/clients/<client-id>/documents/`
- גיבוי = העתקת תיקיית `data/` כולה

## פריסה לשרת (VPS / CloudPanel / pm2)

מדריך מלא צעד-אחר-צעד: **[DEPLOY.md](DEPLOY.md)** (כולל DNS, יצירת אתר Node.js
ב-CloudPanel על פורט 3006, SSL, גיבויים ועדכונים).

תמצית:

```bash
cp .env.production.example .env.production.local   # ולמלא סיסמה וסודות
npm install && npm run build
pm2 start ecosystem.config.cjs && pm2 save
```

חשוב לפני חשיפה לאינטרנט: להגדיר `ADMIN_PASSWORD` (או `ADMIN_PASSWORD_HASH`),
`ADMIN_SESSION_SECRET` ו-`APP_BASE_URL` אמיתיים ב-`.env.production.local`.

## n8n

ראה `n8n/README.md` — כולל רשימת האירועים היוצאים, נקודות ה-API לקריאה,
וחמישה ורקפלואים מוכנים לייבוא.
