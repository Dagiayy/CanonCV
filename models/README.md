# Model weights

This folder holds the pretrained detector used for YOLO26 auto-label suggestions
in Annotation Studio (`backend/app/services/auto_label.py`). It's **not
version-controlled** — `.pt`/`.onnx`/`.engine` files are excluded in the root
`.gitignore` — so you need to place the weights file here yourself after cloning.

## Expected file

```
models/yolo26s-seg.pt
```

The backend looks for exactly this path by default. To use a different
location or filename (e.g. a fine-tuned checkpoint later in the project), set
the `YOLO26_WEIGHTS` environment variable to the full path instead — see
`docker-compose.yml` and `backend/README.md`.

## How to get it

**Option A — let `ultralytics` fetch it automatically.** The `ultralytics`
package (already in `backend/requirements.txt`) downloads a named pretrained
checkpoint on first use if it isn't found locally. From a Python environment
with `ultralytics` installed:

```bash
python -c "from ultralytics import YOLO; YOLO('yolo26s-seg.pt')"
```

This downloads the weights into your current working directory (or the
`ultralytics` cache dir, depending on version). Move/copy the resulting
`yolo26s-seg.pt` into this folder:

```bash
mv yolo26s-seg.pt "models/yolo26s-seg.pt"
```

**Option B — download manually.** If auto-download isn't available (offline
environment, or the checkpoint isn't published under that exact name yet),
get a YOLO26-seg (small) checkpoint from Ultralytics directly — see
[ultralytics docs](https://docs.ultralytics.com/models/) for current release
links — and place it at `models/yolo26s-seg.pt`.

## Without a model file

Everything in this project works without a model file present *except*
auto-label suggestions. Dataset normalization, mapping, quality checks,
splitting, export, and manual annotation (drawing/editing boxes by hand) do
not depend on this folder at all. If `models/yolo26s-seg.pt` is missing, the
"Auto-label with YOLO26" button in Annotation Studio returns a clear error
instead of crashing the app — everything else keeps working.

## Docker

`docker-compose.yml` bind-mounts this folder into the backend container
read-only-in-spirit (nothing in the app writes here) at `/app/models`. Just
make sure the file exists on the host before `docker compose up` — no image
rebuild needed to add or swap a weights file.
