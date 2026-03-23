// Template placeholder.
// `securesupabase init/sync` replaces this file with the generated vendored SDK bundle.
function notSyncedError() {
  return new Error(
    'securesupabase vendor bundle not synced. Run `securesupabase init` or `securesupabase sync`.'
  )
}

/**
 * @returns {any}
 */
export function createClient(..._args) {
  throw notSyncedError()
}

/**
 * @returns {any}
 */
export function createSecureClient(..._args) {
  throw notSyncedError()
}
