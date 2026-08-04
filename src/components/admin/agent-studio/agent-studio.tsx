"use client";

/**
 * Kanvas Agent Studio.
 *
 * Satu keputusan yang membentuk seluruh file ini: React Flow yang memegang
 * keadaan node, bukan sebuah salinan graph di sebelahnya. Dua sumber posisi node
 * akan berselisih pada gerakan pertama yang tidak sempat disinkronkan, dan
 * selisih itu berakhir di kolom yang dibaca runtime. Jadi `data` tiap node
 * membawa kind/config/enabled-nya sendiri, dan graph disusun ulang dari sana
 * setiap kali perlu dikirim ke server.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Blocks, Loader2, Send, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";
import { Panel, PanelHeader, Tone, inkButtonGhost, inkInput } from "@/components/admin/ui";
import { NodeCard, type StudioNode, type StudioNodeData } from "./node-card";
import { NodeInspector } from "./node-inspector";
import { Palette } from "./palette";
import { RunConsole } from "./run-console";
import { Toolbar, type SaveState } from "./toolbar";
import { useAgentStream } from "./use-agent-stream";
import {
  ACCENTS,
  sameGraph,
  type AgentEdge,
  type AgentGraphData,
  type AgentNode,
  type AgentNodeKind,
  type AgentTelemetryEvent,
  type GraphIssue,
  type HeartbeatRunRow,
  type NodeDefinition,
  type StudioPayload,
} from "./shared";

const NODE_TYPES = { studio: NodeCard };

/** Jeda sebelum draft disimpan sendiri. Cukup lama agar menggeser node tidak jadi satu request per pixel. */
const AUTOSAVE_MS = 1_500;

export function AgentStudio(props: {
  payload: StudioPayload;
  initialEvents: AgentTelemetryEvent[];
  heartbeatRuns: HeartbeatRunRow[];
}) {
  return (
    <ReactFlowProvider>
      <Studio {...props} />
    </ReactFlowProvider>
  );
}

