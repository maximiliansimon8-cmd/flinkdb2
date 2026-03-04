import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/authService';

const CACHE_KEY = 'jet_feature_flags';
const CACHE_MAX_AGE = 5 * 60 * 1000; // 5 minutes

export function useFeatureFlags() {
  const [flags, setFlags] = useState(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      if (cached._ts && Date.now() - cached._ts < CACHE_MAX_AGE) {
        return cached.flags || {};
      }
    } catch { /* ignore */ }
    return {};
  });
  const [loading, setLoading] = useState(true);

  const fetchFlags = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('key, enabled');
      if (error) throw error;
      const flagMap = {};
      (data || []).forEach(f => { flagMap[f.key] = f.enabled; });
      setFlags(flagMap);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ flags: flagMap, _ts: Date.now() }));
      } catch { /* quota */ }
    } catch (err) {
      console.warn('[useFeatureFlags] Fetch failed:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchFlags(); }, [fetchFlags]);

  const isEnabled = useCallback((key) => flags[key] === true, [flags]);

  return { flags, isEnabled, loading, refetch: fetchFlags };
}
