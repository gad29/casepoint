import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  countMissingItems,
  documentTemplates,
  officeDisplayName,
  OPEN_STAGES,
  STAGE_LABELS,
  type ActivityRecord,
  type CaseKind,
  type CaseRecord,
  type CaseStage,
  type ChecklistItem,
  type ChecklistStatus,
  type ClientRecord,
  type DocumentRecord,
  type GovernmentOffice,
  type OperatingCompany,
  type PaymentMethod,
  type PaymentRecord,
  type PaymentStatus,
  type WorkerRecord,
} from '@/data/domain';
import { env } from '@/lib/env';
import { triggerN8n } from '@/lib/n8n';

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
  logger(`[CasePoint Store] ${message}${payload}`);
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
    const result = await triggerN8n(`casepoint/${event}`, { event, ...payload, firedAt: nowIso() });
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

// ── Cases ────────────────────────────────────────────────────────────────────

export function listCases(): CaseRecord[] {
  return readJson<CaseRecord[]>(dbFile('cases'), []);
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
    const template = documentTemplates.find((t) => t.code === code);
    if (template && !checklist.some((item) => item.code === template.code)) {
      checklist.push({ code: template.code, label: template.label, status: 'missing', documentIds: [], updatedAt: nowIso() });
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
  /** Worker id to assign the case to; empty string clears the assignment. */
  assignedTo?: string;
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

  const template = code ? documentTemplates.find((t) => t.code === code) : undefined;
  const item: ChecklistItem = {
    code: template?.code ?? `custom-${crypto.randomUUID().slice(0, 8)}`,
    label: template?.label ?? label.trim(),
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
  const cases = listCases();
  const index = cases.findIndex((c) => c.id === caseId);
  if (index === -1) return false;
  const caseRecord = cases[index];
  const before = caseRecord.checklist.length;
  caseRecord.checklist = caseRecord.checklist.filter((i) => i.code !== code);
  if (caseRecord.checklist.length === before) return false;
  caseRecord.updatedAt = nowIso();
  cases[index] = caseRecord;
  writeJson(dbFile('cases'), cases);
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
  const base = path.basename(name).replace(/[\\/:*?"<>| -]/g, '_').trim();
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
}

export function getCaseFinance(caseRecord: Pick<CaseRecord, 'id' | 'fee'>, payments?: PaymentRecord[]): CaseFinance {
  const casePayments = (payments ?? listPayments()).filter((p) => p.caseId === caseRecord.id);
  const paid = casePayments.reduce((sum, p) => sum + p.amount, 0);
  const balance = Math.max(0, Math.round((caseRecord.fee - paid) * 100) / 100);
  const status: PaymentStatus = caseRecord.fee <= 0 && paid <= 0 ? 'unpaid' : paid <= 0 ? 'unpaid' : paid < caseRecord.fee ? 'partial' : 'paid';
  return { caseId: caseRecord.id, fee: caseRecord.fee, paid, balance, status };
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

export function createWorker(input: { name: string; email: string; passwordHash: string }): WorkerRecord | undefined {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name || !email || !input.passwordHash) return undefined;
  if (getWorkerByEmail(email)) return undefined;

  const record: WorkerRecord = {
    id: nextId('WRK', 'worker', 100),
    name,
    email,
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

export function updateWorker(workerId: string, input: { name?: string; active?: boolean; passwordHash?: string }) {
  const workers = listWorkers();
  const index = workers.findIndex((w) => w.id === workerId);
  if (index === -1) return undefined;
  const record = workers[index];
  if (input.name?.trim()) record.name = input.name.trim();
  if (input.active !== undefined) record.active = input.active;
  if (input.passwordHash) record.passwordHash = input.passwordHash;
  record.updatedAt = nowIso();
  workers[index] = record;
  writeJson(dbFile('workers'), workers);
  if (input.active !== undefined) {
    logActivity({ type: 'worker-updated', summary: `עובד ${record.name} ${input.active ? 'הופעל' : 'הושבת'}` });
  }
  return record;
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
