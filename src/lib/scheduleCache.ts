const CACHE_KEY = 'tvmagic_schedule_cache';
const CACHE_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

export interface CachedSchedule {
  leads: any[];
  events: any[];
  cachedAt: number;
}

export function saveScheduleCache(data: Omit<CachedSchedule, 'cachedAt'>) {
  const payload: CachedSchedule = { ...data, cachedAt: Date.now() };
  localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
}

export function loadScheduleCache(): CachedSchedule | null {
  const raw = localStorage.getItem(CACHE_KEY);
  if (!raw) return null;
  const parsed: CachedSchedule = JSON.parse(raw);
  if (Date.now() - parsed.cachedAt > CACHE_TTL_MS) {
    localStorage.removeItem(CACHE_KEY);
    return null;
  }
  return parsed;
}

export function clearScheduleCache() {
  localStorage.removeItem(CACHE_KEY);
}