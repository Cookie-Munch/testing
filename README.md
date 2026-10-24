# @cookiemunch/testing

Test helpers for sites running Cookie Munch: an official, versioned stub of the embed's API, preview
links, and a helper that answers the real banner. Works with Playwright, or anything with its `Page` shape.

```ts
import { installStub, previewUrl, decide } from '@cookiemunch/testing';

await installStub(page, { decision: 'accept' });                 // no network, the real API surface
await page.goto(await previewUrl('your-site-id', 'https://acme.com/pricing', { region: 'de', apiKey }));
await decide(page, 'reject');                                     // answers the real banner
```

For a local or preview origin, list it in the site's `devOrigins` (or put `data-env="test"` on the tag):
the banner then shows to headless browsers and nothing reaches your consent log.
Docs: [cookiemunch.net/docs/testing](https://cookiemunch.net/docs/testing).
