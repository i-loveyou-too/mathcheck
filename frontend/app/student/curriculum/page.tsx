"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
import { StudentBottomNav } from "@/components/student-bottom-nav";
import {
  type CurriculumEdgeData,
  type CurriculumGroup,
  type CurriculumNodeData,
  type CurriculumNodesResponse,
  type StatusFilter,
  formatCurriculumDate,
  GroupSection,
  groupHasActiveNode,
  isGroupAllSettled,
  NODE_TYPE_ICON,
  NODE_TYPE_LABEL,
  STATUS_STYLES,
} from "@/components/curriculum-graph";
import { apiFetch } from "@/lib/api";
import { getStudent } from "@/lib/storage";
import { cn } from "@/lib/utils";

type CurriculumListItem = {
  student_curriculum_id: number;
  curriculum_id: number;
  subject: string;
  title: string;
  description: string | null;
  in_progress_count: number;
  completed_count: number;
  planned_count: number;
};

const SUBJECT_STYLES: { bg: string; text: string; icon: string }[] = [
  { bg: "bg-[#EEF2FF]", text: "text-[#5C5FFF]", icon: "🧮" },
  { bg: "bg-[#EFF6FF]", text: "text-[#2563EB]", icon: "Aa" },
  { bg: "bg-[#F5F3FF]", text: "text-[#7C3AED]", icon: "📖" },
  { bg: "bg-[#FFF7ED]", text: "text-[#EA580C]", icon: "🔬" },
];

function subjectStyle(subject: string) {
  let hash = 0;
  for (let i = 0; i < subject.length; i += 1) hash += subject.charCodeAt(i);
  return SUBJECT_STYLES[hash % SUBJECT_STYLES.length];
}

