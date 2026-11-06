
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createOrder } from "./actions";

type PageProps = {
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
};

const typeLabels: Record<string, string> = {
  table: "Mesa",
  counter: "Balcão",
  pickup: "Retirada",
  delivery: "Delivery",
};

const statusLabels: Record<string, string> = {
  open: "Em aberto",
  awaiting_payment: "Aguardando pagamento",
  paid: "Pago",
  cancelled: "Cancelado",
};

const fulfillmentLabels: Record<string, string> = {
  received: "Recebido",
  preparing: "Em preparo",
  ready: "Pronto para retirada",
  completed: "Concluído",
};

export default async function AttendancesPage({
  searchParams,
}: PageProps) {
  const supabase = await createClient();

  const { data: auth, error: authError } =
    await supabase.auth.getClaims();

  if (authError || !auth?.claims) {
    redirect("/login");
  }

  const userId = auth.claims.sub;

  if (typeof userId !== "string") {
    redirect("/login");
  }

  const { data: membership, error: membershipError } =
    await supabase
      .from("establishment_members")
      .select("establishment_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

  if (membershipError) {
    throw new Error("Não foi possível consultar o estabelecimento.");
  }

  if (!membership) {
    redirect("/configurar");
  }

  const establishmentId = membership.establishment_id;

  const [tablesResult, ordersResult] = await Promise.all([
    supabase
      .from("dining_tables")
      .select("id, name, status")
      .eq("establishment_id", establishmentId)
      .order("name"),
    supabase
      .from("orders")
      .select(
        "id, order_number, order_type, status, customer_name, opened_at, total, table_id, fulfillment_status, order_source"
      )
      .eq("establishment_id", establishmentId)
      .order("opened_at", { ascending: false })
      .limit(50),
  ]);

  if (tablesResult.error || ordersResult.error) {
    throw new Error("Não foi possível carregar os atendimentos.");
  }

  const tables = tablesResult.data ?? [];
  const orders = ordersResult.data ?? [];

  const availableTables = tables.filter(
    (table) => table.status === "available"
  );

  const tableNames = new Map(
    tables.map((table) => [table.id, table.name])
  );

  const { error, success } = await searchParams;

  const errorMessages: Record<string, string> = {
    type: "Selecione um tipo de atendimento válido.",
    no_table: "Escolha uma mesa disponível para esse atendimento.",
    table_busy: "Essa mesa não está mais disponível. Atualize a tela.",
    customer_name: "Informe o nome do cliente para a retirada.",
    address: "Informe o endereço para o delivery.",
    load: "Não foi possível consultar seu estabelecimento.",
    save: "Não foi possível abrir o pedido. Confira os dados e tente novamente.",
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-5 sm:px-8">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Atendimentos e pedidos
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Mesas, balcão, retiradas e delivery em um só lugar.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/mesas"
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Mesas
          </Link>
          <Link
            href="/cozinha"
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Cozinha
          </Link>
          <Link
            href="/produtos"
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Produtos
          </Link>
          <Link
            href="/relatorios"
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Relatórios
          </Link>
          <Link
            href="/"
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Painel
          </Link>
          <Link
            href="/configuracoes/impressao"
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Impressão
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 p-5 sm:p-8">
        {success === "created" && (
          <div
            role="status"
            className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
          >
            Pedido aberto com sucesso! Agora você já pode registrar o atendimento na lista abaixo.
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            {errorMessages[error] ?? "Ocorreu um erro ao processar o pedido."}
          </div>
        )}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Mesas disponíveis", value: availableTables.length },
            { label: "Pedidos registrados", value: orders.length },
            {
              label: "Em aberto",
              value: orders.filter(
                (order) => order.status === "open"
              ).length,
            },
            {
              label: "Retiradas",
              value: orders.filter(
                (order) =>
                  order.order_type === "pickup" &&
                  order.status === "open"
              ).length,
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
            >
              <p className="text-sm text-slate-500">{item.label}</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {item.value}
              </p>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
          <h2 className="text-lg font-bold text-slate-900">
            Abrir novo atendimento
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Escolha o tipo de venda. Mesa é necessária apenas para atendimento em mesa.
          </p>

          <form action={createOrder} className="mt-6 space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="order_type"
                  className="mb-2 block text-sm font-medium"
                >
                  Tipo de atendimento
                </label>
                <select
                  id="order_type"
                  name="order_type"
                  defaultValue="counter"
                  required
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
                >
                  <option value="table">Mesa</option>
                  <option value="counter">Balcão</option>
                  <option value="pickup">Retirada — pedido do WhatsApp</option>
                  <option value="delivery">Delivery</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="table_id"
                  className="mb-2 block text-sm font-medium"
                >
                  Mesa (somente para atendimento em mesa)
                </label>
                <select
                  id="table_id"
                  name="table_id"
                  defaultValue=""
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
                >
                  <option value="">Nenhuma mesa</option>
                  {availableTables.map((table) => (
                    <option key={table.id} value={table.id}>
                      {table.name}
                    </option>
                  ))}
                </select>
                {availableTables.length === 0 && (
                  <p className="mt-2 text-xs text-amber-700">
                    Não há mesas disponíveis no momento. Você ainda pode abrir pedidos de balcão, retirada ou delivery.
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="customer_name"
                  className="mb-2 block text-sm font-medium"
                >
                  Nome do cliente
                </label>
                <input
                  id="customer_name"
                  name="customer_name"
                  type="text"
                  maxLength={120}
                  placeholder="Necessário para retirada"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3"
                />
              </div>

              <div>
                <label
                  htmlFor="customer_phone"
                  className="mb-2 block text-sm font-medium"
                >
                  Telefone / WhatsApp
                </label>
                <input
                  id="customer_phone"
                  name="customer_phone"
                  type="tel"
                  maxLength={30}
                  placeholder="(21) 99999-9999"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3"
                />
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="order_source"
                  className="mb-2 block text-sm font-medium"
                >
                  Origem do pedido
                </label>
                <select
                  id="order_source"
                  name="order_source"
                  defaultValue="in_person"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
                >
                  <option value="in_person">Presencial</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="phone">Telefone</option>
                  <option value="other">Outra origem</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="customer_address"
                  className="mb-2 block text-sm font-medium"
                >
                  Endereço de entrega (somente para delivery)
                </label>
                <input
                  id="customer_address"
                  name="customer_address"
                  type="text"
                  maxLength={300}
                  placeholder="Rua, número, bairro e complemento"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3"
                />
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="notes"
                  className="mb-2 block text-sm font-medium"
                >
                  Observações
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  maxLength={1000}
                  rows={3}
                  placeholder="Ex.: cliente retira às 18h30, sem cebola..."
                  className="w-full rounded-xl border border-slate-300 px-4 py-3"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
              <p className="max-w-lg text-xs leading-5 text-slate-500">
                Nesta etapa, o pedido será aberto sem itens. Na próxima, adicionaremos os produtos e calcularemos os valores automaticamente.
              </p>
              <button
                type="submit"
                className="w-full rounded-xl bg-emerald-700 px-6 py-3 font-semibold text-white hover:bg-emerald-800 sm:w-auto"
              >
                Abrir atendimento
              </button>
            </div>
          </form>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 p-5">
            <h2 className="text-lg font-bold text-slate-900">
              Pedidos recentes
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Os últimos 50 pedidos registrados.
            </p>
          </div>

          {orders.length === 0 ? (
            <div className="p-8 text-center">
              <p className="font-medium text-slate-700">
                Nenhum atendimento registrado ainda.
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Abra seu primeiro pedido pelo formulário acima.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Pedido</th>
                    <th className="px-5 py-3">Tipo</th>
                    <th className="px-5 py-3">Cliente / mesa</th>
                    <th className="px-5 py-3">Total</th>
                    <th className="px-5 py-3">Situação</th>
                    <th className="px-5 py-3">Atendimento</th>
                    <th className="px-5 py-3">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td className="whitespace-nowrap px-5 py-4 font-semibold">
                        <Link
                          href={`/atendimentos/${order.id}`}
                          className="text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          #{order.order_number}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4">
                        {typeLabels[order.order_type] ?? order.order_type}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4">
                        {order.order_type === "table"
                          ? tableNames.get(order.table_id ?? "") ?? "Mesa"
                          : order.customer_name || "Cliente não informado"}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 font-medium">
                        {Number(order.total).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4">
                        {statusLabels[order.status] ?? order.status}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4">
                        {fulfillmentLabels[order.fulfillment_status] ??
                          order.fulfillment_status}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-slate-500">
                        {new Date(order.opened_at).toLocaleString("pt-BR", {
                          timeZone: "America/Sao_Paulo",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
