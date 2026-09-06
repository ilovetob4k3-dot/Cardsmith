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
- `cardReview.ts` derives field and whole-card review models and performs transactional safe application.
- `summary.ts` derives the whole-card export report and downloadable Markdown/JSON ledgers from final field values and session state.
- The React app owns transient interaction state only. Card-format logic should remain UI-independent so it can later be reused by a SillyTavern extension and command-line batch tool.

## Next engineering slices

1. Add dedicated PNG `chara`/`ccv3` and V3 fixtures, then complete destination-application round trips.
2. Replace the approximate preview with tested JanitorAI-visible and SillyTavern-visible modes.
3. Add a tolerant Markdown scanner for nested and malformed asterisks and underscores.
4. Add field-level formatting profiles and written-content backtick suggestions.
5. Add referent-aware pronoun proposals with user, character, NPC, and plural labels.
6. Add IndexedDB sessions, explicit recovery packages, and ZIP batch export.
7. Add the SillyTavern extension wrapper around the shared core.
