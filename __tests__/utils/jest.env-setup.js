// Stub Expo winter runtime polyfills before they are lazily loaded.
// Expo 54 / jest-expo 55: installGlobal.ts lazily installs polyfills from
// runtime.native.ts which uses `import` syntax (ES module) – that fails in Jest's
// CommonJS context with "outside scope of test code" error.
//
// Solution: pre-define the globals that runtime.native.ts would install,
// so the lazy getters in installGlobal.ts never trigger the require.

// structuredClone is already available in Node 17+; stub for older envs
if (typeof globalThis.structuredClone === 'undefined') {
  globalThis.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));
}

// __ExpoImportMetaRegistry
if (typeof globalThis.__ExpoImportMetaRegistry === 'undefined') {
  globalThis.__ExpoImportMetaRegistry = { registry: new Map(), register() {}, resolve() { return {}; } };
}

// URL and URLSearchParams – available in Node, just ensure they're on global
if (typeof globalThis.URL === 'undefined') {
  const { URL, URLSearchParams } = require('url');
  globalThis.URL = URL;
  globalThis.URLSearchParams = URLSearchParams;
}

try {
  const fs = require('fs');
  const path = require('path');
  const envPaths = [
    path.resolve(process.cwd(), '.env.test.local'),
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), '.env.test'),
    path.resolve(process.cwd(), '.env')
  ];

  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');

      for (const rawLine of envContent.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;

        const eqIndex = line.indexOf('=');
        if (eqIndex <= 0) continue;

        const key = line.slice(0, eqIndex).trim();
        let value = line.slice(eqIndex + 1).trim();

        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }

        if (process.env[key] === undefined) {
          process.env[key] = value;
        }
      }
    }
  }
} catch {
  // best-effort env loading only
}