function Studio({
  payload,
  initialEvents,
  heartbeatRuns,
}: {
  payload: StudioPayload;
  initialEvents: AgentTelemetryEvent[];
  heartbeatRuns: HeartbeatRunRow[];
}) {
  const router = useRouter();
  const { screenToFlowPosition } = useReactFlow();

  const definitions = useMemo(
    () => new Map(payload.catalogue.map((definition) => [definition.kind, definition])),
    [payload.catalogue],
  );

  // Draft menang atas yang dipublish: kalau ada kerja yang belum selesai, itu
  // yang harus dilihat admin saat halaman dibuka, bukan versi lama.
  const initial = payload.draft ?? payload.published;
  const [nodes, setNodes, onNodesChangeBase] = useNodesState<StudioNode>(
    useMemo(() => toFlowNodes(initial, definitions), [initial, definitions]),
  );
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState<Edge>(
    useMemo(() => toFlowEdges(initial), [initial]),
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [issues, setIssues] = useState<GraphIssue[]>(payload.issues);
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const [version, setVersion] = useState(payload.version);
  const [publishedAt, setPublishedAt] = useState(payload.publishedAt);
  const [revisions, setRevisions] = useState(payload.revisions);
  const [published, setPublished] = useState(payload.published);
  const [testOpen, setTestOpen] = useState(false);

  const { events, nodeStates, status } = useAgentStream(initialEvents);

  const graph = useMemo<AgentGraphData>(() => toGraphData(nodes, edges), [nodes, edges]);
  const dirty = useMemo(() => !sameGraph(graph, published), [graph, published]);

  const invalidIds = useMemo(
    () => new Set(issues.filter((issue) => issue.level === "error" && issue.nodeId).map((i) => i.nodeId!)),
    [issues],
  );

  // Status live dan penanda error ditulis balik ke `data` node — React Flow
  // hanya merender ulang kartu kalau objek datanya berganti.
  useEffect(() => {
    setNodes((current) =>
      current.map((node) => {
        const run = nodeStates[node.id];
        const invalid = invalidIds.has(node.id);
        if (node.data.run === run && node.data.invalid === invalid) return node;
        return { ...node, data: { ...node.data, run, invalid } };
      }),
    );
  }, [nodeStates, invalidIds, setNodes]);

  const selected = nodes.find((node) => node.id === selectedId) ?? null;
  const selectedDefinition = selected ? definitions.get(selected.data.kind) ?? null : null;

  /* ── Mutasi kanvas ───────────────────────────────────────────────────────── */

  const touched = useRef(false);
  const markTouched = useCallback(() => {
    touched.current = true;
  }, []);

  const onNodesChange = useCallback(
    (changes: NodeChange<StudioNode>[]) => {
      // Seleksi dan pengukuran bukan perubahan graph; menandainya "tersentuh"
      // akan memicu autosave hanya karena admin mengklik satu kotak.
      if (changes.some((change) => change.type !== "select" && change.type !== "dimensions")) {
        markTouched();
      }
      onNodesChangeBase(changes);
    },
    [markTouched, onNodesChangeBase],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      if (changes.some((change) => change.type !== "select")) markTouched();
      onEdgesChangeBase(changes);
    },
    [markTouched, onEdgesChangeBase],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      markTouched();
      setEdges((current) =>
        addEdge({ ...connection, id: `${connection.source}->${connection.target}` }, current),
      );
    },
    [markTouched, setEdges],
  );

  const addNode = useCallback(
    (kind: AgentNodeKind, position?: { x: number; y: number }) => {
      const definition = definitions.get(kind);
      if (!definition) return;
      if (definition.singleton && nodes.some((node) => node.data.kind === kind)) return;

      markTouched();
      const id = `${kind.replace(".", "-")}-${Math.random().toString(36).slice(2, 7)}`;
      const at = position ?? { x: 80 + nodes.length * 24, y: 80 + nodes.length * 18 };
      setNodes((current) => [...current, toFlowNode(newAgentNode(id, definition, at), definition)]);
      setSelectedId(id);
    },
    [definitions, markTouched, nodes, setNodes],
  );

  const updateSelected = useCallback(
    (mutate: (data: StudioNodeData) => StudioNodeData) => {
      if (!selectedId) return;
      markTouched();
      setNodes((current) =>
        current.map((node) => (node.id === selectedId ? { ...node, data: mutate(node.data) } : node)),
      );
    },
    [markTouched, selectedId, setNodes],
  );

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    markTouched();
    setNodes((current) => current.filter((node) => node.id !== selectedId));
    setEdges((current) =>
      current.filter((edge) => edge.source !== selectedId && edge.target !== selectedId),
    );
    setSelectedId(null);
  }, [markTouched, selectedId, setEdges, setNodes]);

  const loadGraph = useCallback(
    (next: AgentGraphData) => {
      setNodes(toFlowNodes(next, definitions));
      setEdges(toFlowEdges(next));
      setSelectedId(null);
    },
    [definitions, setEdges, setNodes],
  );

  /* ── Server ──────────────────────────────────────────────────────────────── */

  const applyPayload = useCallback(
    (data: StudioPayload) => {
      setVersion(data.version);
      setPublishedAt(data.publishedAt);
      setRevisions(data.revisions);
      setPublished(data.published);
      setIssues(data.issues);
      loadGraph(data.draft ?? data.published);
      touched.current = false;
    },
    [loadGraph],
  );

  const post = useCallback(
    async (body: Record<string, unknown>, successMessage?: string) => {
      setState({ kind: "busy" });
      try {
        const res = await fetch("/api/admin/agent-graph", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (json?.data?.issues) setIssues(json.data.issues as GraphIssue[]);
        if (!json.ok) {
          setState({ kind: "error", message: json.error ?? "Gagal menyimpan." });
          return false;
        }
        if (json.data?.catalogue) applyPayload(json.data as StudioPayload);
        setState({ kind: "saved", message: successMessage });
        return true;
      } catch {
        setState({ kind: "error", message: "Tidak bisa menghubungi server." });
        return false;
      }
    },
    [applyPayload],
  );

  const saveDraft = useCallback(
    async (silent = false) => {
      const ok = await post({ action: "save-draft", graph }, silent ? undefined : "Draft tersimpan.");
      if (ok) touched.current = false;
    },
    [graph, post],
  );

  // Autosave: draft memang tidak dibaca runtime, jadi menyimpannya sering tidak
  // punya risiko — dan itu yang membuat daftar masalah di toolbar tetap segar.
  useEffect(() => {
    if (!touched.current || !dirty || state.kind === "busy") return;
    const timer = setTimeout(() => void saveDraft(true), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [graph, dirty, saveDraft, state.kind]);

  const publish = useCallback(async () => {
    const ok = window.confirm(
      "Publish graph ini? Agent yang sedang melayani user akan langsung memakai susunan baru.",
    );
    if (!ok) return;
    const done = await post({ action: "publish", graph }, "Graph dipublish. Runtime sudah memakainya.");
    if (done) router.refresh();
  }, [graph, post, router]);

  const discardDraft = useCallback(async () => {
    if (!window.confirm("Buang semua perubahan yang belum dipublish?")) return;
    await post({ action: "discard-draft" }, "Draft dibuang.");
  }, [post]);

  const rollback = useCallback(
    async (target: number) => {
      if (!window.confirm(`Kembalikan runtime ke graph v${target}?`)) return;
      const done = await post({ action: "rollback", version: target }, `Dikembalikan ke v${target}.`);
      if (done) router.refresh();
    },
    [post, router],
  );

  /* ── Render ──────────────────────────────────────────────────────────────── */

  const usedKinds = useMemo(() => new Set(nodes.map((node) => node.data.kind)), [nodes]);
  const nodeLabels = useMemo(
    () => Object.fromEntries(nodes.map((node) => [node.id, node.data.label])),
    [nodes],
  );
  const selectedIssues = useMemo(
    () => issues.filter((issue) => issue.nodeId === selectedId).map((issue) => issue.message),
    [issues, selectedId],
  );

  return (
    <div className="space-y-4">
      <Toolbar
        version={version}
        publishedAt={publishedAt}
        dirty={dirty}
        issues={issues}
        state={state}
        revisions={revisions}
        onSaveDraft={() => void saveDraft()}
        onDiscardDraft={() => void discardDraft()}
        onPublish={() => void publish()}
        onRollback={(target) => void rollback(target)}
        onReset={() => {
          markTouched();
          loadGraph(payload.defaultGraph);
        }}
        onToggleTest={() => setTestOpen((prev) => !prev)}
        testOpen={testOpen}
      />

      {testOpen && <TestPanel graph={graph} />}

      <div className="grid gap-4 xl:grid-cols-[15rem_minmax(0,1fr)_20rem]">
        <Panel className="order-2 xl:order-1">
          <PanelHeader title="Node" hint="Tarik ke kanvas atau klik" icon={Blocks} />
          <div className="max-h-[28rem] overflow-y-auto px-2.5 py-3 xl:max-h-[36rem]">
            <Palette catalogue={payload.catalogue} used={usedKinds} onAdd={(kind) => addNode(kind)} />
          </div>
        </Panel>

        <Panel className="order-1 overflow-hidden xl:order-2">
          <PanelHeader
            title="Kanvas pipeline"
            hint="Jalur atas melayani chat, jalur bawah laporan proaktif"
            icon={Workflow}
            actions={
              <span className="hidden gap-1.5 sm:flex">
                {(Object.keys(ACCENTS) as Array<keyof typeof ACCENTS>).map((key) => (
                  <span
                    key={key}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold",
                      ACCENTS[key].bg,
                      ACCENTS[key].text,
                    )}
                  >
                    {ACCENTS[key].label}
                  </span>
                ))}
              </span>
            }
          />
          <div
            className="h-[32rem] w-full xl:h-[40rem]"
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDrop={(event) => {
              event.preventDefault();
              const kind = event.dataTransfer.getData("application/ledgerly-node") as AgentNodeKind;
              if (!kind) return;
              addNode(kind, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
            }}
          >
            <ReactFlow<StudioNode>
              nodes={nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={(_, node) => setSelectedId(node.id)}
              onPaneClick={() => setSelectedId(null)}
              fitView
              proOptions={{ hideAttribution: false }}
              defaultEdgeOptions={{
                animated: true,
                style: { stroke: "var(--ink-border)", strokeWidth: 1.6 },
              }}
              className="[&_.react-flow\_\_attribution]:!bg-transparent [&_.react-flow\_\_attribution]:!text-[10px]"
              style={{ background: "transparent" }}
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={20}
                size={1}
                color="var(--ink-border)"
              />
              <Controls
                className="!border !border-ink-border !bg-ink-soft [&_button]:!border-ink-border [&_button]:!bg-ink-soft [&_button]:!fill-ink-muted hover:[&_button]:!bg-ink"
                showInteractive={false}
              />
              <MiniMap
                pannable
                zoomable
                className="!border !border-ink-border !bg-ink-soft"
                maskColor="oklch(0.16 0.03 190 / 0.7)"
                nodeColor={() => "var(--ink-border)"}
              />
            </ReactFlow>
          </div>
        </Panel>

        <Panel className="order-3">
          <PanelHeader title="Pengaturan node" hint={selected ? selected.data.label : "Belum ada yang dipilih"} />
          <div className="max-h-[28rem] overflow-y-auto xl:max-h-[36rem]">
            <NodeInspector
              node={
                selected
                  ? {
                      id: selected.id,
                      kind: selected.data.kind,
                      label: selected.data.rawLabel,
                      enabled: selected.data.enabled,
                      config: selected.data.config,
                    }
                  : null
              }
              definition={selectedDefinition}
              issues={selectedIssues}
              onChange={(key, value) =>
                updateSelected((data) => ({ ...data, config: { ...data.config, [key]: value } }))
              }
              onToggleEnabled={(enabled) => updateSelected((data) => ({ ...data, enabled }))}
              onRename={(label) =>
                updateSelected((data) => ({
                  ...data,
                  rawLabel: label,
                  label: label.trim() || definitions.get(data.kind)?.label || data.kind,
                }))
              }
              onDelete={deleteSelected}
            />
          </div>
        </Panel>
      </div>

      <Panel className="overflow-hidden">
        <div className="h-[22rem]">
          <RunConsole
            events={events}
            heartbeatRuns={heartbeatRuns}
            status={status}
            nodeLabels={nodeLabels}
          />
        </div>
      </Panel>
    </div>
  );
}

/* ── Uji coba ──────────────────────────────────────────────────────────────── */

type TestResult = {
  text: string;
  toolsUsed: string[];
  ms: number;
  blockedTools: string[];
};

function TestPanel({ graph }: { graph: AgentGraphData }) {
  const [message, setMessage] = useState("berapa saldo saya sekarang?");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/agent-graph/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, graph }),
      });
      const json = await res.json();
      if (!json.ok) setError(json.error ?? "Uji coba gagal.");
      else setResult(json.data as TestResult);
    } catch {
      setError("Tidak bisa menghubungi server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel>
      <PanelHeader
        title="Jalankan tes"
        hint="Dijalankan atas nama akun admin ini, dengan seluruh tool yang bisa mengubah data dicabut dari rencana"
      />
      <div className="space-y-3 px-4 py-3.5">
        <div className="flex flex-wrap gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Pesan contoh</span>
            <input
              type="text"
              value={message}
              maxLength={500}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && !busy && message.trim() && void run()}
              placeholder="Tulis pesan contoh…"
              className={cn(inkInput, "h-10")}
            />
          </label>
          <button
            type="button"
            onClick={() => void run()}
            disabled={busy || !message.trim()}
            className={cn(inkButtonGhost, "h-10 px-4 text-xs")}
          >
            {busy ? (
              <Loader2 aria-hidden className="size-3.5 animate-spin" strokeWidth={2.4} />
            ) : (
              <Send aria-hidden className="size-3.5" strokeWidth={2.4} />
            )}
            Kirim
          </button>
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/8 px-3 py-2 text-xs text-rose-200">
            {error}
          </p>
        )}

        {result && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Tone tone="positive">{result.ms} ms</Tone>
              {result.toolsUsed.length > 0 && (
                <Tone tone="info">tool dipakai: {result.toolsUsed.join(", ")}</Tone>
              )}
              {result.blockedTools.length > 0 && (
                <Tone tone="warning">
                  {result.blockedTools.length} tool penulis dicabut demi keamanan uji coba
                </Tone>
              )}
            </div>
            <p className="whitespace-pre-wrap rounded-xl border border-ink-border/70 bg-ink/40 px-3 py-2.5 text-xs leading-relaxed text-ink-foreground">
              {result.text}
            </p>
          </div>
        )}
      </div>
    </Panel>
  );
}

