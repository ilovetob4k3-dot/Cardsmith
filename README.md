# Cardsmith

Working title for a local-first character-card compatibility editor.

The application imports Character Card PNG and JSON files, exposes their editable prompt fields, proposes reversible compatibility changes, previews pronoun macros, and exports the modified card without uploading its contents.

## Current foundation

- Character Card JSON import and export
- PNG `chara` and `ccv3` metadata decoding
- Lossless preservation of unrelated PNG chunks and unknown JSON fields
- Editable prompt-field discovery, including alternate greetings and lorebook entries
- JanitorAI and Wyvern/SillyTavern pronoun-macro conversion proposals
- Malformed `user` and `char` brace normalization
- Formatting warnings for bold, underscores, dialogue emphasis, and em dashes
- Resolved-pronoun preview
- Offline-capable application shell
- Mobile and desktop layouts

All file processing happens in the browser. There is no upload endpoint, analytics service, or remote card-processing API.

## Development

```bash
npm install
npm run dev
```

Validation:

```bash
npm test
npm run build
```

Deployment is intentionally not enabled until the repository rename is complete.
