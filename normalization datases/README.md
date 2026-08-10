# Raw datasets

This is `RAW_DATASETS_DIR` — the root the backend scans for source datasets to
normalize and folders to annotate. **Nothing in this folder is version-controlled**
(see root `.gitignore`) — it's excluded entirely because raw datasets are large
binary image data, often under their own third-party licenses, and don't belong
in a source-code repo.

The application treats this directory as read-only for existing files: nothing
here is ever modified in place. New sibling folders get created next to a
source dataset when you run normalization (`<name>_normalized/`) — see the root
README for details.

## Expected layout

Each subfolder is one dataset, in whatever format it was downloaded in — the
scanner auto-detects the format per dataset:

```
normalization datases/
  <dataset-name>/          # YOLO export: data.yaml + train/valid/test/{images,labels}
  <dataset-name>/          # COCO export: annotations.json + images
  <dataset-name>/          # Pascal VOC: Annotations/*.xml + JPEGImages/
  <dataset-name>/          # folder-per-class image classification export
```

Supported adapters live in `backend/app/adapters/` — `yolo.py`, `coco.py`,
`voc.py`, `folder_classification.py`.

## Adding a new dataset

1. Extract/copy it here as its own subfolder (folder name becomes the dataset's
   display name unless you override it at registration time).
2. Register it via the Dashboard's "Add Dataset" flow (upload through the
   browser, or point at an already-present subfolder) — this triggers a scan
   that detects the format and extracts source labels, image stats, and any
   corruption/pairing warnings.
3. Build its mapping table (source label → canonical class) before running
   normalization — see the root README and `normalization.md`.

## Annotation Studio folders

Annotation Studio (`/annotate` in the UI) works directly on subfolders here
too — either a plain folder of raw/unlabeled images (imported via "Import
folder"), or an already-labeled structured export like the ones above. Edits
made in Annotation Studio never touch a dataset's original label files; they're
written to a parallel `<dataset>/_annotate_labels/` overlay instead. See
`backend/app/services/annotate_ops.py` for the exact contract.
