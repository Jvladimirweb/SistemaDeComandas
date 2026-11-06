import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const menuItems = [
  { icon: "▦", label: "Visão geral", href: "/", active: true },
  { icon: "▤", label: "Comandas", href: "/atendimentos" },
  { icon: "▦", label: "Mesas", href: "/mesa" },
  { icon: "◈", label: "Produtos", href: "/produtos" },
  { icon: "⌂", label: "Cozinha", href: "/cozinha" },
  { icon: "R$", label: "Caixa", href: "/caixa" },
  { icon: "▥", label: "Relatórios", href: "/relatorios" },
  { icon: "⚙", label: "Impressão", href: "/configuracoes/impressao" },
  { icon: "◇", label: "Plano e recursos", href: "/configuracoes/plano" },
  { icon: "▣", label: "Estoque", href: "/estoque", plusOnly: true },
];

const quickLinks = [
  {
    icon: "＋",
    title: "Nova comanda",
    description: "Abrir uma conta para atendimento",
    href: "/atendimentos",
  },
  {
    icon: "▦",
    title: "Ver mesas",
    description: "Consultar a ocupação das mesas",
    href: "/mesa",
  },
  {
    icon: "⌂",
    title: "Abrir cozinha",
    description: "Acompanhar os pedidos em preparo",
    href: "/cozinha",
  },
  {
    icon: "▥",
    title: "Consultar relatórios",
    description: "Acompanhar resultados por período",
    href: "/relatorios",
  },
  {
    icon: "R$",
    title: "Abrir o caixa",
    description: "Registrar abertura, entradas e fechamento",
    href: "/caixa",
  },
];

const orderTypeLabels: Record<string, string> = {
  table: "Mesa",
  counter: "Balcão",
  pickup: "Retirada",
  delivery: "Delivery",
};

const orderStatusLabels: Record<string, string> = {
  open: "Em andamento",
  awaiting_payment: "Aguardando pagamento",
  paid: "Pago",
  cancelled: "Cancelada",
};

function getTodayRange() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";
  const year = Number(part("year"));
  const month = Number(part("month"));
  const day = Number(part("day"));
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  const tomorrow = new Date(Date.UTC(year, month - 1, day + 1))
    .toISOString()
    .slice(0, 10);

  return {
    start: `${today}T00:00:00-03:00`,
    end: `${tomorrow}T00:00:00-03:00`,
  };
}

