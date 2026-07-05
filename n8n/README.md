# CasePoint × n8n

CasePoint שולח אירועים ל-n8n בכל פעולה משמעותית, ו-n8n יכול לקרוא נתונים חזרה
מהמערכת. כך מחברים גוגל שיטס, יומן גוגל, מיילים, וואטסאפ וכל שירות אחר — בלי
לגעת בקוד.

## הגדרה

1. ב-CasePoint (`.env.local`):
   - `N8N_WEBHOOK_BASE_URL` — כתובת ה-webhook של n8n, למשל `https://n8n.example.com/webhook`
   - `CASEPOINT_API_TOKEN` — מחרוזת אקראית ארוכה (משותפת עם n8n)
2. ב-n8n הגדר משתני סביבה:
   - `CASEPOINT_APP_BASE_URL` — כתובת האפליקציה, למשל `https://casepoint.example.com`
   - `CASEPOINT_API_TOKEN` — אותו טוקן
3. ייבא את הוורקפלואים מתיקיית `workflows/` (Import from file), חבר Credentials
   של Google (Sheets / Calendar / Gmail) והפעל.

## אירועים יוצאים (CasePoint → n8n)

| נתיב webhook | מתי |
|---|---|
| `casepoint/client-created` | לקוח חדש נוצר |
| `casepoint/case-created` | תיק חדש נפתח |
| `casepoint/case-stage-changed` | שלב תיק השתנה (כולל פרטי לקוח, שלב קודם/חדש, מסמכים חסרים) |
| `casepoint/document-uploaded` | מסמך הועלה או נשמרה גרסה ערוכה |
| `casepoint/payment-recorded` | תשלום נרשם |
| `casepoint/meeting-request` | בקשת פגישה שנשלחה דרך `POST /api/webhooks/n8n` |

## קריאת נתונים (n8n → CasePoint)

כל הקריאות עם הכותרת `x-casepoint-api-key: <CASEPOINT_API_TOKEN>`:

- `GET /api/summary` — כל התיקים + סטטוס + כספים (מושלם לסנכרון לגיליון או סיכום יומי)
- `GET /api/clients` — לקוחות
- `GET /api/cases` — תיקים

## הוורקפלואים בחבילה

| קובץ | תיאור |
|---|---|
| `01-google-sheets-daily-sync.json` | סנכרון יומי של כל התיקים לגיליון Google Sheets |
| `02-stage-change-client-email.json` | מייל אוטומטי ללקוח בכל שינוי שלב |
| `03-meeting-request-google-calendar.json` | קביעת פגישה ביומן גוגל מאירוע meeting-request |
| `04-missing-docs-weekly-reminder.json` | תזכורת שבועית ללקוחות עם מסמכים חסרים |
| `05-payment-recorded-notification.json` | רישום כל תשלום בגיליון הכנסות |

הוורקפלואים הם תבניות: אחרי הייבוא יש להחליף `REPLACE_WITH_SPREADSHEET_ID`,
לחבר Credentials ולהתאים ניסוחים.
