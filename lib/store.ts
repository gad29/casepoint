import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  countMissingItems,
  DECISION_LABELS,
  DEFAULT_APP_CONFIG,
  documentTemplates,
  INVESTIGATION_OUTCOME_LABELS,
  LEGACY_STAGE_MAP,
  officeDisplayName,
  OPEN_STAGES,
  PAYMENT_STATUS_LABELS,
  STAGE_LABELS,
  type ActivityRecord,
  type AdminRecord,
  type AppConfig,
  type CaseKind,
  type CaseRecord,
  type CaseStage,
  type ChecklistItem,
  type ChecklistStatus,
  type ClientRecord,
  type DecisionStatus,
  type DocumentRecord,
  type GovernmentOffice,
  type InvestigationOutcome,
  type OperatingCompany,
  type PaymentMethod,
  type PaymentRecord,
  type PaymentStatus,
  type ReminderChannel,
  type TaskPriority,
  type TaskRecord,
  type WorkerRecord,
} from '@/data/domain';
import { env } from '@/lib/env';
import { triggerN8n } from '@/lib/n8n';
import { signShareToken } from '@/lib/share';

const appRoot = process.cwd();

function dataRoot() {
  return path.isAbsolute(env.dataDir) ? env.dataDir : path.join(appRoot, env.dataDir);
}

function dbFile(name: string) {
  return path.join(dataRoot(), 'db', `${name}.json`);
}

export function clientFolder(clientId: string) {
  return path.join(dataRoot(), 'clients', clientId);
}

export function clientDocumentsFolder(clientId: string) {
  return path.join(clientFolder(clientId), 'documents');
}

function logStore(level: 'info' | 'warn' | 'error', message: string, details?: Record<string, unknown>) {
  const payload = details ? ` ${JSON.stringify(details)}` : '';
  const logger = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
  logger(`[CRM_YE Store] ${message}${payload}`);
}

function readJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch (error) {
    logStore('error', 'Failed to parse JSON store file', { filePath, error: String(error) });
    return fallback;
  }
}

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const serialized = JSON.stringify(value, null, 2);
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, serialized);
  try {
    fs.renameSync(tmp, filePath);
  } catch {
    fs.copyFileSync(tmp, filePath);
    fs.unlinkSync(tmp);
  }
}

// ── ID generation ────────────────────────────────────────────────────────────

type Counters = Record<string, number>;

function nextId(prefix: string, counterKey: string, start = 1000) {
  const file = dbFile('counters');
  const counters = readJson<Counters>(file, {});
  const next = (counters[counterKey] ?? start) + 1;
  counters[counterKey] = next;
  writeJson(file, counters);
  return `${prefix}-${next}`;
}

function nowIso() {
  return new Date().toISOString();
}

// ── n8n events (fire-and-forget) ─────────────────────────────────────────────

export async function fireEvent(event: string, payload: Record<string, unknown>) {
  if (!env.n8nWebhookBaseUrl) return { ok: false, error: 'n8n not configured' } as const;
  try {
    const result = await triggerN8n(`crmye/${event}`, { event, ...payload, firedAt: nowIso() });
    if (!result.ok) logStore('warn', `n8n event ${event} failed`, { error: result.error });
    return result;
  } catch (error) {
    logStore('warn', `n8n event ${event} threw`, { error: String(error) });
    return { ok: false, error: String(error) } as const;
  }
}

// ── Activity log ─────────────────────────────────────────────────────────────

export function logActivity(input: { type: string; summary: string; clientId?: string; caseId?: string }) {
  const file = dbFile('activity');
  const entries = readJson<ActivityRecord[]>(file, []);
  const record: ActivityRecord = {
    id: crypto.randomUUID(),
    at: nowIso(),
    ...input,
  };
  entries.unshift(record);
  // Keep the log bounded.
  writeJson(file, entries.slice(0, 2000));
  return record;
}

export function listActivity(options?: { clientId?: string; caseId?: string; limit?: number }) {
  const entries = readJson<ActivityRecord[]>(dbFile('activity'), []);
  let filtered = entries;
  if (options?.clientId) filtered = filtered.filter((e) => e.clientId === options.clientId);
  if (options?.caseId) filtered = filtered.filter((e) => e.caseId === options.caseId);
  return filtered.slice(0, options?.limit ?? 50);
}

// ── Clients ──────────────────────────────────────────────────────────────────

export function listClients(): ClientRecord[] {
  return readJson<ClientRecord[]>(dbFile('clients'), []);
}

export function getClient(clientId: string) {
  return listClients().find((c) => c.id === clientId);
}

export interface CreateClientInput {
  fullName: string;
  phone: string;
  idNumber?: string;
  email?: string;
  address?: string;
  city?: string;
  notes?: string;
  /** Worker id who created the client ('admin' for the admin). */
  createdBy?: string;
}

export function createClient(input: CreateClientInput): ClientRecord {
  const clients = listClients();
  const record: ClientRecord = {
    id: nextId('CL', 'client'),
    fullName: input.fullName.trim(),
    phone: input.phone.trim(),
    idNumber: input.idNumber?.trim() || undefined,
    email: input.email?.trim() || undefined,
    address: input.address?.trim() || undefined,
    city: input.city?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    createdBy: input.createdBy || 'admin',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  clients.unshift(record);
  writeJson(dbFile('clients'), clients);
  fs.mkdirSync(clientDocumentsFolder(record.id), { recursive: true });
  logActivity({ type: 'client-created', clientId: record.id, summary: `נפתח לקוח חדש: ${record.fullName}` });
  void fireEvent('client-created', { clientId: record.id, fullName: record.fullName, phone: record.phone, email: record.email || '' });
  return record;
}

export function updateClient(clientId: string, input: Partial<CreateClientInput>) {
  const clients = listClients();
  const index = clients.findIndex((c) => c.id === clientId);
  if (index === -1) return undefined;
  const current = clients[index];
  const updated: ClientRecord = {
    ...current,
    ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)),
    updatedAt: nowIso(),
  };
  clients[index] = updated;
  writeJson(dbFile('clients'), clients);
  logActivity({ type: 'client-updated', clientId, summary: `עודכנו פרטי לקוח: ${updated.fullName}` });
  return updated;
}

/** Delete a client and everything belonging to them: cases, documents, payments, and their folder on disk. */
export function deleteClient(clientId: string) {
  const record = getClient(clientId);
  if (!record) return false;

  for (const c of listClientCases(clientId)) deleteCase(c.id);
  for (const d of listClientDocuments(clientId)) deleteDocument(d.id);

  const payments = listPayments();
  const remaining = payments.filter((p) => p.clientId !== clientId);
  if (remaining.length !== payments.length) writeJson(dbFile('payments'), remaining);

  const tasks = listTasks();
  let tasksChanged = false;
  for (const t of tasks) {
    if (t.clientId === clientId) {
      t.clientId = undefined;
      tasksChanged = true;
    }
  }
  if (tasksChanged) writeJson(dbFile('tasks'), tasks);

  try {
    fs.rmSync(clientFolder(clientId), { recursive: true, force: true });
  } catch {
    /* folder may not exist */
  }

  writeJson(dbFile('clients'), listClients().filter((c) => c.id !== clientId));
  logActivity({ type: 'client-deleted', summary: `נמחק לקוח: ${record.fullName}` });
  return true;
}

