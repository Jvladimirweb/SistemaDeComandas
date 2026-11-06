
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

export default async function KitchenHistoryPage() {
  await connection();

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

  const { data: items, error } = await supabase
    .from("order_items")
    .select("id, order_id, product_name, quantity, sent_to_kitchen_at")
    .eq("establishment_id", membership.establishment_id)
    .eq("kitchen_status", "delivered")
    .order("sent_to_kitchen_at", { ascending: false });

  if (error) {
    throw new Error("Erro ao carregar o histórico da cozinha.");
  }

  const orderIds = [...new Set((items ?? []).map((item) => item.order_id))];

  let orders: {
    id: string;
    order_number: number;
    order_type: string;
    customer_name: string | null;
  }[] = [];

  if (orderIds.length > 0) {
    const { data, error: ordersError } = await supabase
      .from("orders")
      .select("id, order_number, order_type, customer_name")
      .eq("establishment_id", membership.establishment_id)
      .in("id", orderIds);

    if (ordersError) {
      throw new Error("Erro ao carregar as comandas.");
    }

    orders = data ?? [];
  }

  const orderTypes: Record<string, string> = {
    table: "Mesa",
    counter: "Balcão",
    pickup: "Retirada",
    delivery: "Delivery",
  };

  const orderMap = new Map(orders.map((order) => [order.id, order]));

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Histórico da cozinha</h1>
          <p className="text-sm text-gray-500">
            Produtos que já foram entregues
          </p>
        </div>

        <Link
          href="/cozinha"
          className="rounded-lg border px-4 py-2 text-sm font-semibold"
        >
          Voltar à cozinha
        </Link>
      </header>

      {!items || items.length === 0 ? (
        <section className="rounded-xl border p-8 text-center">
          <h2 className="text-xl font-semibold">
            Nenhum produto entregue ainda
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            Os produtos aparecerão aqui após serem marcados como entregues.
          </p>
        </section>
      ) : (
        <section className="overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-3">Pedido</th>
                <th className="p-3">Produto</th>
                <th className="p-3">Quantidade</th>
                <th className="p-3">Tipo</th>
                <th className="p-3">Enviado à cozinha</th>
              </tr>
            </thead>

            <tbody>
              {items.map((item) => {
                const order = orderMap.get(item.order_id);

                return (
                  <tr key={item.id} className="border-t">
                    <td className="p-3 font-semibold">
                      #{order?.order_number ?? "—"}
                    </td>
                    <td className="p-3">{item.product_name}</td>
                    <td className="p-3">{Number(item.quantity)}</td>
                    <td className="p-3">
                      {order
                        ? orderTypes[order.order_type] ?? order.order_type
                        : "—"}
                    </td>
                    <td className="p-3">
                      {item.sent_to_kitchen_at
                        ? new Date(item.sent_to_kitchen_at).toLocaleString(
                            "pt-BR"
                          )
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
