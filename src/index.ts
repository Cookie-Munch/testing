/**
 * @cookiemunch/testing — test helpers for sites running Cookie Munch (CMU-D02).
 *
 *   import { installStub, previewUrl, decide } from '@cookiemunch/testing';
 *
 *   await installStub(page, { decision: 'accept' });            // no network, the real API surface
 *   await page.goto(await previewUrl('cb-…', 'https://acme.com/pricing', { region: 'de', apiKey }));
 *   await decide(page, 'reject');                                // answers the REAL banner
 *
 * Playwright is not a dependency: anything with Playwright's `Page` shape works.
 * For a local or preview origin, list it in the site's `devOrigins` (or put `data-env="test"`
 * on the tag): the banner then shows to headless browsers and nothing is recorded.
 */

import { cookieMunchStub, type StubOptions, type StubDecision } from './stub.js';

export { cookieMunchStub, STUB_VERSION, type StubOptions, type StubDecision } from './stub.js';

/** The part of Playwright's `Page` these helpers use. */
export interface PageLike {
  addInitScript<A>(script: (arg: A) => unknown, arg: A): Promise<unknown>;
  evaluate<R, A>(fn: (arg: A) => R | Promise<R>, arg: A): Promise<R>;
  locator(selector: string): LocatorLike;
}
export interface LocatorLike {
  first(): LocatorLike;
  click(opts?: { timeout?: number }): Promise<void>;
  waitFor(opts?: { state?: 'attached' | 'visible'; timeout?: number }): Promise<void>;
  setChecked(checked: boolean, opts?: { timeout?: number }): Promise<void>;
  count(): Promise<number>;
}

/**
 * Put the official stub on every page the browser opens, before any page script runs: the
 * embed's API (`CookieMunch`, `Cookiebot`) and `__fdConsent`, with the decision you choose.
 * Do not load consent.js as well; block it (`page.route('**\/consent.js', r => r.abort())`).
 */
export async function installStub(page: PageLike, options: StubOptions = {}): Promise<void> {
  await page.addInitScript(cookieMunchStub, options);
}

export interface PreviewOptions {
  /** A country or subdivision code (`de`, `us-ca`) or `eu`. */
  region?: string;
  /** A BCP 47 language tag. */
  lang?: string;
  /** An API key with sites:read. Default: process.env.COOKIEMUNCH_API_KEY. */
  apiKey?: string;
  /** Default https://api.cookiemunch.net. */
  baseUrl?: string;
  /** Token lifetime in seconds, at most 3600. Default 900. */
  ttlSeconds?: number;
  fetch?: typeof fetch;
}

/**
 * A preview link for `url`: the real banner, forced to a region and language, shown to a
 * headless browser, recording nothing. Mints a signed token (POST /v1/sites/{cbid}/preview-token).
 */
export async function previewUrl(cbid: string, url: string, opts: PreviewOptions = {}): Promise<string> {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const apiKey = opts.apiKey ?? env.COOKIEMUNCH_API_KEY;
  if (!apiKey) throw new Error('previewUrl needs an API key with sites:read (apiKey, or COOKIEMUNCH_API_KEY)');
  const f = opts.fetch ?? (globalThis as { fetch?: typeof fetch }).fetch;
  if (!f) throw new Error('previewUrl needs fetch');
  const base = (opts.baseUrl ?? 'https://api.cookiemunch.net').replace(/\/+$/, '');
  const res = await f(`${base}/v1/sites/${encodeURIComponent(cbid)}/preview-token`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, ...(opts.region ? { region: opts.region } : {}), ...(opts.lang ? { lang: opts.lang } : {}), ...(opts.ttlSeconds ? { ttlSeconds: opts.ttlSeconds } : {}) }),
  });
  const body = (await res.json().catch(() => ({}))) as { previewUrl?: string; token?: string; error?: string };
  if (!res.ok) throw new Error(`preview-token: ${res.status} ${body.error ?? ''}`.trim());
  if (body.previewUrl) return body.previewUrl;
  const u = new URL(url);
  u.searchParams.set('cm_preview', body.token ?? '');
  if (opts.region) u.searchParams.set('cm_region', opts.region);
  if (opts.lang) u.searchParams.set('cm_lang', opts.lang);
  return u.toString();
}

/**
 * Answer the REAL banner as a visitor would: `accept`, `reject`, or per category
 * (`{ statistics: true, referrals: false }`, opening the settings and saving). Resolves once
 * the embed has the decision. The banner lives in an open shadow root, which Playwright's CSS
 * locators pierce.
 */
export async function decide(page: PageLike, choice: StubDecision, opts: { timeout?: number } = {}): Promise<void> {
  const timeout = opts.timeout ?? 10_000;
  const action = async (name: string): Promise<void> => {
    const el = page.locator(`[data-action="${name}"]`).first();
    await el.waitFor({ state: 'visible', timeout });
    await el.click({ timeout });
  };
  if (choice === 'accept') await action('accept-all');
  else if (choice === 'reject') await action('reject-all');
  else if (choice !== 'none') {
    await action('customize');
    for (const [cat, on] of Object.entries(choice)) {
      const toggle = page.locator(`input[data-cat="${cat}"]`).first();
      if ((await toggle.count()) > 0) await toggle.setChecked(on, { timeout });
    }
    await action('save');
  }
  if (choice !== 'none') {
    await page.evaluate(
      (t: number) =>
        new Promise<void>((done, fail) => {
          const start = Date.now();
          const tick = (): void => {
            const cm = (window as unknown as { CookieMunch?: { hasResponse?: boolean } }).CookieMunch;
            if (cm?.hasResponse) return done();
            if (Date.now() - start > t) return fail(new Error('the banner did not record a decision'));
            setTimeout(tick, 50);
          };
          tick();
        }),
      timeout,
    );
  }
}
