"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock3, LoaderCircle, QrCode, RefreshCw } from "lucide-react";
import type { BankPaymentStatus } from "@web12/core";
import { CopyButton } from "./CopyButton";
import { SubmitButton } from "./SubmitButton";
import { formatVnd } from "@/lib/format";
import { cancelPaymentAction } from "@/app/thanh-toan/[code]/actions";

export interface CheckoutData {
  code: string;
  total: number;
  receivedAmount: number;
  creditedAmount: number;
  status: BankPaymentStatus;
  orderId: number | null;
  expiresAt: string;
  bankId: string;
  bankAccount: string;
  bankAccountName: string;
  productSlug: string;
}

export function BankCheckout({ payment }: { payment: CheckoutData }) {
  const router = useRouter();
  const [state, setState] = useState(payment);
  const [now, setNow] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);
  useEffect(() => {
    setState(payment);
  }, [payment]);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (state.status !== "PENDING") return;
    const controller = new AbortController();
    let busy = false;
    async function poll() {
      if (document.hidden || busy) return;
      busy = true;
      try {
        const response = await fetch(`/api/me/payments/${payment.code}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("payment status");
        const result = (await response.json()) as Pick<
          CheckoutData,
          "status" | "receivedAmount" | "creditedAmount" | "orderId"
        >;
        setState((previous) => ({ ...previous, ...result }));
        setError(false);
        if (result.orderId) router.replace(`/don-hang/${result.orderId}`);
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        busy = false;
      }
    }
    void poll();
    const timer = setInterval(poll, 3000);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [payment.code, state.status, router]);
  const seconds =
    now === null
      ? null
      : Math.max(
          0,
          Math.ceil((new Date(state.expiresAt).getTime() - now) / 1000),
        );
  const timedOut = seconds === 0;
  const due = Math.max(0, state.total - state.receivedAmount);
  const qr =
    `https://img.vietqr.io/image/${encodeURIComponent(state.bankId)}-${encodeURIComponent(state.bankAccount)}-qr_only.png?` +
    new URLSearchParams({
      amount: String(due),
      addInfo: state.code,
      accountName: state.bankAccountName,
    });
  useEffect(() => {
    setQrFailed(false);
  }, [qr]);

  if (state.status !== "PENDING") {
    const titles: Record<BankPaymentStatus, string> = {
      PENDING: "",
      PAID: "Đã nhận thanh toán",
      EXPIRED: "Mã thanh toán đã hết hạn",
      CANCELLED: "Đã hủy thanh toán",
      CREDITED: "Không thể giao sản phẩm này",
    };
    return (
      <section className="bank-checkout-result" aria-live="polite">
        <h2>{titles[state.status]}</h2>
        {state.creditedAmount > 0 && (
          <p>Đã ghi nhận {formatVnd(state.creditedAmount)} vào ví của bạn.</p>
        )}
        {state.orderId ? (
          <Link href={`/don-hang/${state.orderId}`} className="btn">
            Xem đơn hàng
          </Link>
        ) : (
          <Link
            href={`/san-pham/${state.productSlug}`}
            className="btn-secondary"
          >
            Quay lại sản phẩm
          </Link>
        )}
        <Link href="/tai-khoan" className="link">
          Xem ví của tôi
        </Link>
      </section>
    );
  }
  return (
    <section className="bank-checkout">
      <div className="bank-checkout-qr">
        <h2>
          <QrCode size={21} />
          Thanh toán ngay
        </h2>
        {!timedOut && due > 0 ? (
          <>
            <div className="price-large">{formatVnd(due)}</div>
            {qrFailed ? (
              <p className="notice notice-warning">
                Không tải được QR. Vui lòng chuyển khoản theo thông tin bên
                cạnh.
              </p>
            ) : (
              <div className="qr-frame">
                <img
                  src={qr}
                  alt={`QR thanh toán ${formatVnd(due)}`}
                  onError={() => setQrFailed(true)}
                />
              </div>
            )}
            <p className="checkout-countdown">
              <Clock3 size={16} />
              {seconds === null
                ? "Đang kiểm tra thời hạn"
                : `Còn ${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`}
            </p>
          </>
        ) : (
          <p className="notice notice-warning">
            Mã QR đã hết hạn. Đang cập nhật kết quả thanh toán.
          </p>
        )}
        <div role="status" className="dialog-note">
          <LoaderCircle size={16} className={error ? "" : "spin"} />
          {error
            ? "Chưa kiểm tra được giao dịch. Đang kết nối lại."
            : "Đang chờ xác nhận từ ngân hàng"}
        </div>
      </div>
      <div className="bank-checkout-details">
        <dl className="bank-details">
          <div>
            <dt>Ngân hàng</dt>
            <dd>{state.bankId}</dd>
          </div>
          <div>
            <dt>Số tài khoản</dt>
            <dd>
              <span className="font-mono">{state.bankAccount}</span>
              <CopyButton value={state.bankAccount} />
            </dd>
          </div>
          <div>
            <dt>Chủ tài khoản</dt>
            <dd>{state.bankAccountName}</dd>
          </div>
          <div className="bank-memo">
            <dt>Nội dung</dt>
            <dd>
              <span className="font-mono">{state.code}</span>
              <CopyButton value={state.code} />
            </dd>
          </div>
          <div>
            <dt>Tổng tiền</dt>
            <dd>{formatVnd(state.total)}</dd>
          </div>
          <div>
            <dt>Đã nhận</dt>
            <dd>{formatVnd(state.receivedAmount)}</dd>
          </div>
          <div>
            <dt>Còn thiếu</dt>
            <dd>{formatVnd(due)}</dd>
          </div>
        </dl>
        <p className="text-sm text-muted mt-5">
          Chuyển đúng nội dung và số tiền. Hàng được xác nhận khi nhận đủ tiền.
          Tiền dư, giao dịch ghi nhận sau khi mã hết hạn hoặc không thể giao
          hàng được hoàn vào ví.
        </p>
        <div className="checkout-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => router.refresh()}
          >
            <RefreshCw size={16} />
            Kiểm tra thanh toán
          </button>
          <form action={cancelPaymentAction}>
            <input type="hidden" name="code" value={state.code} />
            <SubmitButton className="btn-secondary">
              Hủy thanh toán
            </SubmitButton>
          </form>
        </div>
      </div>
    </section>
  );
}
