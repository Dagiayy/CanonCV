import { Runs, mediaUrl } from "../api";
import ImageGallery from "./ImageGallery";

export default function NormalizedOutputGallery({ run }) {
  const fetchPage = async (offset, limit) => {
    const res = await Runs.images(run.id, { offset, limit });
    return {
      has_more: res.has_more,
      items: res.items.map((it) => ({
        image_url: mediaUrl(it.image_url),
        file: it.file,
        boxes: it.boxes.map((b) => ({ label: b.label, bbox: b.bbox, color: b.color_hex })),
      })),
    };
  };
  return <ImageGallery fetchPage={fetchPage} resetKey={run.id} emptyMessage="No normalized images found." />;
}
