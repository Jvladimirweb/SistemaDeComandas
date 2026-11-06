
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ExportButton from "./export-button";
import PdfButton from "./pdf-button";

type StatusFilter =
  | "all"
  | "paid"
  | "cancelled"
  | "open"
  | "awaiting_payment";

type Props = {
  searchParams: Promise<{
    inicio?: string;
    fim?: string;
    status?: string;
    pagamento?: string;
  }>;
};

const statusOptions = [
  { value: "all", label: "Todos" },
  { value: "paid", label: "Vendidos" },
  { value: "cancelled", label: "Cancelados" },
  { value: "open", label: "Em aberto" },
  { value: "awaiting_payment", label: "Aguardando pagamento" },
];

export default async function RelatoriosPage({ searchParams }: Props) {
  const {
    inicio,
    fim,
    status: requestedStatus,
    pagamento: requestedPayment,
  } = await searchParams;

  const paymentOptions = [
    { value: "all", label: "Todas as formas" },
    { value: "pix", label: "Pix" },
    { value: "cash", label: "Dinheiro" },
    { value: "debit_card", label: "Cartão de débito" },
    { value: "credit_card", label: "Cartão de crédito" },
    { value: "voucher", label: "Vale" },
    { value: "other", label: "Outros" },
  ];

  const paymentFilter = paymentOptions.some(
    (item) => item.value === requestedPayment
  )
    ? requestedPayment!
    : "all";

  const validStatuses = statusOptions.map((item) => item.value);
  const status: StatusFilter = validStatuses.includes(requestedStatus ?? "")
    ? (requestedStatus as StatusFilter)
    : "cancelled";

  const supabase = await createClient();

  const { data: auth, error: authError } =
    await supabase.auth.getClaims();

  const userId = auth?.claims?.sub;

  if (authError || typeof userId !== "string") {
    redirect("/login");
  }

  const { data: membership } = await supabase
    .from("establishment_members")
    .select("establishment_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/configurar");

  const dateColumn =
    status === "cancelled"
      ? "cancelled_at"
      : status === "paid"
        ? "closed_at"
        : "opened_at";

  let query = supabase
    .from("orders")
    .select(`
      id,
      order_number,
      customer_name,
      order_type,
      status,
      total,
      opened_at,
      closed_at,
      cancelled_at,
      cancellation_reason,
      cancellation_details,
      cancelled_by
    `)
    .eq("establishment_id", membership.establishment_id);

  if (status !== "all") {
    query = query.eq("status", status);
  }

  if (inicio) {
    query = query.gte(dateColumn, `${inicio}T00:00:00-03:00`);
  }

  if (fim) {
    query = query.lte(dateColumn, `${fim}T23:59:59-03:00`);
  }

  const { data: orders, error } = await query.order(dateColumn, {
    ascending: false,
  });

  if (error) {
    throw new Error("Não foi possível carregar os relatórios.");
  }

    let paymentsQuery = supabase
    .from("payments")
    .select(`
      id,
      order_id,
      amount,
      method,
      paid_at,
      orders (
        order_number,
        customer_name
      )
    `)
    .eq("establishment_id", membership.establishment_id)
    .eq("status", "confirmed");

  if (inicio) {
    paymentsQuery = paymentsQuery.gte(
      "paid_at",
      `${inicio}T00:00:00-03:00`
    );
  }

  if (fim) {
    paymentsQuery = paymentsQuery.lte(
      "paid_at",
      `${fim}T23:59:59-03:00`
    );
  }

  const { data: payments, error: paymentsError } =
    await paymentsQuery;

  if (paymentsError) {
    throw new Error("Não foi possível carregar os pagamentos.");
  }

  const filteredPayments = (payments ?? []).filter(
    (payment) =>
      paymentFilter === "all" ||
      payment.method === paymentFilter
  );

  let cashSessionsQuery = supabase
    .from("cash_sessions")
    .select("id, opened_by, opening_balance, opened_at, closed_at, closing_balance")
    .eq("establishment_id", membership.establishment_id)
    .eq("status", "closed")
    .not("closed_at", "is", null);

  if (inicio) {
    cashSessionsQuery = cashSessionsQuery.gte(
      "closed_at",
      `${inicio}T00:00:00-03:00`
    );
  }

  if (fim) {
    cashSessionsQuery = cashSessionsQuery.lte(
      "closed_at",
      `${fim}T23:59:59-03:00`
    );
  }

  const { data: cashSessions, error: cashSessionsError } =
    await cashSessionsQuery.order("closed_at", { ascending: false });

  if (cashSessionsError) {
    throw new Error("Não foi possível carregar os fechamentos de caixa.");
  }

  const cashSessionIds = (cashSessions ?? []).map((session) => session.id);
  let cashMovements: {
    cash_session_id: string;
    movement_type: string;
    amount: number;
  }[] = [];
  let sessionPayments: {
    cash_session_id: string;
    amount: number;
    method: string;
  }[] = [];

  if (cashSessionIds.length > 0) {
    const [cashMovementsResult, sessionPaymentsResult] = await Promise.all([
      supabase
        .from("cash_movements")
        .select("cash_session_id, movement_type, amount")
        .in("cash_session_id", cashSessionIds),
      supabase
        .from("payments")
        .select("cash_session_id, amount, method")
        .in("cash_session_id", cashSessionIds)
        .eq("status", "confirmed"),
    ]);

    if (cashMovementsResult.error || sessionPaymentsResult.error) {
      throw new Error("Não foi possível calcular os fechamentos de caixa.");
    }

    cashMovements = cashMovementsResult.data ?? [];
    sessionPayments = sessionPaymentsResult.data ?? [];
  }

  const money = (value: number | null) =>
    (value ?? 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  const formatDate = (value: string | null) =>
    value
      ? new Date(value).toLocaleString("pt-BR", {
          timeZone: "America/Sao_Paulo",
        })
      : "Não informado";

  const getOrderDate = (order: (typeof orders)[number]) => {
    if (order.status === "cancelled") return order.cancelled_at;
    if (order.status === "paid") return order.closed_at;
    return order.opened_at;
  };

  const totalValue = (orders ?? [])
    .filter((order) =>
      status === "cancelled"
        ? order.status === "cancelled"
        : order.status !== "cancelled"
    )
    .reduce(
      (sum, order) => sum + Number(order.total ?? 0),
      0
    );

    const paymentTotals = {
    pix: 0,
    cash: 0,
    debit_card: 0,
    credit_card: 0,
    voucher: 0,
    other: 0,
  };

  (payments ?? []).forEach((payment) => {
    const method = payment.method as keyof typeof paymentTotals;

    if (method in paymentTotals) {
      paymentTotals[method] += Number(payment.amount);
    }
  });

  const totalReceived = Object.values(paymentTotals).reduce(
    (sum, value) => sum + value,
    0
  );

  const cashSessionReports = (cashSessions ?? []).map((session) => {
    const movements = cashMovements.filter(
      (movement) => movement.cash_session_id === session.id
    );
    const paymentsForSession = sessionPayments.filter(
      (payment) => payment.cash_session_id === session.id
    );
    const entries = movements
      .filter((movement) => movement.movement_type === "entry")
      .reduce((sum, movement) => sum + Number(movement.amount), 0);
    const withdrawals = movements
      .filter((movement) => movement.movement_type === "withdrawal")
      .reduce((sum, movement) => sum + Number(movement.amount), 0);
    const cashReceived = paymentsForSession
      .filter((payment) => payment.method === "cash")
      .reduce((sum, payment) => sum + Number(payment.amount), 0);
    const expected = Math.round(
      (Number(session.opening_balance) + entries - withdrawals + cashReceived) * 100
    ) / 100;
    const counted = Math.round(Number(session.closing_balance ?? 0) * 100) / 100;
    const difference = Math.round((counted - expected) * 100) / 100;

    return {
      id: session.id,
      openedBy: session.opened_by,
      openedAt: formatDate(session.opened_at),
      closedAt: formatDate(session.closed_at),
      openingBalance: Number(session.opening_balance),
      entries,
      withdrawals,
      cashReceived,
      expected,
      counted,
      difference,
      exportRow: {
        Responsavel: session.opened_by.slice(0, 8),
        Abertura: formatDate(session.opened_at),
        Fechamento: formatDate(session.closed_at),
        FundoInicial: Number(session.opening_balance),
        Entradas: entries,
        Retiradas: withdrawals,
        VendasEmDinheiro: cashReceived,
        DinheiroEsperado: expected,
        DinheiroContado: counted,
        Diferenca: difference,
      },
    };
  });

  const rawCashSessionTotals = cashSessionReports.reduce(
    (totals, session) => ({
      expected: totals.expected + session.expected,
      counted: totals.counted + session.counted,
      difference: totals.difference + session.difference,
    }),
    { expected: 0, counted: 0, difference: 0 }
  );
  const cashSessionTotals = {
    expected: Math.round(rawCashSessionTotals.expected * 100) / 100,
    counted: Math.round(rawCashSessionTotals.counted * 100) / 100,
    difference: Math.round(rawCashSessionTotals.difference * 100) / 100,
  };

  const currentLabel =
    statusOptions.find((item) => item.value === status)?.label ?? "Relatórios";

  return (
    <main className="min-h-screen bg-slate-50 p-5 text-slate-800 sm:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Central de relatórios
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Consulte as movimentações do estabelecimento.
            </p>
          </div>

          <ExportButton
            orders={(orders ?? []).map((order) => ({
              Comanda: order.order_number,
              Cliente: order.customer_name || "Não informado",
              Tipo: order.order_type,
              Situacao: order.status,
              Valor: Number(order.total ?? 0),
              Data: formatDate(getOrderDate(order)),
              MotivoCancelamento: order.cancellation_reason || "",
              DetalhesCancelamento: order.cancellation_details || "",
            }))}
            payments={filteredPayments.map((payment) => ({
              Comanda: payment.orders?.order_number ?? "",
              Cliente: payment.orders?.customer_name || "Não informado",
              FormaPagamento: payment.method,
              Valor: Number(payment.amount),
              Data: formatDate(payment.paid_at),
            }))}
            summary={{
              TotalRecebido: totalReceived,
              Pix: paymentTotals.pix,
              Dinheiro: paymentTotals.cash,
              CartaoDebito: paymentTotals.debit_card,
              CartaoCredito: paymentTotals.credit_card,
              Vale: paymentTotals.voucher,
              Outros: paymentTotals.other,
            }}
            cashSessions={cashSessionReports.map((session) => session.exportRow)}
          />
          <PdfButton
            orders={(orders ?? []).map((order) => ({
              Comanda: order.order_number,
              Cliente: order.customer_name || "Não informado",
              Tipo: order.order_type,
              Situacao: order.status,
              Valor: Number(order.total ?? 0),
              Data: formatDate(getOrderDate(order)),
            }))}
            payments={filteredPayments.map((payment) => ({
              Comanda: payment.orders?.order_number ?? "",
              Cliente: payment.orders?.customer_name || "Não informado",
              FormaPagamento: payment.method,
              Valor: Number(payment.amount),
              Data: formatDate(payment.paid_at),
            }))}
            summary={{
              TotalRecebido: totalReceived,
              Pix: paymentTotals.pix,
              Dinheiro: paymentTotals.cash,
              CartaoDebito: paymentTotals.debit_card,
              CartaoCredito: paymentTotals.credit_card,
              Vale: paymentTotals.voucher,
              Outros: paymentTotals.other,
            }}
            cashSessions={cashSessionReports.map((session) => session.exportRow)}
            inicio={inicio}
            fim={fim}
          />
          <Link
            href="/atendimentos"
            className="rounded-xl border bg-white px-4 py-2 text-sm hover:bg-slate-50"
          >
            Voltar aos atendimentos
          </Link>
        </header>

        <form className="flex flex-wrap items-end gap-3 rounded-2xl border bg-white p-5">
          <div>
            <label className="mb-1 block text-sm">Situação</label>
            <select
              name="status"
              defaultValue={status}
              className="rounded-lg border px-3 py-2"
            >
              {statusOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm">
              Forma de pagamento
            </label>
            <select
              name="pagamento"
              defaultValue={paymentFilter}
              className="rounded-lg border px-3 py-2"
            >
              {paymentOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm">Data inicial</label>
            <input
              type="date"
              name="inicio"
              defaultValue={inicio}
              className="rounded-lg border px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm">Data final</label>
            <input
              type="date"
              name="fim"
              defaultValue={fim}
              className="rounded-lg border px-3 py-2"
            />
          </div>

          <button className="rounded-lg bg-slate-900 px-5 py-2 text-white">
            Filtrar
          </button>

          <Link
            href="/relatorios"
            className="rounded-lg border px-5 py-2"
          >
            Limpar
          </Link>
        </form>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border bg-white p-5">
            <p className="text-sm text-slate-500">
              {currentLabel}
            </p>
            <p className="mt-2 text-2xl font-bold">
              {(orders ?? []).length}
            </p>
            <p className="text-xs text-slate-400">Comandas encontradas</p>
          </div>

          <div className="rounded-2xl border bg-white p-5">
            <p className="text-sm text-slate-500">
              {status === "cancelled"
                ? "Valor total das comandas canceladas"
                : "Valor total das comandas válidas"}
            </p>
            <p className="mt-2 text-2xl font-bold">
              {money(totalValue)}
            </p>
          </div>
        </section>

        <section className="overflow-x-auto rounded-2xl border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-500">
              <tr>
                <th className="p-4">Comanda</th>
                <th className="p-4">Cliente</th>
                <th className="p-4">Tipo</th>
                <th className="p-4">Situação</th>
                <th className="p-4">Valor</th>
                <th className="p-4">Data</th>
                {status === "cancelled" && (
                  <>
                    <th className="p-4">Motivo</th>
                    <th className="p-4">Responsável</th>
                  </>
                )}
              </tr>
            </thead>

            <tbody className="divide-y">
              {(orders ?? []).map((order) => (
                <tr key={order.id}>
                  <td className="whitespace-nowrap p-4 font-semibold">
                    <Link
                      href={`/atendimentos/${order.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      #{order.order_number}
                    </Link>
                  </td>

                  <td className="p-4">
                    {order.customer_name || "Não informado"}
                  </td>

                  <td className="p-4">{order.order_type}</td>

                  <td className="p-4">
                    {statusOptions.find(
                      (item) => item.value === order.status
                    )?.label ?? order.status}
                  </td>

                  <td className="whitespace-nowrap p-4">
                    {money(order.total)}
                  </td>

                  <td className="whitespace-nowrap p-4 text-slate-500">
                    {formatDate(getOrderDate(order))}
                  </td>

                  {status === "cancelled" && (
                    <>
                      <td className="min-w-48 p-4">
                        <strong>
                          {order.cancellation_reason || "Não informado"}
                        </strong>
                        {order.cancellation_details && (
                          <p className="mt-1 text-xs text-slate-500">
                            {order.cancellation_details}
                          </p>
                        )}
                      </td>

                      <td className="p-4 text-xs">
                        {order.cancelled_by
                          ? `${order.cancelled_by.slice(0, 8)}...`
                          : "Não informado"}
                      </td>
                    </>
                  )}
                </tr>
              ))}

              {(orders ?? []).length === 0 && (
                <tr>
                  <td
                    colSpan={status === "cancelled" ? 8 : 6}
                    className="p-8 text-center text-slate-500"
                  >
                    Nenhuma comanda encontrada nesse período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900">
            Resumo financeiro
          </h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { label: "Total recebido", value: totalReceived },
              { label: "Pix", value: paymentTotals.pix },
              { label: "Dinheiro", value: paymentTotals.cash },
              { label: "Cartão de débito", value: paymentTotals.debit_card },
              { label: "Cartão de crédito", value: paymentTotals.credit_card },
              { label: "Vale e outros", value: paymentTotals.voucher + paymentTotals.other },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border bg-white p-5">
                <p className="text-sm text-slate-500">{item.label}</p>
                <p className="mt-2 text-2xl font-bold">
                  {money(item.value)}
                </p>
              </div>
            ))}
          </div>

          <p className="text-xs text-slate-500">
            Valores calculados com base nos pagamentos confirmados no período selecionado.
          </p>
        </section>
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900">
            Detalhamento dos recebimentos
          </h2>

          <div className="overflow-x-auto rounded-2xl border bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                <tr>
                  <th className="p-4">Comanda</th>
                  <th className="p-4">Cliente</th>
                  <th className="p-4">Pagamento</th>
                  <th className="p-4">Valor</th>
                  <th className="p-4">Data</th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {filteredPayments.map((payment) => {
                  const order = payment.orders;

                  const paymentLabel =
                    paymentOptions.find(
                      (item) => item.value === payment.method
                    )?.label ?? payment.method;

                  return (
                    <tr key={payment.id}>
                      <td className="p-4 font-semibold">
                        {order ? (
                          <Link
                            href={`/atendimentos/${payment.order_id}`}
                            className="text-blue-600 hover:underline"
                          >
                            #{order.order_number}
                          </Link>
                        ) : "Não informado"}
                      </td>

                      <td className="p-4">
                        {order?.customer_name || "Não informado"}
                      </td>

                      <td className="p-4">{paymentLabel}</td>

                      <td className="whitespace-nowrap p-4">
                        {money(Number(payment.amount))}
                      </td>

                      <td className="whitespace-nowrap p-4 text-slate-500">
                        {formatDate(payment.paid_at)}
                      </td>
                    </tr>
                  );
                })}

                {filteredPayments.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500">
                      Nenhum pagamento encontrado nesse período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Fechamentos de caixa
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Sessões fechadas no período selecionado, com o valor contado e a diferença.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
      { label: "Caixas fechados", value: String(cashSessionReports.length) },
      { label: "Dinheiro esperado", value: money(cashSessionTotals.expected) },
      { label: "Dinheiro contado", value: money(cashSessionTotals.counted) },
      { label: "Diferença total", value: money(cashSessionTotals.difference) },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border bg-white p-5">
                <p className="text-sm text-slate-500">{item.label}</p>
                <p className={`mt-2 text-xl font-bold ${item.label === "Diferença total" && cashSessionTotals.difference !== 0 ? "text-amber-700" : "text-slate-900"}`}>
                  {item.value}
                </p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-2xl border bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                <tr>
                  <th className="p-4">Abertura / fechamento</th>
                  <th className="p-4">Responsável</th>
                  <th className="p-4">Fundo inicial</th>
                  <th className="p-4">Entradas</th>
                  <th className="p-4">Retiradas</th>
                  <th className="p-4">Vendas em dinheiro</th>
                  <th className="p-4">Esperado</th>
                  <th className="p-4">Contado</th>
                  <th className="p-4">Diferença</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {cashSessionReports.map((session) => (
                  <tr key={session.id}>
                    <td className="min-w-48 whitespace-nowrap p-4 text-slate-600">
                      {session.openedAt}<br />
                      <span className="text-xs text-slate-400">até {session.closedAt}</span>
                    </td>
                    <td className="p-4">{session.openedBy.slice(0, 8)}</td>
                    <td className="whitespace-nowrap p-4">{money(session.openingBalance)}</td>
                    <td className="whitespace-nowrap p-4">{money(session.entries)}</td>
                    <td className="whitespace-nowrap p-4">{money(session.withdrawals)}</td>
                    <td className="whitespace-nowrap p-4">{money(session.cashReceived)}</td>
                    <td className="whitespace-nowrap p-4 font-semibold">{money(session.expected)}</td>
                    <td className="whitespace-nowrap p-4">{money(session.counted)}</td>
                    <td className={`whitespace-nowrap p-4 font-semibold ${session.difference === 0 ? "text-emerald-700" : "text-amber-700"}`}>
                      {session.difference > 0 ? "+" : ""}{money(session.difference)}
                    </td>
                  </tr>
                ))}
                {cashSessionReports.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-500">
                      Nenhum fechamento de caixa encontrado nesse período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs leading-5 text-slate-500">
            Os valores consideram pagamentos confirmados vinculados a cada caixa. Fechamentos anteriores a essa associação podem não incluir as vendas daquele turno.
          </p>
        </section>
      </div>
    </main>
  );
}
