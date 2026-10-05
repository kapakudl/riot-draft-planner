# Draft Lab — desktop draft analysis

## Start on Windows

1. Extract the ZIP into a new folder. Keep your existing project as a backup.
2. Open the extracted `riot-draft-tool` folder (the one containing package.json) in VS Code.
3. In the VS Code terminal run:

```powershell
npm.cmd ci
npm.cmd start
```

Use a current Node.js LTS release. The initial install downloads Electron and requires internet access. Do not copy your previous renderer.js over this version.

## Use your Riot API key

Expand **Riot API connection (optional)**, enter your key locally, choose your platform, and click **Test connection**. It calls Riot's LoL platform-status API. The password field is cleared after the test; the key is neither written to disk nor saved in drafts. An expired or invalid key produces an error. Never embed a production key into a distributed desktop executable.

This is an API connection check, not a professional-match ingestion service. The key does not power the Top 5 panel. Champion data and portraits use Riot's public Data Dragon; professional results come from the included public dataset, direct updates, and optional CSV imports.

## Professional data is included — no CSV required

The app includes a normalized snapshot of **9,369 complete 2026 games** from the publicly shared Oracle's Elixir dataset. Recommendations are available immediately. All champion names in the snapshot matched Riot's 173-champion Data Dragon roster (16.19.1) when checked.

Click **Update pro data** to fetch the 2026 dataset from the same public source and merge newer records by game ID. Downloads are approximately 75 MB at the time of validation. Network or provider failures leave your saved data intact. This update button is configured for the 2026 file; future seasons need a new source link.

Source folder: https://drive.google.com/drive/folders/1gLSw0RLjBbtaNy0dgnGQDAZOHIgCe-HH

Source file: https://drive.google.com/file/d/1hnpbrUpBMS1TZI7IovfpKeZfWJH1Aptm/view

Data compiled by Oracle's Elixir / Tim Sevenhuysen. Only normalized game IDs, sides, champions, positions, draft order, outcomes, leagues and patches are included; the full raw player statistics are not bundled. Follow the provider's usage terms and attribution requirements. Public source was retrieved during this build on October 3, 2026 UTC (October 2 Eastern). The dataset includes many leagues and development circuits: select the leagues and patches relevant to your draft.

If the provider requires a browser download, click **Get pro-play data**, download the CSV, then use **Import CSV (optional)**. You can also import other compatible seasons.

Required column names: `gameid, side, position, champion, result, league, patch`.
Expected player positions: top, jng, mid, bot, sup. Common spelled-out alternatives are supported. `result` must be 0 or 1. Team aggregate rows supply optional validated draft order via pick1–pick5; player rows supply champions and results. Games must have exactly five valid player rows per side, unique roles per side, ten distinct champions, complementary results, and consistent patch/league metadata. Invalid games are rejected with a count. Files are limited to 150 MB.

Repeated game IDs replace existing records rather than increasing counts. Importing multiple seasons merges them. Imported normalized games and the champion roster are saved in Electron's user-data directory (`%APPDATA%/draft-lab` in normal Windows development use). Imported datasets are not bundled with exported drafts. No fabricated match data is included; the starter dataset is real historical data.

## Drafting

Pick-only mode starts by default:

`B1 → R1 → R2 → B2 → B3 → R3 → R4 → B4 → B5 → R5`

Click a champion in the pool or a recommendation to lock the current pick. Suggestions update for the next team after every pick or Undo. Search filters the pool only. Undo removes the last action; Reset starts over. Save/Open draft uses JSON and retains filters when available.

Enable **Include tournament bans** before starting for standard two-phase bans:
- Blue/Red alternate three bans each.
- First six picks.
- Red/Blue alternate two bans each.
- Final four picks.

Picked and banned champions are unavailable. Ban recommendations and fearless series drafting are not included. Mode is locked once drafting begins; reset to change it.

## Recommendation search and inspection (v1.2)

Use **Vet any champion** in the recommendation panel. Search examines the full roster rather than filtering only the current Top 5. Matching champions retain their global rank where eligible. Low-sample, already-used, role-conflicting, and unsupported candidates are still visible, with explicit exclusion reasons.

Click **Inspect** to see the score breakdown, overall results, observed roles, sample support, and individual ally/opponent evidence. Search and Inspect do not draft the champion. Click **Pick** (or **Pick manually** for an unranked available champion) to advance. The inspector refreshes after each pick, Undo, and filter change. Analysis pauses during bans and after draft completion.