// ── Cases ────────────────────────────────────────────────────────────────────

export function listCases(): CaseRecord[] {
  const cases = readJson<CaseRecord[]>(dbFile('cases'), []);
  // Normalize stage codes written by older versions (read-time migration).
  for (const caseRecord of cases) {
    const mapped = LEGACY_STAGE_MAP[caseRecord.stage as string];
    if (mapped) caseRecord.stage = mapped;
  }
  return cases;
}

export function getCase(caseId: string) {
  return listCases().find((c) => c.id === caseId);
}

export function listClientCases(clientId: string) {
  return listCases().filter((c) => c.clientId === clientId);
}

export interface CreateCaseInput {
  clientId: string;
  title: string;
  office: GovernmentOffice;
  officeOther?: string;
  description?: string;
  fee?: number;
  nextAction?: string;
  company?: OperatingCompany;
  caseKind?: CaseKind;
  /** Worker id who opened the case ('admin' for the admin). */
  openedBy?: string;
  /** Template codes to seed the checklist with. */
  checklistCodes?: string[];
  /** Free-text custom checklist items. */
  customChecklist?: string[];
}

export function createCase(input: CreateCaseInput): CaseRecord | undefined {
  const client = getClient(input.clientId);
  if (!client) return undefined;

  const checklist: ChecklistItem[] = [];
  for (const code of input.checklistCodes ?? []) {
    const label = templateLabel(code);
    if (label && !checklist.some((item) => item.code === code)) {
      checklist.push({ code, label, status: 'missing', documentIds: [], updatedAt: nowIso() });
    }
  }
  for (const label of input.customChecklist ?? []) {
    const trimmed = label.trim();
    if (!trimmed) continue;
    checklist.push({
      code: `custom-${crypto.randomUUID().slice(0, 8)}`,
      label: trimmed,
      status: 'missing',
      documentIds: [],
      updatedAt: nowIso(),
    });
  }

  const record: CaseRecord = {
    id: nextId('CASE', 'case'),
    clientId: client.id,
    title: input.title.trim(),
    office: input.office,
    officeOther: input.officeOther?.trim() || undefined,
    description: input.description?.trim() || undefined,
    stage: checklist.length ? 'collecting-documents' : 'new-client',
    checklist,
    company: input.company,
    caseKind: input.caseKind || 'new',
    troubleFlag: false,
    openedBy: input.openedBy || 'admin',
    fee: Number.isFinite(input.fee) && (input.fee as number) >= 0 ? Number(input.fee) : 0,
    nextAction: input.nextAction?.trim() || undefined,
    openedAt: nowIso(),
    updatedAt: nowIso(),
  };

  const cases = listCases();
  cases.unshift(record);
  writeJson(dbFile('cases'), cases);
  logActivity({
    type: 'case-created',
    clientId: client.id,
    caseId: record.id,
    summary: `נפתח תיק חדש "${record.title}" (${officeDisplayName(record)}) עבור ${client.fullName}`,
  });
  void fireEvent('case-created', {
    caseId: record.id,
    clientId: client.id,
    clientName: client.fullName,
    title: record.title,
    office: officeDisplayName(record),
    fee: record.fee,
  });
  return record;
}

export interface UpdateCaseInput {
  title?: string;
  office?: GovernmentOffice;
  officeOther?: string;
  description?: string;
  stage?: CaseStage;
  fee?: number;
  referenceNumber?: string;
  nextAction?: string;
  notes?: string;
  decision?: string;
  company?: OperatingCompany;
  caseKind?: CaseKind;
  troubleFlag?: boolean;
  troubleNote?: string;
  decisionStatus?: DecisionStatus;
  /** Empty string clears the outcome (e.g. when switching decision back to approved). */
  investigationOutcome?: InvestigationOutcome | '';
  /** Worker id to assign the case to; empty string clears the assignment. */
  assignedTo?: string;
  /** 'paid' | 'partial' | 'unpaid' to force a status; 'auto' or '' clears back to computed. */
  paymentStatusOverride?: PaymentStatus | 'auto' | '';
}

