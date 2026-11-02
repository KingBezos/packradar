/**
 * HTTP helper for scrapers: per-host throttling, retries with backoff,
 * rotating desktop user agents.
 *
 * Proxy: Node 24+ honors HTTP(S)_PROXY for fetch when NODE_USE_ENV_PROXY=1,
 * so set those env vars to route scraping through a proxy.
 */

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
];

const lastHit = new Map<string, number>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type FetchOpts = {
  /** Minimum ms between requests to the same host. */
  minIntervalMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Use a fixed UA (e.g. Reddit prefers a descriptive one). */
  userAgent?: string;
};

export class HttpError extends Error {
  constructor(
    public status: number,
    public url: string,
    public bodySnippet: string,
  ) {
    super(`HTTP ${status} for ${url}`);
  }
}

export async function scrapeFetch(url: string, opts: FetchOpts = {}): Promise<Response> {
  const host = new URL(url).host;
  const minInterval = opts.minIntervalMs ?? 1500;
  const retries = opts.retries ?? 2;

  for (let attempt = 0; ; attempt++) {
    const wait = (lastHit.get(host) ?? 0) + minInterval - Date.now();
    if (wait > 0) await sleep(wait + Math.random() * 400);
    lastHit.set(host, Date.now());

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20_000);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          "User-Agent": opts.userAgent ?? USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
          Accept: "text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          ...opts.headers,
        },
        redirect: "follow",
      });
      if (res.ok) return res;
      const retryable = res.status === 429 || res.status >= 500 || res.status === 403;
      if (!retryable || attempt >= retries) {
        const body = (await res.text().catch(() => "")).slice(0, 300);
        throw new HttpError(res.status, url, body);
      }
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * 2 ** attempt + Math.random() * 1000);
    } catch (e) {
      if (e instanceof HttpError) throw e;
      if (attempt >= retries) throw e;
      await sleep(1500 * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }
}

export async function fetchText(url: string, opts?: FetchOpts) {
  return (await scrapeFetch(url, opts)).text();
}

export async function fetchJson<T = unknown>(url: string, opts?: FetchOpts): Promise<T> {
  return (await scrapeFetch(url, opts)).json() as Promise<T>;
}
