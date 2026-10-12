# Plainchain Species

A local field guide to Meteora DBC configuration rules, with a Solami mainnet inspector and live event tape. Ivory surfaces, upright technical type, black/gray geometric specimens and a decorative cellular background.

## Run

Use Node 22.12+ (including built-in `process.loadEnvFile`). From this folder:

```powershell
npm install
npm run dev
```

Open http://localhost:4173. The server binds to 127.0.0.1. For the compiled version, run `npm run build`, then `npm start`. Only run one server on this port at a time. Stop the terminal process with Ctrl+C.

The local `.env` contains server-only provider keys. `.env.example` documents the variable names. The browser receives neither the keys nor credential-bearing provider URLs. Panta catalog checks prefer `PANTA_LIVE_API_KEY`, falling back to `PANTA_API_KEY`. Both are used only for reading the catalog.

The default census source is `../Coliseum World's Fair/research/probe/dbc/configs.compact.jsonl`. This existing 300 MB research file stays outside the app. Set `SPECIES_DATA_PATH` to relocate it. On first load the server builds `data/census.json.gz` (about 32.5 MB). Later starts validate and use this portable bundle, including when the original source is absent. Run `npm run prepare-data` to prepare/check it separately. If neither a valid bundle nor source exists, the app explicitly reports unavailable data. Do not commit the raw crawl. To move the local app, include the bundle and configure credentials separately; never copy `.env` into a public artifact.

Samples, up to 100 cached account reads, 500 pool identities and 1,000 event observations are saved atomically in `data/observations.json`. They survive server restarts. Cached account reads have a one-minute TTL; an RPC failure can return a visibly dated stale account with its current-fee marker removed. Saved events appear only in the separate recorded tape. These files are ignored by Git and are not served as static assets.

## Tour

- **Census:** observed configuration counts and most prevalent indexed species.
- **Atlas:** search by rank, fingerprint prefix, or saved config address; filter fees, LP allocation, quote token and migration destination; grid/table, pagination.
- **Species plate:** plain-English clauses with raw-field citations, example configurations, indexed JSON export and bounded pool observations.
- **Inspector:** read a current mainnet config/pool/token via Solami and decode with Meteora's SDK. Twelve clauses cover fees, LP allocation, migration, supply, activation, token program, vesting and curve fields. Full account JSON exports preserve large integer strings.
- **Fee schedule:** step chart computed with Meteora's exact integer math. Timestamp and slot schedules keep their actual units. Pool activation and a confirmed chain clock place the current base fee; config-only views never invent an activation date. Dynamic fees and first-swap exceptions are explicitly separate.
- **Baseline:** nearest prevalent indexed profile with matching quote/migration destination, tied by prevalence. Differences against this comparison never change the exact species identity.
- **Builders:** parameter JSON, hydrated TypeScript/BN SDK parameters, and a read-only API example. SDK validation status distinguishes accepted parameter sets from historical configs rejected by the current creation rules. Recipient addresses and signers are not silently copied into creation parameters.
- **Compare:** exact indexed-field differences and comparison export.
- **Live:** explicitly verified DBC events, receipt times, source links, decoded species links when available, pause and type filter. Recent 300 rows; session-scoped last-hour swap count. Heartbeat/reconnect handling, visible freshness and separate recorded tape. Background pool enrichment is bounded to one read every five seconds and 24 pending addresses.
- **Specimen study:** six procedural SVG families with outlines, grayscale facets and light engraving. Selection persists in this browser.
- **Connections:** bounded, read-only Panta catalog evaluation, with attribution and honest provider states.

## Data boundaries

The saved file has **543,274 configuration accounts**, not that many token launches. The original analysis used 17 selected fields and found **73,827 profiles**. This app groups all 21 rule fields retained in the compact file and finds **75,249 indexed species**. Recipient/account identities are excluded. Full SHA-256 is retained; the URL prefix is checked for collisions during loading.

This remains a compact comparison, not complete on-chain account equivalence: the source retains a truncated curve digest, reduced vesting information, and omits other account settings. The inspector retrieves the full decoded account separately. The displayed snapshot timestamp comes from the saved file's modification time, not an independently verified slot timestamp.

Shapes are deterministic visual identifiers. Different species can share a shape. They do not encode quality, safety, expected return, or a claim of exact full-account identity. Rankings are snapshot prevalence and may change when the dataset changes; fingerprint IDs are stable for the same indexed values.

At startup the server samples the top 125 species, using up to four configuration addresses per species selected by a deterministic reservoir. Each config lookup returns at most the first 12 standard pools. Other species queue on request (queue cap 150). Successful samples are reused for one day; failed/partial samples can retry after one minute. Samples exclude transfer-hook pools and do not establish species-wide outcomes. Every result includes attempted/successful config counts, pool n, read failures, pagination flags and observation time. Migration flags reflect program state; no independent destination-pool verification or survival analysis is claimed. The completed first pass read 500 configs and returned 544 pools, including 259 migration flags; these are observations, not a population graduation rate.

Panta accepted both supplied keys: the test key returned one sandbox-titled item; the live key returned 20 real catalog entries in the bounded check. No structured token references were returned in that page. This does not prove no relevant markets exist elsewhere; it means the DBC linkage and mechanical-resolution gate remain unproven. This is an access evaluation, not a finished Panta sidetrack product integration. No wallet connection, market creation, purchases, signatures, broadcasts or trade reporting are implemented.

## Checks

```powershell
npm test
npm run build
# With the local server running; makes bounded read-only provider requests:
npm run probe
```

Eleven tests cover identity, exact amounts, SDK fee schedules, portable/corrupt census handling, concurrent inspection coalescing, stale fallback, replay separation, partial pool joins and actual SDK encoding of a public-chain fixture. The probe checks census/filter/export/comparison, real config/pool reads, fee math, builder mapping, source citations, baseline identity, request rejection and provider status. It writes sanitized `artifacts/data-verification.json`. `tests/fixtures/fee-config.json` is a public on-chain account, not a credential.

Browser verification covers atlas filtering/table mode, species pages, JSON download, comparison, style selection, live display, and responsive layout. See `BUILD_NOTES.md` for the evidence and remaining product decisions.

## Structure

`src/` holds React UI and vector specimens. `server/catalog.mjs` owns the census; `domain.mjs` owns indexed identity; `evidence.mjs` owns full-account explanations, fee math and SDK exports; `storage.mjs` handles atomic persistence; `providers.mjs` adapts providers; `index.mjs` serves the API and Vite/static frontend.

This is a single-process localhost product, with host/origin restrictions and bounded inspection requests. Public hosting needs a separate deployment setup, provider quotas/access review and dependency review. The October 11 dependency audit reports 13 transitive findings (six high, seven moderate) in the Solana/Anchor dependency tree. Several lack a compatible SDK fix; no forced major upgrade was applied. No public deployment has been configured.
