import { useEffect, useState } from 'react';

export function useApi<T>(url: string | null) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort('timeout'), 15000);
    setState({ data: null, error: null, loading: true });
    fetch(url, { signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'Check the dates and cutoff time, then try again.');
        return body as T;
      })
      .then(data => setState({ data, error: null, loading: false }))
      .catch(error => {
        if (controller.signal.aborted && controller.signal.reason !== 'timeout') return;
        setState({ data: null, loading: false, error: controller.signal.reason === 'timeout' ? 'The request timed out. Please try again.' : error instanceof Error ? error.message : 'Unable to load the dataset.' });
      })
      .finally(() => window.clearTimeout(timeout));
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [url, attempt]);
  return { ...state, retry: () => setAttempt(value => value + 1) };
}

export const number = (value: number | null, digits = 0) => value === null ? '—' : value.toLocaleString('en-GB', { maximumFractionDigits: digits });
export const day = (value: string, short = false) => new Date(value + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: short ? 'short' : 'long', ...(short ? {} : { year: 'numeric' }), timeZone: 'Europe/London' });
export const published = (value: string) => new Date(value).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
