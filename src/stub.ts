/**
 * The official stub of the embed's public API — `window.CookieMunch` (and its `Cookiebot`
 * alias) plus `window.__fdConsent` — for tests that should not load the real embed.
 *
 * It passes the same contract tests as the real embed (test/contract.test.ts), so code that
 * works against it works against Cookie Munch. It is ONE self-contained function: Playwright
 * serialises it into the page (`page.addInitScript(cookieMunchStub, options)`), so it may not
 * close over anything outside itself.
 */

export type StubDecision = 'accept' | 'reject' | 'none' | Record<string, boolean>;

export interface StubOptions {
  /** The visitor's answer at load. `none` (default): not decided yet. */
  decision?: StubDecision;
  /** The site's custom category ids (`referrals`, `support_chat`, …). */
  categories?: string[];
  /** Region code the snapshot reports. Default `eu`. */
  region?: string;
  /** `false`: a region that needs no decision (everything allowed until refused). Default true. */
  required?: boolean;
}

/** The version of the stub's contract; it follows `__fdConsent.version`. */
export const STUB_VERSION = 1;

export function cookieMunchStub(options: StubOptions = {}): void {
  const w = window as unknown as Record<string, any>;
  const custom: string[] = options.categories ?? [];
  const required = options.required !== false;
  const all = ['preferences', 'statistics', 'marketing', ...custom];
  let decided = false;
  let state: Record<string, boolean> = {};
  let stamp = 'stub-' + Math.random().toString(36).slice(2, 10);
  let decidedAt: string | null = null;
  const set = (d: any): void => {
    if (d === 'none' || d === undefined) {
      decided = false;
      state = {};
      for (const c of all) state[c] = !required;
      return;
    }
    decided = true;
    decidedAt = new Date().toISOString();
    state = {};
    for (const c of all) state[c] = d === 'accept' ? true : d === 'reject' ? false : d[c] === true || (d.all === true && d[c] !== false);
  };
  set(options.decision ?? 'none');

  const listeners: Record<string, Array<(...a: any[]) => void>> = {};
  const fire = (event: string, ...args: any[]): void => {
    for (const fn of (listeners[event] ?? []).slice()) fn(...args);
  };
  const consent = (): Record<string, any> => ({ necessary: true, ...state, stamp });
  const snapshot = () => ({
    decided,
    required,
    categories: { necessary: true, ...state },
    stamp,
    region: options.region ?? 'eu',
    gpc: false,
    decidedAt,
  });
  const fdListeners: Array<(s: any, cause: string) => void> = [];
  const announce = (cause: string): void => {
    const c = consent();
    fire('consentReady', c);
    const any = state.preferences || state.statistics || state.marketing;
    fire(any ? 'accept' : 'decline', c);
    for (const ev of ['CookieMunchOnConsentReady', any ? 'CookieMunchOnAccept' : 'CookieMunchOnDecline']) {
      w.dispatchEvent(new CustomEvent(ev, { detail: c }));
    }
    w.dispatchEvent(new CustomEvent('CookieMunchOnChange', { detail: { consent: c, previous: null, cause } }));
    const s = snapshot();
    for (const fn of fdListeners.slice()) fn(s, cause);
  };
  const decide = (d: StubDecision, cause: string): void => {
    set(d);
    announce(cause);
  };
  const known = (c: string): boolean => c === 'necessary' || all.indexOf(c) >= 0;

  const api: Record<string, any> = {
    version: 'stub',
    get consent() {
      return consent();
    },
    get hasResponse() {
      return decided;
    },
    get consented() {
      return decided && all.some((c) => state[c]);
    },
    get declined() {
      return decided && !all.some((c) => state[c]);
    },
    // Boolean, like the real one: tri-state lives on __fdConsent.has.
    hasConsent: (c: string) => c === 'necessary' || state[c] === true,
    consentId: () => stamp,
    on: (event: string, fn: (...a: any[]) => void) => {
      (listeners[event] ??= []).push(fn);
      return () => api.off(event, fn);
    },
    once: (event: string, fn: (...a: any[]) => void) => {
      const off = api.on(event, (...a: any[]) => (off(), fn(...a)));
      return off;
    },
    off: (event: string, fn: (...a: any[]) => void) => {
      const l = listeners[event] ?? [];
      const i = l.indexOf(fn);
      if (i >= 0) l.splice(i, 1);
    },
    show: () => Promise.resolve(),
    showSettings: () => undefined,
    hide: () => undefined,
    renew: () => undefined,
    withdraw: () => decide('reject', 'withdraw'),
    submitCustomConsent: (p: boolean, s: boolean, m: boolean) => decide({ ...state, preferences: p, statistics: s, marketing: m }, 'selection'),
    getStatus: () => ({ ui: 'ready' }),
  };
  w.CookieMunch = api;
  w.Cookiebot = api;

  const queued: any[] = (w.__fdConsent && w.__fdConsent.q) || [];
  const fd: Record<string, any> = {
    version: 1,
    provider: 'stub',
    has: (c: string) => (!known(c) ? false : c === 'necessary' ? true : decided || !required ? state[c] === true : null),
    on: (ev: string, cb: (s: any, cause: string) => void) => {
      if (ev !== 'change') return () => undefined;
      fdListeners.push(cb);
      if (decided || !required) Promise.resolve().then(() => fdListeners.indexOf(cb) >= 0 && cb(snapshot(), 'replay'));
      return () => {
        const i = fdListeners.indexOf(cb);
        if (i >= 0) fdListeners.splice(i, 1);
      };
    },
    ready: () =>
      new Promise((done) => {
        if (decided || !required) return done(snapshot());
        const off = fd.on('change', (s: any) => (off(), done(s)));
      }),
    request: (c: string) => Promise.resolve(fd.has(c) === true),
    identify: () => undefined,
    layout: { bottomInset: () => 0, on: () => () => undefined },
  };
  const run = (call: any[]): void => {
    const [m, a, b, d] = call;
    if (m === 'on') fd.on(a, b);
    else if (m === 'ready') fd.ready().then(a);
    else if (m === 'request') fd.request(a, b).then(d);
  };
  fd.q = { push: (...calls: any[][]) => (calls.forEach(run), 0) };
  w.__fdConsent = fd;
  queued.forEach(run);
  // For tests: change the answer as a visitor would (`window.__cmStub.decide('accept')`).
  w.__cmStub = { decide: (d: StubDecision) => decide(d, d === 'accept' ? 'accept' : d === 'reject' ? 'decline' : 'selection') };
  if (decided) Promise.resolve().then(() => announce('replay'));
}
