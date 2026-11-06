import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { changePlan } from "./actions";

type Props = { searchParams: Promise<{ error?: string; success?: string; recurso?: string }> };

export default async function PlanPage({ searchParams }: Props) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (authError || typeof userId !== "string") redirect("/login");
  const { data: membership } = await supabase.from("establishment_members")
    .select("establishment_id").eq("user_id", userId).limit(1).maybeSingle();
  if (!membership) redirect("/configurar");
  const { data: establishment } = await supabase.from("establishments")
    .select("name, plan_code, created_by").eq("id", membership.establishment_id).maybeSingle();
  if (!establishment) throw new Error("Não foi possível carregar o estabelecimento.");
  const { error, success, recurso } = await searchParams;
  const isOwner = establishment.created_by === userId;
  const errorMessages: Record<string, string> = {
    owner: "Somente o proprietário que cadastrou o estabelecimento pode alterar o plano.",
    plan: "A opção de plano não foi reconhecida.",
    save: "Não foi possível salvar a alteração do plano.",
  };
  const successMessage = success === "plus" ? "Plano Plus ativado para este estabelecimento." : success === "basic" ? "Plano Básico ativado. O saldo e o histórico de estoque foram preservados." : null;

  return <main className="min-h-screen bg-slate-50 text-slate-800">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-5 sm:px-8"><div><p className="text-sm font-semibold text-emerald-700">CONFIGURAÇÕES</p><h1 className="text-2xl font-bold text-slate-900">Plano e recursos</h1><p className="mt-1 text-sm text-slate-500">{establishment.name}</p></div><Link href="/" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50">Voltar ao painel</Link></header>
    <div className="mx-auto max-w-4xl space-y-5 p-5 sm:p-8">
      {recurso === "estoque" && <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">O controle de estoque está disponível no plano Plus.</div>}
      {successMessage && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{successMessage}</div>}
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{errorMessages[error] ?? "Ocorreu um erro."}</div>}
      <section className="grid gap-5 md:grid-cols-2">
        <article className={`rounded-2xl border bg-white p-6 ${establishment.plan_code === "basic" ? "border-emerald-500 ring-2 ring-emerald-100" : "border-slate-200"}`}><p className="text-sm font-semibold text-slate-500">PLANO ATUAL {establishment.plan_code === "basic" ? "· ATIVO" : ""}</p><h2 className="mt-2 text-2xl font-bold">Básico</h2><p className="mt-3 text-sm leading-6 text-slate-600">Comandas, produtos, mesas, cozinha, caixa, relatórios e impressão.</p>{isOwner && establishment.plan_code !== "basic" && <form action={changePlan} className="mt-6"><input type="hidden" name="plan_code" value="basic"/><button className="w-full rounded-xl border border-slate-300 px-4 py-3 font-semibold hover:bg-slate-50">Ativar plano Básico</button></form>}</article>
        <article className={`rounded-2xl border bg-white p-6 ${establishment.plan_code === "plus" ? "border-emerald-500 ring-2 ring-emerald-100" : "border-slate-200"}`}><p className="text-sm font-semibold text-slate-500">PLANO ATUAL {establishment.plan_code === "plus" ? "· ATIVO" : ""}</p><h2 className="mt-2 text-2xl font-bold">Plus</h2><p className="mt-3 text-sm leading-6 text-slate-600">Inclui tudo do Básico e controle de estoque de produtos vendidos, com histórico de entradas, retiradas e baixa automática ao enviar à cozinha.</p>{isOwner && establishment.plan_code !== "plus" && <form action={changePlan} className="mt-6"><input type="hidden" name="plan_code" value="plus"/><button className="w-full rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white hover:bg-emerald-800">Ativar plano Plus</button></form>}</article>
      </section>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">A ativação nesta etapa é manual e não gera cobrança automática. Se voltar ao Básico, o estoque fica oculto e pausado; quantidades e histórico são mantidos para uma futura reativação.</div>
      {!isOwner && <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Apenas o proprietário do estabelecimento pode alterar o plano.</p>}
      {establishment.plan_code === "plus" && <Link href="/estoque" className="inline-flex rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white hover:bg-emerald-800">Abrir controle de estoque</Link>}
    </div>
  </main>;
}
