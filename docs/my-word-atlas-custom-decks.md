# My Word Atlas: Personal Decks

This branch extends the upstream Word Atlas React/TypeScript app without replacing its open corpus, FSRS scheduler, pronunciation handling or WebGL galaxy.

## Implemented

- My Decks / 我的詞庫 navigation page and editor.
- Create/select local custom decks; add, edit, delete entries.
- Import UTF-8 CSV/JSON, Google Translate Saved Translations in either direction (including auto-detected English to Cantonese), and Word Atlas JSON.
- Deduplicate on normalized English word; export a deck as JSON.
- In-memory Atlas adapter: existing Today, Learn, FSRS, pronunciation and Galaxy features work on selected words.
- Dataset-specific progress keys keep public-atlas progress separate.
- Export and restore a personal deck with its exact FSRS cards, bookmarks, practice stats and review history aggregates. Restore creates a new deck ID so existing decks and their progress stay independent.
- Restore a standalone V1.4.1 backup by replaying each word's dated ratings through the bundled FSRS scheduler. The dates and ratings are retained in the resulting schedule and study totals. Legacy fallback intervals and unfinished sessions are not carried over.
- A production build caches its app shell and public vocabulary index after the first online load. Custom deck study and FSRS work offline. External audio and images still depend on availability.

## Run

    npm ci
    npm test
    npm run build
    npm run dev

Then visit http://localhost:5188/#/decks. See [deployment instructions](deployment.md).

## Move a deck to another browser

1. In 我的詞庫, select the deck and choose **備份詞庫與進度**.
2. In the other browser, open 我的詞庫 and choose **還原學習備份**. Select the downloaded JSON.
3. Choose **使用此詞庫開始學習** to activate the restored copy.

To migrate the standalone V1.4.1 version, export its full backup JSON and choose **還原學習備份** in the React app. All nonempty decks in the old backup are copied. The import summary reports replayed ratings and any records that could not be matched to a card.

## Safety and scope

- Personal imported vocabulary stays in browser localStorage. It is not published in this public GitHub repository.
- Export a learning backup before changing device/browser. There is no cloud sync.
- Audio uses browser speech synthesis if no recorded file exists; custom HTTPS media URLs are optional.
- LocalStorage guardrails: 60 decks, 5,000 words per deck, 4 MiB per vocabulary import and 10 MiB per backup file. Available browser space can impose a lower total limit.
- Full teacher dashboard, phrase-specific testing, offline audio packs and account sync are future work.
- Upstream code MIT; original dataset, illustrations and recordings CC BY 4.0. Review LICENSE and CONTENT_LICENSE.md before redistribution.

## Storage separation

- Catalog key: my-word-atlas:catalog:v1
- Progress key: word-atlas:v2:<dataset-id>
- Updating words inside the active custom deck refreshes the current Atlas without reinitializing FSRS progress.

## Future work

Audit translation quality and add a separate phrase learning track.
