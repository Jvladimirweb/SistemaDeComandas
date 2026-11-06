
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createEstablishment } from "./actions";

type PageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function ConfigurarPage({
  searchParams,
}: PageProps) {
  const supabase = await createClient();
  const { data, error: authError } = await supabase.auth.getClaims();

  if (authError || !data?.claims) {
    redirect("/login");
  }

  const { error } = await searchParams;

  const errorMessage =
    error === "name"
      ? "Informe um nome entre 2 e 100 caracteres."
      : error === "check"
        ? "Não foi possível verificar seu cadastro. Tente novamente."
        : error === "save"
          ? "Não foi possível salvar. Confira a conexão e as permissões do banco."
          : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-700 font-bold text-white">
          VC
        </div>

        <p className="mt-6 text-sm font-medium text-emerald-700">
          CONFIGURAÇÃO INICIAL
        </p>

        <h1 className="mt-2 text-2xl font-bold text-slate-900">
          Vamos cadastrar seu estabelecimento
        </h1>

        <p className="mt-3 text-sm leading-6 text-slate-500">
          Informe o nome do estabelecimento que utilizará o Vivati Comandas.
          Seu usuário será vinculado como proprietário.
        </p>

        {errorMessage && (
          <div
            role="alert"
            className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700"
          >
            {errorMessage}
          </div>
        )}

        <form action={createEstablishment} className="mt-6 space-y-5">
          <div>
            <label
              htmlFor="name"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Nome do estabelecimento
            </label>

            <input
              id="name"
              name="name"
              type="text"
              minLength={2}
              maxLength={100}
              required
              autoComplete="organization"
              placeholder="Ex.: Vivati Bar e Lanchonete"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white transition hover:bg-emerald-800"
          >
            Cadastrar estabelecimento
          </button>
        </form>

        <p className="mt-5 text-xs leading-5 text-slate-400">
          O cadastro será salvo no banco de dados do Supabase.
        </p>
      </section>
    </main>
  );
}