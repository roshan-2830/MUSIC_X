/**
 * Web has no push notifications in this app, so this file is deliberately empty of behaviour.
 *
 * It exists as a platform stub — Metro picks `.web.ts` over `.ts` — so the browser build never
 * imports expo-notifications at all. Guarding inside the real hook would not be enough: the
 * import itself pulls in native modules that have no web counterpart, and a person testing in a
 * browser would meet a crash on launch rather than an app with one feature quietly absent.
 */
export type PushState = 'unsupported';

export async function enablePush(): Promise<{ state: PushState }> {
  return { state: 'unsupported' };
}

export async function disablePush(): Promise<void> {}

export function usePush(_onOpenEvent?: (eventId: string) => void) {}
