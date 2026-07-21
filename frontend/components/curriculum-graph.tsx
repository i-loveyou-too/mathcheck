"use client";

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

/**
 * Shared curriculum roadmap rendering — used by both the student "진도표" page and the admin
 * curriculum editor's live preview, so the two can never visually drift apart. The admin
 * preview re-fetches the same GET .../nodes response shape and renders it with these exact
 * components; there is no separate graph editor.
 */

export type CurriculumStatus = "planned" | "in_progress" | "completed" | "paused" | "skipped";
export type CurriculumNodeType = "textbook" | "lecture" | "exam" | "review" | "custom";
export type StatusFilter = "all" | "in_progress" | "completed";

export type CurriculumNodeData = {
  id: number;
  title: string;
  node_type: CurriculumNodeType;
  group_name: string;
  group_order: number;
  description: string | null;
  position_x: number;
  position_y: number;
  order_index: number;
  status: CurriculumStatus;
  started_at: string | null;
  completed_at: string | null;
  memo: string | null;
  link_url: string | null;
  is_unlocked: boolean;
  lecture_unavailable: boolean;
};

export type CurriculumGroup = {
  name: string;
  order: number;
  group_number: number;
  nodes: CurriculumNodeData[];
};

export type CurriculumEdgeData = { from_node_id: number; to_node_id: number; edge_type: string };

export type CurriculumNodesResponse = { groups: CurriculumGroup[]; edges: CurriculumEdgeData[] };

export const STATUS_STYLES: Record<
  CurriculumStatus,
  { bg: string; text: string; border: string; label: string; dot: string }
> = {
  completed: { bg: "bg-emerald-50", text: "text-emerald-600", border: "border-emerald-200", label: "완료", dot: "bg-emerald-500" },
  in_progress: { bg: "bg-[#F1EDFF]", text: "text-[#635BFF]", border: "border-[#C7BFFF]", label: "진행 중", dot: "bg-[#635BFF]" },
  planned: { bg: "bg-[#F1F5F9]", text: "text-[#64748B]", border: "border-[#E2E8F0]", label: "예정", dot: "bg-[#94A3B8]" },
  paused: { bg: "bg-amber-50", text: "text-amber-600", border: "border-amber-200", label: "일시정지", dot: "bg-amber-500" },
  skipped: { bg: "bg-gray-50", text: "text-gray-400", border: "border-gray-200", label: "건너뜀", dot: "bg-gray-300" },
};

export const NODE_TYPE_ICON: Record<CurriculumNodeType, string> = {
  textbook: "📘", lecture: "▶️", exam: "📝", review: "🔁", custom: "⭐",
};

export const NODE_TYPE_LABEL: Record<CurriculumNodeType, string> = {
  textbook: "교재", lecture: "인강", exam: "시험", review: "복습", custom: "사용자 정의",
};

export function formatCurriculumDate(isoStr: string) {
  const d = new Date(isoStr);
  return `${d.getFullYear()}.${`${d.getMonth() + 1}`.padStart(2, "0")}.${`${d.getDate()}`.padStart(2, "0")}`;
}

/** Topological layering (longest-path rank) using only edges whose endpoints are both inside
 * this group — cross-group edges aren't used for layout, only within-group parallel paths are.
 * This is what lets multiple predecessors converge into one node and one node fan out into
 * several, instead of a flat order_index list. */
