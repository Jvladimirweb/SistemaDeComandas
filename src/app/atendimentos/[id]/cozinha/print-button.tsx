
"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-lg bg-orange-600 px-5 py-3 font-semibold text-white hover:bg-orange-700"
    >
      Imprimir via da cozinha
    </button>
  );
}
