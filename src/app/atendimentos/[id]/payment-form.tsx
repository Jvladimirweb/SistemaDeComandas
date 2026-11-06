
"use client";

import { useState } from "react";
import { finalizeOrder } from "./actions";

type Payment = {
  method: string;
  amount: string;
};

type Props = {
  orderId: string;
  subtotal: number;
  currentDiscount: number;
};

const methods = [
  { value: "pix", label: "Pix" },
  { value: "cash", label: "Dinheiro" },
  { value: "debit_card", label: "Cartão de débito" },
  { value: "credit_card", label: "Cartão de crédito" },
  { value: "voucher", label: "Vale" },
  { value: "other", label: "Outros" },
];

export default function PaymentForm({
  orderId,
  subtotal,
  currentDiscount,
}: Props) {
  const [discount, setDiscount] = useState(
    String(currentDiscount)
  );

  const [payments, setPayments] = useState<Payment[]>([
    { method: "pix", amount: "" },
  ]);

  const discountValue = Math.max(0, Number(discount) || 0);
  const total = Math.max(0, subtotal - discountValue);

  const paid = payments.reduce(
    (sum, payment) => sum + (Number(payment.amount) || 0),
    0
  );

  const remaining = total - paid;

  const money = (value: number) =>
    value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  function updatePayment(
    index: number,
    field: keyof Payment,
    value: string
  ) {
    setPayments((current) =>
      current.map((payment, i) =>
        i === index
          ? { ...payment, [field]: value }
          : payment
      )
    );
  }

  function addPayment() {
    setPayments((current) => [
      ...current,
      { method: "cash", amount: "" },
    ]);
  }

  function removePayment(index: number) {
    setPayments((current) =>
      current.filter((_, i) => i !== index)
    );
  }

  const valid =
    total > 0 &&
    discountValue <= subtotal &&
    payments.length > 0 &&
    payments.every(
      (payment) =>
        Number(payment.amount) > 0 &&
        Number.isFinite(Number(payment.amount))
    ) &&
    Math.abs(remaining) < 0.005;

  return (
    <section className="space-y-5 rounded-xl border p-4">
      <h2 className="text-lg font-semibold">
        Finalizar comanda
      </h2>

      <div>
        <label className="mb-2 block text-sm font-medium">
          Desconto em reais
        </label>

        <input
          type="number"
          min="0"
          max={subtotal}
          step="0.01"
          value={discount}
          onChange={(e) => setDiscount(e.target.value)}
          className="w-full rounded-lg border px-3 py-3"
        />
      </div>

      <div className="rounded-lg bg-gray-50 p-3">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{money(subtotal)}</span>
        </div>

        <div className="mt-2 flex justify-between">
          <span>Desconto</span>
          <span>{money(discountValue)}</span>
        </div>

        <div className="mt-3 flex justify-between border-t pt-3 text-xl font-bold">
          <span>Total a receber</span>
          <span>{money(total)}</span>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-semibold">
          Formas de pagamento
        </h3>

        {payments.map((payment, index) => (
          <div
            key={index}
            className="space-y-3 rounded-lg border p-3"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">
                Pagamento {index + 1}
              </span>

              {payments.length > 1 && (
                <button
                  type="button"
                  onClick={() => removePayment(index)}
                  className="text-sm text-red-600"
                >
                  Remover
                </button>
              )}
            </div>

            <select
              value={payment.method}
              onChange={(e) =>
                updatePayment(index, "method", e.target.value)
              }
              className="w-full rounded-lg border bg-white px-3 py-3"
            >
              {methods.map((method) => (
                <option
                  key={method.value}
                  value={method.value}
                >
                  {method.label}
                </option>
              ))}
            </select>

            <input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="Valor recebido"
              value={payment.amount}
              onChange={(e) =>
                updatePayment(index, "amount", e.target.value)
              }
              className="w-full rounded-lg border px-3 py-3"
            />
          </div>
        ))}

        <button
          type="button"
          onClick={addPayment}
          className="w-full rounded-lg border border-blue-600 py-3 font-semibold text-blue-600"
        >
          + Adicionar outra forma de pagamento
        </button>
      </div>

      <div className="rounded-lg border p-3">
        <div className="flex justify-between">
          <span>Total informado</span>
          <strong>{money(paid)}</strong>
        </div>

        <div className="mt-2 flex justify-between">
          <span>
            {remaining > 0 ? "Falta receber" : "Diferença"}
          </span>
          <strong
            className={
              remaining === 0
                ? "text-green-600"
                : "text-red-600"
            }
          >
            {money(Math.abs(remaining))}
          </strong>
        </div>
      </div>

      <form action={finalizeOrder}>
        <input
          type="hidden"
          name="order_id"
          value={orderId}
        />

        <input
          type="hidden"
          name="discount"
          value={discountValue}
        />

        <input
          type="hidden"
          name="payments"
          value={JSON.stringify(
            payments.map((payment) => ({
              method: payment.method,
              amount: Number(payment.amount).toFixed(2),
            }))
          )}
        />

        <button
          type="submit"
          disabled={!valid}
          className="w-full rounded-lg bg-green-600 px-4 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Confirmar recebimento
        </button>
      </form>
    </section>
  );
}
