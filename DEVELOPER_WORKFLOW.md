# Developer Workflow Guide

To ensure consistency, safety, and clear alignment, all contributors must strictly adhere to the following workflow sequence for all code changes. Failure to follow this sequence is a breach of project protocol.

## 1. Scope Boundary
* **Workspace Isolation:** Only read, create, modify, or delete files within the designated project root directory or specified subfolder scope. Do NOT access, edit, or reference files outside this scope unless explicitly instructed otherwise by the project owner.

---

## 2. Pre-Session Sync & Branching
* **Git Tree Synchronization:** Before starting a session or creating a new branch, ensure the local working directory and `main` branch are completely clean and in sync with the remote repository:
  * `git checkout main`
  * `git pull origin main`
* **No Direct Commits:** Never commit directly to the `main` or production branch.
* **Session-Based Isolation:** Work in sessions. Unless explicitly instructed otherwise to isolate a single task, bundle related features and fixes for the current session into a single branch derived from the freshly synced `main` branch.
  * Command: `git checkout -b <prefix>-<session-or-issue-name>`
  * *(e.g., `feature-session-updates` or `fix-auth-and-ui`)*
* **Experimental Feature Gating:** New or unstable features must be implemented with appropriate feature flags or gating to ensure they don't impact standard users until verified.
* **GitHub Issue Association:**
  * Link commits directly to the relevant GitHub issue(s) being addressed (e.g., including `Fixes #123` or `Refs #123` in commit messages).
  * Ensure all fixed issues are properly linked so that submitting/merging the PR automatically closes those issues as **completed**.

---

## 3. Implementation & Pushing
* **Verify Changes:** Complete code changes across all bundled updates for the session and ensure all local static files, scripts, and validation checks (`npm run lint`, `npm run build`, `npm run build:server`, and `npm test`) pass successfully.
* **PWA & Asset Synchronization Protocol:** Whenever brand assets, icons, or logos are added or modified:
  * Automatically regenerate and synchronize the entire PWA icon suite across all densities and formats (`logo.png`, `icon-512.png`, `icon-192.png`, `icon-maskable-512.png`, `icon-maskable-192.png`, `apple-touch-icon.png`, `favicon.png`).
  * Ensure maskable icons (`icon-maskable-*.png`) are calibrated within the 80% safe zone to prevent Android launcher clipping.
  * Ensure splash icons (`purpose: any`) are properly configured with breathing room on the matching background canvas.
  * Update `manifest.json` and the pre-cache list in `sw.js` to ensure the installed PWA never serves stale assets.
* **Documentation Review (Mandatory Before Every PR):** Before finalizing any branch or opening a Pull Request, inspect and update project documentation whenever user-facing capabilities, settings, architecture, APIs, or deployment workflows change:
  * `FEATURES.md` — Detailed capability & widget/engine reference.
  * `README.md` — Top-level feature highlights, setup, and configuration overview.
  * `ARCHITECTURE.md` — IndexedDB stores/fields, state sync/conflict resolution, `/api/*` edge/server handlers, and container runtime behavior.
  * `RASPBERRY_PI.md` — Whenever Docker, `compose.yaml`, runtime env vars, or `scripts/pi-kiosk-setup.sh` change.
* **Push Remote:** Push the local branch to the remote repository:
  * `git push -u origin <branch-name>`

---

## 4. Versioning (MANDATORY STOPPING POINT)
> [!CAUTION]
> **STRICT REQUIREMENT:** Never increment the version number (`package.json`) or update `CHANGELOG.md` / `src/data/changelog.ts` autonomously. Confirmation from the project owner is a HARD BLOCK for this section.
> 
* **Version Detection:** Check if the application is versioned (e.g., `package.json`, `version.txt`).
* **Mandatory Approval:** Before pushing your branch or applying any versioning changes, you **MUST** ask the project owner: *"Should the version number be incremented?"*
* **Negative Case:** If the application is NOT versioned or version increment is declined, proceed to PR creation.

---

## 5. PR Creation & Mandatory Approval (MANDATORY STOPPING POINT)
* **PR Creation:** Use GitHub CLI (`gh`) to create a Pull Request once changes are verified and versioning (if applicable) is approved.
* **Issue Closure in PRs:** When creating the PR body, include GitHub keyword triggers (e.g., `Closes #123`, `Fixes #456`) so that the referenced issues are marked as **completed** upon submission/merge.
* **Wait for Approval:** After creating the PR, **STOP** and wait for the project owner to provide an explicit **"Merge"** command in the chat.
* **Shortcut Command:** If the project owner provides a combined command (e.g., *"PR and Merge"*), you may proceed with both PR creation and merging sequentially in one execution block.
* **Tooling & Environment Requirements:**
  * GitHub CLI (`gh`) must be installed and used for PR and merge actions.
  * **Environment Variable Fix:** If authentication or execution issues occur with `gh` (such as conflicting tokens), ensure conflicting token environment variables (e.g., `GITHUB_TOKEN` or `GH_TOKEN`) are set to `null` or cleared in the session shell.
* **Execution Commands:**
  * `gh pr create --title "<Title>" --body "Summary of changes. Closes #<IssueNumber>"`
  * `gh pr merge --squash --delete-branch` *(Execute ONLY after explicit owner command)*

---

## 6. Cleanup & Release
* **Sync Local:** Only after the PR is successfully merged, switch back to your local `main` branch and pull the latest changes.
* **Repository Hygiene:** Ensure both local and remote feature/session branches are fully cleaned up and deleted.
  * Commands:
    * `git checkout main`
    * `git pull origin main`
    * `git branch -d <branch-name>`
* **Artifact Cleanup:** Permanently delete all session tracking artifacts (e.g., `implementation_plan.md`, `walkthrough.md`, scratch notes) once the PR is merged to prevent context pollution in future sessions.
* **Release Notes:** Provide a concise summary of all changes completed in the session. Use **bullet points** to list functional changes or fixes.
