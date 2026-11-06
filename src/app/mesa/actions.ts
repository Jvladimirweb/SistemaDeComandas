
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createTable(formData: FormData) {
  const rawName = formData.get("name");
  const rawSeats = formData.get("seats");

  if (
    typeof rawName !== "string" ||
    typeof rawSeats !== "string"
  ) {
    redirect("/mesas?error=invalid");
  }

  const name = rawName.trim();
  const seats = Number(rawSeats);

  if (
    name.length < 1 ||
    name.length > 60 ||
    !Number.isInteger(seats) ||
    seats < 1 ||
    seats > 100
  ) {
    redirect("/mesas?error=invalid");
  }

  const supabase = await createClient();

  const { data: auth, error: authError } =
    await supabase.auth.getClaims();

  const userId = auth?.claims?.sub;

  if (authError || typeof userId !== "string") {
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
    redirect("/mesas?error=load");
  }

  if (!membership) {
    redirect("/configurar");
  }

  const { error } = await supabase
    .from("dining_tables")
    .insert({
      establishment_id: membership.establishment_id,
      name,
      seats,
    });

  if (error) {
    console.error("Erro ao cadastrar mesa:", error.message);

    if (error.code === "23505") {
      redirect("/mesas?error=duplicate");
    }

    redirect("/mesas?error=save");
  }

  redirect("/mesas?success=created");
}
