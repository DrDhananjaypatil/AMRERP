import * as XLSX from 'xlsx';

// rows: array of plain objects; columns: [{ key, label }]
export function downloadExcel(filename, columns, rows) {
  const data = rows.map((r) => Object.fromEntries(columns.map((c) => [c.label, r[c.key] ?? ''])));
  const ws = XLSX.utils.json_to_sheet(data, { header: columns.map((c) => c.label) });
  ws['!cols'] = columns.map((c) => ({ wch: Math.max(12, c.label.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

// Returns the first sheet as an array of objects keyed by header text.
export async function readSheet(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
}
