"use client";

export function AnalysisTable({ headers, rows, onRowClick }: { headers: string[]; rows: string[][]; onRowClick?: (index: number) => void }) {
  if (rows.length === 0) {
    return <div className="border border-white/10 bg-black/20 p-3 text-xs text-zinc-500">No rows returned.</div>;
  }
  return (
    <div className="thin-scrollbar max-h-72 overflow-auto border border-white/10">
      <table className="w-full min-w-[420px] text-left text-xs">
        <thead className="sticky top-0 bg-[#071016] font-mono text-[10px] uppercase tracking-[0.12em] text-cyan-300">
          <tr>{headers.map((header) => <th key={header} className="border-b border-white/10 px-2 py-2">{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`${rowIndex}-${row.join("-")}`} onClick={() => onRowClick?.(rowIndex)} className={onRowClick ? "cursor-pointer hover:bg-cyan-300/10" : ""}>
              {row.map((cell, index) => <td key={`${index}-${cell}`} className="border-b border-white/5 px-2 py-2 text-zinc-300">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
