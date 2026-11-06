"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function getUserAndEstablishment() {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;

  if (authError || typeof userId !== "string") redirect("/login");

  const { data: membership, error } = await supabase
    .from("establishment_members")
    .select("establishment_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) redirect("/caixa?error=load");
  if (!membership) redirect("/configurar");

  return { supabase, userId, establishmentId: membership.establishment_id };
}

function readAmount(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export async function openCashSession(formData: FormData) {
  const openingBalance = readAmount(formData.get("opening_balance"));
  if (openingBalance === null) redirect("/caixa?error=amount");

  const { supabase, userId, establishmentId } =
    await getUserAndEstablishment();

  const { error } = await supabase.from("cash_sessions").insert({
    establishment_id: establishmentId,
    opened_by: userId,
    opening_balance: openingBalance,
  });

  if (error) {
    console.error("Erro ao abrir caixa:", error.message);
    redirect(
      error.code === "23505" ? "/caixa?error=already_open" : "/caixa?error=save"
    );
  }

  revalidatePath("/caixa");
  redirect("/caixa?success=opened");
}

export async function addCashMovement(formData: FormData) {
  const movementType = formData.get("movement_type");
  const amount = readAmount(formData.get("amount"));
  const descriptionValue = formData.get("description");
  const description =
    typeof descriptionValue === "string" ? descriptionValue.trim() : "";

  if (
    (movementType !== "entry" && movementType !== "withdrawal") ||
    amount === null ||
    amount <= 0 ||
    description.length < 2 ||
    description.length > 200
  ) {
    redirect("/caixa?error=movement");
  }

  const { supabase, userId, establishmentId } =
    await getUserAndEstablishment();
  const { data: session, error: sessionError } = await supabase
    .from("cash_sessions")
    .select("id")
    .eq("establishment_id", establishmentId)
    .eq("opened_by", userId)
    .eq("status", "open")
    .maybeSingle();

  if (sessionError || !session) redirect("/caixa?error=no_session");

  const { error } = await supabase.from("cash_movements").insert({
    establishment_id: establishmentId,
    cash_session_id: session.id,
    movement_type: movementType,
    amount,
    description,
    created_by: userId,
  });

  if (error) {
    console.error("Erro ao registrar movimentação do caixa:", error.message);
    redirect("/caixa?error=save");
  }

  revalidatePath("/caixa");
  redirect("/caixa?success=movement");
}

export async function closeCashSession(formData: FormData) {
  const sessionId = formData.get("session_id");
  const closingBalance = readAmount(formData.get("closing_balance"));

  if (typeof sessionId !== "string" || closingBalance === null) {
    redirect("/caixa?error=amount");
  }

  const { supabase, userId, establishmentId } =
    await getUserAndEstablishment();
  const { data, error } = await supabase
    .from("cash_sessions")
    .update({
      status: "closed",
      closing_balance: closingBalance,
      closed_by: userId,
      closed_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .eq("establishment_id", establishmentId)
    .eq("opened_by", userId)
    .eq("status", "open")
    .select("id")
    .maybeSingle();

  if (error || !data) {
    console.error("Erro ao fechar caixa:", error?.message);
    redirect("/caixa?error=close");
  }

  revalidatePath("/caixa");
  redirect("/caixa?success=closed");
}
