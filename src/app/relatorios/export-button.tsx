
"use client";

import * as XLSX from "xlsx";

type Props = {
  orders: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  summary: Record<string, number>;
  cashSessions: Record<string, unknown>[];
};

export default function ExportButton({ orders, payments, summary, cashSessions }: Props) {
  function exportExcel() {
    const workbook = XLSX.utils.book_new();

    const ordersSheet = XLSX.utils.json_to_sheet(orders);
    XLSX.utils.book_append_sheet(workbook, ordersSheet, "Comandas");

    const paymentsSheet = XLSX.utils.json_to_sheet(payments);
    XLSX.utils.book_append_sheet(workbook, paymentsSheet, "Recebimentos");

    const summarySheet = XLSX.utils.json_to_sheet(
      Object.entries(summary).map(([forma, valor]) => ({
        Forma: forma,
        Valor: valor,
      }))
    );
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Resumo");

    const cashSessionsSheet = XLSX.utils.json_to_sheet(cashSessions);
    XLSX.utils.book_append_sheet(workbook, cashSessionsSheet, "Fechamentos Caixa");

    XLSX.writeFile(workbook, "Relatorio_Vivati.xlsx");
  }

  return (
    <button
      type="button"
      onClick={exportExcel}
      className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
    >
      Exportar Excel
    </button>
  );
}
