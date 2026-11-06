
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createCategory, createProduct } from "./actions";

type PageProps = {
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
};

export default async function ProductsPage({
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
    throw new Error("Não foi possível consultar seu estabelecimento.");
  }

  if (!membership) {
    redirect("/configurar");
  }

  const establishmentId = membership.establishment_id;

  const [categoryResult, productResult] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name")
      .eq("establishment_id", establishmentId)
      .order("name"),
    supabase
      .from("products")
      .select("id, name, sku, price, category_id, is_active")
      .eq("establishment_id", establishmentId)
      .order("name")
      .limit(200),
  ]);

  if (categoryResult.error || productResult.error) {
    throw new Error("Não foi possível carregar os produtos e categorias.");
  }

  const categories = categoryResult.data ?? [];
  const products = productResult.data ?? [];
  const { error, success } = await searchParams;

  const messages: Record<string, string> = {
    category: "Não foi possível cadastrar a categoria. Confira se ela já existe.",
    product: "Não foi possível cadastrar o produto. Confira o nome e o preço.",
    load: "Não foi possível consultar os dados do estabelecimento.",
  };

  const successMessage =
    success === "category"
      ? "Categoria cadastrada com sucesso."
      : success === "product"
        ? "Produto cadastrado com sucesso."
        : null;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-5 sm:px-8">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Produtos e categorias
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Cadastre e consulte os produtos do seu estabelecimento.
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
        {successMessage && (
          <div
            role="status"
            className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
          >
            {successMessage}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            {messages[error] ?? "Ocorreu um erro. Tente novamente."}
          </div>
        )}

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
            <h2 className="text-lg font-bold text-slate-900">
              Nova categoria
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Ex.: Bebidas, Salgados, Doces.
            </p>

            <form action={createCategory} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="category_name"
                  className="mb-2 block text-sm font-medium"
                >
                  Nome da categoria
                </label>
                <input
                  id="category_name"
                  name="category_name"
                  type="text"
                  minLength={2}
                  maxLength={80}
                  required
                  placeholder="Ex.: Bebidas"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white hover:bg-emerald-800"
              >
                Cadastrar categoria
              </button>
            </form>

            <div className="mt-6 border-t border-slate-100 pt-4">
              <h3 className="text-sm font-semibold text-slate-700">
                Categorias cadastradas ({categories.length})
              </h3>

              {categories.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">
                  Nenhuma categoria cadastrada ainda.
                </p>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  {categories.map((category) => (
                    <span
                      key={category.id}
                      className="rounded-full bg-slate-100 px-3 py-2 text-sm text-slate-700"
                    >
                      {category.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
            <h2 className="text-lg font-bold text-slate-900">
              Novo produto
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Informe o nome e o preço de venda.
            </p>

            <form action={createProduct} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="product_name"
                  className="mb-2 block text-sm font-medium"
                >
                  Nome do produto
                </label>
                <input
                  id="product_name"
                  name="product_name"
                  type="text"
                  minLength={2}
                  maxLength={120}
                  required
                  placeholder="Ex.: Refrigerante lata"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <div>
                <label
                  htmlFor="price"
                  className="mb-2 block text-sm font-medium"
                >
                  Preço de venda (R$)
                </label>
                <input
                  id="price"
                  name="price"
                  type="text"
                  inputMode="decimal"
                  required
                  placeholder="Ex.: 7,50"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Use vírgula ou ponto nos centavos, por exemplo 7,50.
                </p>
              </div>

              <div>
                <label
                  htmlFor="category_id"
                  className="mb-2 block text-sm font-medium"
                >
                  Categoria
                </label>
                <select
                  id="category_id"
                  name="category_id"
                  defaultValue=""
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                >
                  <option value="">Sem categoria</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="sku"
                  className="mb-2 block text-sm font-medium"
                >
                  Código interno (opcional)
                </label>
                <input
                  id="sku"
                  name="sku"
                  type="text"
                  maxLength={80}
                  placeholder="Ex.: BEB001"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white hover:bg-emerald-800"
              >
                Cadastrar produto
              </button>
            </form>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 p-5">
            <h2 className="text-lg font-bold text-slate-900">
              Produtos cadastrados ({products.length})
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Os dados abaixo são consultados no Supabase.
            </p>
          </div>

          {products.length === 0 ? (
            <div className="p-8 text-center">
              <p className="font-medium text-slate-700">
                Nenhum produto cadastrado.
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Use o formulário acima para adicionar seu primeiro produto.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">Produto</th>
                    <th className="px-5 py-3 font-medium">Código</th>
                    <th className="px-5 py-3 font-medium">Preço</th>
                    <th className="px-5 py-3 font-medium">Categoria</th>
                    <th className="px-5 py-3 font-medium">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {products.map((product) => {
                    const category = categories.find(
                      (item) => item.id === product.category_id
                    );

                    return (
                      <tr key={product.id}>
                        <td className="px-5 py-4 font-medium text-slate-800">
                          {product.name}
                        </td>
                        <td className="px-5 py-4 text-slate-500">
                          {product.sku || "—"}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 font-semibold">
                          {Number(product.price).toLocaleString("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          })}
                        </td>
                        <td className="px-5 py-4">
                          {category?.name ?? "Sem categoria"}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={
                              product.is_active
                                ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
                                : "rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
                            }
                          >
                            {product.is_active ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
