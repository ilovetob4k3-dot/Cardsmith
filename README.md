# Cardsmith

A local-first character-card compatibility editor. The current release is an alpha intended for careful testing with retained originals.

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
- Visible warnings for recoverable import compatibility concerns
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

## Deployment

Pull requests and pushes to `main` run the test and production-build checks. Publishing is deliberately manual during alpha testing:

1. In the repository settings, set the GitHub Pages source to **GitHub Actions**.
2. Open **Actions**, select **Deploy Cardsmith to Pages**, and run the workflow.
3. Complete the smoke checks in [`docs/TESTING.md`](docs/TESTING.md) against the deployed URL.

The production base path is `/Cardsmith/`, matching the repository name.

## Release testing

See [`docs/TESTING.md`](docs/TESTING.md) for the automated commands, fixture expectations, mobile checks, and pre-release sign-off record.
