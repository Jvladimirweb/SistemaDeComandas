"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800"
    >
      Imprimir conta do cliente
    </button>
  );
}
