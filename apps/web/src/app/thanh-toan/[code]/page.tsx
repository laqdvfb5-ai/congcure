import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { BankCheckout } from "@/components/BankCheckout";
import { PageHeading } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { core } from "@/lib/core";
import { requireUser } from "@/lib/session";
import { formatVnd } from "@/lib/format";

export default async function BankPaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const user = await requireUser();
  const { code } = await params;
  const payment = await core
    .getBankPaymentForUser(code, user.id)
    .catch((error) => {
      if (core.isAppError(error) && error.code === "NOT_FOUND") return null;
      throw error;
    });
  if (!payment) notFound();
  if (payment.orderId) redirect(`/don-hang/${payment.orderId}`);
  return (
    <>
      <Link href="/don-hang" className="breadcrumb">
        <ArrowLeft size={16} />
        Đơn hàng của tôi
      </Link>
      <PageHeading
        title="Thanh toán đơn hàng"
        description={payment.productName}
      />
      <Flash searchParams={await searchParams} />
      <dl className="checkout-order-summary">
        <div>
          <dt>Số lượng</dt>
          <dd>{payment.quantity}</dd>
        </div>
        <div>
          <dt>Đơn giá</dt>
          <dd>{formatVnd(payment.unitPrice)}</dd>
        </div>
        <div>
          <dt>Tổng thanh toán</dt>
          <dd>{formatVnd(payment.total)}</dd>
        </div>
      </dl>
      <BankCheckout
        payment={{
          code: payment.code,
          total: payment.total,
          receivedAmount: payment.receivedAmount,
          creditedAmount: payment.creditedAmount,
          status: payment.status,
          orderId: payment.orderId,
          expiresAt: new Date(payment.expiresAt).toISOString(),
          bankId: payment.bankId,
          bankAccount: payment.bankAccount,
          bankAccountName: payment.bankAccountName,
          productSlug: payment.productSlug,
        }}
      />
    </>
  );
}
