
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createOrder(formData: FormData) {
  const orderType = formData.get("order_type");
  const tableValue = formData.get("table_id");
  const sourceValue = formData.get("order_source");

  const customerName = formData.get("customer_name");
  const customerPhone = formData.get("customer_phone");
  const customerAddress = formData.get("customer_address");
  const notes = formData.get("notes");

  const validTypes = ["table", "counter", "pickup", "delivery"];
  const validSources = ["in_person", "whatsapp", "phone", "other"];

  if (
    typeof orderType !== "string" ||
    !validTypes.includes(orderType)
  ) {
    redirect("/atendimentos?error=type");
  }

  const source =
    typeof sourceValue === "string" &&
    validSources.includes(sourceValue)
      ? sourceValue
      : "in_person";

  const tableId =
    typeof tableValue === "string" && tableValue
      ? tableValue
      : null;

  if (orderType === "table" && !tableId) {
    redirect("/atendimentos?error=no_table");
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
    redirect("/atendimentos?error=load");
  }

  if (!membership) {
    redirect("/configurar");
  }

  const { data, error } = await supabase.rpc("open_order", {
    p_establishment_id: membership.establishment_id,
    p_order_type: orderType,
    p_table_id: orderType === "table" ? tableId : null,
    p_customer_name:
      typeof customerName === "string" ? customerName.trim() : "",
    p_customer_phone:
      typeof customerPhone === "string" ? customerPhone.trim() : "",
    p_customer_address:
      typeof customerAddress === "string"
        ? customerAddress.trim()
        : "",
    p_notes: typeof notes === "string" ? notes.trim() : "",
    p_scheduled_for: null,
    p_order_source: source,
  });

  if (error) {
    console.error("Erro ao abrir pedido:", error.message);

    if (error.message.includes("Mesa indisponivel")) {
      redirect("/atendimentos?error=table_busy");
    }

    if (error.message.includes("Selecione uma mesa")) {
      redirect("/atendimentos?error=no_table");
    }

    if (error.message.includes("nome do cliente")) {
      redirect("/atendimentos?error=customer_name");
    }

    if (error.message.includes("endereco de entrega")) {
      redirect("/atendimentos?error=address");
    }

    redirect("/atendimentos?error=save");
  }

  if (!data) {
    redirect("/atendimentos?error=save");
  }

  redirect("/atendimentos?success=created");
}