/* ── Konversi graph ⇄ React Flow ───────────────────────────────────────────── */

function newAgentNode(
  id: string,
  definition: NodeDefinition,
  position: { x: number; y: number },
): AgentNode {
  const config: Record<string, unknown> = {};
  for (const field of definition.fields) {
    config[field.key] = Array.isArray(field.default) ? [...field.default] : field.default;
  }
  return { id, kind: definition.kind, enabled: true, position, config };
}

function toFlowNode(node: AgentNode, definition: NodeDefinition): StudioNode {
  return {
    id: node.id,
    type: "studio",
    position: node.position,
    data: {
      kind: node.kind,
      rawLabel: node.label ?? "",
      config: node.config,
      enabled: node.enabled,
      label: node.label?.trim() || definition.label,
      description: definition.description,
      icon: definition.icon,
      accent: definition.accent,
      hasInput: definition.hasInput,
      hasOutput: definition.hasOutput,
      required: definition.required,
      invalid: false,
    },
  };
}

function toFlowNodes(
  graph: AgentGraphData,
  definitions: Map<string, NodeDefinition>,
): StudioNode[] {
  // Node dengan kind yang tidak dikenal dibuang, bukan dirender setengah jadi:
  // itu hanya bisa terjadi kalau graph disimpan oleh versi kode yang lebih baru.
  return graph.nodes
    .map((node) => {
      const definition = definitions.get(node.kind);
      return definition ? toFlowNode(node, definition) : null;
    })
    .filter((node): node is StudioNode => node !== null);
}

function toFlowEdges(graph: AgentGraphData): Edge[] {
  return graph.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target }));
}

function toGraphData(nodes: StudioNode[], edges: Edge[]): AgentGraphData {
  const agentNodes: AgentNode[] = nodes.map((node) => ({
    id: node.id,
    kind: node.data.kind,
    label: node.data.rawLabel.trim() || undefined,
    enabled: node.data.enabled,
    position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
    config: node.data.config,
  }));

  const agentEdges: AgentEdge[] = edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
  }));

  return { nodes: agentNodes, edges: agentEdges };
}
