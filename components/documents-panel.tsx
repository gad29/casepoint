'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';

export type DocumentItem = {
  id: string;
  clientId: string;
  caseId?: string;
  fileName: string;
  originalName: string;
  label?: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  editedFromId?: string;
};

type Props = {
  clientId: string;
  documents: DocumentItem[];
  /** When set, uploads are attached to this case. */
  caseId?: string;
  /** Checklist items available for linking an upload (case page). */
  checklistOptions?: { code: string; label: string }[];
  onChanged: () => void;
};

function formatSize(bytes: number) {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fileEmoji(mimeType: string, name: string) {
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) return '📄';
  if (mimeType.includes('word') || /\.(docx?|rtf)$/i.test(name)) return '📝';
  if (mimeType.includes('sheet') || /\.(xlsx?|csv)$/i.test(name)) return '📊';
  return '📎';
}

export function isEditableDocument(doc: Pick<DocumentItem, 'mimeType' | 'originalName'>) {
  return (
    doc.mimeType.startsWith('image/') ||
    doc.mimeType === 'application/pdf' ||
    doc.originalName.toLowerCase().endsWith('.pdf')
  );
}

export function DocumentsPanel({ clientId, documents, caseId, checklistOptions, onChanged }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragover, setDragover] = useState(false);
  const [error, setError] = useState('');
  const [checklistCode, setChecklistCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      for (const file of list) form.append('file', file);
      if (caseId) form.append('caseId', caseId);
      if (checklistCode) form.append('checklistCode', checklistCode);
      const res = await fetch(`/api/clients/${clientId}/documents`, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'ההעלאה נכשלה');
        return;
      }
      setChecklistCode('');
      onChanged();
    } catch {
      setError('שגיאת תקשורת בהעלאה');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function renameDocument(doc: DocumentItem) {
    const label = window.prompt('שם תצוגה למסמך:', doc.label || doc.originalName);
    if (label === null) return;
    setBusy(doc.id);
    try {
      await fetch(`/api/documents/${doc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      });
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  async function deleteDocument(doc: DocumentItem) {
    if (!window.confirm(`למחוק את המסמך "${doc.label || doc.originalName}"? הקובץ יימחק מהתיקייה.`)) return;
    setBusy(doc.id);
    try {
      await fetch(`/api/documents/${doc.id}`, { method: 'DELETE' });
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div
        className={`upload-zone ${dragover ? 'dragover' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragover(true);
        }}
        onDragLeave={() => setDragover(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragover(false);
          void uploadFiles(e.dataTransfer.files);
        }}
      >
        <div className="upload-zone-icon">📁</div>
        <div>גרור לכאן קבצים או</div>
        <label className="upload-zone-label">
          בחר קבצים מהמחשב
          <input
            ref={inputRef}
            className="upload-file-input"
            type="file"
            multiple
            onChange={(e) => e.target.files && void uploadFiles(e.target.files)}
          />
        </label>
        {checklistOptions && checklistOptions.length > 0 && (
          <div className="field" style={{ maxWidth: 320, margin: '14px auto 0' }}>
            <select value={checklistCode} onChange={(e) => setChecklistCode(e.target.value)}>
              <option value="">שיוך למסמך נדרש (אופציונלי)…</option>
              {checklistOptions.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="upload-zone-hint">
          {uploading
            ? 'מעלה…'
            : 'PDF, תמונות, וורד — כל סוג קובץ. אפשר לבחור או לגרור כמה קבצים בבת אחת (למשל ת"ז של שני בני הזוג). הקבצים נשמרים בתיקיית הלקוח.'}
        </div>
      </div>
      {error && <p className="form-error" style={{ marginTop: 10 }}>{error}</p>}

      {documents.length === 0 ? (
        <p className="muted" style={{ marginTop: 16 }}>אין עדיין מסמכים בתיקייה.</p>
      ) : (
        <div style={{ marginTop: 16 }}>
          {documents.map((doc) => (
            <div key={doc.id} className="doc-row">
              <span style={{ fontSize: 20 }}>{fileEmoji(doc.mimeType, doc.originalName)}</span>
              <div className="doc-name">
                <a href={`/api/documents/${doc.id}`} target="_blank" rel="noreferrer" className="text-link">
                  {doc.label || doc.originalName}
                </a>
                <span className="muted" style={{ display: 'block', fontSize: 11 }}>
                  {formatSize(doc.size)} · {formatDate(doc.uploadedAt)}
                  {doc.editedFromId && ' · גרסה ערוכה'}
                </span>
              </div>
              <div className="doc-actions">
                {isEditableDocument(doc) && (
                  <Link className="doc-action-btn approve" href={`/documents/${doc.id}/edit` as never}>
                    ✏️ עריכה
                  </Link>
                )}
                <a className="doc-action-btn" href={`/api/documents/${doc.id}?download=1`}>
                  ⬇ הורדה
                </a>
                <button type="button" className="doc-action-btn" disabled={busy === doc.id} onClick={() => renameDocument(doc)}>
                  שינוי שם
                </button>
                <button type="button" className="doc-action-btn reject" disabled={busy === doc.id} onClick={() => deleteDocument(doc)}>
                  מחיקה
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
