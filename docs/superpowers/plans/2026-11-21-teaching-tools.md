# Teaching Tools v0.2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for integration. Independent pure geometry / UI modules may use dispatching-parallel-agents with exclusive file ownership.

**Goal:** Deliver all five teaching-tool improvements as a tested Windows portable version.
**Architecture:** Preserve the current app shell. Extend v1 scene data with analytic round primitives, movable sections and the user-confirmed sphere construction. Pure modules keep geometry separate from WebGL; the store owns transactions and persistence.
**Tech Stack:** Existing TypeScript, React, Three.js, Zod, Electron, Vitest, Playwright. No new dependency.
**Spec:** docs/superpowers/specs/2026-11-21-teaching-tools-design.md

## Global Constraints
- All development stays within SpatialGeometryStudio; external installations, if any, go below D:\DevDep in camelCase software directories.
- Preserve existing .gscene v1 files and previous release; do not delete user data or include it in a ZIP.
- Space three-point spheres require clarification, not an arbitrary fabricated sphere.
- Undo covers a complete drag as one edit; JSON import remains dirty until saved.
- No external AI request; copy the complete locally bundled Prompt.

## Review Focus
- Pointer capture, outside release, modifier changes and camera controls must not leave dragging stuck.
- Cube/prism quad faces must remain planar after vertex editing.
- Double-cone hyperbola branches must not be joined across an asymptote or convex-hulled together.
- Shifted/empty/degenerate sections must stay selectable and save/reopen correctly.
- Clipboard must contain the complete prompt in the packaged sandboxed app.

### Task 1: Analytic round solid module
- [ ] Test canonical controls, circle/ellipse/parabola/hyperbola and degenerate plane cases.
- [ ] Implement src/geometry/roundSolids.ts and its own tests; integration contract in teaching-task-round.txt.
- [ ] Run its focused Vitest suite and report actual results.

### Task 2: Family-preserving vertex deformation
- [ ] Test prism translation, base-plane projection, pyramid apex and free tetrahedron.
- [ ] Implement src/geometry/deform.ts and tests; preserve topology and original point dependencies.
- [ ] Run focused tests including parseScene on the modified shapes.

### Task 3: Prompt copy UI
- [ ] Add native/fallback copying in Dialogs and accessible success/error states, preserving JSON text.
- [ ] Verify exact clipboard content in the integrated Electron flow.

### Task 4: Schema, store, renderer and model integration
- [ ] Add schema fields and validation; backward compatibility tests.
- [ ] Add common presets, structured model library and conic controls.
- [ ] Implement drag gestures, one-history transactions and section persistence.
- [ ] Implement sphere behavior after user's mathematical clarification.
- [ ] Extend prompt and native clipboard IPC; typecheck, all unit tests and rendered flows.

### Task 5: Verification and Windows delivery
- [ ] Independent code review, fix material findings, review fixes.
- [ ] Test all requested interactions, clipboard, save/reopen and offline paths.
- [ ] Build a new v0.2 release directory, ZIP and hashes; launch actual portable EXE with system-only PATH.
- [ ] Deliver links, screenshot and concise known limits.
