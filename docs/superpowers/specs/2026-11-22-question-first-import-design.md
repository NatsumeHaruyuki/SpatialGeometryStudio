# Question-first image JSON import

User authorizes importer, drawing system and built-in Prompt changes to make screenshot → external multimodal LLM → JSON → SGS reliable. Continue Windows v0.2 sample only; no packaging until user confirms. Keep all old files/releases/data, no new software installs.

## Contract

New authoring format is schema_version:2. Retain the existing Scene shape and constructions, but required author data can be as short as title/solid/constructions. Crucial distinction: a v2 primitive's solid.points are the question's explicit named points, not generated control handles. No letters are reserved. v1 round scenes retain their old automatic controls and behavior.

Example solid: {type:'cone', points:[{id:'D',position:[0,1.7320508075688772,0]},{id:'O',position:[0,0,0]},{id:'A',position:[1,0,0]},...], primitive:{kind:'cone',apex:'D',baseCenter:'O',radiusPoint:'A'}}. Coordinates, not problem prose, define actual geometry. B/C/E are explicit real circle coordinates; P can use existing movingPoint with start O,end D,t0.408248290463863.

Primitive references normalize to solid.definition, which persists and derives numeric solid.primitive on validation. Definition variants: cone/doubleCone {kind,apex,baseCenter,radiusPoint}, cylinder {kind,baseCenter,topCenter,radiusPoint}. References must name explicit solid.points. Radius point is in the relevant base plane. Native numeric primitive remains supported in v2. v2 type:'diagram' allows point/line/triangle illustrations without forcing closed-polyhedron topology; polyhedron with faces still requires valid convex closed topology. New construction kind:'point' {id,kind,point,label,position} supplies arbitrary additional points in any model.

v2 defaults: scene/solid/construction IDs, point/output labels, problem fields, empty collections, display settings and fitted view. Explicit values stay authoritative. Unknown/incorrect fields remain errors rather than being silently discarded. Input decoder handles BOM, a single fenced JSON block, JSON-string-wrapped JSON and HTML/backslash-newline transport artifacts only after normal parsing fails. Never eval input or guess mathematical coordinates from prose.

Canonical Scene type: schema_version:1|2; Solid gains optional definition: QuestionSolidDefinition; numeric primitive stays existing RoundPrimitive. parseScene remains the single file/JSON/native entry point and normalizes external v2 then validates canonical fields. Exports save canonical v2 with the same explicit question points and definition, and can reopen without changes.

## Editing and rendering

v2 renderer draws only declared question points and derived points. Internal roundControlPoints may be used for bounding calculations, never inserted in v2 point maps. Primitive models with zero explicit points remain renderable. v2 definition bindings drive radius/axis/height; dragging bound apex/baseCenter/radiusPoint transforms existing question points using the model frame to preserve model structure. Other named question points move independently, with the existing condition-recheck notice. v1 control editing remains unchanged. UI coordinate editor describes question-point mode honestly.

## Diagnostics and workflow

List duplicate point IDs and owners, missing refs and construction owners, and a readable dependency cycle. Retain valid current scene on failure. Reject ambiguous/malformed data; supply a repair-copy path if practical. Built-in one-click Prompt uses only the new explicit format, gives a complete minimal cone example, explicit source/assumption handling and no reserved ID rules. No external AI call is sent by SGS.

## Acceptance

Reconstruct user's cone题 with D apex/O center, AE=AD=2, ABC equilateral on radius1 base, PO/DO=sqrt(6)/6; no extra T/control letters displayed. Test import via paste with missing optional fields, unsorted derived refs, fenced/HTML transport and native file paths; save/reopen; edit/motion/undo; compare actual mathematical distances. Also import custom-letter cylinder, diagram and a polyhedron; all old tests/scenes remain valid. Update Windows v0.2 sample and demonstrate a corrected .gscene and ready-to-copy JSON. Original circular/missing-D JSON is not silently guessed into a different mathematical scene.