export function updateCase(caseId: string, input: UpdateCaseInput) {
  const cases = listCases();
  const index = cases.findIndex((c) => c.id === caseId);
  if (index === -1) return undefined;
  const current = cases[index];
  const previousStage = current.stage;

  const updated: CaseRecord = {
    ...current,
    ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)),
    updatedAt: nowIso(),
  };
  if (input.assignedTo !== undefined) {
    updated.assignedTo = input.assignedTo.trim() || undefined;
  }
  if (input.investigationOutcome === '') {
    updated.investigationOutcome = undefined;
  }
  if (input.paymentStatusOverride !== undefined) {
    updated.paymentStatusOverride =
      input.paymentStatusOverride === 'auto' || input.paymentStatusOverride === ''
        ? undefined
        : input.paymentStatusOverride;
  }
  // A direct approval clears any previous investigation outcome.
  if (input.decisionStatus === 'approved') {
    updated.investigationOutcome = undefined;
  }

  if (input.stage && input.stage !== previousStage) {
    if (input.stage === 'submitted' && !updated.submittedAt) updated.submittedAt = nowIso();
    if (input.stage === 'decision-received' && !updated.decisionAt) updated.decisionAt = nowIso();
    if (input.stage === 'closed' && !updated.closedAt) updated.closedAt = nowIso();
  }

  cases[index] = updated;
  writeJson(dbFile('cases'), cases);

  if (input.stage && input.stage !== previousStage) {
    const client = getClient(updated.clientId);
    logActivity({
      type: 'case-stage-changed',
      clientId: updated.clientId,
      caseId,
      summary: `שלב התיק "${updated.title}" עודכן: ${STAGE_LABELS[previousStage]} ← ${STAGE_LABELS[input.stage]}`,
    });
    void fireEvent('case-stage-changed', {
      caseId,
      clientId: updated.clientId,
      clientName: client?.fullName || '',
      clientPhone: client?.phone || '',
      clientEmail: client?.email || '',
      title: updated.title,
      office: officeDisplayName(updated),
      previousStage,
      stage: input.stage,
      stageLabel: STAGE_LABELS[input.stage],
      missingItems: countMissingItems(updated),
    });
  } else {
    logActivity({ type: 'case-updated', clientId: updated.clientId, caseId, summary: `עודכן תיק "${updated.title}"` });
  }

  if (input.assignedTo !== undefined && (current.assignedTo || undefined) !== updated.assignedTo) {
    const worker = updated.assignedTo ? getWorker(updated.assignedTo) : undefined;
    logActivity({
      type: 'case-assigned',
      clientId: updated.clientId,
      caseId,
      summary: worker ? `התיק "${updated.title}" שויך לעובד ${worker.name}` : `בוטל שיוך העובד מהתיק "${updated.title}"`,
    });
  }

  const decisionChanged =
    (input.decisionStatus !== undefined && input.decisionStatus !== current.decisionStatus) ||
    (input.investigationOutcome !== undefined && (input.investigationOutcome || undefined) !== current.investigationOutcome);
  if (decisionChanged) {
    const parts = [
      updated.decisionStatus ? `החלטה: ${DECISION_LABELS[updated.decisionStatus]}` : '',
      updated.investigationOutcome ? `תוצאת חקירה: ${INVESTIGATION_OUTCOME_LABELS[updated.investigationOutcome]}` : '',
    ].filter(Boolean);
    logActivity({
      type: 'case-decision',
      clientId: updated.clientId,
      caseId,
      summary: `עודכנה החלטה בתיק "${updated.title}" — ${parts.join(', ') || 'נוקתה'}`,
    });
    void fireEvent('case-decision', {
      caseId,
      clientId: updated.clientId,
      title: updated.title,
      decisionStatus: updated.decisionStatus || '',
      investigationOutcome: updated.investigationOutcome || '',
    });
  }

  if (input.paymentStatusOverride !== undefined && current.paymentStatusOverride !== updated.paymentStatusOverride) {
    const label = updated.paymentStatusOverride
      ? PAYMENT_STATUS_LABELS[updated.paymentStatusOverride]
      : 'אוטומטי (לפי תשלומים)';
    logActivity({
      type: 'case-payment-status',
      clientId: updated.clientId,
      caseId,
      summary: `סטטוס התשלום של "${updated.title}" עודכן ידנית ל: ${label}`,
    });
  }

  if (input.troubleFlag !== undefined && Boolean(current.troubleFlag) !== Boolean(input.troubleFlag)) {
    logActivity({
      type: 'case-trouble-flag',
      clientId: updated.clientId,
      caseId,
      summary: input.troubleFlag
        ? `🚩 התיק "${updated.title}" סומן כתקוע / נדרשת השלמה${input.troubleNote ? `: ${input.troubleNote}` : ''}`
        : `הוסרה התראת הבעיה מהתיק "${updated.title}"`,
    });
    void fireEvent('case-trouble-flag', {
      caseId,
      clientId: updated.clientId,
      title: updated.title,
      troubleFlag: Boolean(input.troubleFlag),
      troubleNote: updated.troubleNote || '',
    });
  }

  return updated;
}

// ── Checklist ────────────────────────────────────────────────────────────────

export function addChecklistItem(caseId: string, label: string, code?: string) {
  const cases = listCases();
  const index = cases.findIndex((c) => c.id === caseId);
  if (index === -1) return undefined;
  const caseRecord = cases[index];

  const tmplLabel = code ? templateLabel(code) : undefined;
  const item: ChecklistItem = {
    code: code && tmplLabel ? code : `custom-${crypto.randomUUID().slice(0, 8)}`,
    label: tmplLabel ?? label.trim(),
    status: 'missing',
    documentIds: [],
    updatedAt: nowIso(),
  };
  if (!item.label) return undefined;
  if (caseRecord.checklist.some((existing) => existing.code === item.code)) return undefined;

  caseRecord.checklist.push(item);
  caseRecord.updatedAt = nowIso();
  cases[index] = caseRecord;
  writeJson(dbFile('cases'), cases);
  logActivity({ type: 'checklist-item-added', clientId: caseRecord.clientId, caseId, summary: `נוסף מסמך נדרש: ${item.label}` });
  return item;
}

export function updateChecklistItem(
  caseId: string,
  code: string,
  input: { status?: ChecklistStatus; note?: string; label?: string },
) {
  const cases = listCases();
  const index = cases.findIndex((c) => c.id === caseId);
  if (index === -1) return undefined;
  const caseRecord = cases[index];
  const item = caseRecord.checklist.find((i) => i.code === code);
  if (!item) return undefined;

  if (input.status) item.status = input.status;
  if (input.note !== undefined) item.note = input.note.trim() || undefined;
  if (input.label !== undefined && input.label.trim()) item.label = input.label.trim();
  item.updatedAt = nowIso();
  caseRecord.updatedAt = nowIso();
  cases[index] = caseRecord;
  writeJson(dbFile('cases'), cases);

  if (input.status) {
    logActivity({
      type: 'checklist-status-updated',
      clientId: caseRecord.clientId,
      caseId,
      summary: `סטטוס "${item.label}" עודכן`,
    });
  }
  return item;
}

export function removeChecklistItem(caseId: string, code: string) {
  return removeChecklistItems(caseId, [code]) > 0;
}

/** Remove several checklist items at once; returns how many were removed. */
export function removeChecklistItems(caseId: string, codes: string[]) {
  const cases = listCases();
  const index = cases.findIndex((c) => c.id === caseId);
  if (index === -1) return 0;
  const set = new Set(codes);
  const caseRecord = cases[index];
  const before = caseRecord.checklist.length;
  caseRecord.checklist = caseRecord.checklist.filter((i) => !set.has(i.code));
  const removed = before - caseRecord.checklist.length;
  if (removed > 0) {
    caseRecord.updatedAt = nowIso();
    cases[index] = caseRecord;
    writeJson(dbFile('cases'), cases);
    logActivity({ type: 'checklist-items-removed', clientId: caseRecord.clientId, caseId, summary: `הוסרו ${removed} מסמכים מרשימת התיק` });
  }
  return removed;
}

/** Empty the whole checklist of a case; returns how many were removed. */
export function clearChecklist(caseId: string) {
  const cases = listCases();
  const index = cases.findIndex((c) => c.id === caseId);
  if (index === -1) return 0;
  const removed = cases[index].checklist.length;
  if (removed > 0) {
    cases[index].checklist = [];
    cases[index].updatedAt = nowIso();
    writeJson(dbFile('cases'), cases);
    logActivity({ type: 'checklist-cleared', clientId: cases[index].clientId, caseId, summary: 'נוקתה רשימת המסמכים הנדרשים' });
  }
  return removed;
}

