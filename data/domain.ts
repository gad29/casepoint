/**
 * CasePoint domain model.
 *
 * CasePoint manages the full journey of a client whose advisor prepares and
 * submits applications to Israeli government offices: collecting documents,
 * reviewing them, submitting the case, tracking the office's handling,
 * receiving the decision, closing the case, and collecting payment.
 */

export type CaseStage =
  | 'new-client'
  | 'collecting-documents'
  | 'documents-review'
  | 'ready-to-submit'
  | 'submitted'
  | 'in-government-review'
  | 'action-required'
  | 'decision-received'
  | 'closed';

export const CASE_STAGES: CaseStage[] = [
  'new-client',
  'collecting-documents',
  'documents-review',
  'ready-to-submit',
  'submitted',
  'in-government-review',
  'action-required',
  'decision-received',
  'closed',
];

export const STAGE_LABELS: Record<CaseStage, string> = {
  'new-client': 'תיק חדש',
  'collecting-documents': 'איסוף מסמכים',
  'documents-review': 'בדיקת מסמכים',
  'ready-to-submit': 'מוכן להגשה',
  'submitted': 'הוגש למשרד',
  'in-government-review': 'בטיפול המשרד',
  'action-required': 'נדרשת השלמה',
  'decision-received': 'התקבלה החלטה',
  'closed': 'תיק סגור',
};

/** Stages that count as an open, active case. */
export const OPEN_STAGES: CaseStage[] = CASE_STAGES.filter((s) => s !== 'closed');

export type GovernmentOffice =
  | 'bituach-leumi'
  | 'population-authority'
  | 'tax-authority'
  | 'housing-ministry'
  | 'welfare-ministry'
  | 'health-ministry'
  | 'education-ministry'
  | 'transport-ministry'
  | 'aliyah-ministry'
  | 'municipality'
  | 'courts-enforcement'
  | 'other';

export const OFFICE_LABELS: Record<GovernmentOffice, string> = {
  'bituach-leumi': 'המוסד לביטוח לאומי',
  'population-authority': 'רשות האוכלוסין וההגירה (משרד הפנים)',
  'tax-authority': 'רשות המסים',
  'housing-ministry': 'משרד הבינוי והשיכון',
  'welfare-ministry': 'משרד הרווחה והביטחון החברתי',
  'health-ministry': 'משרד הבריאות',
  'education-ministry': 'משרד החינוך',
  'transport-ministry': 'משרד התחבורה',
  'aliyah-ministry': 'משרד העלייה והקליטה',
  'municipality': 'רשות מקומית / עירייה',
  'courts-enforcement': 'בתי משפט / הוצאה לפועל',
  'other': 'אחר',
};

export type ChecklistStatus =
  | 'missing'
  | 'received'
  | 'in-review'
  | 'approved'
  | 'resubmit-needed'
  | 'not-applicable';

export const CHECKLIST_STATUS_LABELS: Record<ChecklistStatus, string> = {
  'missing': 'חסר',
  'received': 'התקבל',
  'in-review': 'בבדיקה',
  'approved': 'אושר',
  'resubmit-needed': 'נדרש מחדש',
  'not-applicable': 'לא רלוונטי',
};

export interface ChecklistItem {
  /** Unique within the case (template code or custom-<n>). */
  code: string;
  label: string;
  status: ChecklistStatus;
  note?: string;
  /** Uploaded document ids fulfilling this requirement. */
  documentIds: string[];
  updatedAt: string;
}

export interface ClientRecord {
  id: string;
  fullName: string;
  idNumber?: string;
  phone: string;
  email?: string;
  address?: string;
  city?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CaseRecord {
  id: string;
  clientId: string;
  /** Short case title, e.g. "קצבת נכות" or "חידוש דרכון". */
  title: string;
  office: GovernmentOffice;
  /** Free-text office name when office === 'other'. */
  officeOther?: string;
  description?: string;
  stage: CaseStage;
  checklist: ChecklistItem[];
  /** Agreed fee in ILS. */
  fee: number;
  /** Reference / file number assigned by the government office. */
  referenceNumber?: string;
  nextAction?: string;
  notes?: string;
  decision?: string;
  openedAt: string;
  submittedAt?: string;
  decisionAt?: string;
  closedAt?: string;
  updatedAt: string;
}

export interface DocumentRecord {
  id: string;
  clientId: string;
  /** Optional link to a specific case. */
  caseId?: string;
  /** Stored file name inside the client folder. */
  fileName: string;
  originalName: string;
  /** Human label shown in the UI, defaults to the original name. */
  label?: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  updatedAt: string;
  /** Set when this file was produced by the in-app editor from another document. */
  editedFromId?: string;
}

export type PaymentMethod =
  | 'cash'
  | 'bank-transfer'
  | 'bit'
  | 'paybox'
  | 'check'
  | 'credit-card'
  | 'other';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  'cash': 'מזומן',
  'bank-transfer': 'העברה בנקאית',
  'bit': 'ביט',
  'paybox': 'פייבוקס',
  'check': "צ'ק",
  'credit-card': 'כרטיס אשראי',
  'other': 'אחר',
};