function money(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function StatCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 font-semibold text-emerald-700">
          {icon}
        </span>
      </div>
      <p className="mt-4 text-2xl font-bold tracking-tight text-slate-900">
        {value}
      </p>
      <p className="mt-2 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

export default async function Home() {
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

  if (membershipError) {
    throw new Error("Não foi possível consultar seu estabelecimento.");
  }

  if (!membership) redirect("/configurar");

  const { data: establishment, error: establishmentError } = await supabase
    .from("establishments")
    .select("name, plan_code")
    .eq("id", membership.establishment_id)
    .maybeSingle();

  if (establishmentError || !establishment) {
    throw new Error("Não foi possível carregar os dados do estabelecimento.");
  }

  const visibleMenuItems = menuItems.filter(
    (item) => !("plusOnly" in item) || establishment.plan_code === "plus"
  );
  const visibleQuickLinks = establishment.plan_code === "plus"
    ? [...quickLinks, { icon: "▣", title: "Controlar estoque", description: "Acompanhar saldo e movimentações dos produtos", href: "/estoque" }]
    : quickLinks;

  const { start, end } = getTodayRange();
  const [tablesResult, recentOrdersResult, activeOrdersResult, paidOrdersResult, paymentsResult] =
    await Promise.all([
      supabase
        .from("dining_tables")
        .select("id, name, status")
        .eq("establishment_id", membership.establishment_id)
        .order("name"),
      supabase
        .from("orders")
        .select(
          "id, order_number, order_type, status, customer_name, opened_at, total, table_id"
        )
        .eq("establishment_id", membership.establishment_id)
        .order("opened_at", { ascending: false })
        .limit(5),
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("establishment_id", membership.establishment_id)
        .in("status", ["open", "awaiting_payment"]),
      supabase
        .from("orders")
        .select("id, total")
        .eq("establishment_id", membership.establishment_id)
        .eq("status", "paid")
        .gte("closed_at", start)
        .lt("closed_at", end),
      supabase
        .from("payments")
        .select("amount")
        .eq("establishment_id", membership.establishment_id)
        .eq("status", "confirmed")
        .gte("paid_at", start)
        .lt("paid_at", end),
    ]);

  if (
    tablesResult.error ||
    recentOrdersResult.error ||
    activeOrdersResult.error ||
    paidOrdersResult.error ||
    paymentsResult.error
  ) {
    throw new Error("Não foi possível carregar o resumo do painel.");
  }

  const tables = tablesResult.data ?? [];
  const recentOrders = recentOrdersResult.data ?? [];
  const activeTables = tables.filter((table) => table.status !== "inactive");
  const occupiedTables = tables.filter((table) => table.status === "occupied");
  const paidOrders = paidOrdersResult.data ?? [];
  const payments = paymentsResult.data ?? [];

  const receivedToday = payments.reduce(
    (sum, payment) => sum + Number(payment.amount ?? 0),
    0
  );
  const averageTicket = paidOrders.length
    ? paidOrders.reduce((sum, order) => sum + Number(order.total ?? 0), 0) /
      paidOrders.length
    : 0;

  const recentOrderIds = recentOrders.map((order) => order.id);
  let recentItems: { order_id: string; quantity: number }[] = [];

  if (recentOrderIds.length > 0) {
    const { data, error } = await supabase
      .from("order_items")
      .select("order_id, quantity")
      .eq("establishment_id", membership.establishment_id)
      .eq("status", "active")
      .in("order_id", recentOrderIds);

    if (error) {
      throw new Error("Não foi possível carregar os itens dos pedidos recentes.");
    }

    recentItems = data ?? [];
  }

  const itemCounts = new Map<string, number>();
  recentItems.forEach((item) => {
    itemCounts.set(
      item.order_id,
      (itemCounts.get(item.order_id) ?? 0) + Number(item.quantity)
    );
  });

  const tableNames = new Map(tables.map((table) => [table.id, table.name]));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 bg-white p-5 lg:block">
        <div className="mb-10 flex items-center gap-3 px-2 pt-2">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-700 text-lg font-bold text-white">
            VC
          </div>
          <div>
            <h1 className="font-bold text-slate-900">Vivati Comandas</h1>
            <p className="text-xs text-slate-500">Gestão simplificada</p>
          </div>
        </div>

        <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
          Menu principal
        </p>
        <nav className="space-y-1">
          {visibleMenuItems.map((item) => (
            <Link
              key={item.label}
              href={item.href!}
              className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                item.active
                  ? "bg-emerald-700 text-white"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <span className="w-6 text-center">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="absolute bottom-5 left-5 right-5 rounded-xl bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-800">
            {establishment.name}
          </p>
          <p className="mt-1 text-xs text-slate-500">Sistema de comandas</p>
        </div>
      </aside>

      <main className="lg:ml-64">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-5 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-700 font-bold text-white lg:hidden">
              VC
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Visão geral</h2>
              <p className="text-sm text-slate-500">Resumo da operação</p>
            </div>
          </div>
          <div className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800">
            ● Dados atualizados
          </div>
        </header>

        <nav className="border-b border-slate-200 bg-white px-5 py-3 lg:hidden">
          <div className="flex gap-2 overflow-x-auto">
            {visibleMenuItems
              .filter((item) => item.href)
              .map((item) => (
                <Link
                  key={item.label}
                  href={item.href!}
                  className="whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  {item.label}
                </Link>
              ))}
          </div>
        </nav>

        <div className="p-5 sm:p-8">
          <section className="mb-8">
            <p className="text-sm text-slate-500">{establishment.name}</p>
            <h3 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Controle seu negócio.
              <span className="block text-emerald-700">Tudo em um só lugar.</span>
            </h3>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
              Acompanhe as comandas, organize as mesas e veja a movimentação do
              seu estabelecimento.
            </p>
          </section>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Recebido hoje"
              value={money(receivedToday)}
              detail="Pagamentos confirmados"
              icon="R$"
            />
            <StatCard
              label="Comandas ativas"
              value={String(activeOrdersResult.count ?? 0)}
              detail="Em atendimento ou aguardando pagamento"
              icon="▤"
            />
            <StatCard
              label="Mesas ocupadas"
              value={`${occupiedTables.length} / ${activeTables.length}`}
              detail="Mesas ativas ocupadas agora"
              icon="▦"
            />
            <StatCard
              label="Ticket médio hoje"
              value={money(averageTicket)}
              detail={`${paidOrders.length} comanda(s) pagas hoje`}
              icon="↗"
            />
          </section>

          <section className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white xl:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
                <div>
                  <h3 className="font-bold text-slate-900">Comandas recentes</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Últimos pedidos registrados
                  </p>
                </div>
                <Link
                  href="/atendimentos"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Ver todas
                </Link>
              </div>

              {recentOrders.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="font-semibold text-slate-700">
                    Nenhuma comanda registrada ainda.
                  </p>
                  <Link
                    href="/atendimentos"
                    className="mt-3 inline-block text-sm font-semibold text-emerald-700 hover:underline"
                  >
                    Abrir o primeiro atendimento
                  </Link>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-5 py-3 font-medium">Comanda</th>
                        <th className="px-5 py-3 font-medium">Local / cliente</th>
                        <th className="px-5 py-3 font-medium">Itens</th>
                        <th className="px-5 py-3 font-medium">Total</th>
                        <th className="px-5 py-3 font-medium">Situação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {recentOrders.map((order) => {
                        const statusClass =
                          order.status === "paid"
                            ? "bg-emerald-50 text-emerald-700"
                            : order.status === "cancelled"
                              ? "bg-red-50 text-red-700"
                              : order.status === "awaiting_payment"
                                ? "bg-blue-50 text-blue-700"
                                : "bg-amber-50 text-amber-700";
                        const location =
                          order.order_type === "table"
                            ? tableNames.get(order.table_id ?? "") ?? "Mesa"
                            : order.customer_name ||
                              orderTypeLabels[order.order_type] ||
                              order.order_type;

                        return (
                          <tr key={order.id}>
                            <td className="whitespace-nowrap px-5 py-4 font-semibold">
                              <Link
                                href={`/atendimentos/${order.id}`}
                                className="text-blue-700 hover:underline"
                              >
                                #{order.order_number}
                              </Link>
                            </td>
                            <td className="whitespace-nowrap px-5 py-4">{location}</td>
                            <td className="px-5 py-4">
                              {itemCounts.get(order.id) ?? 0}
                            </td>
                            <td className="whitespace-nowrap px-5 py-4 font-medium">
                              {money(Number(order.total ?? 0))}
                            </td>
                            <td className="whitespace-nowrap px-5 py-4">
                              <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${statusClass}`}>
                                {orderStatusLabels[order.status] ?? order.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="font-bold text-slate-900">Acesso rápido</h3>
              <p className="mt-1 text-sm text-slate-500">
                Atalhos para sua operação
              </p>

              <div className="mt-5 space-y-3">
                {visibleQuickLinks.map((item) => (
                  <Link
                    key={item.title}
                    href={item.href}
                    className="block rounded-xl border border-slate-200 p-4 transition hover:border-emerald-300 hover:bg-emerald-50"
                  >
                    <p className="font-semibold text-slate-800">
                      {item.icon} {item.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.description}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          </section>

          <footer className="py-8 text-center text-xs text-slate-400">
            Vivati Comandas · {establishment.name}
          </footer>
        </div>
      </main>
    </div>
  );
}
