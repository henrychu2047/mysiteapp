# 圖紙標記 — WebApp 第一版

Approved scope: add 圖紙標記 card to full-app home, per-project multiple original PDFs and multi-page navigation/thumbnails. Phone pinch/pan and desktop zoom/pan, fit/reset/rotate; canonical normalized rotation=0 PDF.js coordinates. Preserve view while camera/modal is open.

Tap a position -> add existing Smart Tag or launch existing shared camera. Reuse actual camera categories, SMART_TAG_KEYS and effective project/structure options, not invented fields. Suggest nearby room text, allow correction/blank. Existing markers support edit/move/delete, stable numbers, multiple photos/tags, camera supplement and album selection. Cancel with no data creates no empty marker; unlink/delete marker never deletes shared album photos. Reuse existing album storage.

PDF text extraction first, cancellable local Chinese/English OCR for scans/outlined text. Persist candidates per page; nearest text is a suggestion, not proof of room membership. Never replace manually confirmed room names. No room boundary recognition in v1.

Annotations: cloud, line, arrow, text, rectangle, ellipse; selection, movement/resizing, properties (color/width/font), delete, undo/redo. No edits to original building lines/text. Mobile gestures must not accidentally draw. Marker list search/filter by page, room, tag; jump to marker.

IndexedDB autosave original PDF and separate metadata, explicit saving/saved/error states, protect unsaved edits on failure/project switch. Offline once resources cached, no cross-device sync. PDF bytes immutable; new revisions imported separately. Validate damaged/encrypted files with actionable errors.

Export flattened marked PDF retaining page size/orientation and Chinese labels. Separate issue report PDF and Word based on current album report appearance: each item includes PDF crop centered on numbered marker, all linked photos, actual Smart Tag fields, room, drawing, page and stable number. Crop from PDF coordinates, not screenshot; adjustable extent, edge clamp, predictable resolution. No-photo items remain; missing photos visibly warned. Preview/select/order/filter before export.

ZIP backup/restore includes originals, annotations, markers, confirmed rooms and actual photo bytes with version validation and safe ID remapping; no destructive overwrite. iPhone downloadable/shareable files. Original/source drawings and marker data stay editable after export.

Native iOS later: keep storage/camera/OCR boundaries replaceable. Not included now: automatic revision migration, room boundaries, collaboration, original PDF content edits, editable standard annotation export.

Validation: compile/build, functional multi-page fixtures including rotated/cropped pages, stable markers through zoom/rotation/reload, existing shared camera/album behavior, real report/backup round-trip, errors, multi-photo/no-photo and mobile gesture checks. Report limits honestly; no claims of actual iPhone/OCR accuracy validation without evidence.
