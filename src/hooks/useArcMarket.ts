import { useState, useEffect, useCallback, useRef } from 'react';

export type ArcMarketTab = 'trending' | 'new' | 'top';

export interface ArcMarketToken {
  address: string;
  name: string;
  symbol: string;
  logoUrl: string;
  bannerUrl?: string;
  priceUsd: number;
  change5m?: number;
  change1h?: number;
  change6h?: number;
  change24h?: number;
  vol5m?: number;
  volUsd: number;
  liqUsd: number;
  mcapUsd: number;
  ageSec: number;
}

// Apify Configuration
const APIFY_TOKEN = 'apify_api_QV9EugCcPDiQa9b24nHTvSmxbMzLgi3rgwjG';
const ACTOR_ID = 'GWfH8uzlNFz2fEjKj';

export function useArcMarket(tab: ArcMarketTab, search: string) {
  const [tokens, setTokens] = useState<ArcMarketToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<number | null>(null);
  
  const isFetchingRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout>();

  const stats = {
    vol5m: tokens.reduce((sum, t) => sum + (t.vol5m || 0), 0),
    txns: tokens.length * 142, // Estimate based on typical pair activity
  };

  const fetchApifyData = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    
    // Only set loading to true if we don't have tokens yet (prevents screen flashing during polling)
    if (tokens.length === 0) setLoading(true);

    try {
      // Map UI tabs to Apify Actor Modes
      let mode = 'trending';
      if (tab === 'new') mode = 'latestListings';
      if (tab === 'top') mode = 'topGainers';

      const response = await fetch(
        `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chain: 'arc',
            mode: mode,
            maxItems: 50,
          }),
        }
      );

      if (!response.ok) throw new Error(`Apify returned ${response.status}`);

      const data = await response.json();

      // Format Apify output to match ArcMarketToken interface
      const mappedTokens: ArcMarketToken[] = data.map((item: any) => {
        const pairCreatedAt = item.pairCreatedAt || Date.now();
        const ageSec = Math.floor((Date.now() - pairCreatedAt) / 1000);

        return {
          address: item.baseToken?.address || item.pairAddress,
          name: item.baseToken?.name || 'Unknown',
          symbol: item.baseToken?.symbol || '???',
          logoUrl: item.info?.imageUrl || '',
          bannerUrl: item.info?.header || '',
          priceUsd: parseFloat(item.priceUsd || '0'),
          change5m: parseFloat(item.priceChange?.m5 || '0'),
          change1h: parseFloat(item.priceChange?.h1 || '0'),
          change6h: parseFloat(item.priceChange?.h6 || '0'),
          change24h: parseFloat(item.priceChange?.h24 || '0'),
          vol5m: parseFloat(item.volume?.m5 || '0'),
          volUsd: parseFloat(item.volume?.h24 || '0'),
          liqUsd: parseFloat(item.liquidity?.usd || '0'),
          mcapUsd: parseFloat(item.fdv || item.marketCap || '0'),
          ageSec: ageSec,
        };
      });

      // Handle Search filtering
      const filtered = search
        ? mappedTokens.filter(
            (t) =>
              t.name.toLowerCase().includes(search.toLowerCase()) ||
              t.symbol.toLowerCase().includes(search.toLowerCase()) ||
              t.address.toLowerCase() === search.toLowerCase()
          )
        : mappedTokens;

      setTokens(filtered);
      setError(null);
      setLastFetched(Date.now());
    } catch (err: any) {
      console.error('Failed to fetch from Apify:', err);
      setError(err.message || 'Apify Fetch Error');
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
      
      // Schedule the next fetch 3 seconds after this one finishes
      timeoutRef.current = setTimeout(fetchApifyData, 3000);
    }
  }, [tab, search, tokens.length]);

  useEffect(() => {
    // Clear interval and immediately fetch new data when tab/search changes
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    fetchApifyData();

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [tab, search]);

  const refresh = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    fetchApifyData();
  };

  return {
    tokens,
    stats,
    total: tokens.length,
    loading,
    error,
    lastFetched,
    refresh,
  };
}