function SubjectDots({ nodes }: { nodes: CurriculumNodeData[] }) {
  const sorted = [...nodes].sort((a, b) => a.group_order - b.group_order || a.order_index - b.order_index);
  return (
    <div className="flex items-center gap-0">
      {sorted.map((node, index) => (
        <div className="flex items-center" key={node.id}>
          <span
            className={cn(
              "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
              node.status === "completed"
                ? "border-emerald-500 bg-emerald-500"
                : node.status === "in_progress"
                  ? "border-[#635BFF] bg-white"
                  : "border-[#D8DEEA] bg-white",
            )}
          >
            {node.status === "in_progress" ? <span className="h-1.5 w-1.5 rounded-full bg-[#635BFF]" /> : null}
          </span>
          {index < sorted.length - 1 ? (
            <span className={cn("h-0.5 w-5", node.status === "completed" ? "bg-emerald-300" : "bg-[#E2E8F0]")} />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function SubjectCard({
  item,
  nodes,
  edges,
  loading,
  expanded,
  filter,
  onToggle,
  onNodeClick,
}: {
  item: CurriculumListItem;
  nodes: CurriculumNodeData[] | null;
  edges: CurriculumEdgeData[];
  loading: boolean;
  expanded: boolean;
  filter: StatusFilter;
  onToggle: () => void;
  onNodeClick: (node: CurriculumNodeData) => void;
}) {
  const style = subjectStyle(item.subject);

  const groups = useMemo(() => {
    if (!nodes) return [];
    const map = new Map<string, CurriculumGroup>();
    for (const node of nodes) {
      const existing = map.get(node.group_name);
      if (existing) {
        existing.nodes.push(node);
      } else {
        map.set(node.group_name, { name: node.group_name, order: node.group_order, group_number: 0, nodes: [node] });
      }
    }
    const ordered = Array.from(map.values()).sort((a, b) => a.order - b.order);
    ordered.forEach((g, index) => {
      g.group_number = index + 1;
      g.nodes.sort((a, b) => a.order_index - b.order_index);
    });
    return ordered;
  }, [nodes]);

  if (!expanded) {
    return (
      <button className="flex w-full items-center justify-between gap-3 rounded-[24px] border border-[#EEF2FF] bg-white px-4 py-4 text-left shadow-card transition hover:border-[#D9E1F5]" onClick={onToggle} type="button">
        <div className="flex min-w-0 items-center gap-3">
          <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg font-black", style.bg, style.text)}>
            {style.icon}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-black text-[#17213B]">{item.subject}</p>
            <p className="mt-0.5 truncate text-xs font-bold text-[#98A2B3]">
              {item.in_progress_count > 0 ? "현재 진행 중" : "예정된 학습"} · {item.in_progress_count > 0 ? item.in_progress_count : item.planned_count}개
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {nodes ? <SubjectDots nodes={nodes} /> : null}
          <span className="text-sm font-black text-[#D0D5DD]">▼</span>
        </div>
      </button>
    );
  }

  return (
    <div className="rounded-[28px] border border-[#EEF2FF] bg-white p-5 shadow-card">
      <button className="flex w-full items-center justify-between gap-3 text-left" onClick={onToggle} type="button">
        <div className="flex min-w-0 items-center gap-3">
          <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl font-black", style.bg, style.text)}>
            {style.icon}
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-black text-[#17213B]">{item.title}</p>
            <p className="mt-0.5 truncate text-xs font-bold text-[#98A2B3]">{item.description ?? "큰 흐름으로 학습 과정을 확인해요"}</p>
          </div>
        </div>
        <span className="shrink-0 text-sm font-black text-[#D0D5DD]">▲</span>
      </button>

      <div className="mt-4 space-y-3">
        {loading ? (
          <p className="py-8 text-center text-sm font-bold text-[#98A2B3]">불러오는 중...</p>
        ) : groups.length === 0 ? (
          <p className="py-8 text-center text-sm font-bold text-[#98A2B3]">등록된 학습 단계가 없어요.</p>
        ) : (
          groups.map((group) => (
            <GroupSection
              defaultExpanded={groupHasActiveNode(group.nodes) || !isGroupAllSettled(group.nodes) && !group.nodes.every((n) => n.status === "planned")}
              edges={edges}
              filter={filter}
              group={group}
              key={group.name}
              onNodeClick={onNodeClick}
            />
          ))
        )}
      </div>
    </div>
  );
}

function NodeDetailPanel({ node, onClose }: { node: CurriculumNodeData; onClose: () => void }) {
  const style = STATUS_STYLES[node.status];
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[430px] px-5 pb-28">
      <div className="rounded-[24px] border border-[#EEF2FF] bg-white p-5 shadow-[0_-8px_30px_rgba(15,23,42,0.12)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[11px] font-black", style.bg, style.text)}>
              {style.label}
            </span>
            <h3 className="mt-2 truncate text-base font-black text-[#17213B]">{node.title}</h3>
            <p className="mt-1 text-xs font-bold text-[#98A2B3]">{NODE_TYPE_ICON[node.node_type]} {NODE_TYPE_LABEL[node.node_type]}</p>
          </div>
          <button className="shrink-0 rounded-full bg-[#F4F6FA] px-3 py-1.5 text-xs font-bold text-[#667085]" onClick={onClose} type="button">
            닫기
          </button>
        </div>

        <div className="mt-3 space-y-1.5 text-xs font-bold text-[#667085]">
          {node.started_at ? <p>시작일 {formatCurriculumDate(node.started_at)}</p> : null}
          {node.completed_at ? <p>완료일 {formatCurriculumDate(node.completed_at)}</p> : null}
          {node.description ? <p className="text-[#98A2B3]">{node.description}</p> : null}
          {node.memo ? <p className="rounded-xl bg-[#F8FAFC] px-3 py-2 text-[#344054]">{node.memo}</p> : null}
        </div>
      </div>
    </div>
  );
}

const FILTER_OPTIONS: { value: StatusFilter; label: string; icon: string }[] = [
  { value: "all", label: "전체", icon: "⣿" },
  { value: "in_progress", label: "진행 중", icon: "▶" },
  { value: "completed", label: "완료", icon: "✓" },
];

export default function StudentCurriculumPage() {
  const router = useRouter();
  const [studentId, setStudentId] = useState<number | null>(null);
  const [items, setItems] = useState<CurriculumListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [nodesByCurriculum, setNodesByCurriculum] = useState<Record<number, CurriculumNodesResponse>>({});
  const [loadingNodeIds, setLoadingNodeIds] = useState<Set<number>>(new Set());
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [detailNode, setDetailNode] = useState<CurriculumNodeData | null>(null);

  const fetchNodes = useCallback(async (sid: number, studentCurriculumId: number) => {
    setLoadingNodeIds((prev) => new Set(prev).add(studentCurriculumId));
    try {
      const data = await apiFetch<CurriculumNodesResponse>(
        `/student/curriculums/${studentCurriculumId}/nodes?student_id=${sid}`,
      );
      setNodesByCurriculum((prev) => ({ ...prev, [studentCurriculumId]: data }));
    } catch {
      // leave unset; subject card will show "불러오지 못했어요" via null check below
    } finally {
      setLoadingNodeIds((prev) => {
        const next = new Set(prev);
        next.delete(studentCurriculumId);
        return next;
      });
    }
  }, []);

  useEffect(() => {
    const student = getStudent();
    if (!student) {
      router.push("/login");
      return;
    }
    setStudentId(student.id);

    setLoading(true);
    setError("");
    apiFetch<CurriculumListItem[]>(`/student/curriculums?student_id=${student.id}`)
      .then(async (list) => {
        setItems(list);
        const defaultExpanded = list.find((item) => item.in_progress_count > 0) ?? list[0] ?? null;
        if (defaultExpanded) setExpandedId(defaultExpanded.student_curriculum_id);
        await Promise.all(list.map((item) => fetchNodes(student.id, item.student_curriculum_id)));
      })
      .catch(() => setError("커리큘럼 정보를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [fetchNodes, router]);

  const totals = useMemo(
    () =>
      items.reduce(
        (acc, item) => ({
          in_progress: acc.in_progress + item.in_progress_count,
          completed: acc.completed + item.completed_count,
          planned: acc.planned + item.planned_count,
        }),
        { in_progress: 0, completed: 0, planned: 0 },
      ),
    [items],
  );

  const visibleItems = items.filter((item) => {
    if (filter === "all") return true;
    if (filter === "in_progress") return item.in_progress_count > 0;
    return item.completed_count > 0;
  });

  const handleToggle = (item: CurriculumListItem) => {
    const willExpand = expandedId !== item.student_curriculum_id;
    setExpandedId(willExpand ? item.student_curriculum_id : null);
  };

  const handleNodeClick = (node: CurriculumNodeData) => {
    if (node.link_url) {
      router.push(node.link_url);
      return;
    }
    setDetailNode(node);
  };

  return (
    <ScreenShell withBottomNav>
      <div className="flex items-start justify-between gap-4 pt-1">
        <div>
          <h1 className="text-[1.5rem] font-black tracking-tight text-[#17213B]">진도표</h1>
          <p className="mt-1 text-sm font-medium text-[#8A94A8]">현재 공부 중인 커리큘럼을 한눈에 확인해요</p>
        </div>
        <div className="relative h-16 w-16 shrink-0">
          <Image alt="" className="object-contain" fill priority src="/study-cat2.png" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5 rounded-[20px] border border-[#EEF2FF] bg-white p-1.5 shadow-card">
        {FILTER_OPTIONS.map((option) => (
          <button
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-2xl py-2.5 text-sm font-black transition",
              filter === option.value ? "bg-[#EEF2FF] text-[#4F46E5]" : "text-[#98A2B3] hover:bg-[#F8FAFC]",
            )}
            key={option.value}
            onClick={() => setFilter(option.value)}
            type="button"
          >
            <span className="text-xs">{option.icon}</span>
            {option.label}
          </button>
        ))}
      </div>

      <div className="rounded-[20px] border border-[#EEF2FF] bg-white px-2 py-4 shadow-card">
        <div className="grid grid-cols-3 divide-x divide-[#EEF1F7]">
          {[
            { icon: "▶", tone: "text-[#635BFF]", bg: "bg-[#F1EDFF]", label: "현재 진행 중", value: totals.in_progress },
            { icon: "✓", tone: "text-emerald-500", bg: "bg-emerald-50", label: "완료", value: totals.completed },
            { icon: "🕓", tone: "text-[#98A2B3]", bg: "bg-[#F1F5F9]", label: "예정", value: totals.planned },
          ].map((stat) => (
            <div className="flex flex-col items-center gap-2 px-1" key={stat.label}>
              <div className={cn("flex h-9 w-9 items-center justify-center rounded-full text-sm font-black", stat.bg, stat.tone)}>
                {stat.icon}
              </div>
              <p className="text-xs font-bold text-[#8A94A8]">{stat.label}</p>
              <p className="text-2xl font-black tracking-tight text-[#17213B]">{stat.value}개</p>
            </div>
          ))}
        </div>
      </div>

      {loading ? <p className="py-10 text-center text-sm font-bold text-gray-400">불러오는 중...</p> : null}
      {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-500">{error}</p> : null}

      {!loading && !error && visibleItems.length === 0 ? (
        <div className="flex min-h-[160px] flex-col items-center justify-center rounded-[28px] border border-dashed border-[#E4EAF6] bg-white px-4 py-8 text-center shadow-card">
          <p className="text-sm font-black text-[#17213B]">
            {items.length === 0 ? "아직 배정된 커리큘럼이 없어요" : "해당 상태의 커리큘럼이 없어요"}
          </p>
        </div>
      ) : null}

      <div className="space-y-3">
        {visibleItems.map((item) => (
          <SubjectCard
            edges={nodesByCurriculum[item.student_curriculum_id]?.edges ?? []}
            expanded={expandedId === item.student_curriculum_id}
            filter={filter}
            item={item}
            key={item.student_curriculum_id}
            loading={loadingNodeIds.has(item.student_curriculum_id)}
            nodes={
              nodesByCurriculum[item.student_curriculum_id]?.groups.flatMap((g) => g.nodes) ?? null
            }
            onNodeClick={handleNodeClick}
            onToggle={() => handleToggle(item)}
          />
        ))}
      </div>

      <div className="rounded-[28px] border border-[#EEF2FF] bg-white p-5 shadow-card">
        <div className="flex items-center gap-4">
          <div className="relative h-16 w-16 shrink-0">
            <Image alt="" className="object-contain" fill src="/hero-cat.png" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-black text-[#635BFF]">오늘의 한 줄</p>
            <p className="mt-1 text-sm font-black leading-snug text-[#17213B]">꾸준히 쌓인 시간이 실력이 돼요. ✨</p>
            <p className="mt-2 text-xs font-bold text-[#98A2B3]">
              지금까지 공부한 날 <span className="rounded-full bg-[#F1EDFF] px-2 py-0.5 font-black text-[#635BFF]">{totals.completed}개</span>
            </p>
          </div>
        </div>
      </div>

      {detailNode ? <NodeDetailPanel node={detailNode} onClose={() => setDetailNode(null)} /> : null}

      <StudentBottomNav />
    </ScreenShell>
  );
}
