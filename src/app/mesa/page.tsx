
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createTable } from "./actions";

type PageProps = {
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
};

export default async function TablesPage({
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

  const { data: tables, error: tablesError } =
    await supabase
      .from("dining_tables")
      .select("id, name, seats, status")
      .eq("establishment_id", membership.establishment_id)
      .order("sort_order")
      .order("name");

  if (tablesError) {
    throw new Error("Não foi possível carregar as mesas.");
  }

  const { error, success } = await searchParams;

  const errorMessage =
    error === "invalid"
      ? "Confira o nome da mesa e a quantidade de lugares."
      : error === "duplicate"
        ? "Já existe uma mesa com esse nome."
        : error === "load"
          ? "Não foi possível consultar o estabelecimento."
          : error === "save"
            ? "Não foi possível salvar a mesa. Tente novamente."
            : null;

  const available = tables.filter(
    (table) => table.status === "available"
  ).length;

  const occupied = tables.filter(
    (table) => table.status === "occupied"
  ).length;

  const inactive = tables.filter(
    (table) => table.status === "inactive"
  ).length;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-5 sm:px-8">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Mesas
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Organize as mesas do seu estabelecimento.
          </p>
        </div>

        <Link
          href="/"
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50"
        >
          Voltar ao painel
        </Link>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 p-5 sm:p-8">
        {success === "created" && (
          <div
            role="status"
            className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
          >
            Mesa cadastrada com sucesso!
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            {errorMessage}
          </div>
        )}

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">Total de mesas</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {tables.length}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">Disponíveis</p>
            <p className="mt-2 text-3xl font-bold text-emerald-700">
              {available}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">Ocupadas</p>
            <p className="mt-2 text-3xl font-bold text-amber-600">
              {occupied}
            </p>
            {inactive > 0 && (
              <p className="mt-1 text-xs text-slate-500">
                Inativas: {inactive}
              </p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="text-lg font-bold text-slate-900">
            Cadastrar mesa
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Informe um nome e a quantidade de lugares.
          </p>

          <form
            action={createTable}
            className="mt-5 grid grid-cols-1 items-end gap-4 sm:grid-cols-3"
          >
            <div className="sm:col-span-1">
              <label
                htmlFor="name"
                className="mb-2 block text-sm font-medium"
              >
                Nome ou número da mesa
              </label>

              <input
                id="name"
                name="name"
                type="text"
                maxLength={60}
                required
                placeholder="Ex.: Mesa 01"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            <div>
              <label
                htmlFor="seats"
                className="mb-2 block text-sm font-medium"
              >
                Quantidade de lugares
              </label>

              <input
                id="seats"
                name="seats"
                type="number"
                min="1"
                max="100"
                step="1"
                defaultValue="4"
                required
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            <button
              type="submit"
              className="rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white hover:bg-emerald-800"
            >
              Cadastrar mesa
            </button>
          </form>
        </section>

        <section>
          <div className="mb-4">
            <h2 className="text-lg font-bold text-slate-900">
              Mesas cadastradas
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Situação atual registrada no banco de dados.
            </p>
          </div>

          {tables.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <p className="font-semibold text-slate-700">
                Nenhuma mesa cadastrada
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Cadastre sua primeira mesa no formulário acima.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {tables.map((table) => {
                const isAvailable = table.status === "available";
                const isOccupied = table.status === "occupied";

                const statusLabel = isAvailable
                  ? "Disponível"
                  : isOccupied
                    ? "Ocupada"
                    : "Inativa";

                const statusClass = isAvailable
                  ? "bg-emerald-50 text-emerald-700"
                  : isOccupied
                    ? "bg-amber-50 text-amber-700"
                    : "bg-slate-100 text-slate-600";

                return (
                  <article
                    key={table.id}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">
                          {table.name}
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">
                          {table.seats}{" "}
                          {table.seats === 1 ? "lugar" : "lugares"}
                        </p>
                      </div>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${statusClass}`}
                      >
                        {statusLabel}
                      </span>
                    </div>

                    <div className="mt-5 border-t border-slate-100 pt-4 text-xs text-slate-400">
                      A situação será atualizada pela operação das comandas.
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
