"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ImagePlus, LoaderCircle, Plus, Star, Trash2 } from "lucide-react";
import {
  isProductImageUrl,
  MAX_PRODUCT_IMAGES,
  MAX_PRODUCT_IMAGE_BYTES,
  PRODUCT_IMAGE_TYPES,
} from "@web12/core/media-rules";
import { uploadProductImageAction } from "@/app/admin/san-pham/image-actions";

export function ProductImages({
  initialImages,
  onUploadingChange,
}: {
  initialImages: string[];
  onUploadingChange: (uploading: boolean) => void;
}) {
  const [images, setImages] = useState(initialImages);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const { pending } = useFormStatus();
  const disabled = uploading || pending;

  async function upload(files: File[]) {
    if (!files.length || inFlight.current || pending) return;
    setError("");
    if (images.length + files.length > MAX_PRODUCT_IMAGES) {
      setError(`Mỗi sản phẩm có tối đa ${MAX_PRODUCT_IMAGES} ảnh`);
      return;
    }
    const invalid = files.find(
      (file) =>
        file.size === 0 ||
        file.size > MAX_PRODUCT_IMAGE_BYTES ||
        !PRODUCT_IMAGE_TYPES.some((type) => type === file.type),
    );
    if (invalid) {
      setError(
        `${invalid.name}: chỉ nhận JPG, PNG, WebP có dung lượng tối đa 5 MB`,
      );
      return;
    }
    inFlight.current = true;
    setUploading(true);
    onUploadingChange(true);
    try {
      for (const file of files) {
        const form = new FormData();
        form.set("file", file);
        const result = await uploadProductImageAction(form);
        if (result.error) {
          setError(`${file.name}: ${result.error}`);
          break;
        }
        setImages((current) => [...current, result.url]);
      }
    } catch {
      setError("Không tải được ảnh. Vui lòng kiểm tra kết nối và thử lại.");
    } finally {
      inFlight.current = false;
      setUploading(false);
      onUploadingChange(false);
    }
  }

  function addUrl() {
    const value = url.trim();
    if (!isProductImageUrl(value)) {
      setError("Vui lòng nhập URL ảnh http/https hợp lệ");
      return;
    }
    if (images.length >= MAX_PRODUCT_IMAGES) {
      setError(`Mỗi sản phẩm có tối đa ${MAX_PRODUCT_IMAGES} ảnh`);
      return;
    }
    if (!images.includes(value)) setImages((current) => [...current, value]);
    setUrl("");
    setError("");
  }

  return (
    <div className="field form-full product-images-editor">
      <div className="flex items-center justify-between gap-3">
        <span>Ảnh sản phẩm</span>
        <span className="text-xs text-muted">
          {images.length}/{MAX_PRODUCT_IMAGES}
        </span>
      </div>
      <input type="hidden" name="images" value={images.join("\n")} />
      <div
        className="image-upload-zone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void upload(Array.from(event.dataTransfer.files));
        }}
      >
        <input
          ref={fileInput}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          aria-label="Chọn ảnh sản phẩm từ máy tính"
          className="sr-only"
          disabled={disabled || images.length >= MAX_PRODUCT_IMAGES}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            void upload(files);
          }}
        />
        <button
          type="button"
          className="btn-secondary"
          disabled={disabled || images.length >= MAX_PRODUCT_IMAGES}
          onClick={() => fileInput.current?.click()}
        >
          {uploading ? (
            <LoaderCircle size={18} className="spin" />
          ) : (
            <ImagePlus size={18} />
          )}
          {uploading ? "Đang tải ảnh…" : "Chọn ảnh từ máy tính"}
        </button>
        <small>JPG, PNG, WebP · Tối đa 5 MB/ảnh</small>
      </div>
      {error && (
        <p role="alert" className="text-xs text-accent break-words">
          {error}
        </p>
      )}
      <div aria-live="polite" className="sr-only">
        {uploading ? "Đang tải ảnh" : `${images.length} ảnh sản phẩm`}
      </div>
      {images.length > 0 && (
        <ol className="product-image-list">
          {images.map((image, index) => (
            <li key={image + index} className="product-image-item">
              <img src={image} alt={"Ảnh sản phẩm " + (index + 1)} />
              <div>
                <span>{index === 0 ? "Ảnh chính" : `Ảnh ${index + 1}`}</span>
                <div className="flex">
                  <button
                    type="button"
                    className="icon-btn"
                    disabled={disabled || index === 0}
                    title="Đặt làm ảnh chính"
                    aria-label={"Đặt ảnh " + (index + 1) + " làm ảnh chính"}
                    onClick={() =>
                      setImages((current) => [
                        current[index]!,
                        ...current.filter((_, i) => i !== index),
                      ])
                    }
                  >
                    <Star
                      size={14}
                      fill={index === 0 ? "currentColor" : "none"}
                    />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    disabled={disabled}
                    title="Xóa ảnh"
                    aria-label={"Xóa ảnh " + (index + 1)}
                    onClick={() => {
                      setImages((current) =>
                        current.filter((_, i) => i !== index),
                      );
                      setError("");
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      <details className="image-url-option">
        <summary>Thêm bằng URL</summary>
        <div className="flex flex-wrap gap-2 mt-3">
          <input
            type="text"
            inputMode="url"
            className="input flex-1 min-w-40"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://…"
            aria-label="URL ảnh sản phẩm"
            disabled={disabled}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addUrl();
              }
            }}
          />
          <button
            type="button"
            className="btn-secondary"
            disabled={disabled || !url.trim()}
            onClick={addUrl}
          >
            <Plus size={16} />
            Thêm ảnh
          </button>
        </div>
      </details>
    </div>
  );
}
