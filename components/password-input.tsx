'use client';

import { useState } from 'react';

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  autoFocus?: boolean;
  autoComplete?: string;
};

/** Password field with a show/hide (eye) toggle. */
export function PasswordInput({ value, onChange, id, placeholder, required, minLength, autoFocus, autoComplete }: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-wrap">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        dir="ltr"
        style={{ textAlign: 'right' }}
      />
      <button
        type="button"
        className="password-eye"
        onClick={() => setVisible((v) => !v)}
        title={visible ? 'הסתר סיסמה' : 'הצג סיסמה'}
        aria-label={visible ? 'הסתר סיסמה' : 'הצג סיסמה'}
        tabIndex={-1}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}
