---
name: updating-bruno-userscript-patch
description: "Regenerates bruno-userscript-feature.patch for a new Bruno version. Use when Bruno updates break the existing patch, or when upgrading BRUNO_TAG in build-bruno-with-userscripts.sh."
---

# Updating Bruno Userscript Patch

Regenerates the userscript feature patch file (`bruno-userscript-feature.patch`) so it applies cleanly to a new Bruno release.

## Overview

This project adds a userscript loading feature to Bruno by patching 6 files in `packages/bruno-electron/`. When Bruno releases a new version, the patch context lines may no longer match, causing `git apply` to fail. This skill guides the regeneration process.

## Patched Files and Their Changes

### 1. `packages/bruno-electron/.gitignore`
- **What**: Append `userscripts/` to `.gitignore`
- **Where**: End of file

### 2. `packages/bruno-electron/src/app/apiSpecsWatcher.js`
- **What**: Add `closeAll()` method to the `ApiSpecWatcher` class
- **Where**: Before the closing `}` of the class (just before `module.exports`)
- **Content**: Iterates `this.watchers`, calls `.close()`, resets `this.watchers` and `this.watcherWorkspaces`

### 3. `packages/bruno-electron/src/app/collection-watcher.js`
- **What**: Add `closeAll()` method to the `CollectionWatcher` class
- **Where**: Before the closing `}` of the class (just before `const collectionWatcher = new CollectionWatcher()`)
- **Content**: Iterates `this.watchers`, calls `.close()`, resets `this.watchers` and `this.loadingStates`

### 4. `packages/bruno-electron/src/app/workspace-watcher.js`
- **What**: Add `closeAll()` method to the `WorkspaceWatcher` class
- **Where**: Before the closing `}` of the class (just before `module.exports`)
- **Content**: Iterates `this.watchers` and `this.environmentWatchers`, calls `.close()`, resets both

### 5. `packages/bruno-electron/src/index.js` (4 hunks)
- **Hunk A — Import**: Add `require('./utils/userscripts')` after the `deeplink` require
- **Hunk B — Load userscripts**: Inside `mainWindow.webContents.on('did-finish-load', ...)`, after `mainWindow.webContents.send('main:app-loaded', ...)`, add the userscript loading loop (creates directory, reads `.js` files, wraps and executes via `executeJavaScript`)
- **Hunk C — Cleanup userscripts**: At the top of `app.on('before-quit', ...)`, add `window.__userscriptCleanup` cleanup
- **Hunk D — Close watchers**: At the bottom of `app.on('before-quit', ...)`, call `closeAll()` on `collectionWatcher`, `workspaceWatcher`, `apiSpecWatcher`

### 6. `packages/bruno-electron/src/utils/userscripts.js` (new file)
- **What**: Utility module providing `getUserscriptsDirectory`, `createUserscriptsDirectory`, `getUserscripts`, `loadScript`

## Version-sensitive Files

The target Bruno version is determined by `BRUNO_TAG` in `build-bruno-with-userscripts.sh`. When updating to a new version, **all of the following must be kept in sync**:

| Location | What to update |
|----------|---------------|
| `build-bruno-with-userscripts.sh` `BRUNO_TAG` | Change to the new tag (e.g., `v3.2.0`) |
| `build-bruno-with-userscripts.sh` header comment | Update the version in the comment (e.g., `Bruno v3.2.0 + Userscript feature build script`) |
| `README.md` | Update all version references (e.g., `v3.1.4` → `v3.2.0`) |

## Workflow

### Step 1: Identify the target version

Check `build-bruno-with-userscripts.sh` for the `BRUNO_TAG` variable, or ask the user which version to target.

### Step 2: Clone the target version

```bash
WORKSPACE_ROOT="<workspace root directory>"
BUILD_DIR="$WORKSPACE_ROOT/bruno-userscript-build"
rm -rf "$BUILD_DIR"
git clone --depth 1 --branch <TAG> https://github.com/usebruno/bruno.git "$BUILD_DIR"
```

### Step 3: Read the target files and apply edits

Read each of the 5 existing files listed above from `$BUILD_DIR/` to understand the current code structure (line numbers, indentation, surrounding context). Then apply the edits described in "Patched Files and Their Changes" using `edit_file`. Also create the new `userscripts.js` file.

**Critical**: Match the exact indentation and style of the target version. Do NOT assume line numbers from the previous patch are correct.

### Step 4: Generate the patch

```bash
cd "$BUILD_DIR"
git add packages/bruno-electron/src/utils/userscripts.js
git diff HEAD > "$WORKSPACE_ROOT/bruno-userscript-feature.patch"
```

### Step 5: Verify

```bash
cd "$BUILD_DIR"
git checkout -- .
git clean -fd packages/bruno-electron/src/utils/userscripts.js
git apply --check "$WORKSPACE_ROOT/bruno-userscript-feature.patch"
```

If `git apply --check` exits with 0, the patch is valid.

### Step 6: Update version references

Update `build-bruno-with-userscripts.sh`:
- `BRUNO_TAG` → new tag
- Header comment → new version

Update `README.md`:
- All Bruno version references (e.g., "Build a customized Bruno (v3.x.x)", "Clone Bruno v3.x.x")

## Troubleshooting

- **Patch hunk fails**: Read the actual file at the failing line number, compare with the patch context, and fix indentation/context mismatches.
- **New code inserted between patch anchors**: If Bruno added new code between the patch's context lines, the hunk boundaries need to be recalculated. Always re-read the source files rather than guessing.
- **`closeAll()` method already exists**: If Bruno adds its own `closeAll()` in a future version, skip that file's hunk.
