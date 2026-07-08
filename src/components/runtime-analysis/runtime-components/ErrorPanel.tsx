"use client";

export function ErrorPanel({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="border border-rose-300/30 bg-rose-950/30 p-3 text-xs leading-5 text-rose-100">{message}</div>;
}