/** Delete a case and cascade: its documents (files + records), payments, task links. */
export function deleteCase(caseId: string) {
  const record = getCase(caseId);
  if (!record) return false;

  for (const doc of listCaseDocuments(caseId)) deleteDocument(doc.id);

  const payments = listPayments();
  const remainingPayments = payments.filter((p) => p.caseId !== caseId);
  if (remainingPayments.length !== payments.length) writeJson(dbFile('payments'), remainingPayments);

  const tasks = listTasks();
  let tasksChanged = false;
  for (const t of tasks) {
    if (t.caseId === caseId) {
      t.caseId = undefined;
      tasksChanged = true;
    }
  }
  if (tasksChanged) writeJson(dbFile('tasks'), tasks);

  writeJson(dbFile('cases'), listCases().filter((c) => c.id !== caseId));
  logActivity({ type: 'case-deleted', clientId: record.clientId, summary: `נמחק תיק "${record.title}"` });
  return true;
}

// ── Documents ────────────────────────────────────────────────────────────────

export function listDocuments(): DocumentRecord[] {
  return readJson<DocumentRecord[]>(dbFile('documents'), []);
}

export function getDocument(documentId: string) {
  return listDocuments().find((d) => d.id === documentId);
}

export function listClientDocuments(clientId: string) {
  return listDocuments().filter((d) => d.clientId === clientId);
}

export function listCaseDocuments(caseId: string) {
  return listDocuments().filter((d) => d.caseId === caseId);
}

function sanitizeFileName(name: string) {
  const base = path.basename(name).replace(/[-\\/:*?"<>|\s]/g, '_').trim();
  return base || 'file';
}

export function documentFilePath(record: Pick<DocumentRecord, 'clientId' | 'fileName'>) {
  return path.join(clientDocumentsFolder(record.clientId), record.fileName);
}

export interface SaveDocumentInput {
  clientId: string;
  caseId?: string;
  originalName: string;
  mimeType: string;
  buffer: Buffer;
  label?: string;
  editedFromId?: string;
  /** Checklist item to link + mark as received. */
  checklistCode?: string;
}

export function saveDocument(input: SaveDocumentInput): DocumentRecord | undefined {
  const client = getClient(input.clientId);
  if (!client) return undefined;

  const id = nextId('DOC', 'document');
  const safeName = sanitizeFileName(input.originalName);
  const fileName = `${id}-${safeName}`;
  const folder = clientDocumentsFolder(input.clientId);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, fileName), input.buffer);

  const record: DocumentRecord = {
    id,
    clientId: input.clientId,
    caseId: input.caseId,
    fileName,
    originalName: safeName,
    label: input.label?.trim() || undefined,
    mimeType: input.mimeType || 'application/octet-stream',
    size: input.buffer.length,
    uploadedAt: nowIso(),
    updatedAt: nowIso(),
    editedFromId: input.editedFromId,
  };

  const documents = listDocuments();
  documents.unshift(record);
  writeJson(dbFile('documents'), documents);

  let checklistLabel = '';
  if (input.caseId && input.checklistCode) {
    const cases = listCases();
    const index = cases.findIndex((c) => c.id === input.caseId);
    if (index !== -1) {
      const item = cases[index].checklist.find((i) => i.code === input.checklistCode);
      if (item) {
        item.documentIds.push(record.id);
        if (item.status === 'missing' || item.status === 'resubmit-needed') item.status = 'received';
        item.updatedAt = nowIso();
        cases[index].updatedAt = nowIso();
        writeJson(dbFile('cases'), cases);
        checklistLabel = item.label;
      }
    }
  }

  logActivity({
    type: record.editedFromId ? 'document-edited' : 'document-uploaded',
    clientId: input.clientId,
    caseId: input.caseId,
    summary: record.editedFromId
      ? `נשמרה גרסה ערוכה של מסמך: ${record.label || record.originalName}`
      : `הועלה מסמך: ${record.label || record.originalName}${checklistLabel ? ` (${checklistLabel})` : ''}`,
  });
  void fireEvent('document-uploaded', {
    documentId: record.id,
    clientId: input.clientId,
    clientName: client.fullName,
    caseId: input.caseId || '',
    fileName: record.originalName,
    checklistItem: checklistLabel,
    edited: Boolean(record.editedFromId),
  });
  return record;
}

export function updateDocumentMeta(documentId: string, input: { label?: string; caseId?: string | null }) {
  const documents = listDocuments();
  const index = documents.findIndex((d) => d.id === documentId);
  if (index === -1) return undefined;
  const record = documents[index];
  if (input.label !== undefined) record.label = input.label.trim() || undefined;
  if (input.caseId !== undefined) record.caseId = input.caseId || undefined;
  record.updatedAt = nowIso();
  documents[index] = record;
  writeJson(dbFile('documents'), documents);
  return record;
}

export function deleteDocument(documentId: string) {
  const documents = listDocuments();
  const record = documents.find((d) => d.id === documentId);
  if (!record) return false;

  const filePath = documentFilePath(record);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  writeJson(dbFile('documents'), documents.filter((d) => d.id !== documentId));

  // Unlink from any checklist items.
  const cases = listCases();
  let casesChanged = false;
  for (const caseRecord of cases) {
    for (const item of caseRecord.checklist) {
      if (item.documentIds.includes(documentId)) {
        item.documentIds = item.documentIds.filter((id) => id !== documentId);
        item.updatedAt = nowIso();
        casesChanged = true;
      }
    }
  }
  if (casesChanged) writeJson(dbFile('cases'), cases);

  logActivity({
    type: 'document-deleted',
    clientId: record.clientId,
    caseId: record.caseId,
    summary: `נמחק מסמך: ${record.label || record.originalName}`,
  });
  return true;
}

export function readDocumentFile(record: Pick<DocumentRecord, 'clientId' | 'fileName'>) {
  const filePath = documentFilePath(record);
  if (!fs.existsSync(filePath)) return undefined;
  return fs.readFileSync(filePath);
}

export type SendChannel = 'email' | 'whatsapp' | 'sms';

/**
 * Send one or more documents to their client as a single secure, expiring
 * download link via n8n. All documents must belong to the same client.
 * Returns the generated link on success.
 */
export async function sendDocumentsLink(documentIds: string[], channel: SendChannel) {
  const ids = Array.from(new Set(documentIds.filter(Boolean)));
  if (!ids.length) return { ok: false as const, error: 'לא נבחרו מסמכים' };

  const docs = ids.map((id) => getDocument(id)).filter((d): d is DocumentRecord => Boolean(d));
  if (!docs.length) return { ok: false as const, error: 'המסמכים לא נמצאו' };

  const clientId = docs[0].clientId;
  if (docs.some((d) => d.clientId !== clientId)) {
    return { ok: false as const, error: 'לא ניתן לשלוח מסמכים של לקוחות שונים בקישור אחד' };
  }
  const client = getClient(clientId);
  if (!client) return { ok: false as const, error: 'הלקוח לא נמצא' };

  if (channel === 'email' && !client.email) return { ok: false as const, error: 'ללקוח אין כתובת אימייל' };
  if ((channel === 'whatsapp' || channel === 'sms') && !client.phone) {
    return { ok: false as const, error: 'ללקוח אין מספר טלפון' };
  }

  const token = signShareToken(docs.map((d) => d.id), 14);
  const link = `${env.appBaseUrl.replace(/\/$/, '')}/api/share/${token}`;
  const label =
    docs.length === 1 ? docs[0].label || docs[0].originalName : `${docs.length} מסמכים`;

  logActivity({
    type: 'document-sent',
    clientId,
    caseId: docs[0].caseId,
    summary: `נשלח קישור ל${label} ל${client.fullName} דרך ${REMINDER_LABEL[channel]}`,
  });

  const result = await fireEvent('send-document', {
    documentIds: docs.map((d) => d.id),
    documentCount: docs.length,
    channel,
    clientName: client.fullName,
    clientEmail: client.email || '',
    clientPhone: client.phone || '',
    fileName: docs.length === 1 ? docs[0].originalName : `${docs.length} מסמכים`,
    documentLabel: label,
    link,
    expiresInDays: 14,
    businessName: getConfig().businessName,
  });
  if (!result.ok) return { ok: false as const, error: 'שליחת ההודעה דרך n8n נכשלה' };
  return { ok: true as const, link };
}

