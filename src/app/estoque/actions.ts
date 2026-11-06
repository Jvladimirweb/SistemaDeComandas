"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function quantity(value: FormDataEntryValue | null, allowZero = false) {
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < (allowZero ? 0 : Number.EPSILON) || parsed > 999999999) return null;
  return parsed;
}

async function getClient() {
  const supabase = await createClient();
  const { data: auth, error } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (error || typeof userId !== "string") redirect("/login");
  const { data: membership } = await supabase
    .from("establishment_members")
    .select("establishment_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/configurar");
  const { data: establishment } = await supabase
    .from("establishments")
    .select("plan_code")
    .eq("id", membership.establishment_id)
    .maybeSingle();
  if (establishment?.plan_code !== "plus") redirect("/configuracoes/plano?recurso=estoque");
  return supabase;
}

export async function configureInventory(formData: FormData) {
  const productId = formData.get("product_id");
  const tracked = formData.get("stock_tracked") === "true";
  const initial = quantity(formData.get("initial_quantity"), true);
  const minimum = quantity(formData.get("minimum_stock"), true);
  if (typeof productId !== "string" || !productId || initial === null || minimum === null) {
    redirect("/estoque?error=quantity");
  }
  const supabase = await getClient();
  const { error } = await supabase.rpc("configure_product_inventory", {
    p_product_id: productId,
    p_track: tracked,
    p_initial_quantity: initial,
    p_minimum_quantity: minimum,
  });
  if (error) {
    console.error("Erro ao configurar estoque:", error.message);
    redirect("/estoque?error=save");
  }
  revalidatePath("/estoque");
  revalidatePath("/produtos");
  redirect("/estoque?success=configured");
}

export async function recordInventoryMovement(formData: FormData) {
  const productId = formData.get("product_id");
  const movementType = formData.get("movement_type");
  const amount = quantity(formData.get("quantity"));
  const description = formData.get("description");
  if (
    typeof productId !== "string" || !productId ||
    (movementType !== "entry" && movementType !== "withdrawal") ||
    amount === null || typeof description !== "string" ||
    description.trim().length < 2 || description.trim().length > 200
  ) redirect("/estoque?error=movement");

  const supabase = await getClient();
  const { error } = await supabase.rpc("record_inventory_movement", {
    p_product_id: productId,
    p_movement_type: movementType,
    p_quantity: amount,
    p_description: description.trim(),
  });
  if (error) {
    console.error("Erro ao registrar movimentação:", error.message);
    redirect(`/estoque?error=${error.message.includes("insuficiente") ? "insufficient" : "save"}`);
  }
  revalidatePath("/estoque");
  redirect("/estoque?success=movement");
}