export function computeGroupLayout(nodes: CurriculumNodeData[], edges: CurriculumEdgeData[]) {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const localEdges = edges.filter((e) => nodeIds.has(e.from_node_id) && nodeIds.has(e.to_node_id));
  const incoming = new Map<number, number[]>();
  nodes.forEach((n) => incoming.set(n.id, []));
  localEdges.forEach((e) => incoming.get(e.to_node_id)?.push(e.from_node_id));

  const rank = new Map<number, number>();
  nodes.forEach((n) => rank.set(n.id, 0));
  for (let iteration = 0; iteration <= nodes.length; iteration += 1) {
    let changed = false;
    for (const node of nodes) {
      const preds = incoming.get(node.id) ?? [];
      if (preds.length === 0) continue;
      const maxPredRank = Math.max(...preds.map((p) => rank.get(p) ?? 0));
      if ((rank.get(node.id) ?? 0) < maxPredRank + 1) {
        rank.set(node.id, maxPredRank + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const columns = new Map<number, CurriculumNodeData[]>();
  nodes.forEach((node) => {
    const r = rank.get(node.id) ?? 0;
    const list = columns.get(r) ?? [];
    list.push(node);
    columns.set(r, list);
  });
  columns.forEach((list) => list.sort((a, b) => a.order_index - b.order_index));

  const columnKeys = Array.from(columns.keys()).sort((a, b) => a - b);
  return { columns, columnKeys, localEdges };
}

export function isGroupAllSettled(nodes: CurriculumNodeData[]) {
  return nodes.every((n) => n.status === "completed" || n.status === "skipped");
}

export function groupHasActiveNode(nodes: CurriculumNodeData[]) {
  return nodes.some((n) => n.status === "in_progress" || n.status === "paused");
}

export function NodeCard({
  node,
  dimmed,
  compact,
  onClick,
  registerRef,
}: {
  node: CurriculumNodeData;
  dimmed: boolean;
  compact?: boolean;
  onClick: () => void;
  registerRef?: (el: HTMLButtonElement | null) => void;
}) {
  const style = STATUS_STYLES[node.status];
  const isCurrent = node.status === "in_progress";
  const locked = !node.is_unlocked && node.status === "planned";

  return (
    <button
      className={cn(
        "flex w-full items-start gap-2 rounded-2xl border px-3 py-2.5 text-left transition",
        style.bg,
        style.border,
        isCurrent ? "shadow-[0_8px_20px_rgba(99,91,255,0.18)] ring-2 ring-[#8B7CFF]/40" : "",
        dimmed ? "opacity-35" : "",
        locked ? "opacity-60" : "",
        compact ? "py-2" : "",
      )}
      onClick={onClick}
      ref={registerRef}
      type="button"
    >
      <span className="shrink-0 text-base">{NODE_TYPE_ICON[node.node_type]}</span>
      <span className="min-w-0 flex-1">
        {/* line-clamp (not truncate) so a long title wraps onto a second line instead of
            silently disappearing behind a one-line ellipsis. */}
        <span className={cn("line-clamp-2 text-sm font-black leading-snug", style.text)}>{node.title}</span>
        {!compact ? (
          <span className={cn("mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-black", style.bg, style.text)}>
            {node.node_type === "lecture" && node.lecture_unavailable ? "연결된 인강 없음" : style.label}
          </span>
        ) : null}
      </span>
      {isCurrent ? <span className="shrink-0 text-sm">▶️</span> : null}
    </button>
  );
}

export function CurriculumGroupGraph({
  nodes,
  edges,
  filter,
  onNodeClick,
}: {
  nodes: CurriculumNodeData[];
  edges: CurriculumEdgeData[];
  filter: StatusFilter;
  onNodeClick: (node: CurriculumNodeData) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const [paths, setPaths] = useState<{ id: string; d: string; highlighted: boolean }[]>([]);
  const [svgSize, setSvgSize] = useState({ width: 0, height: 0 });

  const { columns, columnKeys } = useMemo(() => computeGroupLayout(nodes, edges), [nodes, edges]);

  const recomputePaths = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const nextPaths: { id: string; d: string; highlighted: boolean }[] = [];

    for (const edge of edges) {
      const fromEl = nodeRefs.current.get(edge.from_node_id);
      const toEl = nodeRefs.current.get(edge.to_node_id);
      if (!fromEl || !toEl) continue;
      const fromRect = fromEl.getBoundingClientRect();
      const toRect = toEl.getBoundingClientRect();
      const x1 = fromRect.right - containerRect.left;
      const y1 = fromRect.top + fromRect.height / 2 - containerRect.top;
      const x2 = toRect.left - containerRect.left;
      const y2 = toRect.top + toRect.height / 2 - containerRect.top;
      const midX = (x1 + x2) / 2;

      const fromNode = nodes.find((n) => n.id === edge.from_node_id);
      const toNode = nodes.find((n) => n.id === edge.to_node_id);
      const highlighted = Boolean(
        (fromNode && fromNode.status === "in_progress") || (toNode && toNode.status === "in_progress"),
      );

      nextPaths.push({
        id: `${edge.from_node_id}-${edge.to_node_id}`,
        d: `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`,
        highlighted,
      });
    }

    setSvgSize({ width: container.scrollWidth, height: container.scrollHeight });
    setPaths(nextPaths);
  }, [edges, nodes]);

  useLayoutEffect(() => {
    recomputePaths();
    const handle = () => recomputePaths();
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, [recomputePaths]);

  return (
    <div
      className="relative overflow-x-auto pb-1 [mask-image:linear-gradient(to_right,transparent_0,black_16px,black_calc(100%-28px),transparent_100%)] [mask-repeat:no-repeat]"
      ref={containerRef}
    >
      <svg className="pointer-events-none absolute left-0 top-0" height={svgSize.height} width={svgSize.width}>
        <defs>
          <marker id="curriculum-arrow" markerHeight="7" markerWidth="7" orient="auto" refX="5.5" refY="2.5">
            <path d="M0,0 L5,2.5 L0,5 Z" fill="#C4B5FD" />
          </marker>
          <marker id="curriculum-arrow-active" markerHeight="7" markerWidth="7" orient="auto" refX="5.5" refY="2.5">
            <path d="M0,0 L5,2.5 L0,5 Z" fill="#8B7CFF" />
          </marker>
        </defs>
        {paths.map((path) => (
          <path
            d={path.d}
            fill="none"
            key={path.id}
            markerEnd={path.highlighted ? "url(#curriculum-arrow-active)" : "url(#curriculum-arrow)"}
            stroke={path.highlighted ? "#8B7CFF" : "#DCE0F0"}
            strokeWidth={path.highlighted ? 2.5 : 2}
          />
        ))}
      </svg>

      <div className="relative flex gap-5" style={{ minWidth: columnKeys.length * 168 }}>
        {columnKeys.map((rank) => (
          <div className="flex w-40 shrink-0 flex-col justify-center gap-3" key={rank}>
            {(columns.get(rank) ?? []).map((node) => (
              <NodeCard
                dimmed={filter !== "all" && node.status !== filter}
                key={node.id}
                node={node}
                onClick={() => onNodeClick(node)}
                registerRef={(el) => {
                  if (el) nodeRefs.current.set(node.id, el);
                  else nodeRefs.current.delete(node.id);
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function GroupSection({
  group,
  edges,
  filter,
  defaultExpanded,
  onNodeClick,
}: {
  group: CurriculumGroup;
  edges: CurriculumEdgeData[];
  filter: StatusFilter;
  defaultExpanded: boolean;
  onNodeClick: (node: CurriculumNodeData) => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const allSettled = isGroupAllSettled(group.nodes);
  const completedCount = group.nodes.filter((n) => n.status === "completed").length;
  const isFuture = group.nodes.every((n) => n.status === "planned");

  const summaryLabel = allSettled
    ? `완료한 단계 ${completedCount}개`
    : isFuture
      ? `이후 예정 ${group.nodes.length}개`
      : `${group.nodes.length}개 단계`;

  return (
    <div className={cn("rounded-2xl border", allSettled ? "border-emerald-100 bg-emerald-50/40" : "border-[#EEF2FF] bg-white")}>
      <button
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
        onClick={() => setExpanded((v) => !v)}
        type="button"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-[15px] font-black text-[#17213B]">
            {group.group_number}. {group.name}
          </h3>
          {groupHasActiveNode(group.nodes) ? (
            <span className="rounded-full bg-[#F1EDFF] px-2.5 py-0.5 text-[11px] font-black text-[#635BFF]">진행 중</span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-xs font-bold text-[#98A2B3]">
            {allSettled ? <span className="text-emerald-500">✓</span> : isFuture ? <span>🕓</span> : null}
            {summaryLabel}
          </span>
          <span className="text-xs font-black text-[#98A1B3]">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {expanded ? (
        <div className="border-t border-black/5 px-4 pb-4 pt-3">
          {allSettled ? (
            <div className="flex flex-wrap gap-2">
              {group.nodes.map((node) => (
                <button
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition",
                    STATUS_STYLES[node.status].bg,
                    STATUS_STYLES[node.status].border,
                    STATUS_STYLES[node.status].text,
                    filter !== "all" && node.status !== filter ? "opacity-35" : "",
                  )}
                  key={node.id}
                  onClick={() => onNodeClick(node)}
                  type="button"
                >
                  {node.status === "completed" ? "✅" : "⏭"} {node.title}
                </button>
              ))}
            </div>
          ) : (
            <CurriculumGroupGraph edges={edges} filter={filter} nodes={group.nodes} onNodeClick={onNodeClick} />
          )}
        </div>
      ) : null}
    </div>
  );
}
