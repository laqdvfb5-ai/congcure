"use client";

import { useState } from "react";
import type { Category, Product, Supplier } from "@web12/core";
import { Save } from "lucide-react";
import { SubmitButton } from "@/components/SubmitButton";
import { ProductImages } from "@/components/ProductImages";
import { saveProductAction } from "../actions";

export function ProductForm({
  product: p,
  categories,
  suppliers,
}: {
  product?: Product;
  categories: Category[];
  suppliers: Supplier[];
}) {
  const [uploadingImages, setUploadingImages] = useState(false);
  return (
    <form action={saveProductAction} className="admin-form">
      <input type="hidden" name="id" value={p?.id ?? ""} />
      <div className="form-section-label">Thông tin sản phẩm</div>
      <label className="field">
        Tên sản phẩm
        <input name="name" defaultValue={p?.name} required className="input" />
      </label>
      <label className="field">
        Slug
        <input
          name="slug"
          defaultValue={p?.slug}
          placeholder="Tự tạo từ tên nếu để trống"
          className="input"
        />
      </label>
      <label className="field">
        Danh mục
        <select
          name="categoryId"
          aria-label="Danh mục"
          defaultValue={p?.categoryId}
          className="input"
          required
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Loại sản phẩm
        <select name="type" defaultValue={p?.type ?? "STOCK"} className="input">
          <option value="STOCK">Kho tài khoản (STOCK)</option>
          <option value="UNIQUE">Tài khoản duy nhất (UNIQUE)</option>
          <option value="API">Nguồn nhà cung cấp (API)</option>
        </select>
      </label>
      <label className="field form-full">
        Mô tả
        <textarea
          name="description"
          defaultValue={p?.description}
          rows={4}
          className="input"
        />
      </label>
      <div className="form-section-label">Giá bán · VND</div>
      <label className="field">
        Thành viên
        <input
          name="priceMember"
          defaultValue={p?.priceMember}
          type="number"
          min={0}
          step={1}
          required
          className="input"
        />
      </label>
      <label className="field">
        CTV
        <input
          name="priceCtv"
          defaultValue={p?.priceCtv}
          type="number"
          min={0}
          step={1}
          required
          className="input"
        />
      </label>
      <label className="field">
        Đại lý
        <input
          name="priceAgent"
          defaultValue={p?.priceAgent}
          type="number"
          min={0}
          step={1}
          required
          className="input"
        />
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          name="active"
          defaultChecked={p?.active ?? true}
        />
        Hiển thị và cho phép mua
      </label>
      <div className="form-section-label">Nguồn hàng & thông tin bổ sung</div>
      <label className="field">
        Nhà cung cấp (sản phẩm API)
        <select
          name="supplierId"
          defaultValue={p?.supplierId ?? ""}
          className="input"
        >
          <option value="">Chọn nhà cung cấp</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        SKU bên nguồn
        <input
          name="supplierSku"
          defaultValue={p?.supplierSku ?? ""}
          className="input"
        />
      </label>
      <ProductImages
        key={p?.id ?? "new"}
        initialImages={p?.images ?? []}
        onUploadingChange={setUploadingImages}
      />
      <label className="field">
        Thuộc tính
        <textarea
          name="attributes"
          rows={3}
          className="input"
          placeholder="Mỗi dòng: tên: giá trị"
          defaultValue={
            p
              ? Object.entries(p.attributes)
                  .map(([k, v]) => k + ": " + v)
                  .join("\n")
              : ""
          }
        />
      </label>
      <div className="form-full">
        <SubmitButton disabled={uploadingImages}>
          <Save size={16} />
          Lưu sản phẩm
        </SubmitButton>
      </div>
    </form>
  );
}
