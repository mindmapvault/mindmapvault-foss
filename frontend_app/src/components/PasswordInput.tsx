import { useId, useState, type InputHTMLAttributes } from 'react';

/**
 * A password field with a reveal toggle.
 *
 * Worth having here more than in most products: this password is the encryption
 * key, it cannot be reset by anyone, and a typo in it is only discovered at the
 * next sign-in. Being able to check what was typed is the cheapest guard
 * against locking yourself out of your own vaults.
 *
 * Everything else behaves like a plain `<input>` — `autoComplete`, `minLength`,
 * `required` and the rest pass straight through, so password managers see the
 * field they expect.
 */
type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

const DEFAULT_CLASS =
  'w-full rounded-lg border border-slate-600 bg-surface px-4 py-2.5 pr-11 text-white placeholder-slate-500 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent';

export function PasswordInput({ className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const id = useId();

  return (
    <div className="relative">
      <input
        {...props}
        id={props.id ?? id}
        type={visible ? 'text' : 'password'}
        // The toggle sits inside the field, so every caller needs room for it
        // on the right — guaranteed here rather than left to each call site.
        className={`${className ?? DEFAULT_CLASS} pr-11`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-controls={props.id ?? id}
        aria-pressed={visible}
        aria-label={visible ? 'Hide password' : 'Show password'}
        title={visible ? 'Hide password' : 'Show password'}
        data-testid="toggle-password"
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-slate-400 transition hover:text-slate-200 focus:text-slate-200 focus:outline-none"
      >
        {visible ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}

export default PasswordInput;
