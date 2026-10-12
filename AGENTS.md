# AGENTS.md

## Project Overview

This project adds a userscript feature to Bruno (API client), providing a one-click copy button for network logs and responses.

## Repository Structure

| File | Description |
|------|-------------|
| `src.js` | The userscript itself. Runs as an IIFE in Bruno's renderer process |
| `build-bruno-with-userscripts.sh` | Automates Bruno clone → patch apply → build |
| `bruno-userscript-feature.patch` | Patch that adds userscript loading to Bruno (target version is defined by `BRUNO_TAG` in the build script) |
| `tests/src.test.cjs` | Browser regression test using a Timeline DOM fixture |
| `.agents/skills/updating-bruno-userscript-patch/` | Skill for regenerating the patch |

## Important Notes

### Patch File Management

- `bruno-userscript-feature.patch` depends on the Bruno version specified by `BRUNO_TAG` in `build-bruno-with-userscripts.sh`
- When upgrading Bruno's version, patch context lines may no longer match, causing `git apply` to fail
- When updating the patch, **always clone and read the target version's source first**. Never reuse line numbers or indentation from a previous version
- Never hand-write patch files. **Edit the cloned source with a file editing tool, then generate the patch with `git diff HEAD`**
- Use dedicated temporary clones for editing and verification. Do not delete or reset an existing `bruno-userscript-build/`
- Reuse upstream watcher shutdown; do not restore the old watcher `closeAll()` additions
- Patch applicability does not establish Copy compatibility. Read the target renderer components used by `src.js`

### Patch Update Procedure

The `updating-bruno-userscript-patch` Skill contains detailed steps. Summary:

1. Clone the target Bruno version into a dedicated temporary directory
2. Read the loader, shutdown lifecycle, utility dependencies, and renderer components used by Copy
3. Edit the cloned source and adapt `src.js` and its DOM fixture where needed
4. Generate a scoped patch with `git diff HEAD` (run `git add` for new files first)
5. Run `git apply --check`, apply the patch, and check syntax in a separate untouched clone
6. Validate Copy and cleanup behavior; synchronize version references, this file, and the skill

Do not use `git checkout`/`git clean` to create the verification baseline: staged new files survive those commands.

### Updating build-bruno-with-userscripts.sh

When changing the target version, update `BRUNO_TAG`, the build script's header, and README version/compatibility notes. Check the target `.nvmrc` before changing Node prerequisites.

## Coding Conventions

### src.js

- Wrap in an IIFE `(() => { ... })()` and `return` a cleanup function at the end
- Consolidate settings in the `Config` object
- Separate concerns: `DomOperations` for DOM manipulation, `DataProcessor` for data handling, `Utils` for utilities
- Always mask sensitive information (Cookie, Bearer tokens, etc.)
- Limit extraction to the selected Timeline entry's Response panel; hidden Request editors may remain mounted
- Handle lazy tabs, folded Body, and Preview mode. Do not silently copy an unavailable body as empty or bypass the large-response warning

### Verification

- Syntax checks: `node --check src.js` and `bash -n build-bruno-with-userscripts.sh`
- Copy regression test: `node --test tests/src.test.cjs` (requires Bruno dependencies in `bruno-userscript-build/` and Google Chrome)
- Compare the DOM fixture with the target source before relying on the test. Fixture tests are not actual Bruno app verification
- Follow the user's verification policy for full builds and final app checks. The build script replaces `bruno-userscript-build/` and installs scripts into userData

### Files Modified by the Patch (Bruno side)

The current patch modifies three files under `packages/bruno-electron/`:

- `.gitignore` — adds `userscripts/`
- `src/index.js` — loads userscripts after `main:app-loaded` and awaits their cleanup during shutdown
- `src/utils/userscripts.js` — new file (userscript utilities)

In v4.2.1, cleanup runs alongside upstream `closeAllWatchers()` within the existing two-second shutdown deadline. Preserve the quit guard and other shutdown steps; skip renderer cleanup for destroyed windows or webContents. Re-read this lifecycle for later releases.
