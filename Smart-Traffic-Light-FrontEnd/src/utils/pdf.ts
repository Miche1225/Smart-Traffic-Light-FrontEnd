import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fmtDateTime } from './format';

export interface PdfSection {
  heading: string;
  lines?: string[];
  image?: string; // PNG data URL
  table?: { head: string[]; body: (string | number)[][] };
}

/** Printable report with the LGU header, generated time and preparer. */
export function exportPdf(file: string, title: string, preparedBy: string, sections: PdfSection[]) {
  const doc = new jsPDF();
  doc.setFillColor(15, 23, 42);
  doc.circle(20, 18, 8, 'F');
  doc.setTextColor(255);
  doc.setFontSize(8);
  doc.text('LGU', 20, 19.5, { align: 'center' });
  doc.setTextColor(0);
  doc.setFontSize(14);
  doc.text('SMART Traffic Light System', 32, 15);
  doc.setFontSize(11);
  doc.text(title, 32, 21);
  doc.setFontSize(8);
  doc.text(`Generated ${fmtDateTime(new Date())} (Asia/Manila) - Prepared by ${preparedBy}`, 32, 26);
  doc.line(14, 31, 196, 31);

  let y = 40;
  for (const s of sections) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.text(s.heading, 14, y);
    y += 6;
    doc.setFontSize(9);
    for (const line of s.lines ?? []) { doc.text(line, 14, y); y += 5; }
    if (s.image) { doc.addImage(s.image, 'PNG', 14, y, 120, 67.5); y += 72; }
    if (s.table) {
      autoTable(doc, { startY: y, head: [s.table.head], body: s.table.body, styles: { fontSize: 8 }, headStyles: { fillColor: [30, 41, 59] } });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    }
    y += 3;
  }
  doc.save(file);
}
