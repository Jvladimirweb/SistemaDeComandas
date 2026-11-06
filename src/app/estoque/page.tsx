import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { configureInventory, recordInventoryMovement } from "./actions";

type Props = { searchParams: Promise<{ error?: string; success?: string }> };

function qty(value: number | string | null) {
  return Number(value ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

export default async function InventoryPage({ searchParams }: Props) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (authError || typeof userId !== "string") redirect("/login");
  const { data: membership } = await supabase
    .from("establishment_members").select("establishment_id")
    .eq("user_id", userId).limit(1).maybeSingle();
  if (!membership) redirect("/configurar");
  const { data: establishment } = await supabase
    .from("establishments").select("plan_code")
    .eq("id", membership.establishment_id).maybeSingle();
  if (establishment?.plan_code !== "plus") redirect("/configuracoes/plano?recurso=estoque");

  const [productsResult, movementsResult] = await Promise.all([
    supabase.from("products")
      .select("id, name, sku, is_active, stock_tracked, stock_quantity, minimum_stock, stock_initialized")
      .eq("establishment_id", membership.establishment_id).order("name").limit(300),
    supabase.from("inventory_movements")
      .select("id, product_id, movement_type, quantity, description, created_at")
      .eq("establishment_id", membership.establishment_id).order("created_at", { ascending: false }).limit(30),
  ]);
  if (productsResult.error || movementsResult.error) throw new Error("Não foi possível carregar o estoque.");
  const products = productsResult.data ?? [];
  const movements = movementsResult.data ?? [];
  const productNames = new Map(products.map((product) => [product.id, product.name]));
  const trackedProducts = products.filter((product) => product.stock_tracked);
  const lowStock = trackedProducts.filter((product) => Number(product.stock_quantity) <= Number(product.minimum_stock));
  const { error, success } = await searchParams;
  const errorMessages: Record<string, string> = {
    quantity: "Confira as quantidades informadas.",
    movement: "Confira os dados da movimentação.",
    insufficient: "Não há estoque suficiente para essa retirada.",
    save: "Não foi possível salvar. Confira os dados e tente novamente.",
  };
  const successMessage = success === "configured" ? "Controle do produto atualizado." : success === "movement" ? "Movimentação registrada." : null;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-5 sm:px-8">
        <div><p className="text-sm font-semibold text-emerald-700">RECURSO PLUS</p><h1 className="text-2xl font-bold text-slate-900">Estoque</h1><p className="mt-1 text-sm text-slate-500">Controle unidades dos produtos vendidos. A baixa automática acontece ao enviar o pedido à cozinha.</p></div>
        <Link href="/" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50">Voltar ao painel</Link>
      </header>
      <div className="mx-auto max-w-6xl space-y-6 p-5 sm:p-8">
        {successMessage && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{successMessage}</div>}
        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{errorMessages[error] ?? "Ocorreu um erro."}</div>}
        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border bg-white p-5"><p className="text-sm text-slate-500">Produtos cadastrados</p><p className="mt-2 text-2xl font-bold">{products.length}</p></div>
          <div className="rounded-2xl border bg-white p-5"><p className="text-sm text-slate-500">Com estoque controlado</p><p className="mt-2 text-2xl font-bold">{trackedProducts.length}</p></div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><p className="text-sm text-amber-800">No limite ou abaixo</p><p className="mt-2 text-2xl font-bold text-amber-900">{lowStock.length}</p></div>
        </section>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 p-5"><h2 className="text-lg font-bold">Produtos</h2><p className="mt-1 text-sm text-slate-500">Ative o controle apenas para os produtos cuja quantidade deseja acompanhar.</p></div>
          {products.length === 0 ? <p className="p-6 text-sm text-slate-500">Cadastre produtos antes de configurar o estoque. <Link className="font-semibold text-emerald-700 underline" href="/produtos">Ir para produtos</Link></p> : <div className="divide-y divide-slate-100">
            {products.map((product) => <article key={product.id} className="grid gap-5 p-5 lg:grid-cols-[1fr_1fr]">
              <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-slate-900">{product.name}</h3>{!product.is_active && <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">Inativo</span>}</div><p className="mt-1 text-sm text-slate-500">{product.sku || "Sem código"} · {product.stock_tracked ? `Saldo: ${qty(product.stock_quantity)}` : "Estoque não controlado"}</p>{product.stock_tracked && <p className={`mt-1 text-sm ${Number(product.stock_quantity) <= Number(product.minimum_stock) ? "font-semibold text-amber-700" : "text-slate-500"}`}>Mínimo: {qty(product.minimum_stock)} {Number(product.stock_quantity) <= Number(product.minimum_stock) ? "· Repor estoque" : ""}</p>}
                <form action={configureInventory} className="mt-4 flex flex-wrap items-end gap-3 rounded-xl bg-slate-50 p-3">
                  <input type="hidden" name="product_id" value={product.id}/><input type="hidden" name="stock_tracked" value="true"/>
                  {!product.stock_initialized ? <label className="text-xs font-medium text-slate-600">Saldo inicial<input name="initial_quantity" type="number" min="0" step="0.001" defaultValue="0" className="mt-1 block w-32 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"/></label> : <input type="hidden" name="initial_quantity" value="0"/>}
                  <label className="text-xs font-medium text-slate-600">Estoque mínimo<input name="minimum_stock" type="number" min="0" step="0.001" defaultValue={String(product.minimum_stock ?? 0)} className="mt-1 block w-32 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"/></label>
                  <button className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">{product.stock_tracked ? "Salvar mínimo" : "Ativar controle"}</button>
                </form>
                {product.stock_tracked && <form action={configureInventory} className="mt-2"><input type="hidden" name="product_id" value={product.id}/><input type="hidden" name="stock_tracked" value="false"/><input type="hidden" name="initial_quantity" value="0"/><input type="hidden" name="minimum_stock" value={String(product.minimum_stock ?? 0)}/><button className="text-sm font-medium text-slate-500 underline">Desativar controle deste produto</button></form>}
              </div>
              {product.stock_tracked && <form action={recordInventoryMovement} className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2"><input type="hidden" name="product_id" value={product.id}/><h4 className="font-semibold sm:col-span-2">Registrar movimentação</h4><label className="text-xs font-medium text-slate-600">Tipo<select name="movement_type" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="entry">Entrada</option><option value="withdrawal">Retirada</option></select></label><label className="text-xs font-medium text-slate-600">Quantidade<input name="quantity" type="number" min="0.001" step="0.001" required className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></label><label className="text-xs font-medium text-slate-600 sm:col-span-2">Motivo<input name="description" minLength={2} maxLength={200} required placeholder="Ex.: Reposição do fornecedor" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></label><button className="rounded-lg border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 sm:col-span-2">Salvar movimentação</button></form>}
            </article>)}
          </div>}
        </section>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-100 p-5"><h2 className="text-lg font-bold">Movimentações recentes</h2></div>{movements.length === 0 ? <p className="p-5 text-sm text-slate-500">As entradas, retiradas e baixas de pedidos aparecerão aqui.</p> : <div className="divide-y divide-slate-100">{movements.map((movement) => <div key={movement.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm"><div><p className="font-semibold">{productNames.get(movement.product_id) ?? "Produto removido"} · {movement.movement_type === "entry" ? "Entrada" : movement.movement_type === "withdrawal" ? "Retirada" : "Venda"}</p><p className="text-slate-500">{movement.description}</p></div><div className="text-right"><p className="font-semibold">{qty(movement.quantity)}</p><p className="text-xs text-slate-500">{new Date(movement.created_at).toLocaleString("pt-BR")}</p></div></div>)}</div>}</section>
      </div>
    </main>
  );
}
