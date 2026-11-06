
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "./print-button";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dispatch?: string }>;
};

export default async function KitchenPage({
  params,
  searchParams,
}: Props) {
  await connection();

  const { id } = await params;
  const { dispatch: dispatchId } = await searchParams;

  if (!dispatchId) notFound();

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

  const { data: printSettings, error: printSettingsError } = await supabase
    .from("establishments")
    .select("printer_paper_size, kitchen_ticket_copies")
    .eq("id", membership.establishment_id)
    .maybeSingle();

  if (printSettingsError) {
    throw new Error("Erro ao carregar a configuração da impressora.");
  }

  const paperSize =
    printSettings?.printer_paper_size === "58mm"
      ? "58mm"
      : printSettings?.printer_paper_size === "A4"
        ? "A4"
        : "80mm";

  const pageSize = paperSize === "A4" ? "A4 portrait" : `${paperSize} auto`;
  const ticketWidth =
    paperSize === "A4" ? "204mm" : `calc(${paperSize} - 6mm)`;
  const copyCount = Math.min(
    5,
    Math.max(1, Number(printSettings?.kitchen_ticket_copies) || 1)
  );

  const { data: order } = await supabase
    .from("orders")
    .select("id, order_number, order_type, customer_name, opened_at")
    .eq("id", id)
    .eq("establishment_id", membership.establishment_id)
    .maybeSingle();

  if (!order) notFound();

  const { data: dispatch } = await supabase
    .from("kitchen_dispatches")
    .select("id, sent_at")
    .eq("id", dispatchId)
    .eq("order_id", id)
    .eq("establishment_id", membership.establishment_id)
    .maybeSingle();

  if (!dispatch) notFound();

  const { data: items, error } = await supabase
    .from("kitchen_dispatch_items")
    .select("id, product_name, quantity, notes")
    .eq("dispatch_id", dispatchId);

  if (error) {
    throw new Error("Erro ao carregar os produtos da cozinha.");
  }

  const orderTypes: Record<string, string> = {
    table: "Mesa",
    counter: "Balcão",
    pickup: "Retirada",
    delivery: "Delivery",
  };

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
        <a
          href={`/atendimentos/${id}`}
          className="rounded-lg border px-5 py-3 font-semibold"
        >
          Voltar ao pedido
        </a>
      </div>

      <div className="print-content space-y-4">
        {Array.from({ length: copyCount }, (_, copyIndex) => (
          <section
            key={copyIndex}
            className={`kitchen-ticket border-2 border-black bg-white p-5 text-black ${
              paperSize === "A4" && copyIndex < copyCount - 1
                ? "print-copy-break"
                : ""
            }`}
          >
        <header className="border-b-2 border-dashed border-black pb-3 text-center">
          <h1 className="text-2xl font-bold">VIA DA COZINHA</h1>
          <p className="mt-2 text-xl font-bold">
            Pedido #{order.order_number}
          </p>
          <p className="font-semibold">
            {orderTypes[order.order_type] ?? order.order_type}
          </p>
          {order.customer_name && (
            <p className="mt-1">Cliente: {order.customer_name}</p>
          )}
          <p className="mt-1 text-sm">
            Enviado: {new Date(dispatch.sent_at).toLocaleString("pt-BR")}
          </p>
        </header>

        <div className="py-4">
          <h2 className="mb-3 text-lg font-bold">
            PRODUTOS
          </h2>

          {!items || items.length === 0 ? (
            <p>Nenhum produto neste envio.</p>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="border-b border-dashed border-black pb-3"
                >
                  <p className="text-xl font-bold">
                    {Number(item.quantity)}x {item.product_name}
                  </p>
                  {item.notes && (
                    <p className="mt-1 text-base">
                      Obs.: {item.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <footer className="border-t-2 border-dashed border-black pt-3 text-center text-sm">
          Pedido #{order.order_number} · Via {copyIndex + 1} de {copyCount}
        </footer>
          </section>
        ))}
      </div>
    </main>
  );
}
