"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function changePlan(formData: FormData) {
  const planCode = formData.get("plan_code");
  if (planCode !== "basic" && planCode !== "plus") redirect("/configuracoes/plano?error=plan");
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (authError || typeof userId !== "string") redirect("/login");
  const { data: membership } = await supabase.from("establishment_members")
    .select("establishment_id").eq("user_id", userId).limit(1).maybeSingle();
  if (!membership) redirect("/configurar");
  const { data: establishment } = await supabase.from("establishments")
    .select("created_by").eq("id", membership.establishment_id).maybeSingle();
  if (establishment?.created_by !== userId) redirect("/configuracoes/plano?error=owner");
  const { error } = await supabase.from("establishments")
    .update({ plan_code: planCode }).eq("id", membership.establishment_id);
  if (error) {
    console.error("Erro ao alterar plano:", error.message);
    redirect("/configuracoes/plano?error=save");
  }
  revalidatePath("/");
  revalidatePath("/estoque");
  revalidatePath("/produtos");
  redirect(`/configuracoes/plano?success=${planCode}`);
}