/** Single-document convenience wrapper. */
export async function sendDocumentLink(documentId: string, channel: SendChannel) {
  return sendDocumentsLink([documentId], channel);
}

const REMINDER_LABEL: Record<SendChannel, string> = { email: 'אימייל', whatsapp: 'וואטסאפ', sms: 'SMS' };

// ── Payments ─────────────────────────────────────────────────────────────────

export function listPayments(): PaymentRecord[] {
  return readJson<PaymentRecord[]>(dbFile('payments'), []);
}

export function listCasePayments(caseId: string) {
  return listPayments().filter((p) => p.caseId === caseId);
}

export function listClientPayments(clientId: string) {
  return listPayments().filter((p) => p.clientId === clientId);
}

export interface CreatePaymentInput {
  clientId: string;
  caseId?: string;
  amount: number;
  method: PaymentMethod;
  paidAt?: string;
  note?: string;
}

export function createPayment(input: CreatePaymentInput): PaymentRecord | undefined {
  const client = getClient(input.clientId);
  if (!client) return undefined;
  if (!Number.isFinite(input.amount) || input.amount <= 0) return undefined;

  const record: PaymentRecord = {
    id: nextId('PAY', 'payment'),
    clientId: input.clientId,
    caseId: input.caseId,
    amount: Math.round(input.amount * 100) / 100,
    method: input.method,
    paidAt: input.paidAt || nowIso(),
    note: input.note?.trim() || undefined,
    createdAt: nowIso(),
  };

  const payments = listPayments();
  payments.unshift(record);
  writeJson(dbFile('payments'), payments);

  const caseRecord = input.caseId ? getCase(input.caseId) : undefined;
  logActivity({
    type: 'payment-recorded',
    clientId: input.clientId,
    caseId: input.caseId,
    summary: `נרשם תשלום של ₪${record.amount.toLocaleString()} מ${client.fullName}${caseRecord ? ` (תיק "${caseRecord.title}")` : ''}`,
  });
  void fireEvent('payment-recorded', {
    paymentId: record.id,
    clientId: client.id,
    clientName: client.fullName,
    caseId: input.caseId || '',
    caseTitle: caseRecord?.title || '',
    amount: record.amount,
    method: record.method,
    paidAt: record.paidAt,
  });
  return record;
}

export function updatePayment(
  paymentId: string,
  input: { amount?: number; method?: PaymentMethod; paidAt?: string; note?: string; caseId?: string | null },
) {
  const payments = listPayments();
  const index = payments.findIndex((p) => p.id === paymentId);
  if (index === -1) return undefined;
  const record = payments[index];
  const previousAmount = record.amount;

  if (input.amount !== undefined) {
    if (!Number.isFinite(input.amount) || input.amount <= 0) return undefined;
    record.amount = Math.round(input.amount * 100) / 100;
  }
  if (input.method) record.method = input.method;
  if (input.paidAt) record.paidAt = input.paidAt;
  if (input.note !== undefined) record.note = input.note.trim() || undefined;
  if (input.caseId !== undefined) record.caseId = input.caseId || undefined;

  payments[index] = record;
  writeJson(dbFile('payments'), payments);
  logActivity({
    type: 'payment-updated',
    clientId: record.clientId,
    caseId: record.caseId,
    summary:
      input.amount !== undefined && input.amount !== previousAmount
        ? `עודכן תשלום ${record.id}: ₪${previousAmount.toLocaleString()} ← ₪${record.amount.toLocaleString()}`
        : `עודכנו פרטי תשלום ${record.id}`,
  });
  return record;
}

export function deletePayment(paymentId: string) {
  const payments = listPayments();
  const record = payments.find((p) => p.id === paymentId);
  if (!record) return false;
  writeJson(dbFile('payments'), payments.filter((p) => p.id !== paymentId));
  logActivity({
    type: 'payment-deleted',
    clientId: record.clientId,
    caseId: record.caseId,
    summary: `נמחק תשלום של ₪${record.amount.toLocaleString()}`,
  });
  return true;
}

// ── Finance / summaries ──────────────────────────────────────────────────────

export interface CaseFinance {
  caseId: string;
  fee: number;
  paid: number;
  balance: number;
  status: PaymentStatus;
  /** True when the status was set manually rather than computed from payments. */
  overridden: boolean;
}

export function getCaseFinance(
  caseRecord: Pick<CaseRecord, 'id' | 'fee' | 'paymentStatusOverride'>,
  payments?: PaymentRecord[],
): CaseFinance {
  const casePayments = (payments ?? listPayments()).filter((p) => p.caseId === caseRecord.id);
  const paid = casePayments.reduce((sum, p) => sum + p.amount, 0);
  let balance = Math.max(0, Math.round((caseRecord.fee - paid) * 100) / 100);
  let status: PaymentStatus =
    caseRecord.fee <= 0 && paid <= 0 ? 'unpaid' : paid <= 0 ? 'unpaid' : paid < caseRecord.fee ? 'partial' : 'paid';

  const override = caseRecord.paymentStatusOverride;
  if (override === 'paid') {
    status = 'paid';
    balance = 0;
  } else if (override === 'unpaid') {
    status = 'unpaid';
  } else if (override === 'partial') {
    status = 'partial';
  }

  return { caseId: caseRecord.id, fee: caseRecord.fee, paid, balance, status, overridden: Boolean(override) };
}

