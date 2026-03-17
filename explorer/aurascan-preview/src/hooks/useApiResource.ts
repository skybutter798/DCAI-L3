import { useEffect, useState } from 'react';

type UseApiResourceOptions<T> = {
  initialData?: T | null;
  initialLoading?: boolean;
  keepPreviousData?: boolean;
  treat404As?: T | null;
  map?: (json: any) => T | null;
};

export default function useApiResource<T = any>(
  url: string | null,
  deps: any[] = [],
  options: UseApiResourceOptions<T> = {}
) {
  const {
    initialData = null,
    initialLoading = false,
    keepPreviousData = false,
    treat404As,
    map,
  } = options;

  const [data, setData] = useState<T | null>(initialData);
  const [loading, setLoading] = useState<boolean>(initialLoading);

  useEffect(() => {
    if (!url) {
      setLoading(false);
      if (!keepPreviousData) setData(initialData);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        if (!keepPreviousData) setData(initialData);
        setLoading(true);

        const res = await fetch(url, { cache: 'no-store' });
        if (res.status === 429) return;
        if (res.status === 404 && treat404As !== undefined) {
          if (!cancelled) setData(treat404As);
          return;
        }

        const json = await res.json();
        const next = map ? map(json) : json;
        if (!cancelled) setData(next as T | null);
      } catch {
        if (!cancelled && !keepPreviousData) setData(initialData);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [url, ...deps]);

  return { data, loading, setData, setLoading };
}
