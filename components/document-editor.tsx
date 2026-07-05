'use client';

/**
 * In-app document editor for images and PDFs.
 *
 * Model: the original file is rendered to canvases; the user draws/types on a
 * transparent overlay per page. Saving flattens the overlay into a new file
 * (PNG for images, the original PDF with the overlay stamped per page via
 * pdf-lib) and stores it as a NEW document version — the original is kept.
 * Rendering text as pixels also sidesteps PDF Hebrew font embedding entirely.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type TextAnnotation = { type: 'text'; x: number; y: number; text: string; size: number; color: string };
type PathAnnotation = { type: 'path'; points: { x: number; y: number }[]; color: string; width: number; alpha: number };
type Annotation = TextAnnotation | PathAnnotation;

type Tool = 'pen' | 'highlight' | 'text';

export type EditorDocument = {
  id: string;
  clientId: string;
  caseId?: string;
  originalName: string;
  label?: string;
  mimeType: string;
};

const COLORS = ['#111827', '#1d4ed8', '#dc2626', '#059669', '#f59e0b', '#ffffff'];

function drawAnnotations(ctx: CanvasRenderingContext2D, annotations: Annotation[]) {
  for (const a of annotations) {
    if (a.type === 'path') {
      if (a.points.length < 2) continue;
      ctx.save();
      ctx.globalAlpha = a.alpha;
      ctx.strokeStyle = a.color;
      ctx.lineWidth = a.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(a.points[0].x, a.points[0].y);
      for (const p of a.points.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.save();
      ctx.fillStyle = a.color;
      ctx.font = `${a.size}px "Plus Jakarta Sans", "Segoe UI", Arial, sans-serif`;
      ctx.textBaseline = 'top';
      ctx.direction = 'rtl';
      ctx.textAlign = 'right';
      ctx.fillText(a.text, a.x, a.y);
      ctx.restore();
    }
  }
}

type PendingText = { pageIndex: number; x: number; y: number; cssLeft: number; cssTop: number };

type PageState = {
  width: number;
  height: number;
  /** For PDFs: pdf page size in PDF points, used when stamping via pdf-lib. */
  pdfWidth?: number;
  pdfHeight?: number;
};