export function getDashboardSummary(caseFilter?: (caseRecord: CaseRecord) => boolean) {
  const allCases = listCases();
  const cases = caseFilter ? allCases.filter(caseFilter) : allCases;
  const allClients = listClients();
  const clients = caseFilter
    ? allClients.filter((client) => cases.some((c) => c.clientId === client.id))
    : allClients;
  const payments = listPayments();

  const byStage: Record<string, number> = {};
  for (const stage of Object.keys(STAGE_LABELS)) byStage[stage] = 0;
  let missingDocsCases = 0;
  let actionRequired = 0;
  for (const caseRecord of cases) {
    byStage[caseRecord.stage] = (byStage[caseRecord.stage] ?? 0) + 1;
    if (OPEN_STAGES.includes(caseRecord.stage) && countMissingItems(caseRecord) > 0) missingDocsCases += 1;
    if (caseRecord.stage === 'action-required') actionRequired += 1;
  }

  const openCases = cases.filter((c) => c.stage !== 'closed');
  const finance = cases.map((c) => getCaseFinance(c, payments));
  const totalFees = finance.reduce((sum, f) => sum + f.fee, 0);
  const totalPaid = finance.reduce((sum, f) => sum + f.paid, 0);
  const totalOutstanding = finance.reduce((sum, f) => sum + f.balance, 0);

  const troubleCases = cases.filter((c) => c.troubleFlag && c.stage !== 'closed').length;

  return {
    clients: clients.length,
    cases: cases.length,
    openCases: openCases.length,
    closedCases: cases.length - openCases.length,
    missingDocsCases,
    actionRequired,
    troubleCases,
    byStage,
    totalFees,
    totalPaid,
    totalOutstanding,
  };
}

// ── Workers ──────────────────────────────────────────────────────────────────

export function listWorkers(): WorkerRecord[] {
  return readJson<WorkerRecord[]>(dbFile('workers'), []);
}

export function getWorker(workerId: string) {
  return listWorkers().find((w) => w.id === workerId);
}

export function getWorkerByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  return listWorkers().find((w) => w.email.toLowerCase() === normalized);
}

export function createWorker(input: { name: string; email: string; passwordHash: string; phone?: string }): WorkerRecord | undefined {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name || !email || !input.passwordHash) return undefined;
  if (getWorkerByEmail(email)) return undefined;

  const record: WorkerRecord = {
    id: nextId('WRK', 'worker', 100),
    name,
    email,
    phone: input.phone?.trim() || undefined,
    passwordHash: input.passwordHash,
    active: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  const workers = listWorkers();
  workers.unshift(record);
  writeJson(dbFile('workers'), workers);
  logActivity({ type: 'worker-created', summary: `נוסף עובד חדש: ${name} (${email})` });
  return record;
}

export function updateWorker(workerId: string, input: { name?: string; active?: boolean; passwordHash?: string; phone?: string }) {
  const workers = listWorkers();
  const index = workers.findIndex((w) => w.id === workerId);
  if (index === -1) return undefined;
  const record = workers[index];
  if (input.name?.trim()) record.name = input.name.trim();
  if (input.active !== undefined) record.active = input.active;
  if (input.passwordHash) record.passwordHash = input.passwordHash;
  if (input.phone !== undefined) record.phone = input.phone.trim() || undefined;
  record.updatedAt = nowIso();
  workers[index] = record;
  writeJson(dbFile('workers'), workers);
  if (input.active !== undefined) {
    logActivity({ type: 'worker-updated', summary: `עובד ${record.name} ${input.active ? 'הופעל' : 'הושבת'}` });
  }
  return record;
}

// ── Admin accounts (additional admins beyond the root .env admin) ───────────

export function listAdmins(): AdminRecord[] {
  return readJson<AdminRecord[]>(dbFile('admins'), []);
}

export function getAdmin(adminId: string) {
  return listAdmins().find((a) => a.id === adminId);
}

export function getAdminByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  return listAdmins().find((a) => a.email.toLowerCase() === normalized);
}

export function createAdmin(input: { name: string; email: string; passwordHash: string; phone?: string }): AdminRecord | undefined {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name || !email || !input.passwordHash) return undefined;
  // Emails must be unique across admins and workers (both log in with email).
  if (getAdminByEmail(email) || getWorkerByEmail(email)) return undefined;

  const record: AdminRecord = {
    id: nextId('ADM', 'admin', 10),
    name,
    email,
    phone: input.phone?.trim() || undefined,
    passwordHash: input.passwordHash,
    active: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  const admins = listAdmins();
  admins.unshift(record);
  writeJson(dbFile('admins'), admins);
  logActivity({ type: 'admin-created', summary: `נוסף מנהל נוסף: ${name} (${email})` });
  return record;
}

export function updateAdmin(adminId: string, input: { name?: string; active?: boolean; passwordHash?: string; phone?: string }) {
  const admins = listAdmins();
  const index = admins.findIndex((a) => a.id === adminId);
  if (index === -1) return undefined;
  const record = admins[index];
  if (input.name?.trim()) record.name = input.name.trim();
  if (input.active !== undefined) record.active = input.active;
  if (input.passwordHash) record.passwordHash = input.passwordHash;
  if (input.phone !== undefined) record.phone = input.phone.trim() || undefined;
  record.updatedAt = nowIso();
  admins[index] = record;
  writeJson(dbFile('admins'), admins);
  if (input.active !== undefined) {
    logActivity({ type: 'admin-updated', summary: `מנהל ${record.name} ${input.active ? 'הופעל' : 'הושבת'}` });
  }
  return record;
}

// ── Password reset codes (delivered via n8n: email / SMS / WhatsApp) ─────────

interface ResetRecord {
  id: string;
  accountType: 'admin' | 'worker';
  accountId: string;
  email: string;
  codeHash: string;
  expiresAt: string;
  attempts: number;
  createdAt: string;
}

const RESET_TTL_MS = 15 * 60 * 1000;
const RESET_COOLDOWN_MS = 60 * 1000;
const RESET_MAX_ATTEMPTS = 5;

function hashResetCode(code: string) {
  return crypto.createHash('sha256').update(`crmye-reset:${code}`).digest('hex');
}

function readResets(): ResetRecord[] {
  const now = Date.now();
  return readJson<ResetRecord[]>(dbFile('resets'), []).filter((r) => new Date(r.expiresAt).getTime() > now);
}

/**
 * Creates a reset code for the account behind `email` (admin or worker) and
 * fires the crmye/password-reset n8n event with the requested channel.
 * Always behaves the same externally so emails can't be enumerated.
 */
export async function requestPasswordReset(email: string, channel: 'email' | 'sms' | 'whatsapp') {
  const normalized = email.trim().toLowerCase();
  const admin = getAdminByEmail(normalized);
  const worker = admin ? undefined : getWorkerByEmail(normalized);
  const account = admin ?? worker;
  if (!account || !account.active) return { ok: true, sent: false } as const;

  const resets = readResets();
  const recent = resets.find(
    (r) => r.email === normalized && Date.now() - new Date(r.createdAt).getTime() < RESET_COOLDOWN_MS,
  );
  if (recent) return { ok: true, sent: false } as const;

  const code = String(crypto.randomInt(100000, 1000000));
  const record: ResetRecord = {
    id: crypto.randomUUID(),
    accountType: admin ? 'admin' : 'worker',
    accountId: account.id,
    email: normalized,
    codeHash: hashResetCode(code),
    expiresAt: new Date(Date.now() + RESET_TTL_MS).toISOString(),
    attempts: 0,
    createdAt: nowIso(),
  };
  // One active reset per email.
  writeJson(dbFile('resets'), [...resets.filter((r) => r.email !== normalized), record]);

  logActivity({ type: 'password-reset-requested', summary: `התבקש איפוס סיסמה עבור ${account.name}` });
  await fireEvent('password-reset', {
    channel,
    code,
    name: account.name,
    email: account.email,
    phone: account.phone || '',
    expiresMinutes: 15,
  });
  return { ok: true, sent: true } as const;
}

