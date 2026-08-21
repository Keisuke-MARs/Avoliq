# Avoliq Complete Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename smartTask completely to Avoliq, including its distributed application identity, local database location, source-level names, and bundle icons.

**Architecture:** The rename has two independent boundaries: the frontend/package layer and the native Tauri layer. The native layer owns the new bundle identifier and database path, so Avoliq starts as a separate application without accessing or migrating smartTask data. The existing 1024px Avoliq source icon is used to regenerate all derived Tauri icon files.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Tauri 2, Rust, Cargo, macOS `sips`.

**Spec:** `docs/superpowers/specs/2026-08-20-avoliq-brand-design.md`

## Global Constraints

- Use the official name `Avoliq`; use `avoliq` for package and DOM identifiers and `avoliq_lib` for the Rust library crate.
- Change the Tauri identifier to exactly `com.kei06.avoliq`.
- Persist new data only at `~/Library/Application Support/Avoliq/avoliq.db`; do not read, migrate, modify, or delete smartTask data.
- Use `design/avoliq-app-icon.png` as the sole source for every derived file in `src-tauri/icons/`.
- Do not add a wordmark to the existing task-operation UI.
- Do not commit unless the user explicitly requests a commit.
- Do not modify the technical directory name `src-tauri`.

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json` | npm workspace identity is `avoliq`. |
| `package-lock.json` | Lockfile root package metadata matches `package.json`. |
| `index.html` | Browser-window title uses the official product name. |
| `README.md` | Gives the repository the official title and its concise product description. |
| `src/index.css` | Keeps the application-specific stylesheet comments aligned with the official name. |
| `src/hooks/useKeyboard.ts` | Exposes `SEARCH_INPUT_ID` as `avoliq-search`. |
| `src/hooks/useKeyboard.test.ts` / `src/components/Palette.test.tsx` | Assert the renamed DOM ID through the exported constant or literal DOM lookup. |
| `src-tauri/Cargo.toml` / `src-tauri/Cargo.lock` | Define the `avoliq` package and `avoliq_lib` crate. |
| `src-tauri/src/main.rs` | Calls `avoliq_lib::run()`. |
| `src-tauri/src/lib.rs` | Builds the new Avoliq database path and proves it by unit test. |
| `src-tauri/src/panel.rs` | Names the platform panel types `AvoliqPanel` and `AvoliqPanelEvents`. |
| `src-tauri/tauri.conf.json` | Sets display name, title, and Tauri bundle identifier. |
| `src-tauri/icons/*` | Derived platform icon set generated from the approved source PNG. |

### Task 1: Rename the frontend and package identity

**Files:**
- Modify: `package.json:2`
- Modify: `package-lock.json:2-8`
- Modify: `index.html:6`
- Modify: `README.md:1-8`
- Modify: `src/index.css:132,152`
- Modify: `src/hooks/useKeyboard.ts:9`
- Modify: `src/hooks/useKeyboard.test.ts:1-70`
- Modify: `src/components/Palette.test.tsx:80-110`

**Interfaces:**
- Consumes: the public `SEARCH_INPUT_ID: string` export from `src/hooks/useKeyboard.ts`.
- Produces: the DOM identifier `avoliq-search`, which keyboard focus handling and Palette assertions share.

- [ ] **Step 1: Change the frontend test expectations to the new identifier**

Update every literal `smarttask-search` assertion in `src/components/Palette.test.tsx` to `avoliq-search`. In `src/hooks/useKeyboard.test.ts`, retain the existing imported `SEARCH_INPUT_ID` and test setup; it will begin creating the renamed ID automatically once the implementation changes.

- [ ] **Step 2: Run the focused frontend tests to verify the renamed literal fails before implementation**

Run: `npm test -- src/components/Palette.test.tsx src/hooks/useKeyboard.test.ts`

Expected: `Palette.test.tsx` fails its `document.activeElement?.id` assertions because the implementation still assigns `smarttask-search`.

- [ ] **Step 3: Apply the minimal frontend rename**

Make these exact metadata and implementation changes:

```json
// package.json
{ "name": "avoliq" }
```

```html
<!-- index.html -->
<title>Avoliq</title>
```

```ts
// src/hooks/useKeyboard.ts
export const SEARCH_INPUT_ID = "avoliq-search";
```

Set the root package name in both `package-lock.json` metadata locations to `avoliq`. Replace the template README with a short Japanese README headed `# Avoliq`, describing it as a macOS task-management palette that helps organize thoughts and move to the next step. Do not add new product UI or a wordmark.

Rename the two application-specific comments in `src/index.css` from `smartTask` to `Avoliq`; CSS selectors, declarations, and design tokens remain unchanged.

- [ ] **Step 4: Run the focused frontend tests to verify the rename passes**

Run: `npm test -- src/components/Palette.test.tsx src/hooks/useKeyboard.test.ts`

Expected: PASS.

- [ ] **Step 5: Record the task boundary without committing**

Run: `git diff --check && git status --short`

Expected: only Task 1 frontend/package/documentation changes, plus this approved plan and specification document; do not run `git add` or `git commit`.

### Task 2: Rename the Tauri application and establish the new data boundary

**Files:**
- Modify: `src-tauri/tauri.conf.json:3-17`
- Modify: `src-tauri/Cargo.toml:2-14`
- Modify: `src-tauri/Cargo.lock` (root package record)
- Modify: `src-tauri/src/main.rs:4-5`
- Modify: `src-tauri/src/lib.rs:4-55`
- Modify: `src-tauri/src/panel.rs:25-77`

**Interfaces:**
- Produces: `fn avoliq_database_path(data_dir: &std::path::Path) -> std::path::PathBuf` in `src-tauri/src/lib.rs`.
- Consumes: `app.path().data_dir()?` in the Tauri setup callback and joins only `Avoliq/avoliq.db`.
- Produces: native crate name `avoliq_lib`, panel types `AvoliqPanel` and `AvoliqPanelEvents`, and bundle identifier `com.kei06.avoliq`.

- [ ] **Step 1: Write the failing Rust unit test for Avoliq’s data path**

Add this module at the end of `src-tauri/src/lib.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::avoliq_database_path;
    use std::path::Path;

    #[test]
    fn database_path_is_scoped_to_avoliq() {
        assert_eq!(
            avoliq_database_path(Path::new("/tmp/application-support")),
            Path::new("/tmp/application-support/Avoliq/avoliq.db"),
        );
    }
}
```

- [ ] **Step 2: Run the targeted Rust test to verify it fails before implementation**

Run: `cargo test --manifest-path src-tauri/Cargo.toml database_path_is_scoped_to_avoliq`

Expected: FAIL because `avoliq_database_path` is not defined.

- [ ] **Step 3: Implement the native rename and data-path helper**

Add this helper above `run` and make setup use it:

```rust
fn avoliq_database_path(data_dir: &std::path::Path) -> std::path::PathBuf {
    data_dir.join("Avoliq").join("avoliq.db")
}
```

```rust
let db_path = avoliq_database_path(&app.path().data_dir()?);
```

Then apply the exact native names:

```toml
# src-tauri/Cargo.toml
[package]
name = "avoliq"
description = "Avoliq - 思考を整え、次へ進むタスク管理パレット"

[lib]
name = "avoliq_lib"
```

```rust
// src-tauri/src/main.rs
fn main() {
    avoliq_lib::run()
}
```

Rename `SmartTaskPanel` to `AvoliqPanel` and `SmartTaskPanelEvents` to `AvoliqPanelEvents` at their macro definitions and every use in `src-tauri/src/panel.rs`. Set Tauri `productName` and `windows[0].title` to `Avoliq`, and set `identifier` to `com.kei06.avoliq`. Update the root package record in `src-tauri/Cargo.lock` from `smart-task` to `avoliq` without changing dependency versions.

- [ ] **Step 4: Run the targeted Rust test and static name scan**

Run: `cargo test --manifest-path src-tauri/Cargo.toml database_path_is_scoped_to_avoliq && rg -n -i 'smartTask|smart-task|smart_task|SmartTaskPanel' src-tauri package.json package-lock.json index.html README.md src --glob '!**/*.test.ts' --glob '!**/*.test.tsx'`

Expected: the Rust test passes. The scan produces no product-identity matches; technical strings such as Vite and Vitest are allowed.

- [ ] **Step 5: Record the task boundary without committing**

Run: `git diff --check && git status --short`

Expected: Task 1 and Task 2 changes are present with no whitespace error; do not stage or commit.

### Task 3: Regenerate and validate the platform icon set

**Files:**
- Read: `design/avoliq-app-icon.png`
- Modify: `src-tauri/icons/32x32.png`
- Modify: `src-tauri/icons/128x128.png`
- Modify: `src-tauri/icons/128x128@2x.png`
- Modify: `src-tauri/icons/icon.icns`
- Modify: `src-tauri/icons/icon.ico`
- Modify: generated Windows tile PNG files under `src-tauri/icons/`

**Interfaces:**
- Consumes: one 1024×1024 RGBA PNG at `design/avoliq-app-icon.png`.
- Produces: every icon listed in `src-tauri/tauri.conf.json` and Tauri’s generated Windows icon variants.

- [ ] **Step 1: Check that the approved source asset is valid before generating derived files**

Run: `sips -g pixelWidth -g pixelHeight -g format design/avoliq-app-icon.png`

Expected: PNG, 1024 pixels wide, and 1024 pixels high.

- [ ] **Step 2: Regenerate all Tauri icons from the approved source**

Run: `npm run tauri icon design/avoliq-app-icon.png`

Expected: the command replaces the generated files beneath `src-tauri/icons/`, including `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`, and `icon.ico`.

- [ ] **Step 3: Validate required generated files and their PNG dimensions**

Run: `test -f src-tauri/icons/32x32.png && test -f src-tauri/icons/128x128.png && test -f src-tauri/icons/128x128@2x.png && test -f src-tauri/icons/icon.icns && test -f src-tauri/icons/icon.ico && sips -g pixelWidth -g pixelHeight src-tauri/icons/32x32.png src-tauri/icons/128x128.png src-tauri/icons/128x128@2x.png`

Expected: every file exists; the three PNGs report 32×32, 128×128, and 256×256 respectively.

- [ ] **Step 4: Record the icon task boundary without committing**

Run: `git diff --check && git status --short`

Expected: only icon variants in `src-tauri/icons/` changed for this task; do not stage or commit.

### Task 4: Run regression checks and rename the repository folder

**Files:**
- Rename directory: `/Users/kei06/dev/smartTaskManagement` → `/Users/kei06/dev/Avoliq`

**Interfaces:**
- Consumes: all prior completed renames and generated icon files.
- Produces: an Avoliq repository directory whose application build and tests pass from its new path.

- [ ] **Step 1: Run the project regression checks before moving the working directory**

Run: `npm test && npm run build && cargo test --manifest-path src-tauri/Cargo.toml`

Expected: all Vitest tests, TypeScript checking, Vite build, and Rust library tests pass.

- [ ] **Step 2: Verify no stale branding remains in source and configuration**

Run: `rg -n -i 'smartTask|smart-task|smart_task|SmartTaskPanel|smarttask-search' package.json package-lock.json index.html README.md src src-tauri --glob '!**/*.test.ts' --glob '!**/*.test.tsx' --glob '!**/Cargo.lock'`

