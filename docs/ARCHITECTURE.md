# Architecture

## Privacy boundary

The default application is a static web app. Card bytes are read through the browser file picker and processed in memory. The project must not add analytics, crash-report payloads, remote card storage, or network-based rewriting without an explicit opt-in design and a separate privacy review.

## Safety invariants

1. Keep the original bytes available until the tab is closed or the user replaces the card.
2. Preserve unknown JSON properties and unrelated PNG chunks.
3. Represent automatic findings as reviewable proposals.
4. Apply only high-confidence deterministic rules through bulk actions.
5. Re-import and compare every generated file before download.
6. Keep transformation rules idempotent wherever possible.

## Modules

- `card.ts` owns format detection, editable-field extraction, immutable field updates, and export selection.
- `png.ts` owns PNG chunk parsing, CRC validation, card metadata selection, and chunk reconstruction.
- `macros.ts` owns platform macro profiles and resolved-pronoun previews.
- `rules.ts` emits source-positioned edit proposals and applies accepted proposals.
- The React app owns transient interaction state only. Card-format logic should remain UI-independent so it can later be reused by a SillyTavern extension and command-line batch tool.

## Next engineering slices

1. Add golden fixtures from real V1, V2, and V3 cards with sensitive text removed.
2. Add IndexedDB sessions, explicit recovery packages, and an edit ledger.
3. Replace the approximate preview with a tested SillyTavern-compatible pipeline.
4. Add a tolerant Markdown scanner for nested and malformed asterisks and underscores.
5. Add field-level formatting profiles and written-content backtick suggestions.
6. Add referent-aware pronoun proposals with user, character, NPC, and plural labels.
7. Add ZIP export and resumable batch processing in a Web Worker.
8. Add the SillyTavern extension wrapper around the shared core.
