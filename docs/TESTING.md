# Cardsmith Alpha Testing Checklist

Use this checklist before publishing an alpha build and whenever card parsing, transformation rules, or export behavior changes. Test only with copies. Keep each original card until its edited export has been opened successfully in its destination application.

## Release record

- Date:
- Cardsmith version:
- Commit:
- Browser and version:
- Device and operating system:
- Tester:

## Automated checks

From a clean checkout:

```bash
npm ci
npm test
npm run build
npm audit --omit=dev
```

- [ ] Installation succeeds from `package-lock.json`.
- [ ] Every test passes.
- [ ] TypeScript and the Vite production build succeed.
- [ ] The audit reports no unresolved production vulnerabilities.
- [ ] The built `dist/index.html` uses `/Cardsmith/` asset paths.
- [ ] The built manifest uses `/Cardsmith/` for its ID, start URL, and scope.
- [ ] A custom-domain simulation built with `VITE_BASE_PATH=/` uses root asset paths and `/` for the manifest ID, start URL, and scope.

## Test fixture set

Use sanitized cards that collectively cover the following cases. Do not commit private or sensitive character text.

- [ ] Character Card V1 JSON.
- [ ] Character Card V2 JSON.
- [ ] Character Card V3 JSON.
- [ ] PNG containing a legacy `chara` metadata chunk.
- [ ] PNG containing a `ccv3` metadata chunk.
- [ ] Card with alternate greetings.
- [ ] Card with a character book or lorebook.
- [ ] Card with unknown root, data, extension, and lorebook fields.
- [ ] Card containing JanitorAI pronoun macros.
- [ ] Card containing Wyvern/SillyTavern pronoun macros.
- [ ] Deliberately malformed or unsupported card for warning and error checks.

## Import and editing

For every valid fixture:

- [ ] The file opens without leaving the browser or making an external request.
- [ ] The detected source type and card version are correct.
- [ ] The filename, size, and editable-field count are plausible.
- [ ] Direct text fields appear with the expected labels and contents.
- [ ] Alternate greetings and lorebook entries appear in the field list.
- [ ] An edited field receives a changed indicator.
- [ ] **Restore field** restores the imported value exactly.
- [ ] Replacing the open card clears the previous card's transient state.

For warning fixtures:

- [ ] Recoverable concerns appear in the visible **Review this import** panel.
- [ ] The status bar includes the correct warning count.
- [ ] An unknown schema explains that compatibility is not guaranteed.
- [ ] A card with no recognized text fields explains why the editor is empty.
- [ ] A content/filename-extension mismatch is reported.
- [ ] A V3-shaped card in a legacy `chara` chunk is reported.
- [ ] Fatal JSON, PNG structure, metadata, Base64, and CRC problems prevent import and display a useful error.

## Review rules

- [ ] JanitorAI macros convert to their corresponding Wyvern/SillyTavern grammatical roles.
- [ ] Wyvern/SillyTavern macros convert to the corresponding JanitorAI roles where supported.
- [ ] Converting from and to the same platform makes no proposals.
- [ ] Single, triple, and incorrectly capitalized `user` and `char` braces are proposed correctly.
- [ ] Bold asterisks, bold underscores, emphasis inside quoted dialogue, and em dashes are identified.
- [ ] **Apply safe changes** applies only high-confidence, non-overlapping proposals.
- [ ] Medium- and low-confidence formatting proposals require individual acceptance.
- [ ] Ignoring one proposal does not alter the text.
- [ ] Editing a field regenerates proposals so stale positions cannot be applied.

## Preview

- [ ] Imported and edited text appear side by side on desktop.
- [ ] Both columns stack legibly on mobile.
- [ ] She/her, he/him, and they/them previews resolve both supported macro families.
- [ ] Actions and backtick-delimited written text render distinctly.
- [ ] HTML-like card text is escaped and cannot execute markup or scripts.

## Export integrity

For every edited fixture:

- [ ] Export produces a new `-cardsmith` filename and leaves the original untouched.
- [ ] The exported file re-imports into Cardsmith without an error.
- [ ] Only accepted edits changed.
- [ ] Unknown JSON properties remain unchanged.
- [ ] Unrelated PNG chunks remain byte-for-byte unchanged.
- [ ] The PNG image remains viewable.
- [ ] The exported card imports into its intended destination application.
- [ ] Alternate greetings, lorebook content, extensions, and other non-edited data survive destination import.

## Mobile and PWA checks

Complete these checks in current mobile Firefox and Chrome when possible:

- [ ] Choosing and replacing JSON and PNG files works.
- [ ] Long filenames and large fields do not break the layout.
- [ ] Field tabs scroll horizontally and remain selectable.
- [ ] Editing, review controls, previews, warnings, and export remain usable at phone width.
- [ ] The edited download completes and can be located on the device.
- [ ] The deployed application installs as a PWA.
- [ ] The installed PWA opens at `/Cardsmith/` rather than the account root.
- [ ] After one successful online load, the application shell opens offline.
- [ ] Returning online updates the service worker without losing an open in-memory card.

## Security and privacy smoke checks

- [ ] Browser developer tools show no analytics or card-content network requests.
- [ ] The Content Security Policy produces no unexpected violations during normal use.
- [ ] A card containing `<script>`, event attributes, and HTML tags is displayed as text in preview.
- [ ] No card data remains after closing or reloading the tab.

## Alpha sign-off

- [ ] All automated checks pass on the release commit.
- [ ] All applicable manual checks pass, or each exception is recorded below.
- [ ] The displayed alpha version matches `package.json`.
- [ ] The GitHub Pages workflow deploys the intended commit.
- [ ] The deployed URL completes a final JSON and PNG round trip.

Exceptions and notes:

```text
None.
```