export function DocumentEditor({ doc }: { doc: EditorDocument }) {
  const router = useRouter();
  const isPdf = doc.mimeType === 'application/pdf' || doc.originalName.toLowerCase().endsWith('.pdf');

  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(COLORS[1]);
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [fontSize, setFontSize] = useState(22);
  const [pages, setPages] = useState<PageState[]>([]);
  const [annotations, setAnnotations] = useState<Record<number, Annotation[]>>({});
  const [pendingText, setPendingText] = useState<PendingText | null>(null);
  const [pendingValue, setPendingValue] = useState('');
  const [rotation, setRotation] = useState(0); // images only
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState('');

  const baseCanvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const overlayCanvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const originalBytesRef = useRef<ArrayBuffer | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const drawingRef = useRef<{ pageIndex: number; annotation: PathAnnotation } | null>(null);

  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;

  const redrawOverlay = useCallback((pageIndex: number) => {
    const canvas = overlayCanvasRefs.current[pageIndex];
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawAnnotations(ctx, annotationsRef.current[pageIndex] ?? []);
    const active = drawingRef.current;
    if (active && active.pageIndex === pageIndex) {
      drawAnnotations(ctx, [active.annotation]);
    }
  }, []);

  // ── Load and render the source document ────────────────────────────────────

  const renderImage = useCallback((img: HTMLImageElement, rot: number) => {
    const rotated = rot % 180 !== 0;
    const width = rotated ? img.naturalHeight : img.naturalWidth;
    const height = rotated ? img.naturalWidth : img.naturalHeight;
    setPages([{ width, height }]);
    // Draw after state applies and canvases exist.
    requestAnimationFrame(() => {
      const canvas = baseCanvasRefs.current[0];
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.save();
      ctx.clearRect(0, 0, width, height);
      ctx.translate(width / 2, height / 2);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      ctx.restore();
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/documents/${doc.id}`);
        if (!res.ok) throw new Error('הקובץ לא נמצא');
        const bytes = await res.arrayBuffer();
        originalBytesRef.current = bytes;

        if (isPdf) {
          const pdfjs = await import('pdfjs-dist');
          pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
          const pdf = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
          if (cancelled) return;

          const scale = 1.7;
          const pageStates: PageState[] = [];
          const viewports: { width: number; height: number }[] = [];
          for (let i = 1; i <= pdf.numPages; i += 1) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale });
            pageStates.push({
              width: Math.floor(viewport.width),
              height: Math.floor(viewport.height),
              pdfWidth: page.view[2] - page.view[0],
              pdfHeight: page.view[3] - page.view[1],
            });
            viewports.push({ width: viewport.width, height: viewport.height });
          }
          if (cancelled) return;
          setPages(pageStates);

          // Render after canvases mount.
          requestAnimationFrame(async () => {
            for (let i = 1; i <= pdf.numPages; i += 1) {
              if (cancelled) return;
              const canvas = baseCanvasRefs.current[i - 1];
              if (!canvas) continue;
              const ctx = canvas.getContext('2d');
              if (!ctx) continue;
              const page = await pdf.getPage(i);
              const viewport = page.getViewport({ scale });
              await page.render({ canvasContext: ctx, viewport }).promise;
            }
            if (!cancelled) setLoading(false);
          });
        } else {
          const blob = new Blob([bytes], { type: doc.mimeType });
          const url = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => {
            if (cancelled) return;
            imageRef.current = img;
            renderImage(img, 0);
            setLoading(false);
            URL.revokeObjectURL(url);
          };
          img.onerror = () => {
            if (!cancelled) setError('טעינת התמונה נכשלה');
            URL.revokeObjectURL(url);
          };
          img.src = url;
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'טעינת הקובץ נכשלה');
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [doc.id, doc.mimeType, isPdf, renderImage]);

  // Redraw overlays whenever annotations change.
  useEffect(() => {
    for (let i = 0; i < pages.length; i += 1) redrawOverlay(i);
  }, [annotations, pages.length, redrawOverlay]);

  // ── Pointer interactions ────────────────────────────────────────────────────

  function canvasPoint(event: React.PointerEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function onPointerDown(pageIndex: number) {
    return (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = overlayCanvasRefs.current[pageIndex];
      if (!canvas) return;
      const point = canvasPoint(event, canvas);

      if (tool === 'text') {
        const rect = canvas.getBoundingClientRect();
        commitPendingText();
        setPendingText({
          pageIndex,
          x: point.x,
          y: point.y,
          cssLeft: event.clientX - rect.left,
          cssTop: event.clientY - rect.top,
        });
        setPendingValue('');
        return;
      }

      canvas.setPointerCapture(event.pointerId);
      drawingRef.current = {
        pageIndex,
        annotation: {
          type: 'path',
          points: [point],
          color,
          width: tool === 'highlight' ? strokeWidth * 5 : strokeWidth,
          alpha: tool === 'highlight' ? 0.35 : 1,
        },
      };
    };
  }

  function onPointerMove(pageIndex: number) {
    return (event: React.PointerEvent<HTMLCanvasElement>) => {
      const active = drawingRef.current;
      if (!active || active.pageIndex !== pageIndex) return;
      const canvas = overlayCanvasRefs.current[pageIndex];
      if (!canvas) return;
      active.annotation.points.push(canvasPoint(event, canvas));
      redrawOverlay(pageIndex);
    };
  }

  function onPointerUp(pageIndex: number) {
    return () => {
      const active = drawingRef.current;
      if (!active || active.pageIndex !== pageIndex) return;
      drawingRef.current = null;
      if (active.annotation.points.length > 1) {
        setAnnotations((prev) => ({
          ...prev,
          [pageIndex]: [...(prev[pageIndex] ?? []), active.annotation],
        }));
      } else {
        redrawOverlay(pageIndex);
      }
    };
  }

  function commitPendingText() {
    setPendingText((current) => {
      if (current && pendingValue.trim()) {
        const annotation: TextAnnotation = {
          type: 'text',
          x: current.x,
          y: current.y,
          text: pendingValue.trim(),
          size: fontSize,
          color,
        };
        setAnnotations((prev) => ({
          ...prev,
          [current.pageIndex]: [...(prev[current.pageIndex] ?? []), annotation],
        }));
      }
      return null;
    });
    setPendingValue('');
  }

  function undo() {
    setAnnotations((prev) => {
      const next = { ...prev };
      // Undo the most recently updated page (last annotation overall is unknown;
      // simple approach: remove from the last page that has annotations).
      for (let i = pages.length - 1; i >= 0; i -= 1) {
        const list = next[i];
        if (list && list.length) {
          next[i] = list.slice(0, -1);
          return next;
        }
      }
      return prev;
    });
  }

  function clearAll() {
    if (!window.confirm('לנקות את כל הסימונים והטקסטים שהוספת?')) return;
    setAnnotations({});
  }

  function rotate() {
    if (!imageRef.current) return;
    const hasAnnotations = Object.values(annotations).some((list) => list.length > 0);
    if (hasAnnotations && !window.confirm('סיבוב התמונה ינקה את הסימונים שהוספת. להמשיך?')) return;
    const next = (rotation + 90) % 360;
    setRotation(next);
    setAnnotations({});
    renderImage(imageRef.current, next);
  }

  // ── Saving ──────────────────────────────────────────────────────────────────

  async function buildEditedFile(): Promise<{ blob: Blob; name: string }> {
    if (!isPdf) {
      const base = baseCanvasRefs.current[0];
      const overlay = overlayCanvasRefs.current[0];
      if (!base || !overlay) throw new Error('Canvas not ready');
      const merged = document.createElement('canvas');
      merged.width = base.width;
      merged.height = base.height;
      const ctx = merged.getContext('2d')!;
      ctx.drawImage(base, 0, 0);
      ctx.drawImage(overlay, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => merged.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('יצירת התמונה נכשלה');
      const name = doc.originalName.replace(/\.[^.]+$/, '') + '-edited.png';
      return { blob, name };
    }

    const original = originalBytesRef.current;
    if (!original) throw new Error('Original bytes missing');
    const { PDFDocument } = await import('pdf-lib');
    const pdfDoc = await PDFDocument.load(original.slice(0));
    const pdfPages = pdfDoc.getPages();

    for (let i = 0; i < pdfPages.length; i += 1) {
      const pageAnnotations = annotations[i];
      if (!pageAnnotations || pageAnnotations.length === 0) continue;
      const overlay = overlayCanvasRefs.current[i];
      if (!overlay) continue;
      const pngDataUrl = overlay.toDataURL('image/png');
      const pngImage = await pdfDoc.embedPng(pngDataUrl);
      const page = pdfPages[i];
      page.drawImage(pngImage, {
        x: 0,
        y: 0,
        width: page.getWidth(),
        height: page.getHeight(),
      });
    }

    const bytes = await pdfDoc.save();
    const arrayBuffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(arrayBuffer).set(bytes);
    const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
    const name = doc.originalName.replace(/\.pdf$/i, '') + '-edited.pdf';
    return { blob, name };
  }

  async function save() {
    commitPendingText();
    setSaving(true);
    setError('');
    try {
      const { blob, name } = await buildEditedFile();
      const form = new FormData();
      form.append('file', new File([blob], name, { type: blob.type }));
      const res = await fetch(`/api/documents/${doc.id}/edited`, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'השמירה נכשלה');
      setSavedId(data.data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'השמירה נכשלה');
    } finally {
      setSaving(false);
    }
  }

  function goBack() {
    if (doc.caseId) router.push(`/cases/${doc.caseId}` as never);
    else router.push(`/clients/${doc.clientId}` as never);
  }

  const hasChanges = Object.values(annotations).some((list) => list.length > 0);

  return (
    <div className="editor-root" dir="rtl">
      <div className="editor-toolbar">
        <button type="button" className="button button-secondary button-compact" onClick={goBack}>
          → חזרה
        </button>
        <strong className="editor-doc-name">{doc.label || doc.originalName}</strong>

        <div className="editor-tools">
          <button type="button" className={`editor-tool ${tool === 'pen' ? 'active' : ''}`} onClick={() => setTool('pen')} title="עט">
            ✏️ עט
          </button>
          <button type="button" className={`editor-tool ${tool === 'highlight' ? 'active' : ''}`} onClick={() => setTool('highlight')} title="מדגש">
            🖍️ מדגש
          </button>
          <button type="button" className={`editor-tool ${tool === 'text' ? 'active' : ''}`} onClick={() => setTool('text')} title="הוספת טקסט — לחץ על המסמך">
            🅰️ טקסט
          </button>
        </div>

        <div className="editor-colors">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`editor-color ${color === c ? 'active' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              title={c}
            />
          ))}
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="editor-color-picker" title="צבע מותאם" />
        </div>

        {tool === 'text' ? (
          <label className="editor-size">
            גודל
            <input type="range" min={12} max={64} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} />
          </label>
        ) : (
          <label className="editor-size">
            עובי
            <input type="range" min={1} max={12} value={strokeWidth} onChange={(e) => setStrokeWidth(Number(e.target.value))} />
          </label>
        )}

        <div className="editor-actions">
          {!isPdf && (
            <button type="button" className="button button-secondary button-compact" onClick={rotate}>
              ⟳ סיבוב
            </button>
          )}
          <button type="button" className="button button-secondary button-compact" onClick={undo} disabled={!hasChanges}>
            ↩ בטל
          </button>
          <button type="button" className="button button-secondary button-compact" onClick={clearAll} disabled={!hasChanges}>
            🗑 נקה
          </button>
          <button type="button" className="button button-compact" onClick={save} disabled={saving || (!hasChanges && rotation === 0)}>
            {saving ? 'שומר…' : '💾 שמור גרסה ערוכה'}
          </button>
        </div>
      </div>

      {error && <p className="form-error" style={{ padding: '0 20px' }}>{error}</p>}

      {savedId && (
        <div className="editor-saved-banner">
          ✓ הגרסה הערוכה נשמרה בתיקיית הלקוח (המקור נשמר ללא שינוי).
          <button type="button" className="button button-compact" onClick={goBack} style={{ marginInlineStart: 12 }}>
            חזרה לתיק
          </button>
        </div>
      )}

      <div className="editor-pages">
        {loading && <div className="card muted" style={{ padding: 24, margin: '20px auto', maxWidth: 400, textAlign: 'center' }}>טוען את המסמך…</div>}
        {pages.map((page, index) => (
          <div key={index} className="editor-page" style={{ aspectRatio: `${page.width} / ${page.height}` }}>
            <canvas
              ref={(el) => {
                baseCanvasRefs.current[index] = el;
              }}
              width={page.width}
              height={page.height}
              className="editor-canvas-base"
            />
            <canvas
              ref={(el) => {
                overlayCanvasRefs.current[index] = el;
              }}
              width={page.width}
              height={page.height}
              className={`editor-canvas-overlay ${tool === 'text' ? 'text-cursor' : 'draw-cursor'}`}
              onPointerDown={onPointerDown(index)}
              onPointerMove={onPointerMove(index)}
              onPointerUp={onPointerUp(index)}
              onPointerLeave={onPointerUp(index)}
            />
            {pendingText && pendingText.pageIndex === index && (
              <input
                autoFocus
                className="editor-text-input"
                style={{ left: pendingText.cssLeft, top: pendingText.cssTop, fontSize: 15, color }}
                value={pendingValue}
                placeholder="הקלד טקסט…"
                onChange={(e) => setPendingValue(e.target.value)}
                onBlur={commitPendingText}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitPendingText();
                  if (e.key === 'Escape') {
                    setPendingText(null);
                    setPendingValue('');
                  }
                }}
              />
            )}
            {pages.length > 1 && <div className="editor-page-number">עמוד {index + 1} מתוך {pages.length}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
