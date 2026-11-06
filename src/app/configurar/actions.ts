
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createEstablishment(formData: FormData) {
  const rawName = formData.get("name");

  if (typeof rawName !== "string") {
    redirect("/configurar?error=name");
  }

  const name = rawName.trim();

  if (name.length < 2 || name.length > 100) {
    redirect("/configurar?error=name");
  }

  const supabase = await createClient();

  const { data, error: authError } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (authError || typeof userId !== "string") {
    redirect("/login");
  }

  // Impede cadastrar o mesmo usuario como proprietario
  // de um novo estabelecimento por esta tela.
  const { data: memberships, error: membershipError } =
    await supabase
      .from("establishment_members")
      .select("establishment_id")
      .eq("user_id", userId)
      .limit(1);

  if (membershipError) {
    redirect("/configurar?error=check");
  }

  if (memberships && memberships.length > 0) {
    redirect("/");
  }

  const { error } = await supabase
    .from("establishments")
    .insert({
      name,
      created_by: userId,
    });

  if (error) {
    console.error("Erro ao cadastrar estabelecimento:", error.message);
    redirect("/configurar?error=save");
  }

  redirect("/");
}