## Context-based scoring after B1

The previous formula was dominated by overall win rate. In this version overall win rate is only a small adjustment; the main adjustments come from the current allied and enemy champions.

- Baseline rate for each champion: (wins + 10) / (games + 20).
- Ally expectation: sigmoid(logit(candidate rate) + logit(ally rate)).
- Opponent expectation: sigmoid(logit(candidate rate) - logit(opponent rate)).
- Pair lift: (observed pair wins - pair games × expectation) / (pair games + 20).
- Score: 50 + 10 × (candidate rate - 0.5) + 45 × mean ally lift + 45 × mean opponent lift, bounded to 0–100.

Missing pairs contribute zero lift. Small samples shrink toward zero. Overall results contribute at most ±5 points. A candidate must have at least one current ally/opponent pair with five games, meet the selected minimum total games, and allow a distinct role assignment across the currently selected allied champions. Roles require at least 5% usage in the filtered dataset. All candidates, including those failing these gates, can still be searched and inspected.

Evidence support is the mean n/(n+20) across the current pairings; it is not prediction accuracy or a probability. Pair samples overlap and must not be added as independent games. The five-game contextual gate is deliberately modest, so inspect evidence sizes before relying on a recommendation.

## First-pick scoring

**Best opening picks · Blue B1** and the initial Top 5 use:

65 × Wilson 95% lower bound on observed B1 wins
+ 25 × sqrt(B1 appearances / highest B1 appearances in the selected data)
+ 10 × (observed role count - 1) / 4.

This balances conservative observed success, actual first-pick adoption, and historical flex-role usage. It does not rank solely by raw B1 win rate. Minimum games applies to B1 appearances. Banned champions are excluded.

The bundled dataset has 9,301 games with validated blue draft order out of 9,369 games. B1 is read from the blue team row's pick1 field only when pick1–pick5 match that side's five unique champions. Missing or inconsistent order is excluded. Player array order is never treated as draft order. Matching cached games are automatically enriched with bundled draft order when upgrading.

## Interpretation and limits

All weights and champion-strength expectations are transparent design heuristics, not fitted or independently validated model parameters. The score is not a win probability. Adjusted pairing lift describes an association, not causal synergy or a lane counter. It does not control professional player/team strength, draft intent, schedule, overlapping matches, or patch changes inside an All patches filter.

No engage, range, damage balance, scaling, or other champion-kit traits are inferred from results. Use relevant patch/league filters, inspect samples, and make your own final choice. The same champion can remain highly ranked when supported across several draft states; the app does not rotate suggestions artificially.

Champion roster and portraits use the latest available Data Dragon release even when match statistics use historical patches. Bundled roster metadata and the real dataset allow offline analysis, but portraits require internet and are not explicitly cached for offline use.

## Build a Windows installer

From Windows:

```powershell
npm.cmd run dist
```

The installer appears under `dist`. It is unsigned; signing for public distribution is not configured. This source package has not been built or run on Windows in this session. Check Riot's developer registration and distribution policies before sharing publicly.

## Verification

```powershell
npm.cmd test
```

18 engine/import tests pass, including exact draft order, invalid import rejection, filters, role feasibility, recorded B1 extraction, and recommendation evidence. Regression checks verify that stronger current-matchup evidence can outrank a higher overall win rate, recommendations change when the opposing pick changes, missing evidence adds no positive lift, and low-sample candidates remain inspectable.

DOM interaction tests against the bundled real dataset passed for search outside the Top 5, Inspect without drafting, unranked reasons, ally/opponent breakdown, Undo updates, empty search, and draft completion. Native Electron/Windows launch and visual rendering were not rerun in this environment.

## Files

- main.js: desktop window, local file dialogs, Data Dragon fetch/cache, Riot key test, data persistence.
- preload.js: restricted desktop bridge.
- engine.js: draft sequence, statistics, role feasibility, recommendations.
- importer.js: professional match normalization and validation.
- starter-data.json / starter-roster.json: real starting data and roster metadata.
- renderer.js: interface interactions.
- index.html / style.css: interface and styles.
- tests/engine.test.js: core logic tests.

## Sources

- Riot documentation: https://developer.riotgames.com/docs/lol
- Riot API reference: https://developer.riotgames.com/apis/
- Electron security: https://www.electronjs.org/docs/latest/tutorial/security
- Papa Parse: https://www.papaparse.com/docs
- Oracle's Elixir downloads: https://oracleselixir.com/tools/downloads

Draft Lab is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.
