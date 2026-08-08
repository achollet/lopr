import { VERSION } from '@lopr/core';

export const EXTENSION_ID = 'lopr';

export function activate(): void {
  // Placeholder activation until the extension epic. Loading core proves the
  // workspace wiring works end to end.
  console.log(`lopr extension ${VERSION} activated`);
}

export function deactivate(): void {
  // no-op
}
