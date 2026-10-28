import { z } from 'zod';
// Strict CSP blocks Zod's JIT probe; use the interpreter only in the browser.
z.config({ jitless: true });
