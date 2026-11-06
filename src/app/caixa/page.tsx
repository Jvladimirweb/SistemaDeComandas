import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  addCashMovement,
  closeCashSession,
  openCashSession,
} from "./actions";

type PageProps = {
  searchParams: Promise<{ error?: string; success?: string }>;
};

function money(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function dateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

const methodLabels: Record<string, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  credit_card: "Crédito",
  debit_card: "Débito",
  voucher: "Vale",
  other: "Outros",
};

export default async function CashPage({ searchParams }: PageProps) {
  const { error: errorCode, success } = await searchParams;
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;

  if (authError || typeof userId !== "string") redirect("/login");

  const { data: membership, error: membershipError } = await supabase
    .from("establishment_members")
    .select("establishment_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (membershipError) throw new Error("Não foi possível carregar seu cadastro.");
  if (!membership) redirect("/configurar");

  const { data: openSession, error: sessionError } = await supabase
    .from("cash_sessions")
    .select("id, opening_balance, opened_at")
    .eq("establishment_id", membership.establishment_id)
    .eq("opened_by", userId)
    .eq("status", "open")
    .maybeSingle();

  if (sessionError) throw new Error("Não foi possível consultar o caixa.");

  let movements: {
    id: string;
    movement_type: string;
    amount: number;
    description: string;
    created_at: string;
  }[] = [];
  let payments: { amount: number; method: string }[] = [];
  let closedSessions: {
    id: string;
    opening_balance: number;
    closing_balance: number | null;
    opened_at: string;
    closed_at: string | null;
  }[] = [];
  let closedMovements: { cash_session_id: string; movement_type: string; amount: number }[] = [];
  let closedPayments: { cash_session_id: string; amount: number; method: string }[] = [];

  if (openSession) {
    const [movementsResult, paymentsResult] = await Promise.all([
      supabase
        .from("cash_movements")
        .select("id, movement_type, amount, description, created_at")
        .eq("cash_session_id", openSession.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("payments")
        .select("amount, method")
        .eq("cash_session_id", openSession.id)
        .eq("status", "confirmed"),
    ]);

    if (movementsResult.error || paymentsResult.error) {
      throw new Error("Não foi possível carregar as movimentações do caixa.");
    }

    movements = movementsResult.data ?? [];
    payments = paymentsResult.data ?? [];
  } else {
    const { data, error } = await supabase
      .from("cash_sessions")
      .select("id, opening_balance, closing_balance, opened_at, closed_at")
      .eq("establishment_id", membership.establishment_id)
      .eq("opened_by", userId)
      .eq("status", "closed")
      .order("closed_at", { ascending: false })
      .limit(5);

    if (error) throw new Error("Não foi possível carregar os últimos caixas.");
    closedSessions = data ?? [];

    const closedSessionIds = closedSessions.map((session) => session.id);
    if (closedSessionIds.length > 0) {
      const [closedMovementsResult, closedPaymentsResult] = await Promise.all([
        supabase
          .from("cash_movements")
          .select("cash_session_id, movement_type, amount")
          .in("cash_session_id", closedSessionIds),
        supabase
          .from("payments")
          .select("cash_session_id, amount, method")
          .in("cash_session_id", closedSessionIds)
          .eq("status", "confirmed"),
      ]);

      if (closedMovementsResult.error || closedPaymentsResult.error) {
        throw new Error("Não foi possível carregar os resumos dos caixas fechados.");
      }

      closedMovements = closedMovementsResult.data ?? [];
      closedPayments = closedPaymentsResult.data ?? [];
    }
  }

  const entries = movements
    .filter((movement) => movement.movement_type === "entry")
    .reduce((sum, movement) => sum + Number(movement.amount), 0);
  const withdrawals = movements
    .filter((movement) => movement.movement_type === "withdrawal")
    .reduce((sum, movement) => sum + Number(movement.amount), 0);
  const cashPayments = payments
    .filter((payment) => payment.method === "cash")
    .reduce((sum, payment) => sum + Number(payment.amount), 0);
  const expectedCash = Number(openSession?.opening_balance ?? 0) + entries - withdrawals + cashPayments;
  const paymentsByMethod = payments.reduce<Record<string, number>>((totals, payment) => {
    totals[payment.method] = (totals[payment.method] ?? 0) + Number(payment.amount);
    return totals;
  }, {});

  const errorMessages: Record<string, string> = {
    load: "Não foi possível localizar seu estabelecimento.",
    amount: "Informe um valor válido, usando até duas casas decimais.",
    already_open: "Você já tem um caixa aberto.",
    save: "Não foi possível salvar. Confira sua conexão e tente novamente.",
    movement: "Informe o tipo, o valor e uma descrição de pelo menos 2 caracteres.",
    no_session: "Abra um caixa antes de registrar movimentações.",
    close: "Não foi possível fechar o caixa. Atualize a página e tente novamente.",
  };
  const successMessages: Record<string, string> = {
    opened: "Caixa aberto.",
    movement: "Movimentação registrada.",
    closed: "Caixa fechado.",
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-emerald-700">VIVATI COMANDAS</p>
            <h1 className="mt-1 text-3xl font-bold text-slate-900">Caixa</h1>
            <p className="mt-2 text-sm text-slate-500">
              Abertura, movimentações e conferência do seu turno.
            </p>
          </div>
          <a
            href="/"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Voltar ao painel
          </a>
        </header>

        {(errorCode && errorMessages[errorCode]) || (success && successMessages[success]) ? (
          <div
            role={errorCode ? "alert" : "status"}
            className={`rounded-xl p-4 text-sm ${errorCode ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}
          >
            {errorCode ? errorMessages[errorCode] : successMessages[success!]}
          </div>
        ) : null}

        {openSession ? (
          <>
            <section className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                    CAIXA ABERTO
                  </span>
                  <p className="mt-3 text-sm text-slate-500">
                    Aberto em {dateTime(openSession.opened_at)}
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-sm text-slate-500">Dinheiro esperado</p>
                  <p className="text-3xl font-bold text-slate-900">{money(expectedCash)}</p>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryCard label="Fundo de abertura" value={money(Number(openSession.opening_balance))} />
                <SummaryCard label="Entradas" value={money(entries)} />
                <SummaryCard label="Retiradas" value={money(withdrawals)} />
                <SummaryCard label="Vendas em dinheiro" value={money(cashPayments)} />
              </div>

              {Object.keys(paymentsByMethod).length > 0 && (
                <div className="mt-5 rounded-xl bg-slate-50 p-4">
                  <h2 className="text-sm font-semibold text-slate-800">Vendas por forma de pagamento neste caixa</h2>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Object.entries(paymentsByMethod).map(([method, total]) => (
                      <span key={method} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                        {methodLabels[method] ?? method}: <strong>{money(total)}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-bold text-slate-900">Registrar movimentação</h2>
                <p className="mt-1 text-sm text-slate-500">Use para reforço de dinheiro ou retirada do caixa.</p>
                <form action={addCashMovement} className="mt-5 space-y-4">
                  <div>
                    <label htmlFor="movement_type" className="mb-1 block text-sm font-medium">Tipo</label>
                    <select id="movement_type" name="movement_type" required className="w-full rounded-lg border border-slate-300 px-3 py-2.5">
                      <option value="entry">Entrada</option>
                      <option value="withdrawal">Retirada</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="amount" className="mb-1 block text-sm font-medium">Valor (R$)</label>
                    <input id="amount" name="amount" type="number" min="0.01" step="0.01" required className="w-full rounded-lg border border-slate-300 px-3 py-2.5" placeholder="0,00" />
                  </div>
                  <div>
                    <label htmlFor="description" className="mb-1 block text-sm font-medium">Descrição</label>
                    <input id="description" name="description" type="text" minLength={2} maxLength={200} required className="w-full rounded-lg border border-slate-300 px-3 py-2.5" placeholder="Ex.: troco ou compra de emergência" />
                  </div>
                  <button className="w-full rounded-lg bg-emerald-700 px-4 py-3 font-semibold text-white hover:bg-emerald-800">Registrar</button>
                </form>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-bold text-slate-900">Fechar caixa</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Conte o dinheiro disponível e informe o total. O sistema compara com o valor esperado.
                </p>
                <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                  Esperado em dinheiro: <strong>{money(expectedCash)}</strong>
                </div>
                <form action={closeCashSession} className="mt-5 space-y-4">
                  <input type="hidden" name="session_id" value={openSession.id} />
                  <div>
                    <label htmlFor="closing_balance" className="mb-1 block text-sm font-medium">Dinheiro contado (R$)</label>
                    <input id="closing_balance" name="closing_balance" type="number" min="0" step="0.01" required className="w-full rounded-lg border border-slate-300 px-3 py-2.5" placeholder="0,00" />
                  </div>
                  <button className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-800 hover:bg-slate-50">Conferir e fechar caixa</button>
                </form>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">Movimentações desta sessão</h2>
              {movements.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">Nenhuma entrada ou retirada registrada.</p>
              ) : (
                <div className="mt-4 divide-y divide-slate-100">
                  {movements.map((movement) => (
                    <div key={movement.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
                      <div>
                        <p className="font-semibold text-slate-800">{movement.movement_type === "entry" ? "Entrada" : "Retirada"} · {movement.description}</p>
                        <p className="mt-1 text-xs text-slate-500">{dateTime(movement.created_at)}</p>
                      </div>
                      <p className={movement.movement_type === "entry" ? "font-semibold text-emerald-700" : "font-semibold text-red-700"}>
                        {movement.movement_type === "entry" ? "+" : "−"}{money(Number(movement.amount))}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : (
          <>
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-slate-900">Abra seu caixa</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                Informe o dinheiro inicial disponível para troco. As vendas finalizadas enquanto a sessão estiver aberta serão associadas a este caixa.
              </p>
              <form action={openCashSession} className="mt-5 flex max-w-lg flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label htmlFor="opening_balance" className="mb-1 block text-sm font-medium">Fundo de abertura (R$)</label>
                  <input id="opening_balance" name="opening_balance" type="number" min="0" step="0.01" required className="w-full rounded-lg border border-slate-300 px-3 py-2.5" placeholder="0,00" />
                </div>
                <button className="rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white hover:bg-emerald-800">Abrir caixa</button>
              </form>
              <p className="mt-4 max-w-2xl rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                Os pedidos ainda podem ser pagos sem abrir o caixa, mas esses pagamentos não entram no fechamento desta sessão.
              </p>
            </section>

            {closedSessions.length > 0 && (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-bold text-slate-900">Últimos fechamentos</h2>
                <div className="mt-3 divide-y divide-slate-100">
                  {closedSessions.map((session) => {
                    const sessionMovements = closedMovements.filter(
                      (movement) => movement.cash_session_id === session.id
                    );
                    const sessionPayments = closedPayments.filter(
                      (payment) => payment.cash_session_id === session.id
                    );
                    const expected =
                      Number(session.opening_balance) +
                      sessionMovements.reduce(
                        (sum, movement) =>
                          sum +
                          (movement.movement_type === "entry"
                            ? Number(movement.amount)
                            : movement.movement_type === "withdrawal"
                              ? -Number(movement.amount)
                              : 0),
                        0
                      ) +
                      sessionPayments
                        .filter((payment) => payment.method === "cash")
                        .reduce((sum, payment) => sum + Number(payment.amount), 0);
                    const counted = Number(session.closing_balance ?? 0);
                    const difference = counted - expected;

                    return (
                      <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm">
                        <p className="text-slate-600">{dateTime(session.opened_at)} até {session.closed_at ? dateTime(session.closed_at) : "—"}</p>
                        <div className="flex flex-wrap gap-x-5 gap-y-2">
                          <span>Esperado: <strong>{money(expected)}</strong></span>
                          <span>Contado: <strong>{money(counted)}</strong></span>
                          <span className={difference === 0 ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"}>
                            Diferença: {difference > 0 ? "+" : ""}{money(difference)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>
    </div>
  );
}
