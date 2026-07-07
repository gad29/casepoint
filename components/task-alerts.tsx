'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type AlertTask = {
  id: string;
  title: string;
  dueAt?: string;
  priority: 'normal' | 'high' | 'urgent';
  assigneeName: string;
  clientName?: string;
  status: 'open' | 'done';
};

const DISMISS_KEY = 'casepoint-dismissed-alerts';
const SOON_MS = 60 * 60 * 1000; // due within the next hour

function getDismissed(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(DISMISS_KEY) || '[]');
  } catch {
    return [];
  }
}

/** Pop-up toasts for urgent / due tasks. Polls every minute; dismissals last for the session. */
export function TaskAlerts() {
  const [alerts, setAlerts] = useState<AlertTask[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch('/api/tasks');
        const data = await res.json();
        if (!data.ok || cancelled) return;
        const now = Date.now();
        const dismissed = getDismissed();
        const due = (data.data as AlertTask[]).filter((task) => {
          if (task.status !== 'open' || dismissed.includes(task.id)) return false;
          if (!task.dueAt) return false;
          const dueTime = new Date(task.dueAt).getTime();
          // Urgent: pop up an hour ahead; anything else only once overdue.
          if (task.priority === 'urgent') return dueTime - now <= SOON_MS;
          if (task.priority === 'high') return dueTime <= now;
          return false;
        });
        setAlerts(due.slice(0, 4));
      } catch {
        /* offline — try again next tick */
      }
    }

    void check();
    const interval = setInterval(check, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  function dismiss(taskId: string) {
    const dismissed = getDismissed();
    sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...dismissed, taskId]));
    setAlerts((prev) => prev.filter((a) => a.id !== taskId));
  }

  async function markDone(taskId: string) {
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    });
    setAlerts((prev) => prev.filter((a) => a.id !== taskId));
  }

  if (!alerts.length) return null;

  return (
    <div className="task-alerts" dir="rtl">
      {alerts.map((task) => {
        const overdue = task.dueAt && new Date(task.dueAt).getTime() < Date.now();
        return (
          <div key={task.id} className="task-alert">
            <span className="task-alert-icon">{task.priority === 'urgent' ? '🚨' : '⏰'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="task-alert-title">{task.title}</div>
              <div className="task-alert-meta">
                {overdue ? 'עבר מועד היעד!' : 'מתקרב מועד היעד'}
                {task.dueAt && ` · ${new Date(task.dueAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`}
                {task.clientName && ` · ${task.clientName}`}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" className="doc-action-btn approve" onClick={() => markDone(task.id)}>✓ בוצע</button>
                <Link className="doc-action-btn" href={'/tasks' as never}>לכל המשימות</Link>
              </div>
            </div>
            <button type="button" className="task-alert-close" onClick={() => dismiss(task.id)} title="סגור">✕</button>
          </div>
        );
      })}
    </div>
  );
}
