import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useEffect, useMemo, useState } from 'react';

export type LegalDocument = 'privacy' | 'terms' | 'credits';

type Props = {
  document: LegalDocument | null;
  onClose: () => void;
};

export function LegalDocumentDialog({ document, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [html, setHtml] = useState('');

  const meta = useMemo(() => {
    if (document === 'privacy') {
      return {
        title: 'MindMapVault Privacy & GDPR Notice',
        path: '/PRIVACY.md',
      };
    }
    if (document === 'terms') {
      return {
        title: 'MindMapVault Terms of Service',
        path: '/TERMS.md',
      };
    }
    if (document === 'credits') {
      return {
        title: 'Credits and acknowledgements',
        path: '/CREDITS.md',
      };
    }
    return null;
  }, [document]);

  useEffect(() => {
    if (!meta) {
      setLoading(false);
      setError('');
      setHtml('');
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError('');
      setHtml('');

      try {
        const res = await fetch(meta.path, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Failed to load document (${res.status})`);
        const md = await res.text();
        const parsed = marked.parse(md, { async: false }) as string;
        if (!cancelled) setHtml(DOMPurify.sanitize(parsed));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load document');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [meta]);

  if (!meta) return null;

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-700 bg-surface-1 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-700 px-5 py-3">
          <h2 className="text-base font-semibold text-white">{meta.title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-600 px-2.5 py-1 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="max-h-[calc(90vh-56px)] overflow-y-auto px-5 py-4" style={{ color: 'var(--text-primary)' }}>
          {loading && <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading document...</p>}
          {error && <p className="text-sm text-red-400">{error}</p>}
          {!loading && !error && (
            <article
              className="whitepaper-md text-sm leading-6"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
          <div className="mt-4 border-t border-slate-700 pt-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
            Prefer raw file view? <a href={meta.path} target="_blank" rel="noreferrer" className="text-accent underline">Open markdown file</a>
          </div>
        </div>
      </div>
    </div>
  );
}
