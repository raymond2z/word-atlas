# My Word Atlas: Personal Decks (first integration milestone)

This branch extends the upstream Word Atlas React/TypeScript app without replacing its open corpus, FSRS scheduler, pronunciation handling or WebGL galaxy.

## Implemented

- My Decks / 我的詞庫 navigation page and editor.
- Create/select local custom decks; add, edit, delete entries.
- Import UTF-8 CSV/JSON, Google Translate Saved Translations in either direction, Word Atlas JSON, and vocabulary content from V1.4.1 backups.
- Deduplicate on normalized English word; export a deck as JSON.
- In-memory Atlas adapter: existing Today, Learn, FSRS, pronunciation and Galaxy features work on selected words.
- Dataset-specific progress keys keep public-atlas progress separate.

## Run

    npm ci
    npm test
    npm run build
    npm run dev

Then visit http://localhost:5188/#/decks. Deployment instructions: docs/deployment.md.

## Safety and scope

- Personal imported vocabulary stays in browser localStorage. It is not published in this public GitHub repository.
- Export JSON before changing device/browser. There is no cloud sync.
- The old standalone V1.4.1 remains unchanged. Its *vocabulary content* can be imported from a backup, but its scheduling records are NOT converted into ts-fsrs cards.
- Audio uses browser speech synthesis if no recorded file exists; custom HTTPS media URLs are optional.
- LocalStorage guardrails: 5,000 words per deck, 4 MB per import.
- Full teacher dashboard, phrase-specific testing, offline audio packs and account sync are future work.
- Upstream code MIT; original dataset, illustrations and recordings CC BY 4.0. Review LICENSE and CONTENT_LICENSE.md before redistribution.

## Storage separation

- Catalog key: my-word-atlas:catalog:v1
- Progress key: word-atlas:v2:<dataset-id>
- Updating words inside the active custom deck refreshes the current Atlas without reinitializing FSRS progress.

## Future work

Validate and migrate old V1.4.1 progress, audit translation quality, and add a separate phrase learning track.
