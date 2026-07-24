import { env, hasAdminPassword, hasApiAccessToken, hasN8nConfig } from '@/lib/env';

export const dynamic = 'force-dynamic';

const EVENTS = [
  { path: 'crmye/client-created', description: 'לקוח חדש נוצר — למשל: הוספת שורה בגוגל שיטס, הודעת ברוכים הבאים' },
  { path: 'crmye/case-created', description: 'תיק חדש נפתח — עדכון טבלת מעקב, יומן משימות' },
  { path: 'crmye/case-stage-changed', description: 'שלב תיק השתנה — שליחת עדכון ללקוח במייל/וואטסאפ, תזכורות' },
  { path: 'crmye/case-trouble-flag', description: 'תיק סומן כתקוע / נדרשת השלמה — התראה מיידית' },
  { path: 'crmye/case-decision', description: 'עודכנה החלטת המשרד (אושר / חקירה / נדחה)' },
  { path: 'crmye/document-uploaded', description: 'מסמך הועלה — גיבוי לדרייב, עדכון סטטוס' },
  { path: 'crmye/payment-recorded', description: 'תשלום נרשם — הפקת קבלה, עדכון גיליון הכנסות' },
  { path: 'crmye/task-assigned', description: 'משימה הוקצתה לעובד — מייל אוטומטי לעובד' },
  { path: 'crmye/password-reset', description: 'קוד איפוס סיסמה — נשלח באימייל / SMS / וואטסאפ לפי בחירת המשתמש' },
  { path: 'crmye/send-document', description: 'שליחת מסמך ללקוח — קישור מאובטח באימייל / וואטסאפ / SMS (וורקפלואו 09)' },
  { path: 'crmye/meeting-request', description: 'בקשת פגישה (נשלח ידנית/מסוכן AI) — קביעת פגישה ביומן גוגל' },
  { path: 'crmye/daily-summary', description: 'סיכום יומי (מופעל מתוזמן ב-n8n שקורא מ-GET /api/summary)' },
];

function StatusBadge({ ok, okText, missingText }: { ok: boolean; okText: string; missingText: string }) {
  return <span className={`badge ${ok ? 'good' : 'warn'}`}>{ok ? `✓ ${okText}` : `○ ${missingText}`}</span>;
}

export default function ConnectionsPage() {
  const n8nConfigured = hasN8nConfig();

  return (
    <div>
      <div className="hero">
        <div>
          <p className="eyebrow">חיבורים ואוטומציה</p>
          <h1 style={{ margin: '6px 0 4px' }}>n8n ואינטגרציות</h1>
          <p className="muted" style={{ margin: 0 }}>
            כל אירוע במערכת נשלח אוטומטית ל-n8n, ומשם אפשר לחבר גוגל שיטס, יומן גוגל, מיילים, וואטסאפ ועוד.
          </p>
        </div>
      </div>

      <div className="connection-grid" style={{ marginBottom: 20 }}>
        <div className="connection-card">
          <div className="split connection-topline">
            <strong>חיבור n8n</strong>
            <StatusBadge ok={n8nConfigured} okText="מחובר" missingText="לא מוגדר" />
          </div>
          <p className="connection-value" dir="ltr" style={{ fontSize: 14 }}>
            {env.n8nWebhookBaseUrl || 'N8N_WEBHOOK_BASE_URL not set'}
          </p>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            הגדר את N8N_WEBHOOK_BASE_URL בקובץ ‎.env.local (למשל https://n8n.example.com/webhook).
          </p>
        </div>

        <div className="connection-card">
          <div className="split connection-topline">
            <strong>טוקן API ל-n8n</strong>
            <StatusBadge ok={hasApiAccessToken()} okText="מוגדר" missingText="לא מוגדר" />
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            CRMYE_API_TOKEN מאפשר ל-n8n לקרוא נתונים מהמערכת (למשל GET /api/summary לסיכום יומי לגיליון)
            באמצעות הכותרת <code dir="ltr">x-crmye-api-key</code>.
          </p>
        </div>

        <div className="connection-card">
          <div className="split connection-topline">
            <strong>אבטחת מנהל</strong>
            <StatusBadge ok={hasAdminPassword()} okText="סיסמה מוגדרת" missingText="ללא סיסמה!" />
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            הגדר ADMIN_PASSWORD (או ADMIN_PASSWORD_HASH) לפני חשיפת המערכת לאינטרנט.
          </p>
        </div>

        <div className="connection-card">
          <div className="split connection-topline">
            <strong>אחסון מסמכים</strong>
            <span className="badge good">✓ מקומי</span>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            לכל לקוח תיקייה פיזית תחת <code dir="ltr">data/clients/&lt;client-id&gt;/documents</code> עם כל המסמכים שלו.
          </p>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>אירועי Webhook שנשלחים ל-n8n</h3>
        <p className="muted" style={{ fontSize: 13 }}>
          כל אירוע נשלח כ-POST אל <code dir="ltr">{'{N8N_WEBHOOK_BASE_URL}/<path>'}</code>. חבילת ורקפלואו מוכנה לייבוא נמצאת בתיקיית <code dir="ltr">n8n/workflows</code> בפרויקט.
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>נתיב</th>
              <th>מתי נשלח</th>
            </tr>
          </thead>
          <tbody>
            {EVENTS.map((event) => (
              <tr key={event.path}>
                <td dir="ltr" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13 }}>{event.path}</td>
                <td style={{ fontSize: 13 }}>{event.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h3 style={{ marginTop: 0 }}>נקודות API לשימוש n8n</h3>
        <ul className="list" style={{ fontSize: 13 }}>
          <li><code dir="ltr">GET /api/summary</code> — סיכום מלא: כל התיקים, שלבים, חובות ותשלומים (לסנכרון לגוגל שיטס).</li>
          <li><code dir="ltr">GET /api/tasks/due?markSent=1</code> — תזכורות משימות שהגיע זמנן, כולל פרטי קשר וערוצי שליחה (וורקפלואו 06 בודק כל 10 דקות).</li>
          <li><code dir="ltr">GET /api/clients</code> — רשימת לקוחות.</li>
          <li><code dir="ltr">GET /api/cases</code> — רשימת תיקים כולל סטטוס כספי.</li>
          <li><code dir="ltr">POST /api/webhooks/n8n</code> — שליחת אירוע מותאם אישית ל-n8n מתוך המערכת.</li>
        </ul>
        <p className="muted" style={{ fontSize: 13 }}>
          יש לצרף לכל קריאה את הכותרת <code dir="ltr">x-crmye-api-key: {'<CRMYE_API_TOKEN>'}</code>.
        </p>
      </div>
    </div>
  );
}
