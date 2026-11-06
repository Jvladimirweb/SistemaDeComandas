import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { savePrinterPaper } from "./actions";

type Props = {
  searchParams: Promise<{ error?: string; success?: string }>;
};

export default async function PrintSettingsPage({ searchParams }: Props) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;

  if (typeof userId !== "string") redirect("/login");

  const { data: membership } = await supabase
    .from("establishment_members")
    .select("establishment_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/configurar");

  const { data: establishment, error } = await supabase
    .from("establishments")
    .select(
      "printer_paper_size, customer_receipt_copies, kitchen_ticket_copies"
    )
    .eq("id", membership.establishment_id)
    .maybeSingle();

  if (error || !establishment) {
    throw new Error("Não foi possível carregar as configurações.");
  }

  const { error: errorCode, success } = await searchParams;

  return (
    <main className="mx-auto max-w-xl space-y-5 p-5">
      <Link href="/atendimentos" className="text-sm text-blue-700 underline">
        Voltar aos atendimentos
      </Link>

      <section className="rounded-2xl border bg-white p-6">
        <h1 className="text-2xl font-bold">Configuração de impressão</h1>
        <p className="mt-2 text-sm text-gray-600">
          Escolha o tamanho do papel e quantas vias imprimir para cada tipo.
        </p>

        {success === "saved" && (
          <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-green-800">
            Configuração salva.
          </p>
        )}

        {errorCode && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-red-800">
            {errorCode === "copies"
              ? "Escolha entre 1 e 5 vias para cada comprovante."
              : "Não foi possível salvar. Tente novamente."}
          </p>
        )}

        <form action={savePrinterPaper} className="mt-5 space-y-4">
          <label htmlFor="printer_paper_size" className="block font-medium">
            Tamanho do papel
          </label>
          <select
            id="printer_paper_size"
            name="printer_paper_size"
            defaultValue={establishment.printer_paper_size ?? "80mm"}
            className="w-full rounded-lg border px-4 py-3"
          >
            <option value="58mm">58 mm</option>
            <option value="80mm">80 mm</option>
            <option value="A4">A4</option>
          </select>

          <label htmlFor="customer_receipt_copies" className="block font-medium">
            Vias da conta do cliente
          </label>
          <select
            id="customer_receipt_copies"
            name="customer_receipt_copies"
            defaultValue={establishment.customer_receipt_copies ?? 1}
            className="w-full rounded-lg border px-4 py-3"
          >
            {[1, 2, 3, 4, 5].map((count) => (
              <option key={count} value={count}>{count} {count === 1 ? "via" : "vias"}</option>
            ))}
          </select>

          <label htmlFor="kitchen_ticket_copies" className="block font-medium">
            Vias da cozinha
          </label>
          <select
            id="kitchen_ticket_copies"
            name="kitchen_ticket_copies"
            defaultValue={establishment.kitchen_ticket_copies ?? 1}
            className="w-full rounded-lg border px-4 py-3"
          >
            {[1, 2, 3, 4, 5].map((count) => (
              <option key={count} value={count}>{count} {count === 1 ? "via" : "vias"}</option>
            ))}
          </select>

          <button className="rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white">
            Salvar configuração
          </button>
        </form>
      </section>
    </main>
  );
}
