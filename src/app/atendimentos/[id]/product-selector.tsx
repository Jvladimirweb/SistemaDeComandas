
"use client";

import { useState } from "react";
import { addProduct } from "./actions";

type Product = {
  id: string;
  name: string;
  price: number;
};

type Props = {
  products: Product[];
  orderId: string;
};

export default function ProductSelector({
  products,
  orderId,
}: Props) {
  const [search, setSearch] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);

  const filteredProducts = products.filter((product) =>
    product.name.toLowerCase().includes(search.toLowerCase())
  );

  const selectedProduct = products.find(
    (product) => product.id === productId
  );

  const money = (value: number) =>
    Number(value).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  return (
    <section className="space-y-4 rounded-xl border p-4">
      <h2 className="text-lg font-semibold">
        Adicionar produtos
      </h2>

      <div>
        <label className="mb-2 block text-sm font-medium">
          Pesquisar produto
        </label>

        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setProductId("");
          }}
          placeholder="Digite o nome do produto..."
          className="w-full rounded-lg border px-3 py-3 outline-none focus:border-blue-500"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">
          Selecione o produto
        </label>

        <select
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          className="w-full rounded-lg border bg-white px-3 py-3"
        >
          <option value="">Selecione um produto...</option>

          {filteredProducts.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name} — {money(product.price)}
            </option>
          ))}
        </select>

        {filteredProducts.length === 0 && (
          <p className="mt-2 text-sm text-gray-500">
            Nenhum produto encontrado.
          </p>
        )}
      </div>

      {selectedProduct && (
        <>
          <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
            <div>
              <p className="text-sm text-gray-500">
                Preço unitário
              </p>
              <p className="font-semibold">
                {money(selectedProduct.price)}
              </p>
            </div>

            <div className="text-right">
              <p className="text-sm text-gray-500">
                Total do item
              </p>
              <p className="text-lg font-bold">
                {money(Number(selectedProduct.price) * quantity)}
              </p>
            </div>
          </div>

          <form action={addProduct} className="space-y-4">
            <input
              type="hidden"
              name="order_id"
              value={orderId}
            />

            <input
              type="hidden"
              name="product_id"
              value={productId}
            />

            <input
              type="hidden"
              name="quantity"
              value={quantity}
            />

            <div>
              <label className="mb-2 block text-sm font-medium">
                Quantidade
              </label>

              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() =>
                    setQuantity((current) =>
                      Math.max(1, current - 1)
                    )
                  }
                  className="h-11 w-11 rounded-lg border text-xl font-bold"
                >
                  −
                </button>

                <span className="min-w-8 text-center text-xl font-bold">
                  {quantity}
                </span>

                <button
                  type="button"
                  onClick={() =>
                    setQuantity((current) => current + 1)
                  }
                  className="h-11 w-11 rounded-lg border text-xl font-bold"
                >
                  +
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700"
            >
              + Adicionar à comanda
            </button>
          </form>
        </>
      )}
    </section>
  );
}
