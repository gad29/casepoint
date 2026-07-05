import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="landing" dir="rtl">
      <div className="landing-hero">
        <h1 className="landing-title">הדף לא נמצא</h1>
        <p className="landing-lead">הקישור שהגעת אליו אינו קיים או שהוסר.</p>
        <div className="landing-actions">
          <Link className="button" href="/dashboard">
            חזרה ללוח הבקרה
          </Link>
        </div>
      </div>
    </div>
  );
}