Expected: no matches. The old name may remain only in historical documentation or externally stored old application data, neither of which is changed by this plan.

- [ ] **Step 3: Rename the repository folder after all checks pass**

Run: `mv /Users/kei06/dev/smartTaskManagement /Users/kei06/dev/Avoliq`

Expected: the repository is now located at `/Users/kei06/dev/Avoliq`; this does not delete or modify the old application data directory.

- [ ] **Step 4: Confirm the final repository state from its new path**

Run: `git -C /Users/kei06/dev/Avoliq diff --check && git -C /Users/kei06/dev/Avoliq status --short && test -d /Users/kei06/dev/Avoliq/src-tauri/icons`

Expected: no whitespace errors, expected rebrand changes are visible, and the generated icon directory exists; do not stage or commit.

## Plan Self-Review

- Spec coverage: Task 1 covers visible frontend/package branding, Task 2 covers the new native identity and isolated database path, Task 3 covers all derived icon variants, and Task 4 covers regression checks plus the approved repository-directory rename.
- Data safety: only the new `Avoliq/avoliq.db` path is constructed; no task opens, removes, or migrates `smartTask` data.
- No-placeholder check: completed with no unresolved markers, deferred implementation language, or undefined interfaces.
- Type consistency: `avoliq_database_path`, `avoliq_lib`, `AvoliqPanel`, and `AvoliqPanelEvents` are defined once and used consistently in the task steps.
