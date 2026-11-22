# Geometry Study Sample Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans, with isolated parallel pure math and presentation tasks authorized by dispatching-parallel-agents.

**Goal:** A runnable Windows v0.2 sample with selectable centers, perpendiculars, exact triangles, angles, point-plane projections and cleaned branding.

**Architecture:** Extend scene v1 constructions and centralize point producer/reference metadata. Pure study math supplies robust geometry; the compiler computes available derived points without inventing coordinates for undefined dependencies. Existing renderer adds overlays and right-panel measurements.

**Tech Stack:** Existing TypeScript, React, Three.js, Zustand, Zod, Vitest, Playwright/Electron.

**Spec:** docs/superpowers/specs/2026-11-21-study-sample-design.md

## Global constraints

- No packaging, no new EXE/ZIP, no changes to old release/user data.
- Development stays within SpatialGeometryStudio; reuse installed D:/DevDep runtimes.
- Visible version/sample name: Windows v0.2.

## Review focus

- Undefined sphere center hides descendants but does not block motion or crash rendering.
- A foot outside line segment/triangle still measures distance to the infinite line/plane.
- Duplicate/cyclic output references are rejected; deleting a sphere cascades into center-dependent objects.
- Angles at 0/180 and point-in-plane distance0 have explicit valid states.
- A narrow toolbar and right panel retain usable controls; derived points can be picked on canvas and by name.

## Tasks

1. [x] Pure math in src/geometry/studyGeometry.ts and studyGeometry.test.ts: perpendicularFoot(P,A,B) returns foot,t,distance,direction (null at0); triangleMeasurement(A,B,C) returns area/normal; threePointAngle(A,B,C) returns degrees/rays/normal; pointPlaneProjection(P,[A,B,C]) returns foot,distance,signedDistance,unitNormal,referenceIndex,direction,triangle. Test independent literal results, scale, endpoint/exterior and degenerate cases RED then GREEN.
2. [x] Construction metadata and compiler: src/geometry/constructionGraph.ts (producedPoints/referencedPoints/pointNames), schema sphere center normalization and new perpendicular/triangle/angle/pointPlaneDistance variants; recursive cache computes centers/feet and skips unavailable descendants. Add engine/schema tests first, including center→foot→angle and recovery/cycle cases.
3. [x] Store editing: preserve one source point on entering perpendicular/distance, correct 3/4 point counts, initial validation, stable output names, cascade deletion. Add tests for exact half-base triangle, right-angle, distance2 and undo/roundtrip.
4. [x] Renderer/Inspector/Toolbar: select derived centers/feet, highlight chosen triangles, angle arcs and measurements, perpendicular right-angle, projection triangle/vectors/distance labels, temporary undefined status and PNG labels. Add actual Electron tests proving new user flows and regression recovery.
5. [x] Presentation/sample launcher in App/Sidebar/platform version/scripts. Remove specified text. Build sample with npm run build, launch against installed Electron, keep sample data separate. Add a representative lesson and updated Prompt/help.
6. [x] Independent scoped review; full unit/build/existing interactions plus new study interactions; actual sample screenshots, desktop/narrow UI and local launcher validation. Deliver sample launcher and lesson, wait for user's approval before any packaging.

No git repository exists, so no worktree/commit or branch integration steps are applicable. Browser plugin is not available; use the existing Playwright/Electron workflow.

