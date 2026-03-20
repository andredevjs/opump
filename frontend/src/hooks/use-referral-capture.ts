import { useEffect } from 'react';

const STORAGE_KEY = 'opump_ref';

/**
 * Captures `?ref=CODE` from the URL on mount, stores it in localStorage,
 * and cleans the URL without a page reload.
 */
export function useReferralCapture(): void {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (!ref) return;

    // Store uppercase code in localStorage
    localStorage.setItem(STORAGE_KEY, ref.toUpperCase());

    // Clean the URL — remove ref param but keep others
    params.delete('ref');
    const newSearch = params.toString();
    const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash;
    window.history.replaceState(null, '', newUrl);
  }, []);
}
