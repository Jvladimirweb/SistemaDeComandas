
"use client";

import { useState } from "react";
import { cancelOrder } from "./actions";

const reasons = [
  "Cliente desistiu",
  "Pedido lançado por engano",
  "Pedido duplicado",
  "Erro nos produtos ou quantidades",
  "Falta de produto em estoque",
  "Problema no pagamento",
  "Outro",
];

export default function CancelOrderButton({
  orderId,
}: {
  orderId: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
      >
        Cancelar comanda
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h2 className="mb-4 text-lg font-bold text-gray-900">
              Motivo do cancelamento
            </h2>

            <form action={cancelOrder}>
              <input
                type="hidden"
                name="order_id"
                value={orderId}
              />
              <input
                type="hidden"
                name="reason"
                value={reason}
              />
              <input
                type="hidden"
                name="details"
                value={details}
              />

              <div className="space-y-3">
                {reasons.map((item) => (
                  <label
                    key={item}
                    className="flex cursor-pointer items-center gap-2 text-sm text-gray-800"
                  >
                    <input
                      type="radio"
                      name="reason_choice"
                      value={item}
                      checked={reason === item}
                      onChange={() => setReason(item)}
                    />
                    {item}
                  </label>
                ))}
              </div>

              {reason === "Outro" && (
                <textarea
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                  placeholder="Descreva o motivo do cancelamento..."
                  className="mt-4 w-full rounded-lg border p-3 text-sm text-gray-900"
                  rows={3}
                  required
                />
              )}

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border px-4 py-2 text-sm"
                >
                  Voltar
                </button>

                <button
                  type="submit"
                  disabled={!reason || (reason === "Outro" && !details.trim())}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                  Confirmar cancelamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
