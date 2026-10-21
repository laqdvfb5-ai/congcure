import type { CSSProperties } from "react";
import { isProductImageUrl } from "@web12/core/media-rules";
import { ProductGallery } from "./ProductGallery";
import {
  siGmail,
  siFacebook,
  siNetflix,
  siSpotify,
  siTiktok,
  siInstagram,
  siTelegram,
  siDiscord,
  siYoutube,
} from "simple-icons";

const brands = [
  { pattern: /gmail/i, name: "Gmail", color: "#d34c41", path: siGmail.path },
  { pattern: /hotmail|outlook/i, name: "Outlook", color: "#1674bd", text: "O" },
  {
    pattern: /facebook/i,
    name: "Facebook",
    color: "#1877f2",
    path: siFacebook.path,
  },
  {
    pattern: /netflix/i,
    name: "Netflix",
    color: "#db2333",
    path: siNetflix.path,
  },
  {
    pattern: /spotify/i,
    name: "Spotify",
    color: "#16864b",
    path: siSpotify.path,
  },
  { pattern: /tiktok/i, name: "TikTok", color: "#242424", path: siTiktok.path },
  {
    pattern: /instagram/i,
    name: "Instagram",
    color: "#d7306e",
    path: siInstagram.path,
  },
  {
    pattern: /chatgpt|openai/i,
    name: "ChatGPT",
    color: "#17856b",
    text: "GPT",
  },
  { pattern: /canva/i, name: "Canva", color: "#008c9b", text: "Ca" },
  { pattern: /capcut/i, name: "CapCut", color: "#242424", text: "Cc" },
  {
    pattern: /telegram/i,
    name: "Telegram",
    color: "#2787b5",
    path: siTelegram.path,
  },
  {
    pattern: /discord/i,
    name: "Discord",
    color: "#5765b8",
    path: siDiscord.path,
  },
  {
    pattern: /youtube/i,
    name: "YouTube",
    color: "#d82d29",
    path: siYoutube.path,
  },
];
export function BrandTile({
  product,
  size = 44,
}: {
  product: { name: string };
  size?: number;
}) {
  const brand = brands.find((b) => b.pattern.test(product.name));
  return (
    <span
      className="brand-tile"
      style={
        {
          "--brand": brand?.color ?? "#63726d",
          "--tile-size": size + "px",
        } as CSSProperties
      }
      aria-hidden="true"
    >
      {brand?.path ? (
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d={brand.path} />
        </svg>
      ) : (
        <b>{brand?.text ?? product.name.slice(0, 2).toUpperCase()}</b>
      )}
    </span>
  );
}
export function ProductCover({
  product,
  large = false,
}: {
  product: { name: string; images?: string[] };
  large?: boolean;
}) {
  const images = product.images?.filter(isProductImageUrl) ?? [];
  if (images.length)
    return (
      <ProductGallery
        key={images.join("|")}
        images={images}
        name={product.name}
        large={large}
      />
    );
  return (
    <div className={"product-media" + (large ? " large" : "")}>
      <>
        <BrandTile product={product} size={large ? 120 : 60} />
        <span>
          {brands.find((b) => b.pattern.test(product.name))?.name ?? "congcure"}
        </span>
      </>
    </div>
  );
}

export function ProductThumbnail({
  product,
  size = 44,
}: {
  product: { name: string; images?: string[] };
  size?: number;
}) {
  const source = product.images?.find(isProductImageUrl);
  return source ? (
    <img
      className="product-thumbnail"
      src={source}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
    />
  ) : (
    <BrandTile product={product} size={size} />
  );
}
