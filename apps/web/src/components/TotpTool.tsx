"use client";

import { useEffect, useState } from "react";
import { TOTP, Secret } from "otpauth";
import { KeyRound, ShieldCheck } from "lucide-react";
import { CopyButton } from "./CopyButton";

export function TotpTool() {
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [seconds, setSeconds] = useState(30);
  const [error, setError] = useState("");
  useEffect(() => {
    const normalized = secret.replace(/\s/g, "").toUpperCase();
    if (!normalized) {
      setCode("");
      setError("");
      return;
    }
    try {
      if (
        !/^[A-Z2-7]+=*$/.test(normalized) ||
        normalized.replace(/=/g, "").length < 8
      )
        throw new Error("invalid");
      const totp = new TOTP({
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: Secret.fromBase32(normalized),
      });
      const tick = () => {
        setCode(totp.generate());
        setSeconds(30 - (Math.floor(Date.now() / 1000) % 30));
      };
      tick();
      setError("");
      const interval = setInterval(tick, 1000);
      return () => clearInterval(interval);
    } catch {
      setCode("");
      setError("Secret không hợp lệ. Vui lòng kiểm tra mã Base32.");
    }
  }, [secret]);
  return (
    <div className="card">
      <label className="field">
        Secret key
        <input
          className="input font-mono"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="Nhập secret key"
        />
      </label>
      {error && (
        <p className="text-accent text-xs mt-3" role="alert">
          {error}
        </p>
      )}
      <div className="totp-result">
        <div>
          <span className="eyebrow">Mã xác thực</span>
          <div className="totp-code" aria-live="polite">
            {code ? code.slice(0, 3) + " " + code.slice(3) : "--- ---"}
          </div>
        </div>
        {code ? (
          <CopyButton value={code} label="Sao chép mã" />
        ) : (
          <KeyRound size={23} className="text-muted" />
        )}
      </div>
      {code && (
        <>
          <div className="totp-timer">
            <div style={{ width: (seconds / 30) * 100 + "%" }} />
          </div>
          <p className="text-xs text-muted mt-2">Mã mới sau {seconds} giây</p>
          <button
            type="button"
            className="btn-secondary btn-sm mt-4"
            onClick={() => setSecret("")}
          >
            Xóa secret
          </button>
        </>
      )}
      <div className="dialog-note">
        <ShieldCheck size={15} />
        Secret chỉ được xử lý trên thiết bị của bạn.
      </div>
    </div>
  );
}
