
"use client";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type Props = {
  orders: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  summary: Record<string, number>;
  cashSessions: Record<string, unknown>[];
  inicio?: string;
  fim?: string;
};

export default function PdfButton({
  orders,
  payments,
  summary,
  cashSessions,
  inicio,
  fim,
}: Props) {
  function exportPDF() {
    const pdf = new jsPDF({ orientation: "landscape" });

    pdf.setFontSize(18);
    pdf.text("Relatorio - Vivati Comandas", 14, 18);

    pdf.setFontSize(10);
    pdf.text(
      `Periodo: ${inicio || "Inicio"} ate ${fim || "Hoje"}`,
      14,
      26
    );

    pdf.setFontSize(13);
    pdf.text("Resumo financeiro", 14, 38);

    autoTable(pdf, {
      startY: 43,
      head: [["Forma de pagamento", "Valor"]],
      body: Object.entries(summary).map(([forma, valor]) => [
        forma,
        Number(valor).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        }),
      ]),
    });

    let nextY = (pdf as any).lastAutoTable.finalY + 12;

    pdf.setFontSize(13);
    pdf.text("Comandas", 14, nextY);

    autoTable(pdf, {
      startY: nextY + 5,
      head: [["Comanda", "Cliente", "Tipo", "Situacao", "Valor", "Data"]],
      body: orders.map((order) => [
        String(order.Comanda ?? ""),
        String(order.Cliente ?? ""),
        String(order.Tipo ?? ""),
        String(order.Situacao ?? ""),
        Number(order.Valor ?? 0).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        }),
        String(order.Data ?? ""),
      ]),
    });

    nextY = (pdf as any).lastAutoTable.finalY + 12;

    pdf.addPage();
    pdf.setFontSize(13);
    pdf.text("Detalhamento dos recebimentos", 14, 18);

    autoTable(pdf, {
      startY: 24,
      head: [["Comanda", "Cliente", "Pagamento", "Valor", "Data"]],
      body: payments.map((payment) => [
        String(payment.Comanda ?? ""),
        String(payment.Cliente ?? ""),
        String(payment.FormaPagamento ?? ""),
        Number(payment.Valor ?? 0).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        }),
        String(payment.Data ?? ""),
      ]),
    });

    pdf.addPage();
    pdf.setFontSize(13);
    pdf.text("Fechamentos de caixa", 14, 18);

    autoTable(pdf, {
      startY: 24,
      head: [[
        "Responsável",
        "Abertura",
        "Fechamento",
        "Fundo inicial",
        "Entradas",
        "Retiradas",
        "Vendas em dinheiro",
        "Esperado",
        "Contado",
        "Diferença",
      ]],
      body: cashSessions.map((session) => [
        String(session.Responsavel ?? ""),
        String(session.Abertura ?? ""),
        String(session.Fechamento ?? ""),
        formatCurrency(session.FundoInicial),
        formatCurrency(session.Entradas),
        formatCurrency(session.Retiradas),
        formatCurrency(session.VendasEmDinheiro),
        formatCurrency(session.DinheiroEsperado),
        formatCurrency(session.DinheiroContado),
        formatCurrency(session.Diferenca),
      ]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fontSize: 7 },
    });

    pdf.save("Relatorio_Vivati.pdf");
  }

  return (
    <button
      type="button"
      onClick={exportPDF}
      className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
    >
      Exportar PDF
    </button>
  );
}

function formatCurrency(value: unknown) {
  return Number(value ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
