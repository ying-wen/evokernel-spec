import { useEffect, useState, useRef } from 'react';

declare global {
  interface Window {
    pagefind?: {
      search: (q: string) => Promise<{
        results: Array<{
          id: string;
          data: () => Promise<{ url: string; meta: { title?: string }; excerpt: string }>;
        }>;
      }>;
    };
  }
}

interface SearchResult { url: string; title: string; excerpt: string }

export default function Search() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    if (window.pagefind) return;
    // Load pagefind via runtime dynamic import using a string built at runtime so Vite/Rollup
    // doesn't try to bundle it. The asset lives at /pagefind/pagefind.js after `pagefind --site dist`.
    const url = ['/pagefind', 'pagefind.js'].join('/');
    (new Function('u', 'return import(u)')(url) as Promise<{ search: (q: string) => Promise<unknown> }>)
      .then((pf) => { window.pagefind = pf as unknown as typeof window.pagefind; })
      .catch(() => { /* index not built locally; search disabled */ });
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (!query || !window.pagefind) { setResults([]); return; }
    let cancelled = false;
    (async () => {
      const r = await window.pagefind!.search(query);
      const items = await Promise.all(
        r.results.slice(0, 10).map(async (x) => {
          const d = await x.data();
          return { url: d.url, title: d.meta.title ?? d.url, excerpt: d.excerpt };
        })
      );
      if (!cancelled) setResults(items);
    })();
    return () => { cancelled = true; };
  }, [query]);

  return (
    <>
      <button onClick={() => setOpen(true)} type="button" aria-label="搜索 (Ctrl/Cmd+K)"
              className="text-xs px-2 py-1 rounded border inline-flex items-center gap-2"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-muted)' }}>
        <span>🔍</span><kbd style={{ fontFamily: 'var(--font-mono)' }}>⌘K</kbd>
      </button>

      {open && (
        <div role="dialog" aria-modal="true" aria-label="搜索"
             className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4"
             style={{ background: 'rgba(20,22,28,0.55)' }} onClick={() => setOpen(false)}>
          <div className="w-full max-w-2xl rounded-lg p-4 shadow-2xl"
               style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
               onClick={(e) => e.stopPropagation()}>
            <input ref={inputRef} type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                   placeholder="搜索硬件 / 模型 / 案例 / 模式..."
                   className="w-full px-3 py-2 rounded border text-base"
                   style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }} />
            <ul className="mt-3 max-h-96 overflow-y-auto">
              {results.length === 0 && query.length > 0 && (
                <li className="text-sm p-3" style={{ color: 'var(--color-text-muted)' }}>未找到 "{query}" 的结果</li>
              )}
              {results.map((r) => (
                <li key={r.url}>
                  <a href={r.url} className="block p-3 rounded text-sm" onClick={() => setOpen(false)}
                     style={{ color: 'var(--color-text)' }}>
                    <div style={{ color: 'var(--color-accent)', fontWeight: 600 }}>{r.title}</div>
                    <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }} dangerouslySetInnerHTML={{ __html: r.excerpt }} />
                  </a>
                </li>
              ))}
            </ul>
            <div className="text-xs mt-3 pt-3 border-t flex justify-between"
                 style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
              <span>↵ 打开 · ESC 关闭</span><span>Ctrl/⌘+K 唤起</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
