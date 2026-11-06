import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "./print-button";

type Props = {
  params: Promise<{ id: string }>;
};

const orderTypes: Record<string, string> = {
  table: "Mesa",
  counter: "Balcão",
  pickup: "Retirada",
  delivery: "Delivery",
};

export default async function CustomerReceiptPage({ params }: Props) {
  await connection();

  const { id } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;

  if (typeof userId !== "string") redirect("/login");

  const { data: membership } = await supabase
    .from("establishment_members")
    .select("establishment_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/configurar");

  const [orderResult, itemsResult, establishmentResult] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, order_number, order_type, status, customer_name, opened_at, subtotal, discount, total"
      )
      .eq("id", id)
      .eq("establishment_id", membership.establishment_id)
      .maybeSingle(),
    supabase
      .from("order_items")
      .select("id, product_name, quantity, unit_price, line_total")
      .eq("order_id", id)
      .eq("establishment_id", membership.establishment_id)
      .eq("status", "active")
      .order("created_at"),
    supabase
      .from("establishments")
      .select("name, printer_paper_size, customer_receipt_copies")
      .eq("id", membership.establishment_id)
      .maybeSingle(),
  ]);

  if (orderResult.error || itemsResult.error || establishmentResult.error) {
    throw new Error("Erro ao carregar a conta para impressão.");
  }

  const order = orderResult.data;
  const items = itemsResult.data ?? [];
  const establishment = establishmentResult.data;

  if (!order || !establishment || order.status === "cancelled") notFound();

  const paperSize =
    establishment.printer_paper_size === "58mm"
      ? "58mm"
      : establishment.printer_paper_size === "A4"
        ? "A4"
        : "80mm";
  const pageSize = paperSize === "A4" ? "A4 portrait" : `${paperSize} auto`;
  const ticketWidth =
    paperSize === "A4" ? "204mm" : `calc(${paperSize} - 6mm)`;
  const copyCount = Math.min(
    5,
    Math.max(1, Number(establishment.customer_receipt_copies) || 1)
  );

  const money = (value: number | null) =>
    (value ?? 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  return (
    <main className="mx-auto max-w-xl space-y-5 p-4">
      <style>{`
        @media print {
          @page {
            size: ${pageSize};
            margin: 3mm;
          }

          .print-content {
            width: ${ticketWidth} !important;
          }
        }
      `}</style>

      <div className="no-print flex flex-wrap gap-3">
        <PrintButton />
        <Link
          href={`/atendimentos/${id}`}
          className="rounded-lg border px-5 py-3 font-semibold"
        >
          Voltar ao pedido
        </Link>
      </div>

      <div className="print-content space-y-4">
        {Array.from({ length: copyCount }, (_, copyIndex) => (
          <section
            key={copyIndex}
            className={`customer-receipt border-2 border-black bg-white p-5 text-black ${
              paperSize === "A4" && copyIndex < copyCount - 1
                ? "print-copy-break"
                : ""
            }`}
          >
        <header className="border-b-2 border-dashed border-black pb-3 text-center">
          <h1 className="text-xl font-bold">{establishment.name}</h1>
          <p className="mt-2 text-lg font-bold">CONTA DO CLIENTE</p>
          <p className="mt-1 text-xl font-bold">Pedido #{order.order_number}</p>
          <p className="font-semibold">
            {orderTypes[order.order_type] ?? order.order_type}
          </p>
          {order.customer_name && (
            <p className="mt-1">Cliente: {order.customer_name}</p>
          )}
          <p className="mt-1 text-sm">
            {new Date(order.opened_at).toLocaleString("pt-BR", {
              timeZone: "America/Sao_Paulo",
            })}
          </p>
        </header>

        <div className="space-y-3 py-4">
          {items.length === 0 ? (
            <p>Nenhum produto ativo nesta conta.</p>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="flex justify-between gap-3 border-b border-dashed border-black pb-3"
              >
                <div>
                  <p className="font-bold">
                    {Number(item.quantity)}x {item.product_name}
                  </p>
                  <p className="text-sm">{money(Number(item.unit_price))} cada</p>
                </div>
                <p className="whitespace-nowrap font-semibold">
                  {money(Number(item.line_total))}
                </p>
              </div>
            ))
          )}
        </div>

        <footer className="space-y-2 border-t-2 border-dashed border-black pt-3">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{money(Number(order.subtotal))}</span>
          </div>
          <div className="flex justify-between">
            <span>Desconto</span>
            <span>{money(Number(order.discount))}</span>
          </div>
          <div className="flex justify-between border-t border-black pt-2 text-lg font-bold">
            <span>Total</span>
            <span>{money(Number(order.total))}</span>
          </div>
          <p className="pt-2 text-center text-sm">
            Via {copyIndex + 1} de {copyCount} · Obrigado pela preferência!
          </p>
        </footer>
          </section>
        ))}
      </div>
    </main>
  );
}
