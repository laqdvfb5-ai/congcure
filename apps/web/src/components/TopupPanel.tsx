"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, CreditCard, LoaderCircle, Wallet } from "lucide-react";
import { CopyButton } from "./CopyButton";
import { formatVnd } from "@/lib/format";

const presets = [50_000, 100_000, 200_000, 500_000, 1_000_000];
export function TopupPanel({
  initialBalance,
  initialAmount,
  bankId,
  account,
  accountName,
  code,
}: {
  initialBalance: number;
  initialAmount: number;
  bankId: string;
  account: string;
  accountName: string;
  code: string;
}) {
  const router = useRouter();
  const [balance, setBalance] = useState(initialBalance);
  const [amount, setAmount] = useState(initialAmount);
  const [custom, setCustom] = useState(!presets.includes(initialAmount));
  const [draft, setDraft] = useState(String(initialAmount));
  const [received, setReceived] = useState(0);
  const [failed, setFailed] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);
  const last = useRef(initialBalance);
  const configured = !!bankId && !!account && !/^0+$/.test(account);
  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    async function poll() {
      if (document.hidden || busy) return;
      busy = true;
      try {
        const res = await fetch("/api/me/balance", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("balance");
        const data = (await res.json()) as { balance: number };
        if (data.balance > last.current) {
          setReceived(data.balance - last.current);
          router.refresh();
        }
        last.current = data.balance;
        setBalance(data.balance);
        setFailed(false);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      } finally {
        busy = false;
      }
    }
    const timer = setInterval(poll, 5000);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [router]);
  const qr =
    "https://img.vietqr.io/image/" +
    encodeURIComponent(bankId) +
    "-" +
    encodeURIComponent(account) +
    "-qr_only.png?" +
    new URLSearchParams({ amount: String(amount), addInfo: code, accountName });
  return (
    <div className="topup-layout">
      <section>
        <div className="balance-panel">
          <span>
            <Wallet size={17} />
            Số dư hiện tại
          </span>
          <strong aria-live="polite">{formatVnd(balance)}</strong>
        </div>
        <h2 className="text-base">Số tiền nạp</h2>
        <div className="amount-grid">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              className={!custom && p === amount ? "active" : ""}
              aria-pressed={!custom && p === amount}
              onClick={() => {
                setAmount(p);
                setDraft(String(p));
                setCustom(false);
                setQrFailed(false);
              }}
            >
              {formatVnd(p)}
            </button>
          ))}
          <button
            type="button"
            className={custom ? "active" : ""}
            aria-pressed={custom}
            onClick={() => setCustom(true)}
          >
            Số khác
          </button>
        </div>
        {custom && (
          <form
            className="custom-amount"
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(draft);
              if (Number.isSafeInteger(n) && n >= 1000 && n <= 100_000_000) {
                setAmount(n);
                setQrFailed(false);
              }
            }}
          >
            <input
              className="input"
              type="number"
              min={1000}
              max={100_000_000}
              step={1000}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Số tiền tùy chọn"
              required
            />
            <button className="btn-secondary">Áp dụng</button>
          </form>
        )}
        <p className="text-xs text-muted">
          Nội dung chuyển khoản của bạn:{" "}
          <strong className="font-mono text-fg">{code}</strong>
        </p>
        <div className="notice">
          <span>
            Chuyển đúng nội dung để tiền được ghi nhận vào ví. Nếu cần hỗ trợ
            giao dịch, liên hệ{" "}
            <a
              href="https://t.me/congcure"
              className="link"
              target="_blank"
              rel="noreferrer"
            >
              Telegram cửa hàng
            </a>
            .
          </span>
        </div>
        {received > 0 && (
          <div className="notice notice-success" role="status">
            <CircleCheck size={19} />
            <span>Số dư ví đã tăng {formatVnd(received)}.</span>
          </div>
        )}
      </section>
      <section className="bank-card">
        <h2>
          <CreditCard size={19} />
          Chuyển khoản ngân hàng
        </h2>
        {configured ? (
          <>
            {qrFailed ? (
              <div className="notice notice-warning">
                Không tải được mã QR. Bạn có thể chuyển khoản bằng thông tin bên
                dưới.
              </div>
            ) : (
              <div className="qr-frame">
                <img
                  src={qr}
                  alt={"QR nạp " + formatVnd(amount)}
                  onError={() => setQrFailed(true)}
                />
              </div>
            )}
            <p className="text-center text-sm mb-5">
              Số tiền <strong>{formatVnd(amount)}</strong>
            </p>
          </>
        ) : (
          <div className="notice notice-warning">
            Cửa hàng chưa cấu hình tài khoản nhận tiền. Vui lòng liên hệ hỗ trợ.
          </div>
        )}
        <dl className="bank-details">
          <div>
            <dt>Ngân hàng</dt>
            <dd>{bankId || "Chưa cấu hình"}</dd>
          </div>
          <div>
            <dt>Số tài khoản</dt>
            <dd>
              <span className="font-mono">
                {configured ? account : "Chưa cấu hình"}
              </span>
              {configured && <CopyButton value={account} />}
            </dd>
          </div>
          <div>
            <dt>Chủ tài khoản</dt>
            <dd>{accountName || "Chưa cấu hình"}</dd>
          </div>
          <div className="bank-memo">
            <dt>Nội dung</dt>
            <dd>
              <span className="font-mono">{code}</span>
              <CopyButton value={code} />
            </dd>
          </div>
        </dl>
        {configured && (
          <div className="dialog-note" role="status">
            {!failed && <LoaderCircle className="spin" size={14} />}
            {failed
              ? "Chưa kiểm tra được số dư. Đang thử kết nối lại."
              : "Đang chờ ghi nhận giao dịch"}
          </div>
        )}
      </section>
    </div>
  );
}
