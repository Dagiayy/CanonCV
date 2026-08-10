# syntax=docker/dockerfile:1
FROM python:3.13-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libjpeg62-turbo \
    zlib1g \
    && rm -rf /var/lib/apt/lists/*

# CPU-only torch build (~200MB) instead of the default CUDA-bundled PyPI wheel
# (~770MB) — this is a CPU-inference-only service, no GPU in the deployment target.
COPY requirements.txt .
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch \
    && pip install --no-cache-dir -r requirements.txt \
    # ultralytics pulls in plain opencv-python, which needs a GUI/X11/OpenGL/mesa
    # stack (libgl1, libllvm19, ...) we'd otherwise have to apt-install just to
    # satisfy an import — none of it is ever used in this headless service.
    # Overwriting with opencv-python-headless (same cv2 API, zero GUI deps) after
    # the fact avoids that whole dependency chain entirely.
    && pip install --no-cache-dir --force-reinstall --no-deps opencv-python-headless

COPY app/ ./app

ENV RAW_DATASETS_DIR=/data/raw \
    DATA_DIR=/data/store \
    PYTHONUNBUFFERED=1

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
