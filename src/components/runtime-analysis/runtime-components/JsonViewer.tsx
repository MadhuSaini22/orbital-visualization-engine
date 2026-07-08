"use client";

export function JsonViewer({ value }: { value: unknown }) {
  return <pre className="thin-scrollbar max-h-80 overflow-auto whitespace-pre-wrap break-words bg-black/45 p-3 font-mono text-[11px] leading-5 text-zinc-300">{JSON.stringify(value, null, 2)}</pre>;
}
