# Four-point sphere completion plan

User confirmed: four noncoplanar selected points define a tetrahedron. Add 外接球 and 内切球 toolbar tools to finish the remaining item 2. All earlier teaching features remain intact; publish a separate v0.2.1 directory and preserve prior releases/data.

- [x] Pure sphere math: stable circumsphere and insphere, degenerate rejection, independent literal/tangency tests.
- [x] Scene v1 adds {id,kind:circumsphere|insphere,points:[four IDs]}. Store requires four selections and rejects degenerate initial creation. All point references must exist and be unique.
- [x] A previously defined sphere that becomes degenerate during motion/editing is temporarily undefined, with an explicit status; other valid geometry editing continues and it can recover. This state can be saved/reopened; invalid JSON reference structure remains rejected.
- [x] Render translucent spheres, great circles, sphere centers, radius and the selected tetrahedron wireframe; Inspector shows definition, radius and center or temporary invalidity. Dependent deletion and undo/redo work.
- [x] Update full one-click Prompt, help and docs; integration tests cover 4-point selection count, both tools, invalid selection, dependency edits, motion degeneration/recovery and file roundtrip.
- [x] Independent review, 96 unit tests, 31 interaction groups, v0.2.1 build, 12-file ZIP allowlist/hashes and actual portable EXE verification (including both four-point sphere tools).

No new software installation. All changes remain in SpatialGeometryStudio; any external dependency installations would still use D:\DevDep/camelCase but none is needed.
