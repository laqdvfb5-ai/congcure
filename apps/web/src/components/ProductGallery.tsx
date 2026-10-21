"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";

export function ProductGallery({
  images,
  name,
  large,
}: {
  images: string[];
  name: string;
  large: boolean;
}) {
  const [selected, setSelected] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const source = images[selected] ?? images[0]!;
  return (
    <div className="product-gallery">
      <div className={"product-media" + (large ? " large" : "")}>
        {failed.includes(source) ? (
          <div className="flex flex-col items-center gap-2 text-muted">
            <ImageOff size={30} />
            <span className="text-xs">Không tải được ảnh</span>
          </div>
        ) : (
          <img
            src={source}
            alt={name}
            onError={() => setFailed((current) => [...current, source])}
          />
        )}
      </div>
      {images.length > 1 && (
        <div className="product-gallery-thumbs">
          {images.map((image, index) => (
            <button
              type="button"
              key={image + index}
              aria-label={"Xem ảnh sản phẩm " + (index + 1)}
              aria-pressed={index === selected}
              className={index === selected ? "active" : ""}
              onClick={() => setSelected(index)}
            >
              <img src={image} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