/** Verifies the code and sets the new password hash. Consumes the reset on success. */
export function completePasswordReset(email: string, code: string, newPasswordHash: string) {
  const normalized = email.trim().toLowerCase();
  const resets = readResets();
  const record = resets.find((r) => r.email === normalized);
  if (!record) return { ok: false, error: 'קוד לא תקין או שפג תוקפו' } as const;

  if (record.attempts >= RESET_MAX_ATTEMPTS) {
    writeJson(dbFile('resets'), resets.filter((r) => r.id !== record.id));
    return { ok: false, error: 'יותר מדי ניסיונות — בקש קוד חדש' } as const;
  }

  if (record.codeHash !== hashResetCode(code.trim())) {
    record.attempts += 1;
    writeJson(dbFile('resets'), resets);
    return { ok: false, error: 'קוד שגוי' } as const;
  }

  const updated =
    record.accountType === 'admin'
      ? updateAdmin(record.accountId, { passwordHash: newPasswordHash })
      : updateWorker(record.accountId, { passwordHash: newPasswordHash });
  writeJson(dbFile('resets'), resets.filter((r) => r.id !== record.id));
  if (!updated) return { ok: false, error: 'החשבון לא נמצא' } as const;

  logActivity({ type: 'password-reset-completed', summary: `אופסה סיסמה עבור ${updated.name}` });
  return { ok: true } as const;
}

// ── Session-based visibility ─────────────────────────────────────────────────

export type Viewer = { role: 'admin' } | { role: 'worker'; workerId: string };

export function caseVisibleTo(caseRecord: Pick<CaseRecord, 'openedBy' | 'assignedTo'>, viewer: Viewer) {
  if (viewer.role === 'admin') return true;
  return caseRecord.openedBy === viewer.workerId || caseRecord.assignedTo === viewer.workerId;
}

export function listVisibleCases(viewer: Viewer) {
  const cases = listCases();
  if (viewer.role === 'admin') return cases;
  return cases.filter((c) => caseVisibleTo(c, viewer));
}

export function clientVisibleTo(client: Pick<ClientRecord, 'id' | 'createdBy'>, viewer: Viewer) {
  if (viewer.role === 'admin') return true;
  if (client.createdBy === viewer.workerId) return true;
  return listCases().some((c) => c.clientId === client.id && caseVisibleTo(c, viewer));
}

export function listVisibleClients(viewer: Viewer) {
  const clients = listClients();
  if (viewer.role === 'admin') return clients;
  const visibleClientIds = new Set(listVisibleCases(viewer).map((c) => c.clientId));
  return clients.filter((c) => c.createdBy === viewer.workerId || visibleClientIds.has(c.id));
}

export function documentVisibleTo(doc: Pick<DocumentRecord, 'clientId'>, viewer: Viewer) {
  if (viewer.role === 'admin') return true;
  const client = getClient(doc.clientId);
  return Boolean(client && clientVisibleTo(client, viewer));
}

// ── Tasks & reminders ────────────────────────────────────────────────────────

export function listTasks(): TaskRecord[] {
  return readJson<TaskRecord[]>(dbFile('tasks'), []);
}

export function getTask(taskId: string) {
  return listTasks().find((t) => t.id === taskId);
}

export function taskVisibleTo(task: Pick<TaskRecord, 'assigneeId' | 'createdBy'>, viewer: Viewer) {
  if (viewer.role === 'admin') return true;
  return task.assigneeId === viewer.workerId || task.createdBy === viewer.workerId;
}

export function listVisibleTasks(viewer: Viewer) {
  const tasks = listTasks();
  if (viewer.role === 'admin') return tasks;
  return tasks.filter((t) => taskVisibleTo(t, viewer));
}

/** Contact details for a task assignee ('admin' or a worker id). */
export function assigneeContact(assigneeId: string) {
  if (assigneeId === 'admin') {
    return { id: 'admin', name: 'מנהל', email: env.adminEmail, phone: env.adminPhone || '' };
  }
  const worker = getWorker(assigneeId);
  if (!worker) return { id: assigneeId, name: assigneeId, email: '', phone: '' };
  return { id: worker.id, name: worker.name, email: worker.email, phone: worker.phone || '' };
}

export interface CreateTaskInput {
  title: string;
  notes?: string;
  dueAt?: string;
  remindAt?: string;
  reminderChannels?: ReminderChannel[];
  priority?: TaskPriority;
  assigneeId?: string;
  clientId?: string;
  caseId?: string;
  createdBy: string;
}

