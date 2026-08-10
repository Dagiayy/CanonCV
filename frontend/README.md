# Frontend

React + Vite + Tailwind CSS. Talks to the backend at `/api` (proxied to
`http://127.0.0.1:8000` in dev via `vite.config.js`; proxied by nginx in Docker
via `nginx.conf`) — see root `README.md` for the overall project.

## Run

```bash
npm install
npm run dev      # http://localhost:5173, proxies /api to localhost:8000
```

```bash
npm run build     # production build to dist/
npm run preview   # serve the production build locally
npm run lint       # oxlint
```

The backend must be running separately (see `backend/README.md`) — this is a
pure client, no server-side code here.

## Pages

| Page | Route | What it does |
|---|---|---|
| Dashboard | `/` | Project datasets: add (upload/on-server/custom path), scan status, source class breakdown |
| Taxonomy | `/taxonomy` | Canonical class taxonomy editor (versioned) |
| Dataset Detail | `/datasets/:id` | Mapping builder, sample viewer, image browser, run history |
| Run Normalize | `/run` | Kick off a normalization run, live progress |
| Annotate | `/annotate` | Annotation Studio — draw/edit/delete boxes, crop, augment, YOLO26 auto-label, works on both raw and already-labeled folders |
| Quality | `/quality` | Duplicate detection, bbox validation, blur/exposure scoring, class balance |
| Splits | `/splits` | Stratified + grouped train/val/test split plans |
| Export | `/export` | Versioned export snapshots with lineage manifests |
| History | `/history` | Run audit trail, run diffing |
| Review | `/review` | Review queue for labels that couldn't be auto-mapped |

## Structure

```
src/
  api.js              All backend calls, grouped by resource (Projects, Datasets, Annotate, ...)
  App.jsx             Router + nav shell
  ProjectContext.jsx  Active-project state shared across pages
  pages/              One component per route (see table above)
  components/         Shared UI: BoxCanvas (interactive box editor), ImageGallery,
                       MappingBuilder, modals, etc.
  utils/              Small helpers (e.g. color-for-label)
```

`BoxCanvas.jsx` is the core interactive piece — draws/selects/moves/resizes/
deletes bounding boxes over an image using normalized `[0,1]` coordinates, used
by both Annotation Studio and the crop tool.

## Notes for contributors

- Backend `image_url` fields are bare paths (e.g. `/media/raw-image?...`) — use
  the `mediaUrl()` helper from `api.js` to resolve them, don't interpolate
  `/api` by hand (see the note in `api.js`).
- Any `<img>` with a box overlay must size to the image's *natural* aspect
  ratio (no `object-fit: cover`/`contain`) — box `<div>`s are positioned as a
  percentage of their container, so cropping/letterboxing the image without
  adjusting for it desyncs the boxes from what's actually visible. See
  `BoxCanvas.jsx` for the reference implementation.
