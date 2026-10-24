// @vitest-environment happy-dom
/**
 * The contract: the official stub and the real embed answer the same questions the same way
 * (CMU-D02 acceptance). Each case runs twice — once against cookieMunchStub, once against the
 * real engine with consent-sdk.js attached — through one harness, so neither can drift.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cookieMunchStub } from '../src/stub.js';
import { createCmp, type CmpHandle } from '../../core/src/create-cmp.js';
import { installExtended, type ExtendedDeps } from '../../core/src/sdk-extended.js';
import { defaultConfig, type SiteConfig } from '../../core/src/config.js';
import { serializeValue } from '../../core/src/cookie.js';
import { createState } from '../../core/src/state.js';

const w = window as unknown as Record<string, any>;
const tick = () => new Promise((r) => setTimeout(r, 0));
type Decision = 'none' | 'accept' | 'reject';

interface Env {
  /** Start with this decision stored. */
  start(d: Decision): void;
  /** The visitor answers now. */
  answer(d: 'accept' | 'reject'): void;
  stop(): void;
}

let handle: CmpHandle | null = null;
const realEnv: Env = {
  start(d) {
    if (d !== 'none') {
      const all = d === 'accept';
      const s = createState({ preferences: all, statistics: all, marketing: all, custom: { referrals: all } }, 'explicit', { now: 1, stamp: 'st' });
      document.cookie = `CookieMunch=${serializeValue(s)}; path=/`;
    }
    const c = defaultConfig('cb-1') as SiteConfig & Record<string, unknown>;
    (c as { categories: unknown }).categories = { custom: [{ id: 'referrals', label: 'Referrals', default: false, mapsTo: 'none' }] };
    c.sdkBoot = 1;
    handle = createCmp({ config: c, apiBase: 'https://api.test', assetBase: 'https://cdn.test', fetch: (async () => new Response(null, { status: 204 })) as never, region: 'de' });
    const h = w.__cmSdk as { deps: ExtendedDeps; attach?: (i: (api: unknown) => void) => void };
    h.attach?.((api) => installExtended(api as Record<string, unknown>, h.deps));
    w.__cmUi = { createBanner: () => ({ host: document.createElement('div'), show() {}, hide() {}, openPreferences() {}, destroy() {}, isOpen: () => false }) };
  },
  answer(d) {
    if (d === 'accept') handle!.engine.acceptAll();
    else handle!.engine.declineAll();
  },
  stop() {
    handle?.uninstall();
    handle = null;
  },
};
const stubEnv: Env = {
  start(d) {
    cookieMunchStub({ decision: d, categories: ['referrals'] });
  },
  answer(d) {
    w.__cmStub.decide(d);
  },
  stop() {},
};

for (const [name, env] of [['stub', stubEnv], ['real embed', realEnv]] as const) {
  describe(`contract: ${name}`, () => {
    beforeEach(() => {
      document.head.innerHTML = '';
      document.body.innerHTML = '';
      document.cookie = 'CookieMunch=; max-age=0; path=/';
      for (const k of ['CookieMunch', 'Cookiebot', '__fdConsent', '__cmSdk', '__cmUi', '__cmStub']) delete w[k];
    });
    afterEach(() => env.stop());

    it('the surface exists', () => {
      env.start('none');
      for (const m of ['hasConsent', 'consentId', 'on', 'once', 'off', 'show', 'showSettings', 'withdraw', 'submitCustomConsent']) {
        expect(typeof w.CookieMunch[m], m).toBe('function');
      }
      expect(w.Cookiebot).toBe(w.CookieMunch);
      expect(w.__fdConsent.version).toBe(1);
      for (const m of ['has', 'on', 'ready', 'request', 'identify']) expect(typeof w.__fdConsent[m], m).toBe('function');
      expect(w.__fdConsent.layout.bottomInset()).toBe(0);
    });

    it('undecided: hasConsent is false, hasResponse false, __fdConsent.has is null', () => {
      env.start('none');
      expect(w.CookieMunch.hasResponse).toBe(false);
      expect(w.CookieMunch.hasConsent('marketing')).toBe(false);
      expect(w.__fdConsent.has('referrals')).toBeNull();
      expect(w.__fdConsent.has('necessary')).toBe(true);
      expect(w.__fdConsent.has('no-such-category')).toBe(false);
    });

    it('a returning visitor who accepted: everything true, and on(change) replays', async () => {
      env.start('accept');
      expect(w.CookieMunch.hasResponse).toBe(true);
      expect(w.CookieMunch.hasConsent('statistics')).toBe(true);
      expect(w.__fdConsent.has('referrals')).toBe(true);
      const causes: string[] = [];
      w.__fdConsent.on('change', (_s: unknown, c: string) => causes.push(c));
      await tick();
      expect(causes).toContain('replay');
      expect((await w.__fdConsent.ready()).decided).toBe(true);
    });

    it('answering fires change synchronously and flips the answers', async () => {
      env.start('none');
      const seen: Array<[boolean, string]> = [];
      w.__fdConsent.on('change', (s: { categories: Record<string, boolean> }, c: string) => seen.push([s.categories.marketing!, c]));
      env.answer('reject');
      expect(seen).toEqual([[false, 'decline']]);
      expect(w.__fdConsent.has('marketing')).toBe(false);
      expect(w.CookieMunch.hasResponse).toBe(true);
      env.answer('accept');
      expect(seen.at(-1)).toEqual([true, 'accept']);
      expect(w.CookieMunch.hasConsent('marketing')).toBe(true);
    });

    it('withdraw() refuses everything, and the window hears CookieMunchOnChange', () => {
      env.start('accept');
      const causes: string[] = [];
      window.addEventListener('CookieMunchOnChange', (e) => causes.push((e as CustomEvent).detail.cause), { once: true });
      w.CookieMunch.withdraw();
      expect(causes).toEqual(['withdraw']);
      expect(w.__fdConsent.has('referrals')).toBe(false);
    });
  });
}
