import axios from "axios";

const api = axios.create({ baseURL: "/api" });

export default api;

// Backend image_url fields (e.g. "/media/raw-image?...") are bare paths, not
// routed through the "/api" prefix the dev proxy and nginx both expect.
export const mediaUrl = (path) => `/api${path}`;

export const Projects = {
  list: () => api.get("/projects").then((r) => r.data),
  create: (body) => api.post("/projects", body).then((r) => r.data),
  availableRawFolders: (projectId) => api.get(`/projects/${projectId}/available-raw-folders`).then((r) => r.data),
  registerFromFolder: (projectId, body) =>
    api.post(`/projects/${projectId}/datasets/from-folder`, body).then((r) => r.data),
  // Uploads a browser-picked folder (webkitdirectory) in batches, preserving
  // its internal structure, then leaves registration/scan to the caller.
  uploadFolder: async (projectId, folderName, fileList, onProgress) => {
    const BATCH_SIZE = 40;
    const files = Array.from(fileList);
    const total = files.length;
    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      const form = new FormData();
      form.append("folder_name", folderName);
      for (const f of batch) {
        form.append("relative_paths", f.webkitRelativePath || f.name);
        form.append("files", f);
      }
      await api.post(`/projects/${projectId}/datasets/upload-batch`, form);
      onProgress?.(Math.min(i + BATCH_SIZE, total), total);
    }
  },
  taxonomy: (projectId) => api.get(`/projects/${projectId}/taxonomy`).then((r) => r.data),
  taxonomyHistory: (projectId) => api.get(`/projects/${projectId}/taxonomy/history`).then((r) => r.data),
  saveTaxonomy: (projectId, body) => api.post(`/projects/${projectId}/taxonomy`, body).then((r) => r.data),
  datasets: (projectId) => api.get(`/projects/${projectId}/datasets`).then((r) => r.data),
  runs: (projectId) => api.get(`/projects/${projectId}/runs`).then((r) => r.data),
  reviewQueue: (projectId, status) =>
    api.get(`/projects/${projectId}/review-queue`, { params: status ? { status } : {} }).then((r) => r.data),
  classStats: (projectId) => api.get(`/projects/${projectId}/class-stats`).then((r) => r.data),
};

export const Datasets = {
  register: (projectId, body) => api.post(`/projects/${projectId}/datasets`, body).then((r) => r.data),
  get: (id) => api.get(`/datasets/${id}`).then((r) => r.data),
  rescan: (id) => api.post(`/datasets/${id}/rescan`).then((r) => r.data),
  updateNotes: (id, body) => api.patch(`/datasets/${id}/notes`, body).then((r) => r.data),
  samples: (id, params) => api.get(`/datasets/${id}/samples`, { params }).then((r) => r.data),
  images: (id, params) => api.get(`/datasets/${id}/images`, { params }).then((r) => r.data),
  imagesCount: (id, params) => api.get(`/datasets/${id}/images/count`, { params }).then((r) => r.data),
  mapping: (id) => api.get(`/datasets/${id}/mapping`).then((r) => r.data),
  mappingHistory: (id) => api.get(`/datasets/${id}/mapping/history`).then((r) => r.data),
  saveMapping: (id, body) => api.post(`/datasets/${id}/mapping`, body).then((r) => r.data),
  runHistory: (id) => api.get(`/datasets/${id}/runs`).then((r) => r.data),
};

export const Normalize = {
  run: (datasetIds) => api.post("/normalize/run", { dataset_ids: datasetIds }).then((r) => r.data),
  job: (jobId) => api.get(`/jobs/${jobId}`).then((r) => r.data),
};

export const Runs = {
  get: (id) => api.get(`/runs/${id}`).then((r) => r.data),
  images: (id, params) => api.get(`/runs/${id}/images`, { params }).then((r) => r.data),
};

export const ReviewQueue = {
  resolve: (id, body) => api.post(`/review-queue/${id}/resolve`, body).then((r) => r.data),
};

// filename may be a nested relative path ("train/images/x.jpg") for structured
// datasets — encode each segment but keep the "/" separators literal, since
// the backend route uses a {filename:path} converter to accept them.
const encodeFilePath = (filename) => filename.split("/").map(encodeURIComponent).join("/");

export const Annotate = {
  folders: (projectId) => api.get(`/projects/${projectId}/annotate/folders`).then((r) => r.data),
  images: (projectId, folder, params) =>
    api.get(`/projects/${projectId}/annotate/${encodeURIComponent(folder)}/images`, { params }).then((r) => r.data),
  save: (projectId, folder, filename, boxes) =>
    api
      .post(`/projects/${projectId}/annotate/${encodeURIComponent(folder)}/images/${encodeFilePath(filename)}/save`, { boxes })
      .then((r) => r.data),
  crop: (projectId, folder, filename, rect) =>
    api
      .post(`/projects/${projectId}/annotate/${encodeURIComponent(folder)}/images/${encodeFilePath(filename)}/crop`, rect)
      .then((r) => r.data),
  exclude: (projectId, folder, filename) =>
    api.post(`/projects/${projectId}/annotate/${encodeURIComponent(folder)}/images/${encodeFilePath(filename)}/exclude`).then((r) => r.data),
  copy: (projectId, folder, filename, targetFolder) =>
    api
      .post(`/projects/${projectId}/annotate/${encodeURIComponent(folder)}/images/${encodeFilePath(filename)}/copy`, {
        target_folder: targetFolder,
      })
      .then((r) => r.data),
  augment: (projectId, folder, filename, ops) =>
    api
      .post(`/projects/${projectId}/annotate/${encodeURIComponent(folder)}/images/${encodeFilePath(filename)}/augment`, { ops })
      .then((r) => r.data),
  autoLabel: (projectId, folder, filename) =>
    api
      .post(`/projects/${projectId}/annotate/${encodeURIComponent(folder)}/images/${encodeFilePath(filename)}/auto-label`)
      .then((r) => r.data),
};

export const Quality = {
  duplicates: (datasetId, params) => api.get(`/datasets/${datasetId}/quality/duplicates`, { params }).then((r) => r.data),
  validation: (datasetId) => api.get(`/datasets/${datasetId}/quality/validation`).then((r) => r.data),
  outliers: (datasetId) => api.get(`/datasets/${datasetId}/quality/outliers`).then((r) => r.data),
  imageQuality: (datasetId, params) => api.get(`/datasets/${datasetId}/quality/image-quality`, { params }).then((r) => r.data),
  classBalance: (projectId) => api.get(`/projects/${projectId}/quality/class-balance`).then((r) => r.data),
  summary: (datasetId, params) => api.get(`/datasets/${datasetId}/quality/summary`, { params }).then((r) => r.data),
};

export const Splits = {
  list: (projectId) => api.get(`/projects/${projectId}/splits`).then((r) => r.data),
  create: (projectId, body) => api.post(`/projects/${projectId}/splits`, body).then((r) => r.data),
  get: (id) => api.get(`/splits/${id}`).then((r) => r.data),
};

export const Exports = {
  list: (projectId) => api.get(`/projects/${projectId}/exports`).then((r) => r.data),
  create: (projectId, body) => api.post(`/projects/${projectId}/exports`, body).then((r) => r.data),
  get: (id) => api.get(`/exports/${id}`).then((r) => r.data),
  lineage: (id) => api.get(`/exports/${id}/lineage`).then((r) => r.data),
};

export const Lineage = {
  run: (id) => api.get(`/runs/${id}/lineage`).then((r) => r.data),
  diffRuns: (runA, runB) => api.get("/runs/diff", { params: { run_a: runA, run_b: runB } }).then((r) => r.data),
};
