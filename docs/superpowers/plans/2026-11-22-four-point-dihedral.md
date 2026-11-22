# Four-point Dihedral Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace face selection with the user's two-stage A, B, P, Q dihedral workflow, including colored points and common line.

**Architecture:** Add a scale-aware half-plane measurement to study geometry and a safe adapter supporting both legacy face pairs and new four-point constructions. Extend schema/store, then update toolbar, inspector and Three.js rendering using the existing selection state.

**Tech Stack:** TypeScript, React, Three.js, Zustand, Zod, Vitest, Playwright/Electron.

## Tasks

- [x] Write and observe failing geometry tests for 90°, 120°, supplementary angle, infinite axis, reversed endpoints, 0°/180°, invalid selections and scale.
- [x] Implement measurement + legacy adapter and test schema round-trip, missing references, and recoverable dependencies.
- [x] Write failing store tests for staged selection, invalid-pick recovery, derived point dependencies, cancellation, undo/redo and primitive models; implement point-only workflow.
- [x] Add dynamic step instructions, shared blue/orange selection colors, common-line preview, two-plane previews, final overlays and undefined-state handling; update help and README.
- [x] Update affected smoke path; build and run the complete unit suite, targeted four-point Electron UI checks, and relevant existing UI regression checks. Verify real canvas clicks, label colors, save/reopen and screenshots at desktop/smaller widths.
- [x] Review the final changes and report exact verification and runnable entry point.

## Execution notes

- Original directory is not a Git repository; user asked to change original files. No worktree or commits.
- Browser plugin not available in session; use the existing Playwright/Electron workflow, with screenshots and temporary QA data outside source.
- Build dist for `Windows v0.2.cmd`; historical release executables are separate snapshots.

## Review focus

Selection rollback after invalid axis/side points; deleting upstream derived endpoints; dynamic unavailable dependencies and collinearity; legacy scene compatibility; 120° orientation; snapshot colors versus final scene; keeping the inspector point picker usable on long construction lists.

## Verification and review

- RED: new geometry/store tests failed because the four-point adapter did not exist; the UI test against the previous build failed at the initial step prompt (old face-pair instructions).
- GREEN: `npm test` — 18 files, 230 tests pass. `npm run build` — TypeScript, web and desktop build pass. Existing Vite size warning remains.
- `npm run test:e2e` passes the full existing suite plus the new `test:dihedral`: actual canvas picking, colored labels/chips, infinite/non-edge common line, invalid-pick recovery, undo/redo, native save/reopen, legacy 120°, motion degeneracy/recovery, readable 0° labels, cancellation and a 900×700 viewport. No app console errors or error overlays.
- Fresh read-only review found a 0° label collision and stale AI JSON instructions. The new UI assertion reproduced the collision (RED); separate screen offsets resolve it (GREEN). The actual in-app copied prompt now documents `[A,B,P,Q]`, checked by the existing exact clipboard tests.
- The review's long-list name-picker concern is resolved by scrolling the active picker into view. No review findings left deferred.
- New screenshot evidence is outside the repo under `%TEMP%/sgs-dihedral-dhyHwo`. The rebuilt `dist` is used by the existing `Windows v0.2.cmd` launcher; historical release EXEs were not repackaged.
