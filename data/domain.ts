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
  | 'ready-for-client'
  | 'sent-to-client'
  | 'submitted'
  | 'in-government-review'
  | 'action-required'
  | 'decision-received'
  | 'awaiting-payment'
  | 'closed';

export const CASE_STAGES: CaseStage[] = [
  'new-client',
  'collecting-documents',
  'documents-review',
  'ready-for-client',
  'sent-to-client',
  'submitted',
  'in-government-review',
  'action-required',
  'decision-received',
  'awaiting-payment',
  'closed',
];

export const STAGE_LABELS: Record<CaseStage, string> = {
  'new-client': 'תיק חדש',
  'collecting-documents': 'איסוף מסמכים',
  'documents-review': 'בדיקת מסמכים',
  'ready-for-client': 'מוכן לשליחה ללקוח',
  'sent-to-client': 'נשלח ללקוח לאחר תיקון',
  'submitted': 'הוגש למשרד',
  'in-government-review': 'בטיפול המשרד',
  'action-required': 'נדרשת השלמה',
  'decision-received': 'התקבלה החלטה',
  'awaiting-payment': 'ממתין לתשלום',
  'closed': 'תיק סגור',
};

/** Case is in an open investigation (red state) until an outcome is set. */
export function isUnderInvestigation(caseRecord: {
  decisionStatus?: DecisionStatus;
  investigationOutcome?: InvestigationOutcome;
}) {
  return caseRecord.decisionStatus === 'investigation' && !caseRecord.investigationOutcome;
}

/** Legacy stage codes → current codes (kept for data written by older versions). */
export const LEGACY_STAGE_MAP: Record<string, CaseStage> = {
  'ready-to-submit': 'ready-for-client',
};

export type DecisionStatus = 'approved' | 'investigation';
export type InvestigationOutcome = 'approved' | 'rejected';

export const DECISION_LABELS: Record<DecisionStatus, string> = {
  approved: 'אושר',
  investigation: 'חקירה',
};

export const INVESTIGATION_OUTCOME_LABELS: Record<InvestigationOutcome, string> = {
  approved: 'אושר',
  rejected: 'נדחה',
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

/** Operating company handling the case (e.g. rent-assistance operators). */
export type OperatingCompany = 'milgam' | 'alonim' | 'maof' | 'none';

export const COMPANY_LABELS: Record<OperatingCompany, string> = {
  'milgam': 'מילגם',
  'alonim': 'אלונים',
  'maof': 'מעוף',
  'none': 'ללא / אחר',
};

export type CaseKind = 'new' | 'renewal';

export const CASE_KIND_LABELS: Record<CaseKind, string> = {
  'new': 'תיק חדש',
  'renewal': 'חידוש',
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
  /** Worker id who created the client; 'admin' or absent for the admin. */
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

/** Additional admin account (full privileges, stored in the DB). The root admin lives in .env. */
export interface AdminRecord {
  id: string;
  name: string;
  email: string;
  /** Optional, for SMS/WhatsApp password-reset codes (international format). */
  phone?: string;
  passwordHash: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkerRecord {
  id: string;
  name: string;
  email: string;
  /** Optional, for WhatsApp reminders (international format, e.g. 9725x…). */
  phone?: string;
  passwordHash: string;
  active: boolean;
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
  /** Operating company the case is handled through. */
  company?: OperatingCompany;
  /** New application or renewal. */
  caseKind?: CaseKind;
  /** Red flag: the case is stuck / needs additional information or documents. */
  troubleFlag?: boolean;
  troubleNote?: string;
  /** Worker id who opened the case ('admin' when opened by the admin). */
  openedBy?: string;
  /** Worker id the admin assigned the case to. */
  assignedTo?: string;
  /** Agreed fee in ILS. */
  fee: number;
  /** Reference / file number assigned by the government office. */
  referenceNumber?: string;
  nextAction?: string;
  notes?: string;
  /** Free-text decision summary. */
  decision?: string;
  /** Structured decision: approved directly, or sent to investigation. */
  decisionStatus?: DecisionStatus;
  /** Outcome when decisionStatus === 'investigation'. */
  investigationOutcome?: InvestigationOutcome;
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

// ── Tasks & reminders ────────────────────────────────────────────────────────

export type TaskPriority = 'normal' | 'high' | 'urgent';

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  normal: 'רגיל',
  high: 'חשוב',
  urgent: 'דחוף',
};

export type ReminderChannel = 'email' | 'whatsapp';

export const REMINDER_CHANNEL_LABELS: Record<ReminderChannel, string> = {
  email: 'אימייל',
  whatsapp: 'וואטסאפ',
};

export interface TaskRecord {
  id: string;
  title: string;
  notes?: string;
  /** When the task is due (ISO datetime). */
  dueAt?: string;
  /** When to send the reminder (ISO datetime). */
  remindAt?: string;
  reminderChannels: ReminderChannel[];
  /** Set once the reminder was handed to n8n (prevents double sends). */
  reminderSentAt?: string;
  priority: TaskPriority;
  /** 'admin' or a worker id. */
  assigneeId: string;
  clientId?: string;
  caseId?: string;
  status: 'open' | 'done';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

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
  { code: 'id-spouses', label: 'תעודת זהות וספח — שני בני הזוג' },
  { code: 'payslips-6m', label: 'תלושי שכר — 6 חודשים אחרונים' },
  { code: 'non-working-status', label: 'אישור מעמד לא עובד' },
  { code: 'kollel-confirmation', label: 'אישור כולל' },
  { code: 'marriage-certificate', label: 'תעודת נישואין' },
  { code: 'employer-letter', label: 'מכתב מעסיק / אישור העסקה' },
  { code: 'request-letter', label: 'מכתב בקשה' },
  { code: 'bank-statements', label: 'עובר ושב' },
  { code: 'rent-contract', label: 'חוזה שכירות' },
];

/** Codes seeded into every new case's checklist (rent contract included — a blank
 *  template uploaded once in Settings is downloadable from every case). */
export const DEFAULT_CHECKLIST_CODES = documentTemplates.map((t) => t.code);

export const BLANK_CONTRACT_CODE = 'rent-contract';

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
