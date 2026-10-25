# Changelog: @cookiemunch/testing

Every published release, newest first. Dates are the day the version was cut.

## 0.1.1 (2026-10-25)

- Changed: the stub sets `window.__consent` as well as `window.__fdConsent` (the same object).

## 0.1.0 (2026-10-24)

- Added: `installStub(page, { decision })` (an official stub of the embed's API, versioned as `STUB_VERSION`), `previewUrl(cbid, url, { region, lang, apiKey })` and `decide(page, 'accept' | 'reject' | {…})`.
