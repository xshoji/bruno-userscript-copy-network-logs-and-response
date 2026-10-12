---
name: updating-bruno-userscript-patch
description: "Regenerates bruno-userscript-feature.patch and checks src.js compatibility for a new Bruno version. Use when Bruno updates break the patch or Copy behavior, or when upgrading BRUNO_TAG in build-bruno-with-userscripts.sh."
---

# Updating Bruno Userscript Patch

Update the userscript loader patch and Copy script for the target Bruno release. Patch applicability alone does not establish runtime compatibility.

## Current Patch

The patch currently modifies three files under `packages/bruno-electron/`:

| File | Change |
|------|--------|
| `.gitignore` | Ignore the development `userscripts/` directory |
| `src/index.js` | Import userscript utilities, load scripts after `main:app-loaded`, and await cleanup during shutdown |
| `src/utils/userscripts.js` | Provide directory creation, sorted `.js` discovery, and file loading |

Preserve these contracts when adapting the patch:

- Execute scripts in the renderer via `executeJavaScript`, isolating each script's failure.
- Register returned cleanup functions in `window.__userscriptCleanup`; clear the registry before disposal and await each cleanup, continuing after failures.
- Skip renderer cleanup when the window or its webContents is destroyed.
- Reuse Bruno's watcher shutdown. Do not reintroduce the old watcher `closeAll()` additions or separate dotenv shutdown calls.
- In v4.2.1, integrate cleanup alongside `closeAllWatchers()` inside the existing `Promise.race` with its two-second deadline. Preserve the quit guard and other shutdown steps. Re-read this lifecycle for later releases.
- Use the working-directory `userscripts/` in development and `app.getPath('userData')/userscripts` in production.

## Workflow

### 1. Read the current implementation

Read `build-bruno-with-userscripts.sh`, the current patch, `src.js`, and `tests/src.test.cjs`. Determine the requested target tag; do not assume the current `BRUNO_TAG` is the new target.

### 2. Create an isolated clone

Do not delete or reset the existing `bruno-userscript-build/`; it may contain local changes or installed dependencies.

```bash
WORKSPACE_ROOT="<workspace root directory>"
TARGET_TAG="<target tag>"
SCRATCH_DIR="$(mktemp -d)"
SOURCE_DIR="$SCRATCH_DIR/source"
VERIFY_DIR="$SCRATCH_DIR/verify"
git clone --quiet --depth 1 --branch "$TARGET_TAG" https://github.com/usebruno/bruno.git "$SOURCE_DIR"
```

### 3. Adapt the loader patch

Read the target files before editing. Trace `did-finish-load`, `before-quit`, watcher shutdown, window settings, and utility dependencies. Check whether upstream now provides any patched behavior.

Apply only the missing userscript behavior using a file editing tool. Match the target's style and structure; never assume previous line numbers or hand-write the patch.

### 4. Check Copy compatibility

Read the target renderer components used by `src.js`: StatusBar, ResponsiveTabs, Timeline/TimelineItem, Network, Response, Body, QueryResponse, and its format/Preview controls.

In v4.2.1 the relevant contracts are:

- Dev Tools remains the button placement anchor; the outer Timeline tab can be in an overflow menu.
- Timeline entries use `.tl-row-wrap`, `.tl-row`, and `.tl-detail`.
- Inner tabs use `data-testid="tl-tab-response"` and `data-testid="tl-tab-network"`; the label is `Network`, not `Network Logs`.
- Response and Network panels mount on their first visit and remain mounted while hidden. Limit body extraction to the selected entry's active Response panel, not its Request editor.
- Response metadata is in `.tl-response-meta`; the Body toggle is `data-testid="response-body-toggle"` inside `.tl-block`.
- Preview has no CodeMirror. The format menu exposes `data-testid="preview-response-tab"` on a wrapper; click its `input`, not the wrapper.
- Large-response content requires View before copying. Do not silently treat unavailable content as an empty body or automatically bypass the warning.

Adapt `src.js` and its fixture only when the target source requires it. Keep sensitive-data masking and distinguish an empty body from an unavailable body.

### 5. Generate and verify the patch

Stage new files in the isolated source clone so `git diff HEAD` includes them. Scope the diff to the intended patch files; extend the list only if the target requires it.

```bash
git -C "$SOURCE_DIR" add packages/bruno-electron/src/utils/userscripts.js
git -C "$SOURCE_DIR" diff HEAD -- \
  packages/bruno-electron/.gitignore \
  packages/bruno-electron/src/index.js \
  packages/bruno-electron/src/utils/userscripts.js \
  > "$WORKSPACE_ROOT/bruno-userscript-feature.patch"

git clone --quiet --depth 1 --branch "$TARGET_TAG" https://github.com/usebruno/bruno.git "$VERIFY_DIR"
git -C "$VERIFY_DIR" apply --check "$WORKSPACE_ROOT/bruno-userscript-feature.patch"
git -C "$VERIFY_DIR" apply "$WORKSPACE_ROOT/bruno-userscript-feature.patch"
node --check "$VERIFY_DIR/packages/bruno-electron/src/index.js"
node --check "$VERIFY_DIR/packages/bruno-electron/src/utils/userscripts.js"
```

Use an untouched verification clone rather than `git checkout`/`git clean`: staged new files would survive those commands. Re-read generated and applied files. Successful application establishes patch applicability, not working Copy behavior.

### 6. Validate behavior and synchronize guidance

- Run `node --check src.js` and `bash -n build-bruno-with-userscripts.sh`.
- After Bruno dependency setup in `bruno-userscript-build/`, with Google Chrome installed, run `node --test tests/src.test.cjs`. The test uses a DOM fixture, not a running Bruno app; compare that fixture with the target source first.
- Cover collapsed/expanded entries, multiple entries with different bodies, overflow tabs, folded Body, Preview, missing logs, empty Body, masking, and clipboard failure.
- Check sorted loading, broken-script isolation, async cleanup, cleanup failure, destroyed windows, and the shutdown deadline when loader behavior changes.
- Update `BRUNO_TAG`, the build script's header, README version/compatibility notes, and Node prerequisites if the target `.nvmrc` changes.
- Keep `AGENTS.md` and this skill aligned with the actual patch targets and lifecycle.
- Follow the user's verification policy for full builds and final app checks. Report fixture checks separately from actual app verification; the build script replaces `bruno-userscript-build/` and installs scripts into userData.
- Remove only scratch directories created for this task after verification.

## Troubleshooting

- **Hunk fails**: Read the target context and regenerate the diff from edited source; do not repair patch line numbers manually.
- **Upstream provides the behavior**: Remove redundant hunks. Check semantics, not just method names (`closeAllWatchers()` already handles watcher shutdown).
- **Patch applies but Copy fails**: Inspect lazy rendering, active-panel scoping, body visibility, and Preview controls against the target renderer source.
