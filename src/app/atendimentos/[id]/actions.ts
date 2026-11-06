
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function validateOrder(orderId: string) {
  const supabase = await createClient();

  const { data: auth, error: authError } =
    await supabase.auth.getClaims();

  const userId = auth?.claims?.sub;

  if (authError || typeof userId !== "string") {
    redirect("/login");
  }

  const { data: membership } = await supabase
    .from("establishment_members")
    .select("establishment_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    redirect("/configurar");
  }

  const { data: order } = await supabase
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .eq("establishment_id", membership.establishment_id)
    .eq("status", "open")
    .maybeSingle();

  if (!order) {
    redirect("/atendimentos");
  }

  return { supabase, establishmentId: membership.establishment_id };
}

export async function addProduct(formData: FormData) {
  const orderId = formData.get("order_id");
  const productId = formData.get("product_id");
  const quantity = Number(formData.get("quantity"));

  if (
    typeof orderId !== "string" ||
    typeof productId !== "string" ||
    !orderId ||
    !productId ||
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    redirect("/atendimentos");
  }

  const { supabase } = await validateOrder(orderId);

  const { data, error } = await supabase.rpc(
    "add_product_to_order",
    {
      p_order_id: orderId,
      p_product_id: productId,
      p_quantity: quantity,
    }
  );

  if (error || !data) {
    console.error("Erro ao adicionar produto:", error?.message);
    redirect(`/atendimentos/${orderId}?error=add_product`);
  }

  revalidatePath(`/atendimentos/${orderId}`);
  redirect(`/atendimentos/${orderId}`);
}



export async function sendItemsToKitchen(formData: FormData) {
  const orderId = formData.get("order_id");

  if (typeof orderId !== "string" || !orderId) {
    redirect("/atendimentos");
  }

  const { supabase } = await validateOrder(orderId);
  const { data: dispatchId, error } = await supabase.rpc(
    "send_order_items_to_kitchen",
    { p_order_id: orderId }
  );

  if (error || typeof dispatchId !== "string") {
    console.error("Erro ao enviar produtos à cozinha:", error?.message);
    const code = error?.message.includes("STOCK_INSUFFICIENT") ? "stock" : "kitchen";
    redirect(`/atendimentos/${orderId}?error=${code}`);
  }

  revalidatePath(`/atendimentos/${orderId}`);

  redirect(
    `/atendimentos/${orderId}/cozinha?dispatch=${dispatchId}`
  );
}

export async function updateItemQuantity(formData: FormData) {
  const orderId = formData.get("order_id");
  const itemId = formData.get("item_id");
  const quantity = Number(formData.get("quantity"));

  if (
    typeof orderId !== "string" ||
    typeof itemId !== "string" ||
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    redirect("/atendimentos");
  }

  const { supabase, establishmentId } =
    await validateOrder(orderId);

  const { error } = await supabase
    .from("order_items")
    .update({ quantity })
    .eq("id", itemId)
    .eq("order_id", orderId)
    .eq("establishment_id", establishmentId)
    .eq("status", "active");

  if (error) {
    console.error("Erro ao atualizar quantidade:", error.message);
    redirect(`/atendimentos/${orderId}?error=update_item`);
  }

  revalidatePath(`/atendimentos/${orderId}`);
  redirect(`/atendimentos/${orderId}`);
}

export async function cancelOrderItem(formData: FormData) {
  const orderId = formData.get("order_id");
  const itemId = formData.get("item_id");

  if (
    typeof orderId !== "string" ||
    typeof itemId !== "string"
  ) {
    redirect("/atendimentos");
  }

  const { supabase, establishmentId } =
    await validateOrder(orderId);

  const { error } = await supabase
    .from("order_items")
    .update({ status: "cancelled" })
    .eq("id", itemId)
    .eq("order_id", orderId)
    .eq("establishment_id", establishmentId)
    .eq("status", "active");

  if (error) {
    console.error("Erro ao cancelar item:", error.message);
    redirect(`/atendimentos/${orderId}?error=cancel_item`);
  }

  revalidatePath(`/atendimentos/${orderId}`);
  redirect(`/atendimentos/${orderId}`);
}

export async function finalizeOrder(formData: FormData) {
  const orderId = formData.get("order_id");
  const discount = Number(formData.get("discount") || 0);
  const paymentsValue = formData.get("payments");

  if (
    typeof orderId !== "string" ||
    typeof paymentsValue !== "string" ||
    !Number.isFinite(discount) ||
    discount < 0
  ) {
    redirect("/atendimentos");
  }

  let payments;

  try {
    payments = JSON.parse(paymentsValue);
  } catch {
    redirect(`/atendimentos/${orderId}?error=invalid_payment`);
  }

  if (!Array.isArray(payments) || payments.length === 0) {
    redirect(`/atendimentos/${orderId}?error=invalid_payment`);
  }

  const supabase = await createClient();

  const { data: auth, error: authError } =
    await supabase.auth.getClaims();

  const userId = auth?.claims?.sub;

  if (authError || typeof userId !== "string") {
    redirect("/login");
  }

  const { data, error } = await supabase.rpc(
    "finalize_order",
    {
      p_order_id: orderId,
      p_discount: discount,
      p_payments: payments,
    }
  );

  if (error || !data?.success) {
    console.error("Erro ao finalizar comanda:", error?.message);
    redirect(`/atendimentos/${orderId}?error=finalize`);
  }

  revalidatePath("/atendimentos");
  revalidatePath("/mesa");
  revalidatePath(`/atendimentos/${orderId}`);

  redirect("/atendimentos");
}

export async function cancelOrder(formData: FormData) {
  const orderId = formData.get("order_id");
  const reason = formData.get("reason");
  const details = formData.get("details");

  if (
    typeof orderId !== "string" ||
    typeof reason !== "string" ||
    typeof details !== "string"
  ) {
    redirect("/atendimentos");
  }

  const { supabase } = await validateOrder(orderId);

  const { error } = await supabase.rpc("cancel_order", {
    p_order_id: orderId,
    p_reason: reason,
    p_details: details || null,
  });

  if (error) {
    console.error("Erro ao cancelar comanda:", error.message);
    redirect(`/atendimentos/${orderId}?error=cancel_order`);
  }

  revalidatePath("/atendimentos");
  revalidatePath("/mesa");
  revalidatePath(`/atendimentos/${orderId}`);

  redirect("/atendimentos");
}


export async function updateKitchenStatus(formData: FormData) {
  const orderId = formData.get("order_id");
  const itemId = formData.get("item_id");
  const kitchenStatus = formData.get("kitchen_status");

  const allowedStatuses = ["preparing", "ready", "delivered"];

  if (
    typeof orderId !== "string" ||
    typeof itemId !== "string" ||
    typeof kitchenStatus !== "string" ||
    !allowedStatuses.includes(kitchenStatus)
  ) {
    redirect("/cozinha");
  }

  const { supabase, establishmentId } = await validateOrder(orderId);

  const { error } = await supabase
    .from("order_items")
    .update({ kitchen_status: kitchenStatus })
    .eq("id", itemId)
    .eq("order_id", orderId)
    .eq("establishment_id", establishmentId)
    .eq("status", "active")
    .neq("kitchen_status", "not_sent");

  if (error) {
    console.error("Erro ao atualizar preparo:", error.message);
    redirect("/cozinha?error=update");
  }

  revalidatePath("/cozinha");
  revalidatePath(`/atendimentos/${orderId}`);

  redirect("/cozinha");
}
