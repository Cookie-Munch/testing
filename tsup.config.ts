import { defineConfig } from 'tsup';
// es2022: nothing in the stub is lowered into a helper outside the function, which Playwright
// could not carry into the page when it serialises `cookieMunchStub`.
export default defineConfig({ entry: { index: 'src/index.ts' }, format: ['esm'], dts: true, clean: true, sourcemap: true, target: 'es2022' });
