
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProductSelector from "./product-selector";
import PaymentForm from "./payment-form";
import { connection } from "next/server";
import CancelOrderButton from "./cancel-order-button";

import {
  updateItemQuantity,
  cancelOrderItem,
  sendItemsToKitchen,
} from "./actions";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

const kitchenStatusLabels: Record<string, string> = {
  not_sent: "Não enviado",
  pending: "Aguardando preparo",
  preparing: "Em preparo",
  ready: "Pronto",
  delivered: "Entregue",
};

export default async function OrderDetailsPage({ params, searchParams }: Props) {
  await connection();

  const { id } = await params;
  const { error: errorCode } = await searchParams;
  const supabase = await createClient();

  const { data: auth, error: authError } =
    await supabase.auth.getClaims();

  const userId = auth?.claims?.sub;

  if (authError || typeof userId !== "string") {
    redirect("/login");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("establishment_members")
    .select("establishment_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    throw new Error("Não foi possível carregar o estabelecimento.");
  }

  if (!membership) {
    redirect("/configurar");
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select(`
      id,
      order_number,
      order_type,
      status,
      customer_name,
      customer_phone,
      customer_address,
      subtotal,
      discount,
      total,
      opened_at,
      fulfillment_status
    `)
    .eq("id", id)
    .eq("establishment_id", membership.establishment_id)
    .maybeSingle();

  if (orderError) {
    throw new Error("Erro ao carregar o pedido.");
  }

  if (!order) {
    notFound();
  }

  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select(`
      id,
      product_name,
      quantity,
      unit_price,
      line_total,
      status,
      kitchen_status
    `)
    .eq("order_id", id)
    .eq("establishment_id", membership.establishment_id)
    .eq("status", "active")
    .order("created_at");

  if (itemsError) {
    throw new Error("Erro ao carregar os itens do pedido.");
  }

  const { data: kitchenDispatches, error: dispatchesError } = await supabase
    .from("kitchen_dispatches")
    .select("id, sent_at")
    .eq("order_id", id)
    .eq("establishment_id", membership.establishment_id)
    .order("sent_at", { ascending: false });

  if (dispatchesError) {
    throw new Error("Erro ao carregar os envios para a cozinha.");
  }

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, name, price")
    .eq("establishment_id", membership.establishment_id)
    .eq("is_active", true)
    .order("name");

  if (productsError) {
    throw new Error("Erro ao carregar os produtos.");
  }

  const orderTypes: Record<string, string> = {
    table: "Mesa",
    counter: "Balcão",
    pickup: "Retirada",
    delivery: "Delivery",
  };

  const money = (value: number | null) =>
    (value ?? 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4">
      <div>
        <Link
          href="/atendimentos"
          className="text-sm text-blue-600 hover:underline"
        >
          ← Voltar aos atendimentos
        </Link>

        <h1 className="mt-3 text-2xl font-bold">
          Pedido #{order.order_number}
        </h1>

        <p className="text-sm text-gray-500">
          {orderTypes[order.order_type] ?? order.order_type}
          {" · "}
          {new Date(order.opened_at).toLocaleString("pt-BR")}
        </p>

        {errorCode && (
          <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {errorCode === "stock"
              ? "Estoque insuficiente para enviar este pedido. Confira as quantidades no controle de estoque."
              : "Não foi possível enviar os itens à cozinha. Tente novamente."}
            {errorCode === "stock" && <Link href="/estoque" className="ml-1 font-semibold underline">Abrir estoque</Link>}
          </div>
        )}

        {order.status === "open" && (
          <div className="mt-4">
            <CancelOrderButton orderId={order.id} />
          </div>
        )}

        {order.status !== "cancelled" && (
          <div className="no-print mt-4">
            <Link
              href={`/atendimentos/${order.id}/comprovante`}
              className="inline-flex rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800"
            >
              Imprimir conta do cliente
            </Link>
          </div>
        )}
      </div>

      <section className="rounded-xl border p-4">
        <h2 className="mb-3 text-lg font-semibold">
          Informações do cliente
        </h2>

        <p>Nome: {order.customer_name || "Não informado"}</p>
        <p>Telefone: {order.customer_phone || "Não informado"}</p>
        <p>Endereço: {order.customer_address || "Não informado"}</p>
        <p>Status: {order.status}</p>
      </section>

      <section className="rounded-xl border p-4">
        <h2 className="mb-4 text-lg font-semibold">
          Produtos do pedido
        </h2>

        {order.status === "open" &&
          items.some((item) => item.kitchen_status === "not_sent") && (
            <form action={sendItemsToKitchen} className="mb-4">
              <input type="hidden" name="order_id" value={order.id} />

              <button
                type="submit"
                className="rounded-lg bg-orange-600 px-4 py-3 font-semibold text-white hover:bg-orange-700"
              >
                Enviar novos produtos para cozinha
              </button>
            </form>
          )}

        {items.length === 0 ? (
          <p className="text-sm text-gray-500">
            Nenhum produto adicionado ainda.
          </p>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-4 border-b pb-3"
              >
                <div>
                  <p className="font-medium">{item.product_name}</p>

                  <p className="text-xs font-medium text-orange-700">
                    Cozinha:{" "}
                    {kitchenStatusLabels[item.kitchen_status] ??
                      "Não informado"}
                  </p>

                  <p className="text-sm text-gray-500">
                    {item.quantity} × {money(item.unit_price)}
                  </p>

                  <strong>{money(item.line_total)}</strong>
                </div>

                {order.status === "open" && (
                  <div className="flex items-center gap-2">
                    <form
                      action={
                        Number(item.quantity) <= 1
                          ? cancelOrderItem
                          : updateItemQuantity
                      }
                    >
                      <input
                        type="hidden"
                        name="order_id"
                        value={order.id}
                      />
                      <input
                        type="hidden"
                        name="item_id"
                        value={item.id}
                      />

                      {Number(item.quantity) > 1 && (
                        <input
                          type="hidden"
                          name="quantity"
                          value={Number(item.quantity) - 1}
                        />
                      )}

                      <button
                        type="submit"
                        className="h-10 w-10 rounded-lg border font-bold"
                        title={
                          Number(item.quantity) <= 1
                            ? "Cancelar produto"
                            : "Diminuir quantidade"
                        }
                      >
                        −
                      </button>
                    </form>

                    <span className="min-w-6 text-center font-semibold">
                      {item.quantity}
                    </span>

                    <form action={updateItemQuantity}>
                      <input
                        type="hidden"
                        name="order_id"
                        value={order.id}
                      />
                      <input
                        type="hidden"
                        name="item_id"
                        value={item.id}
                      />
                      <input
                        type="hidden"
                        name="quantity"
                        value={Number(item.quantity) + 1}
                      />

                      <button
                        type="submit"
                        className="h-10 w-10 rounded-lg border font-bold"
                      >
                        +
                      </button>
                    </form>

                    <form action={cancelOrderItem}>
                      <input
                        type="hidden"
                        name="order_id"
                        value={order.id}
                      />
                      <input
                        type="hidden"
                        name="item_id"
                        value={item.id}
                      />

                      <button
                        type="submit"
                        className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600"
                      >
                        Cancelar
                      </button>
                    </form>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {kitchenDispatches.length > 0 && (
        <section className="rounded-xl border p-4">
          <h2 className="mb-3 text-lg font-semibold">Envios para a cozinha</h2>
          <div className="space-y-2">
            {kitchenDispatches.map((dispatch) => (
              <div
                key={dispatch.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b pb-2 last:border-0"
              >
                <span className="text-sm text-gray-600">
                  Enviado em {new Date(dispatch.sent_at).toLocaleString("pt-BR")}
                </span>
                <Link
                  href={`/atendimentos/${order.id}/cozinha?dispatch=${dispatch.id}`}
                  className="rounded-lg border border-orange-600 px-4 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-50"
                >
                  Reimprimir via da cozinha
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {order.status === "open" && (
        <ProductSelector
          products={(products ?? []).map((product) => ({
            id: product.id,
            name: product.name,
            price: Number(product.price),
          }))}
          orderId={order.id}
        />
      )}

      {order.status === "open" ||
      order.status === "awaiting_payment" ? (
        <PaymentForm
          orderId={order.id}
          subtotal={Number(order.subtotal)}
          currentDiscount={Number(order.discount)}
        />
      ) : (
        <section className="rounded-xl border p-4">
          <h2 className="mb-3 text-lg font-semibold">
            Resumo da comanda
          </h2>

          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{money(order.subtotal)}</span>
          </div>

          <div className="mt-2 flex justify-between">
            <span>Desconto</span>
            <span>{money(order.discount)}</span>
          </div>

          <div className="mt-4 flex justify-between border-t pt-4 text-xl font-bold">
            <span>Total</span>
            <span>{money(order.total)}</span>
          </div>

          <p className="mt-3 text-sm text-gray-500">
            Situação: {order.status}
          </p>
        </section>
      )}
    </main>
  );
}
