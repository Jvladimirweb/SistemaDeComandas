
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function getEstablishmentContext() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (error || typeof userId !== "string") {
    redirect("/login");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("establishment_members")
    .select("establishment_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    redirect("/produtos?error=load");
  }

  if (!membership) {
    redirect("/configurar");
  }

  return {
    supabase,
    establishmentId: membership.establishment_id,
  };
}

export async function createCategory(formData: FormData) {
  const rawName = formData.get("category_name");

  if (typeof rawName !== "string") {
    redirect("/produtos?error=category");
  }

  const name = rawName.trim();

  if (name.length < 2 || name.length > 80) {
    redirect("/produtos?error=category");
  }

  const { supabase, establishmentId } =
    await getEstablishmentContext();

  const { error } = await supabase.from("categories").insert({
    establishment_id: establishmentId,
    name,
  });

  if (error) {
    console.error("Erro ao cadastrar categoria:", error.message);
    redirect("/produtos?error=category");
  }

  redirect("/produtos?success=category");
}

export async function createProduct(formData: FormData) {
  const rawName = formData.get("product_name");
  const rawPrice = formData.get("price");
  const rawSku = formData.get("sku");
  const rawCategoryId = formData.get("category_id");

  if (
    typeof rawName !== "string" ||
    typeof rawPrice !== "string"
  ) {
    redirect("/produtos?error=product");
  }

  const name = rawName.trim();
  const priceText = rawPrice.trim().replace(/\s/g, "");
  const normalizedPrice = priceText.includes(",")
    ? priceText.replace(/\./g, "").replace(",", ".")
    : priceText;
  const price = Number(normalizedPrice);

  if (
    name.length < 2 ||
    name.length > 120 ||
    !/^\d+(\.\d{1,2})?$/.test(normalizedPrice) ||
    !Number.isFinite(price) ||
    price < 0
  ) {
    redirect("/produtos?error=product");
  }

  const sku =
    typeof rawSku === "string" && rawSku.trim()
      ? rawSku.trim()
      : null;

  const categoryId =
    typeof rawCategoryId === "string" && rawCategoryId
      ? rawCategoryId
      : null;

  const { supabase, establishmentId } =
    await getEstablishmentContext();

  const { error } = await supabase.from("products").insert({
    establishment_id: establishmentId,
    name,
    price,
    sku,
    category_id: categoryId,
  });

  if (error) {
    console.error("Erro ao cadastrar produto:", error.message);
    redirect("/produtos?error=product");
  }

  redirect("/produtos?success=product");
}
