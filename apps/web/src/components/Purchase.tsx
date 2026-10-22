"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Minus,
  Plus,
  QrCode,
  ShoppingBag,
  Wallet,
  X,
} from "lucide-react";
import { buyAction } from "@/app/san-pham/[slug]/actions";
import { SubmitButton } from "./SubmitButton";
import { formatVnd, formatStock } from "@/lib/format";

export interface BuyProduct {
  id: number;
  slug: string;
  name: string;
  price: number;
  stock: number | null;
  maxQuantity: number;
}
export function PurchaseForm({
  product,
  balance,
  requestId,
}: {
  product: BuyProduct;
  balance: number;
  requestId: string;
}) {
  const [quantity, setQuantity] = useState(1);
  const [method, setMethod] = useState<"WALLET" | "BANK">("WALLET");
  const max = Math.max(
    1,
    Math.min(product.maxQuantity, product.stock === 0 ? product.maxQuantity : product.stock ?? product.maxQuantity),
  );
  const total = product.price * quantity;
  const insufficient = total > balance;
  return (
    <form action={buyAction} className="purchase-form">
      <input type="hidden" name="preorder" value={String(product.stock === 0)} />
      {product.stock === 0 && <p className="notice notice-warning">Đặt trước: thanh toán ngay, nhận tài khoản khi có hàng. Đơn được lưu ở trạng thái chờ hàng.</p>}
      <input type="hidden" name="productId" value={product.id} />
      <input type="hidden" name="slug" value={product.slug} />
      <input type="hidden" name="requestId" value={requestId} />
      <fieldset className="payment-methods">
        <legend>Phương thức thanh toán</legend>
        <label className="payment-choice">
          <input
            type="radio"
            name="paymentMethod"
            value="WALLET"
            checked={method === "WALLET"}
            onChange={() => setMethod("WALLET")}
          />
          <Wallet size={19} />
          <span>
            Thanh toán bằng ví<small>{formatVnd(balance)}</small>
          </span>
        </label>
        <label className="payment-choice">
          <input
            type="radio"
            name="paymentMethod"
            value="BANK"
            checked={method === "BANK"}
            onChange={() => setMethod("BANK")}
            disabled={product.price === 0}
          />
          <QrCode size={19} />
          <span>
            Thanh toán ngay<small>QR ngân hàng</small>
          </span>
        </label>
      </fieldset>
      <div className="purchase-quantity">
        <label htmlFor={"qty-" + requestId}>Số lượng</label>
        <div className="quantity-control">
          <button
            type="button"
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            disabled={quantity <= 1}
            aria-label="Giảm số lượng"
          >
            <Minus size={16} />
          </button>
          <input
            id={"qty-" + requestId}
            name="quantity"
            type="number"
            min={1}
            max={max}
            value={quantity}
            onChange={(e) =>
              setQuantity(
                Math.min(max, Math.max(1, Number(e.target.value) || 1)),
              )
            }
            aria-label="Số lượng"
          />
          <button
            type="button"
            onClick={() => setQuantity(Math.min(max, quantity + 1))}
            disabled={quantity >= max}
            aria-label="Tăng số lượng"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>
      <dl className="purchase-summary">
        <div>
          <dt>Đơn giá</dt>
          <dd>{formatVnd(product.price)}</dd>
        </div>
        {method === "WALLET" && (
          <div>
            <dt>Số dư ví</dt>
            <dd>{formatVnd(balance)}</dd>
          </div>
        )}
        {method === "WALLET" && (
          <div>
            <dt>Số dư sau khi mua</dt>
            <dd className={insufficient ? "text-accent" : ""}>
              {formatVnd(balance - total)}
            </dd>
          </div>
        )}
        <div className="purchase-total">
          <dt>Tổng thanh toán</dt>
          <dd>{formatVnd(total)}</dd>
        </div>
      </dl>
      {method === "WALLET" && insufficient && (
        <div className="notice notice-warning">
          <Wallet size={18} />
          <span>Cần nạp thêm {formatVnd(total - balance)} để thanh toán.</span>
        </div>
      )}
      {method === "WALLET" && insufficient ? (
        <Link href="/nap-tien" className="btn w-full">
          Nạp tiền vào ví
          <ArrowRight size={16} />
        </Link>
      ) : (
        <SubmitButton className="btn w-full">
          {method === "BANK" ? <QrCode size={17} /> : <ShoppingBag size={17} />}
          {product.stock === 0 ? "Đặt trước " : method === "BANK" ? "Thanh toán ngay " : "Thanh toán "}
          {formatVnd(total)}
        </SubmitButton>
      )}
    </form>
  );
}
export function BuyButton({
  product,
  balance,
}: {
  product: BuyProduct;
  balance: number | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [requestId, setRequestId] = useState("");
  if (balance === null)
    return (
      <Link href="/dang-nhap" className="btn btn-sm">
        {product.stock === 0 ? "Đặt trước" : "Mua ngay"}
        <ArrowRight size={15} />
      </Link>
    );
  return (
    <>
      <button
        type="button"
        className="btn btn-sm"
        onClick={() => {
          setRequestId(crypto.randomUUID());
          dialog.current?.showModal();
        }}
      >
        {product.stock === 0 ? "Đặt trước" : "Mua ngay"}
        <ArrowRight size={15} />
      </button>
      <dialog
        ref={dialog}
        className="purchase-dialog"
        aria-labelledby={"buy-title-" + product.id}
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
      >
        <div className="dialog-head">
          <span className="eyebrow">Thanh toán</span>
          <button
            type="button"
            className="icon-btn"
            onClick={() => dialog.current?.close()}
            aria-label="Đóng thanh toán"
          >
            <X size={20} />
          </button>
        </div>
        <h2 id={"buy-title-" + product.id}>{product.name}</h2>
        <p className="muted text-sm mb-6">
          Tồn kho: {formatStock(product.stock)}
        </p>
        {requestId && (
          <PurchaseForm
            key={requestId}
            product={product}
            balance={balance}
            requestId={requestId}
          />
        )}
        <p className="dialog-note">
          <Check size={14} />
          Đơn hàng được lưu trong lịch sử của bạn.
        </p>
      </dialog>
    </>
  );
}