export function createTask(input: CreateTaskInput): TaskRecord | undefined {
  const title = input.title.trim();
  if (!title) return undefined;

  const record: TaskRecord = {
    id: nextId('TASK', 'task'),
    title,
    notes: input.notes?.trim() || undefined,
    dueAt: input.dueAt || undefined,
    remindAt: input.remindAt || undefined,
    reminderChannels: input.reminderChannels?.filter((c) => c === 'email' || c === 'whatsapp') ?? [],
    priority: input.priority ?? 'normal',
    assigneeId: input.assigneeId || 'admin',
    clientId: input.clientId || undefined,
    caseId: input.caseId || undefined,
    status: 'open',
    createdBy: input.createdBy,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  const tasks = listTasks();
  tasks.unshift(record);
  writeJson(dbFile('tasks'), tasks);

  const assignee = assigneeContact(record.assigneeId);
  logActivity({
    type: 'task-created',
    clientId: record.clientId,
    caseId: record.caseId,
    summary: `נוצרה משימה: "${record.title}" (${assignee.name})`,
  });
  if (record.assigneeId !== record.createdBy) {
    void fireEvent('task-assigned', {
      taskId: record.id,
      title: record.title,
      notes: record.notes || '',
      dueAt: record.dueAt || '',
      priority: record.priority,
      assigneeId: assignee.id,
      assigneeName: assignee.name,
      assigneeEmail: assignee.email,
      assigneePhone: assignee.phone,
      caseId: record.caseId || '',
      clientId: record.clientId || '',
    });
  }
  return record;
}

export interface UpdateTaskInput {
  title?: string;
  notes?: string;
  dueAt?: string | null;
  remindAt?: string | null;
  reminderChannels?: ReminderChannel[];
  priority?: TaskPriority;
  assigneeId?: string;
  status?: 'open' | 'done';
}

export function updateTask(taskId: string, input: UpdateTaskInput) {
  const tasks = listTasks();
  const index = tasks.findIndex((t) => t.id === taskId);
  if (index === -1) return undefined;
  const record = tasks[index];

  if (input.title?.trim()) record.title = input.title.trim();
  if (input.notes !== undefined) record.notes = input.notes.trim() || undefined;
  if (input.dueAt !== undefined) record.dueAt = input.dueAt || undefined;
  if (input.remindAt !== undefined) {
    record.remindAt = input.remindAt || undefined;
    // Rescheduling a reminder re-arms it.
    record.reminderSentAt = undefined;
  }
  if (input.reminderChannels) record.reminderChannels = input.reminderChannels;
  if (input.priority) record.priority = input.priority;
  if (input.assigneeId) record.assigneeId = input.assigneeId;
  if (input.status && input.status !== record.status) {
    record.status = input.status;
    record.completedAt = input.status === 'done' ? nowIso() : undefined;
    logActivity({
      type: input.status === 'done' ? 'task-completed' : 'task-reopened',
      clientId: record.clientId,
      caseId: record.caseId,
      summary: input.status === 'done' ? `הושלמה משימה: "${record.title}"` : `נפתחה מחדש משימה: "${record.title}"`,
    });
  }
  record.updatedAt = nowIso();
  tasks[index] = record;
  writeJson(dbFile('tasks'), tasks);
  return record;
}

export function deleteTask(taskId: string) {
  const tasks = listTasks();
  const record = tasks.find((t) => t.id === taskId);
  if (!record) return false;
  writeJson(dbFile('tasks'), tasks.filter((t) => t.id !== taskId));
  return true;
}

/**
 * Open tasks whose reminder time has arrived and was not sent yet.
 * Used by the n8n polling workflow; with markSent the tasks are flagged so
 * they are returned exactly once.
 */
export function listDueReminders(markSent: boolean) {
  const tasks = listTasks();
  const now = Date.now();
  const due = tasks.filter(
    (t) => t.status === 'open' && t.remindAt && !t.reminderSentAt && new Date(t.remindAt).getTime() <= now,
  );
  if (markSent && due.length) {
    for (const task of due) task.reminderSentAt = nowIso();
    writeJson(dbFile('tasks'), tasks);
  }
  return due.map((task) => {
    const assignee = assigneeContact(task.assigneeId);
    const client = task.clientId ? getClient(task.clientId) : undefined;
    const caseRecord = task.caseId ? getCase(task.caseId) : undefined;
    return {
      taskId: task.id,
      title: task.title,
      notes: task.notes || '',
      dueAt: task.dueAt || '',
      remindAt: task.remindAt || '',
      priority: task.priority,
      channels: task.reminderChannels,
      assigneeName: assignee.name,
      assigneeEmail: assignee.email,
      assigneePhone: assignee.phone,
      clientName: client?.fullName || '',
      caseTitle: caseRecord?.title || '',
      caseId: task.caseId || '',
      link: `${env.appBaseUrl}/tasks`,
    };
  });
}

// ── Settings (blank rent-contract template, etc.) ────────────────────────────

export interface AppSettings {
  blankContract?: {
    fileName: string;
    originalName: string;
    mimeType: string;
    uploadedAt: string;
  };
}

function templatesFolder() {
  return path.join(dataRoot(), 'templates');
}

export function getSettings(): AppSettings {
  return readJson<AppSettings>(dbFile('settings'), {});
}

function saveSettings(settings: AppSettings) {
  writeJson(dbFile('settings'), settings);
}

// ── App configuration (fully editable from the Settings page) ────────────────

export function getConfig(): AppConfig {
  const saved = readJson<Partial<AppConfig>>(dbFile('config'), {});
  return {
    ...DEFAULT_APP_CONFIG,
    ...saved,
    stageLabels: { ...DEFAULT_APP_CONFIG.stageLabels, ...(saved.stageLabels ?? {}) },
    companies: saved.companies?.length ? saved.companies : DEFAULT_APP_CONFIG.companies,
    documentTemplates: saved.documentTemplates?.length ? saved.documentTemplates : DEFAULT_APP_CONFIG.documentTemplates,
    paymentMethods: saved.paymentMethods?.length ? saved.paymentMethods : DEFAULT_APP_CONFIG.paymentMethods,
    offices: saved.offices?.length ? saved.offices : DEFAULT_APP_CONFIG.offices,
  };
}

export function saveConfig(patch: Partial<AppConfig>): AppConfig {
  const saved = readJson<Partial<AppConfig>>(dbFile('config'), {});
  const next: Partial<AppConfig> = { ...saved, ...patch };
  if (patch.stageLabels) {
    next.stageLabels = { ...(saved.stageLabels ?? {}), ...patch.stageLabels };
  }
  writeJson(dbFile('config'), next);
  logActivity({ type: 'config-updated', summary: 'עודכנו הגדרות המערכת' });
  return getConfig();
}

/** Resolve a checklist-template label from config, falling back to the built-in list. */
function templateLabel(code: string): string | undefined {
  return (
    getConfig().documentTemplates.find((t) => t.code === code)?.label ??
    documentTemplates.find((t) => t.code === code)?.label
  );
}

export function saveBlankContract(input: { originalName: string; mimeType: string; buffer: Buffer }) {
  const settings = getSettings();
  // Remove the previous template file, if any.
  if (settings.blankContract) {
    const oldPath = path.join(templatesFolder(), settings.blankContract.fileName);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
  const safeName = `blank-contract-${Date.now()}${path.extname(input.originalName) || ''}`;
  fs.mkdirSync(templatesFolder(), { recursive: true });
  fs.writeFileSync(path.join(templatesFolder(), safeName), input.buffer);
  settings.blankContract = {
    fileName: safeName,
    originalName: path.basename(input.originalName),
    mimeType: input.mimeType || 'application/octet-stream',
    uploadedAt: nowIso(),
  };
  saveSettings(settings);
  logActivity({ type: 'settings-updated', summary: 'הועלה טופס חוזה שכירות ריק חדש' });
  return settings.blankContract;
}

export function readBlankContract() {
  const settings = getSettings();
  if (!settings.blankContract) return undefined;
  const filePath = path.join(templatesFolder(), settings.blankContract.fileName);
  if (!fs.existsSync(filePath)) return undefined;
  return { meta: settings.blankContract, buffer: fs.readFileSync(filePath) };
}

export function deleteBlankContract() {
  const settings = getSettings();
  if (!settings.blankContract) return false;
  const filePath = path.join(templatesFolder(), settings.blankContract.fileName);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  delete settings.blankContract;
  saveSettings(settings);
  return true;
}
