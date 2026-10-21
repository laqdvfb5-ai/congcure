"use client";

import { Download } from "lucide-react";
import { CopyButton } from "./CopyButton";

export function AccountList({ accounts }: { accounts: string[] }) {
  function download() {
    const blob = new Blob([accounts.join("\n")], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "congcure-tai-khoan.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="table-surface">
      <div className="account-list-head">
        <h2 className="text-sm">
          Tài khoản đã nhận{" "}
          <span className="text-muted">({accounts.length})</span>
        </h2>
        <div>
          <CopyButton
            value={accounts.join("\n")}
            label="Sao chép tất cả"
            text
          />
          <button
            type="button"
            onClick={download}
            className="btn-secondary btn-sm"
          >
            <Download size={15} />
            Tải .txt
          </button>
        </div>
      </div>
      {accounts.map((account, index) => (
        <div key={index} className="account-line">
          <span>{String(index + 1).padStart(2, "0")}</span>
          <code>{account}</code>
          <CopyButton
            value={account}
            label={"Sao chép tài khoản " + (index + 1)}
          />
        </div>
      ))}
    </div>
  );
}
