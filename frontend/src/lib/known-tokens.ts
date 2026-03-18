const KNOWN_TOKENS_KEY = 'opump:known-token-addresses';

function loadKnownAddresses(): string[] {
  try {
    const raw = localStorage.getItem(KNOWN_TOKENS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

export function saveKnownAddress(address: string): void {
  const known = new Set(loadKnownAddresses());
  known.add(address);
  localStorage.setItem(KNOWN_TOKENS_KEY, JSON.stringify([...known]));
}

export function getKnownTokenAddresses(): string[] {
  return loadKnownAddresses();
}
