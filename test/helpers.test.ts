import { describe, it, expect, vi } from 'vitest';
import { installStub, previewUrl, decide, cookieMunchStub, type PageLike, type LocatorLike } from '../src/index.js';

function fakePage() {
  const calls: string[] = [];
  const loc = (sel: string): LocatorLike => ({
    first: () => loc(sel),
    click: async () => void calls.push(`click ${sel}`),
    waitFor: async () => undefined,
    setChecked: async (v) => void calls.push(`check ${sel}=${v}`),
    count: async () => 1,
  });
  const page: PageLike = {
    addInitScript: vi.fn(async () => undefined),
    evaluate: vi.fn(async () => undefined) as never,
    locator: loc,
  };
  return { page, calls };
}

describe('installStub', () => {
  it('adds the self-contained stub as an init script with the options', async () => {
    const { page } = fakePage();
    await installStub(page, { decision: 'accept' });
    expect(page.addInitScript).toHaveBeenCalledWith(cookieMunchStub, { decision: 'accept' });
  });
});

describe('decide', () => {
  it('clicks the real banner’s buttons, and the settings path for a selection', async () => {
    const a = fakePage();
    await decide(a.page, 'reject');
    expect(a.calls).toEqual(['click [data-action="reject-all"]']);
    const b = fakePage();
    await decide(b.page, { statistics: true, referrals: false });
    expect(b.calls).toEqual(['click [data-action="customize"]', 'check input[data-cat="statistics"]=true', 'check input[data-cat="referrals"]=false', 'click [data-action="save"]']);
    expect(b.page.evaluate).toHaveBeenCalled();
  });
});

describe('previewUrl', () => {
  it('mints a token with the key and returns the preview link', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ token: 't', previewUrl: 'https://acme.com/?cm_preview=t&cm_region=de' })));
    const url = await previewUrl('cb-1', 'https://acme.com/', { region: 'de', apiKey: 'fck_x', baseUrl: 'https://api.test', fetch: fetch as never });
    expect(url).toBe('https://acme.com/?cm_preview=t&cm_region=de');
    const [u, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(u).toBe('https://api.test/v1/sites/cb-1/preview-token');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer fck_x');
    expect(JSON.parse(String(init.body))).toEqual({ url: 'https://acme.com/', region: 'de' });
  });

  it('needs a key, and says what the API refused', async () => {
    await expect(previewUrl('cb-1', 'https://a', { fetch: vi.fn() as never })).rejects.toThrow(/API key/);
    const fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }));
    await expect(previewUrl('cb-1', 'https://a', { apiKey: 'k', fetch: fetch as never })).rejects.toThrow(/403 forbidden/);
  });
});

describe('the stub is serialisable', () => {
  it('uses nothing outside its own body (Playwright sends its source text into the page)', () => {
    const src = cookieMunchStub.toString();
    // eslint-disable-next-line no-new-func
    const rebuilt = new Function(`return (${src})`)() as typeof cookieMunchStub;
    expect(typeof rebuilt).toBe('function');
    expect(src).not.toMatch(/__vite|import\(/);
  });
});
