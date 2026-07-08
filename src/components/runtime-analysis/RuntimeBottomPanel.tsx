"use client";

import type { ReactNode } from "react";
import { JsonViewer } from "@/components/runtime-analysis/runtime-components/JsonViewer";
import type { RuntimeLogEntry, RuntimeWorkspaceResult } from "@/components/runtime-analysis/RuntimeAnalysisWorkspace";

export function RuntimeBottomPanel({ result, logs }: { result: RuntimeWorkspaceResult; logs: RuntimeLogEntry[] }) {
  return (
    <section className="grid min-h-0 grid-cols-[1fr_1fr_1.1fr] border-t border-cyan-300/15 bg-black/45 max-lg:grid-cols-1">
      <BottomPane title="Timeline"><Timeline result={result} /></BottomPane>
      <BottomPane title="Logs">
        {logs.length === 0 ? <p className="text-xs text-zinc-500">No runtime requests yet.</p> : logs.map((log) => <p key={`${log.time}-${log.message}`} className="font-mono text-[11px] text-zinc-300">{log.time.slice(11, 19)} {log.message}</p>)}
      </BottomPane>
      <BottomPane title="JSON Inspector"><JsonViewer value={result ?? { status: "empty" }} /></BottomPane>
    </section>
  );
}

function BottomPane({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="thin-scrollbar min-h-0 overflow-auto border-r border-cyan-300/15 p-3 last:border-r-0 max-lg:border-r-0 max-lg:border-b">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">{title}</p>
      {children}
    </div>
  );
}

function Timeline({ result }: { result: RuntimeWorkspaceResult }) {
  if (!result) return <p className="text-xs text-zinc-500">No timeline events yet.</p>;
  const items: Array<[string, string]> = [];
  if ("startTime" in result) items.push(["Start", result.startTime], ["Stop", result.stopTime]);
  if ("windows" in result) result.windows.forEach((window, index) => items.push([`Pass ${index + 1}`, `${window.acquisitionOfSignalTime} -> ${window.lossOfSignalTime}`]));
  if ("intervals" in result) result.intervals.forEach((interval) => items.push([interval.type, `${interval.startTime} -> ${interval.stopTime}`]));
  if ("closestApproach" in result) items.push(["TCA", result.closestApproach.timeOfClosestApproach]);
  if (items.length === 0) return <p className="text-xs text-zinc-500">Result has no timeline intervals.</p>;
  return <div className="space-y-1">{items.slice(0, 12).map(([label, value]) => <p key={`${label}-${value}`} className="text-xs text-zinc-300"><span className="font-mono text-cyan-300">{label}</span> {value}</p>)}</div>;
}
