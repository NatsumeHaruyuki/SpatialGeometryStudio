# Question-first Import Implementation Plan

> **For agentic workers:** Follow test-driven-development and executing-plans. Independent codec, primitive-binding, and Prompt/example tasks can use dispatching-parallel-agents with disjoint files.

**Goal:** Make external multimodal image JSON import directly with question-owned point names and coordinates, without collisions with hidden primitive controls.

**Architecture:** Add a v2 authoring normalizer in front of the central scene validator. Keep canonical scene structure compatible with the engine, rendering explicit point maps in v2 and legacy controls in v1. Resolve reference-based primitives from declared points and retain reference definitions for editing and saving.

**Tech stack:** Existing TypeScript/React/Three/Zod/Vitest/Electron/Playwright, no new dependencies.

**Spec:** docs/superpowers/specs/2026-11-22-question-first-import-design.md

## Constraints and review focus

- Windows v0.2 sample only, no package/release generation or old data changes.
- Point IDs in v2 never collide with implicit handles; label/default generation must not overwrite explicit IDs/values.
- Decoder fallback must preserve ordinary string content and reject ambiguous or executable input.
- Roundtrip/editing must not reintroduce old implicit controls or leave stale derived primitive parameters.
- Validate missing references/cycles with precise owners; invalid import keeps existing project.
- Empty explicit primitive points, large/small shapes, oblique bases and diagram bounds render safely.

## Tasks

1. [x] src/schema/importInput.ts + tests: decodeSceneInput(unknown):unknown, normalizeSceneV2(unknown):unknown. Fill defaults and move referenced primitive to definition without deriving points/geometry. Include fitted view from explicit/numeric bounds. Tests before implementation.
2. [x] src/geometry/questionPrimitive.ts + tests: QuestionSolidDefinition type; deriveQuestionPrimitive(def,points):RoundPrimitive; moveQuestionPrimitive(solid,id,position):Solid. Validate dimensions, base planarity, explicit bindings. Test cone/cylinder/oblique editing/frame transformations.
3. [x] Root scene/schema/graph/engine: v2 canonical acceptance, kind:point, explicit names, diagrams, definition derivation, detailed diagnostics. Regression tests for the exact cone and wrong legacy input.
4. [x] Root rendering/store/Inspector/Dialogs: handle bounds independent of explicit points; question coordinate edits and primitive bindings; honest UI help and import diagnostics. Actual Electron flow first RED then GREEN.
5. [x] Prompt/help + new cone fixture and minimal author JSON; schema-v2 authoring contract documented with a full example. Build one-click native Prompt content and lesson generator integration.
6. [x] Independent code review, fix important findings with regression tests; full existing unit/interaction tests plus new v2 imports, files, clipboard, edit/motion and mathematical verification. Build and deliver sample + cone files, no packaging.

