"use client";

export function identityMatrix(size: number) {
  return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, column) => (row === column ? 1 : 0)));
}

export function CovarianceMatrixEditor({ values, size, onChange }: { values: number[][]; size: number; onChange: (values: number[][]) => void }) {
  const matrix = values.length === size ? values : identityMatrix(size);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300/70">Covariance Matrix</p>
        <button type="button" onClick={() => onChange(identityMatrix(size))} className="border border-white/10 px-2 py-1 font-mono text-[10px] uppercase text-zinc-300 hover:border-cyan-300 hover:text-cyan-100">Identity</button>
      </div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
        {matrix.flatMap((row, rowIndex) => row.slice(0, size).map((value, columnIndex) => (
          <input
            key={`${rowIndex}-${columnIndex}`}
            value={String(value)}
            inputMode="decimal"
            onChange={(event) => {
              const next = matrix.map((item) => [...item]);
              next[rowIndex][columnIndex] = Number(event.target.value);
              onChange(next);
            }}
            className="min-w-0 border border-white/10 bg-black/45 px-1 py-1 font-mono text-[10px] text-zinc-100 outline-none focus:border-cyan-300"
          />
        )))}
      </div>
    </div>
  );
}
