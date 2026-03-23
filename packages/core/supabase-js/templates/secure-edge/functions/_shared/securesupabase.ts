// Template bridge for secure edge handlers.
// During `securesupabase init/sync`, the vendored SDK file is generated at:
//   _shared/vendor/securesupabase/index.mjs
export { createClient, createSecureClient } from './vendor/securesupabase/index.mjs';
