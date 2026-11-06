
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updateKitchenStatus } from "../atendimentos/[id]/actions";
import AutoRefresh from "./auto-refresh";

export default async function KitchenPage() {
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

  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select(`
      id,
      order_id,
      product_name,
      quantity,
      kitchen_status,
      sent_to_kitchen_at
    `)
    .eq("establishment_id", membership.establishment_id)
    .eq("status", "active")
    .in("kitchen_status", ["pending", "preparing", "ready"])
    .order("sent_to_kitchen_at");

  if (itemsError) {
    throw new Error("Erro ao carregar os produtos da cozinha.");
  }

  const orderIds = [...new Set((items ?? []).map((item) => item.order_id))];

  let orders: {
    id: string;
    order_number: number;
    order_type: string;
    customer_name: string | null;
  }[] = [];

  if (orderIds.length > 0) {
    const { data, error } = await supabase
      .from("orders")
      .select("id, order_number, order_type, customer_name")
      .eq("establishment_id", membership.establishment_id)
      .in("id", orderIds)
      .eq("status", "open");

    if (error) {
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

  const visibleItems = (items ?? []).filter((item) =>
    orderMap.has(item.order_id)
  );

  const preparingItems = visibleItems.filter(
    (item) => item.kitchen_status !== "ready"
  );

  const readyItems = visibleItems.filter(
    (item) => item.kitchen_status === "ready"
  );

  function groupByOrder(
    list: typeof visibleItems
  ) {
    return list.reduce((groups, item) => {
      const group = groups.get(item.order_id) ?? [];
      group.push(item);
      groups.set(item.order_id, group);
      return groups;
    }, new Map<string, typeof visibleItems>());
  }

  const preparingGroups = groupByOrder(preparingItems);
  const readyGroups = groupByOrder(readyItems);

  function renderOrders(
    groups: Map<string, typeof visibleItems>,
    isReady: boolean
  ) {
    return [...groups.entries()].map(([orderId, orderItems]) => {
      const order = orderMap.get(orderId);

      if (!order) return null;

      return (
        <section
          key={orderId}
          className={`rounded-xl border bg-white p-4 shadow-sm ${
            isReady ? "border-green-500 border-2" : ""
          }`}
        >
          <div className="mb-4 border-b pb-3">
            <h3 className="text-xl font-bold">
              Pedido #{order.order_number}
            </h3>
            <p className="text-sm text-gray-600">
              {orderTypes[order.order_type] ?? order.order_type}
              {order.customer_name ? ` · ${order.customer_name}` : ""}
            </p>
          </div>

          <div className="space-y-4">
            {orderItems.map((item) => {
              const nextStatus = isReady ? "delivered" :
                item.kitchen_status === "pending" ? "preparing" : "ready";

              const nextLabel = isReady ? "Confirmar entrega" :
                item.kitchen_status === "pending"
                  ? "Iniciar preparo"
                  : "Marcar como pronto";

              return (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b pb-4 last:border-0"
                >
                  <div>
                    <p className="text-lg font-bold">
                      {Number(item.quantity)}x {item.product_name}
                    </p>

                    <span
                      className={`text-sm font-semibold ${
                        isReady ? "text-green-700" : "text-orange-700"
                      }`}
                    >
                      {isReady
                        ? "Pronto para entrega"
                        : item.kitchen_status === "pending"
                          ? "Aguardando preparo"
                          : "Em preparo"}
                    </span>
                  </div>

                  <form action={updateKitchenStatus}>
                    <input type="hidden" name="order_id" value={orderId} />
                    <input type="hidden" name="item_id" value={item.id} />
                    <input
                      type="hidden"
                      name="kitchen_status"
                      value={nextStatus}
                    />

                    <button
                      type="submit"
                      className={`rounded-lg px-4 py-3 text-sm font-semibold text-white ${
                        isReady
                          ? "bg-green-600 hover:bg-green-700"
                          : "bg-orange-600 hover:bg-orange-700"
                      }`}
                    >
                      {nextLabel}
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        </section>
      );
    });
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4">
      <AutoRefresh itemIds={visibleItems.map((item) => item.id)} />

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Cozinha</h1>
          <p className="text-sm text-gray-500">
            Acompanhamento dos produtos enviados
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/atendimentos"
            className="rounded-lg border px-4 py-2 text-sm font-semibold"
          >
            Atendimentos
          </Link>
          <Link
            href="/cozinha/historico"
            className="rounded-lg border px-4 py-2 text-sm font-semibold"
          >
            Histórico
          </Link>
        </div>
      </header>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">🔥 Em preparo</h2>
          <span className="rounded-full bg-orange-100 px-3 py-1 text-sm font-bold text-orange-700">
            {preparingItems.length} produto(s)
          </span>
        </div>

        {preparingGroups.size === 0 ? (
          <p className="rounded-xl border p-5 text-center text-gray-500">
            Nenhum produto em preparo.
          </p>
        ) : (
          <div className="space-y-4">
            {renderOrders(preparingGroups, false)}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-green-700">
            ✅ Pedidos prontos
          </h2>
          <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-bold text-green-700">
            {readyItems.length} produto(s)
          </span>
        </div>

        {readyGroups.size === 0 ? (
          <p className="rounded-xl border p-5 text-center text-gray-500">
            Nenhum produto pronto para entrega.
          </p>
        ) : (
          <div className="space-y-4">
            {renderOrders(readyGroups, true)}
          </div>
        )}
      </section>
    </main>
  );
}
