"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function savePrinterPaper(formData: FormData) {
  const paperSize = formData.get("printer_paper_size");
  const customerCopies = Number(formData.get("customer_receipt_copies"));
  const kitchenCopies = Number(formData.get("kitchen_ticket_copies"));

  if (
    paperSize !== "58mm" &&
    paperSize !== "80mm" &&
    paperSize !== "A4"
  ) {
    redirect("/configuracoes/impressao?error=paper");
  }

  if (
    !Number.isInteger(customerCopies) ||
    customerCopies < 1 ||
    customerCopies > 5 ||
    !Number.isInteger(kitchenCopies) ||
    kitchenCopies < 1 ||
    kitchenCopies > 5
  ) {
    redirect("/configuracoes/impressao?error=copies");
  }

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

  const { error } = await supabase
    .from("establishments")
    .update({
      printer_paper_size: paperSize,
      customer_receipt_copies: customerCopies,
      kitchen_ticket_copies: kitchenCopies,
    })
    .eq("id", membership.establishment_id);

  if (error) {
    console.error("Erro ao salvar o papel da impressora:", error.message);
    redirect("/configuracoes/impressao?error=save");
  }

  redirect("/configuracoes/impressao?success=saved");
}