export interface PaymentRecord {
  id: string;
  clientId: string;
  caseId?: string;
  amount: number;
  method: PaymentMethod;
  paidAt: string;
  note?: string;
  createdAt: string;
}

export type PaymentStatus = 'unpaid' | 'partial' | 'paid';

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'לא שולם',
  partial: 'שולם חלקית',
  paid: 'שולם',
};

export interface ActivityRecord {
  id: string;
  type: string;
  clientId?: string;
  caseId?: string;
  summary: string;
  at: string;
}

/**
 * Reusable document requirements. Selected items seed a new case's checklist;
 * the admin can always add custom items per case.
 */
export interface DocumentTemplate {
  code: string;
  label: string;
  /** When set, the template is suggested first for these offices. */
  offices?: GovernmentOffice[];
}

export const documentTemplates: DocumentTemplate[] = [
  { code: 'id-card', label: 'תעודת זהות + ספח פתוח' },
  { code: 'power-of-attorney', label: 'ייפוי כוח למגיש הבקשה' },
  { code: 'application-form', label: 'טופס בקשה רשמי חתום' },
  { code: 'bank-account-confirmation', label: 'אישור ניהול חשבון בנק' },
  { code: 'payslips-3m', label: 'תלושי שכר – 3 חודשים אחרונים' },
  { code: 'bank-statements-3m', label: 'תדפיסי עו"ש – 3 חודשים אחרונים' },
  { code: 'income-confirmation', label: 'אישור הכנסות / שומת מס', offices: ['tax-authority', 'bituach-leumi'] },
  { code: 'medical-documents', label: 'מסמכים רפואיים עדכניים', offices: ['bituach-leumi', 'health-ministry'] },
  { code: 'medical-committee-summary', label: 'סיכום ועדה רפואית קודמת', offices: ['bituach-leumi'] },
  { code: 'rent-contract', label: 'חוזה שכירות', offices: ['housing-ministry', 'municipality'] },
  { code: 'residence-confirmation', label: 'אישור תושבות מהרשות המקומית', offices: ['municipality', 'bituach-leumi'] },
  { code: 'marriage-certificate', label: 'תעודת נישואין', offices: ['population-authority'] },
  { code: 'birth-certificate', label: 'תעודת לידה', offices: ['population-authority'] },
  { code: 'passport-photos', label: 'תמונות פספורט', offices: ['population-authority'] },
  { code: 'employer-letter', label: 'מכתב מעסיק / אישור העסקה' },
  { code: 'unemployment-confirmation', label: 'אישור מלשכת התעסוקה', offices: ['bituach-leumi', 'welfare-ministry'] },
  { code: 'affidavit', label: 'תצהיר חתום בפני עו"ד' },
  { code: 'court-decision', label: 'פסק דין / החלטת בית משפט', offices: ['courts-enforcement'] },
  { code: 'vehicle-license', label: 'רישיון רכב', offices: ['transport-ministry'] },
  { code: 'teudat-oleh', label: 'תעודת עולה', offices: ['aliyah-ministry'] },
];

/** Checklist statuses that still block submission. */
export function checklistItemIsMissing(item: ChecklistItem) {
  return item.status === 'missing' || item.status === 'resubmit-needed';
}

export function countMissingItems(caseRecord: Pick<CaseRecord, 'checklist'>) {
  return caseRecord.checklist.filter(checklistItemIsMissing).length;
}

export function officeDisplayName(caseRecord: Pick<CaseRecord, 'office' | 'officeOther'>) {
  if (caseRecord.office === 'other' && caseRecord.officeOther?.trim()) {
    return caseRecord.officeOther.trim();
  }
  return OFFICE_LABELS[caseRecord.office];
}
