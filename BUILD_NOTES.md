# Species localhost build — October 11, 2026

## Backend completion — October 11, around 8pm

This update supersedes the initial top-three/sample-of-one limits below. The approved UI is now wired to persistent census/provider state, on-demand pool joins, full config explanations, SDK-computed fee charts, a separate comparison baseline and builder exports.

- Portable census: 32.5 MB gzip, 543,274 configs / 75,249 indexed species. Restart loaded the bundle; an automated test also loaded a bundle with no source file and recovered from a corrupted bundle using raw source.
- Completed sampling pass: 125 species, 500/500 config reads, 544 returned pools, 259 migration flags. Up to four reservoir-selected configs per species / first 12 standard pools per config. Non-probability sample, not a species-wide rate.
- Mainnet fee-schedule example `1QigotGJrKQXnrisRceoUmDBA8ontDXU9Mrotmmq6bR`: 5% to 1%, ten steps of 30 seconds; dynamic fees enabled. Pool inspections also place current base fee using activation and confirmed-chain time/slot. Config-only inspection does not invent a current point.
- Twelve plain-English clauses; raw source citations use actual account values, including the base-fee numerator. LP distributions, token supply, vesting and complete curve evidence included.
- Builder mapping validates with SDK 1.5.13 and round-trips through its Borsh encoder (283 bytes for this fixture). Large liquidity integers survive. Historical mode rejection tested. No transactions created or sent.
- Live pool-to-species links verified in the browser. One-minute inspection cache; bounded background enrichment. WebSocket ping/pong and reconnect handling. Recorded tape successfully loaded after restart and remains explicitly non-live. Receipt times use 12-hour presentation.
- Panta live key returned 20 real markets. No structured DBC token link on that catalog page; integration gate remains unproven. Test-key access alone had previously returned only one sandbox item.
- Eleven tests pass. Expanded mainnet integration probe passes. Production frontend builds. Desktop and 390px mobile inspector checked without page overflow; builder tabs/API snippet, live pause and recorded tape verified. No current browser console errors.
- Evidence: `artifacts/data-verification.json`, `artifacts/sdk-roundtrip.json`, `artifacts/backend-fee-builder.jpg`, `artifacts/backend-mobile.jpg`. Public fixture: `tests/fixtures/fee-config.json`.

Local read-only product scope is complete. Submission still needs deployment, a final demo/video and entry materials. Panta is not ready to claim as a joined product integration. `npm audit` reports 13 transitive dependency findings (six high/seven moderate); several originate in the current Solana/Anchor SDK tree without a compatible fix. The server remains bound to localhost; review these before public deployment rather than forcing an incompatible SDK major upgrade.

## Initial build record (historical)

James approved building the selected ivory field-guide direction with reusable black/gray geometry. This supersedes earlier build/imagery holds. No council prompts, paid image calls, transactions or public deployment were run for this build.

## Implemented and verified

- React/Vite frontend and local Node backend. Six procedural SVG specimen families, three selectable treatments, responsive layouts, local bundled fonts, reduced-motion support.
- Saved census: 543,274 configs, 75,249 profiles under the expanded indexed schema; historical 73,827 count reproducible from its original field selection. Source file not copied into app.
- Browser-verified atlas USDC filter (10,534 species), grid/table switch, species plate, JSON export/download, two-species comparison (four differing fields for species 1/2), and specimen treatment changes.
- Solami returned a full configuration with 43 decoded top-level fields and matched its saved species fingerprint. A real live-event pool also decoded and matched a species. Fees, allocation and threshold explanations retain field citations.
- Explicit DBC swaps and token updates observed; feed retains 300 rows, shows receipt/freshness information, and the pause control freezes display. Pool-create activity also appeared during the browser check. No comprehensive event-coverage claim.
- Bounded outcome join: one pool observed for each of the first configs in the top three species on the verification run. Migration flags were unset, unset, set respectively. These are samples of one, not population rates; subsequent reads can change.
- Panta key accepted (HTTP 200). Actual catalog envelope is `items`, `nextCursor`, `disclaimer`; market ID is `marketId`. One returned item titled “Sandbox test market.” No structured token link in that catalog item. Panta is a read-only access evaluation, not a finished integration for competition claims.
- Production build passed. Domain tests passed. Local integration probe passed census/filter/export/compare/config+pool read/input/method checks. Desktop at 1440 pixels and mobile at 390 pixels checked; mobile inspector had no horizontal page overflow. No browser console errors on the final inspector check.

## Next review

James can review the live app and compare the three treatments under Specimen study. The substantive next product decision is whether Panta has a useful, supported relationship to launch-rule profiles; credentials alone do not establish that. A submission/demo still needs its own final readiness review and public deployment authorization.

## Operations and evidence

Start/restart instructions and limitations are in README.md. Sanitized integration evidence is generated at `artifacts/data-verification.json`; bounded pool evidence is in `data/outcome-probe.json`. Both folders are ignored. The saved census is static; live inspection and live events are separately dated. Keys remain server-side in the ignored `.env`.

Known scope: indexed comparison rather than full census account equality; no full historical pool crawl; no independent migration destination verification; no wallet execution; no automatic public deployment; no Panta outcome join. The browser JSON-download check experienced a long tool delay but produced the expected file in Downloads. Later browser interactions completed normally.

## Digital field-guide visual revision

James approved a web4.ai-inspired direction: squared upright Chakra Petch headings, DM Sans body, IBM Plex Mono metrics, no italic flourishes, and a full-viewport cellular canvas. The cell patterns are decorative, not market data. Motion can be paused in the header; the preference survives refresh. Reduced-motion and page visibility stop animation work. Ivory palette and SVG specimen family are preserved. Production build passed; 1440px desktop and 390px mobile checked, plus pause persistence and resumed motion. Preview screenshot: artifacts/species-digital-field.jpg. No backend or data changes.

## Focused product polish — October 12, 2026

- Homepage now explains the inspect/compare/reuse workflow and provides two real examples: config 1QigotGJrKQXnrisRceoUmDBA8ontDXU9Mrotmmq6bR and species 1 vs 26. Comparison deep links load their results directly.
- Cards lead with starting fee, fee behavior, destination, quote token and permanent LP allocation. Shape names remain secondary identifiers.
- Profile actions precede the clauses. Inspector opens with four sourced facts and the configured fee chart; rules, baseline, builder and source evidence remain accessible in separate sections. The primary export action moves to its section. Mobile puts the facts before the illustration.
- Fourth optional treatment: Dithered ink, using deterministic ordered Bayer shading in the existing SVG mesh. Large forms reveal once, then remain still. Global pause and reduced-motion CSS disable specimen motion. Existing three treatments retained; preview selection set to Dithered ink.
- Verification: production build passed; browser checked at 1440px and 390px without horizontal page overflow. Real example decoded a 5% to 1% base fee schedule; all 12 clauses available; baseline and source account intact; builder reports SDK validation; direct comparison returns 11 differing fields. Header pause disabled specimen animation and survived reload. Final console check returned no errors. Backend logic and credentials unchanged; export controls inspected, download not repeated in this pass.
- Preview files: artifacts/species-polish-home.jpg, species-polish-inspector.jpg, species-polish-mobile.jpg, species-polish-home-mobile.jpg. Local production server remains on localhost:4173. No deployment or submission performed.

