"use client";

/**
 * Workspace Agent Studio.
 *
 * Satu keputusan yang membentuk seluruh file ini: React Flow yang memegang
 * keadaan node, bukan sebuah salinan graph di sebelahnya. Dua sumber posisi node
 * akan berselisih pada gerakan pertama yang tidak sempat disinkronkan, dan
 * selisih itu berakhir di kolom yang dibaca runtime. Jadi `data` tiap node
 * membawa kind/config/enabled-nya sendiri, dan graph disusun ulang dari sana
 * setiap kali perlu dikirim ke server.
 *
 * Keputusan kedua menyangkut tata letak: halaman ini satu workspace setinggi
 * viewport, bukan tumpukan panel yang digulir. Nilai halaman ini ada pada
 * melihat node berkedip saat run masuk — dan itu mensyaratkan kanvas dan log
 * terlihat bersamaan. Karena tinggi layar terbatas, palette, inspector, dan dok
 * semuanya bisa dilipat: yang sedang tidak dipakai mengembalikan ruangnya ke
 * kanvas alih-alih menyisakan kotak kosong.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type DefaultEdgeOptions,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Blocks, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Sliders, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Panel } from "@/components/admin/ui";
import { Dock, type DockTab } from "./dock";
import { NodeCard, type StudioNode, type StudioNodeData } from "./node-card";
import { NodeInspector } from "./node-inspector";
import { Palette } from "./palette";
import { Toolbar, type SaveState } from "./toolbar";
import { useAgentStream } from "./use-agent-stream";
import {
  ACCENTS,
  EDGE_COLOR,
  sameGraph,
  type AccentName,
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

/**
 * Garis siku, bukan bezier, dan tanpa animasi.
 *
 * Graph ini disusun dalam baris dan kolom, dan lengkung bezier melintasinya
 * dengan sudut yang tidak pernah sejajar apa pun — pada dua belas node hasilnya
 * terbaca sebagai kusut. Animasi dimatikan karena arah aliran sudah dinyatakan
 * panah, dan garis putus-putus yang bergerak terus-menerus bersaing dengan satu
 * hal yang memang harus menarik mata di sini: node yang sedang berjalan.
 */
const EDGE_OPTIONS: DefaultEdgeOptions = {
  type: "smoothstep",
  animated: false,
  style: { stroke: EDGE_COLOR, strokeWidth: 1.8 },
  markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: EDGE_COLOR },
};

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

  const [paletteOpen, setPaletteOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [dockOpen, setDockOpen] = useState(false);
  const [dockTab, setDockTab] = useState<DockTab>("runs");

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

  /**
   * Memilih node berarti ingin mengaturnya, jadi panelnya ikut terbuka.
   *
   * Dipasang di sini, bukan di effect yang mengawasi `selectedId`: membuka
   * inspector adalah reaksi terhadap satu tindakan admin, bukan penyelarasan
   * dengan keadaan di luar React. Sebagai effect, ia juga akan menyalak kembali
   * pada seleksi yang datang dari mana pun — termasuk saat panel baru saja
   * ditutup manual.
   */
  const selectNode = useCallback((id: string) => {
    setSelectedId(id);
    setInspectorOpen(true);
  }, []);

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
      selectNode(id);
    },
    [definitions, markTouched, nodes, selectNode, setNodes],
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
  // punya risiko — dan itu yang membuat daftar masalah di topbar tetap segar.
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

  const openTest = useCallback(() => {
    setDockTab("test");
    setDockOpen((prev) => (prev && dockTab === "test" ? false : true));
  }, [dockTab]);

  return (
    <div className="flex h-[calc(100svh-7rem)] min-h-[36rem] flex-col gap-3 sm:h-[calc(100svh-8rem)]">
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
        onOpenTest={openTest}
        testOpen={dockOpen && dockTab === "test"}
      />

      {/*
        Di bawah `lg`, palette dan inspector melayang di atas kanvas alih-alih
        ikut membagi lebar: pada layar sempit tiga kolom berarti kanvas tinggal
        selebar satu kartu node, yang membuat halamannya tidak bisa dipakai sama
        sekali. Markup-nya sama, hanya posisinya yang berganti.
      */}
      <div className="relative flex min-h-0 flex-1 gap-3">
        {paletteOpen && (
          <SidePanel side="left" title="Node" icon={Blocks} onClose={() => setPaletteOpen(false)}>
            <div className="px-2.5 py-3">
              <Palette catalogue={payload.catalogue} used={usedKinds} onAdd={(kind) => addNode(kind)} />
            </div>
          </SidePanel>
        )}

        <Panel className="relative min-w-0 flex-1 overflow-hidden bg-ink/40">
          <div
            className="size-full"
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
              onNodeClick={(_, node) => selectNode(node.id)}
              onPaneClick={() => setSelectedId(null)}
              fitView
              fitViewOptions={{ padding: 0.22, maxZoom: 1 }}
              minZoom={0.3}
              maxZoom={1.6}
              // Node ditempelkan ke kisi yang sama dengan dot grid di latar,
              // supaya susunan hasil geser manual tetap sejajar tanpa dirapikan.
              snapToGrid
              snapGrid={[20, 20]}
              proOptions={{ hideAttribution: false }}
              defaultEdgeOptions={EDGE_OPTIONS}
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
                nodeColor={(node) => ACCENTS[(node.data as StudioNodeData).accent].swatch}
                nodeStrokeWidth={0}
              />
            </ReactFlow>
          </div>

          {/* Chrome kanvas: melayang di atas React Flow, tidak mengambil tingginya. */}
          <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2">
            <CanvasButton
              onClick={() => setPaletteOpen((prev) => !prev)}
              label={paletteOpen ? "Sembunyikan daftar node" : "Tampilkan daftar node"}
            >
              {paletteOpen ? (
                <PanelLeftClose aria-hidden className="size-4" strokeWidth={2.2} />
              ) : (
                <PanelLeftOpen aria-hidden className="size-4" strokeWidth={2.2} />
              )}
            </CanvasButton>

            <div className="pointer-events-auto hidden items-center gap-2.5 rounded-xl border border-ink-border bg-ink-soft/90 px-2.5 py-1.5 backdrop-blur-sm md:flex">
              {(Object.keys(ACCENTS) as AccentName[]).map((key) => (
                <span key={key} className="flex items-center gap-1 text-[10px] font-bold text-ink-muted">
                  <span
                    aria-hidden
                    className="size-1.5 rounded-full"
                    style={{ background: ACCENTS[key].swatch }}
                  />
                  {ACCENTS[key].label}
                </span>
              ))}
            </div>
          </div>

          <div className="absolute right-3 top-3 z-10">
            <CanvasButton
              onClick={() => setInspectorOpen((prev) => !prev)}
              label={inspectorOpen ? "Sembunyikan pengaturan node" : "Tampilkan pengaturan node"}
            >
              {inspectorOpen ? (
                <PanelRightClose aria-hidden className="size-4" strokeWidth={2.2} />
              ) : (
                <PanelRightOpen aria-hidden className="size-4" strokeWidth={2.2} />
              )}
            </CanvasButton>
          </div>

          {nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center px-6">
              <div className="max-w-sm text-center">
                <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-ink text-ink-muted">
                  <Blocks aria-hidden className="size-5" strokeWidth={1.8} />
                </span>
                <p className="mt-4 text-sm font-semibold text-ink-foreground">Kanvas masih kosong</p>
                <p className="mt-1.5 text-sm text-ink-muted">
                  Tarik node dari daftar di kiri, atau muat susunan bawaan lewat menu di kanan atas
                  topbar.
                </p>
              </div>
            </div>
          )}
        </Panel>

        {inspectorOpen && (
          <SidePanel
            side="right"
            title="Pengaturan node"
            icon={Sliders}
            onClose={() => setInspectorOpen(false)}
          >
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
          </SidePanel>
        )}
      </div>

      <Dock
        open={dockOpen}
        tab={dockTab}
        onTabChange={(next) => {
          setDockTab(next);
          setDockOpen(true);
        }}
        onToggle={() => setDockOpen((prev) => !prev)}
        events={events}
        heartbeatRuns={heartbeatRuns}
        status={status}
        nodeLabels={nodeLabels}
        graph={graph}
      />
    </div>
  );
}

function SidePanel({
  side,
  title,
  hint,
  icon: Icon,
  onClose,
  children,
}: {
  side: "left" | "right";
  title: string;
  hint?: string;
  icon: typeof Blocks;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Panel
      className={cn(
        "absolute inset-y-0 z-20 flex flex-col overflow-hidden shadow-2xl shadow-black/40",
        "lg:relative lg:inset-y-auto lg:z-auto lg:shrink-0 lg:shadow-none",
        side === "left" ? "left-0 w-60" : "right-0 w-[19rem] lg:w-80",
      )}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-ink-border/70 px-3 py-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-ink text-brand-glow">
          <Icon aria-hidden className="size-3.5" strokeWidth={2.2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-bold text-ink-foreground">{title}</span>
          {hint && <span className="block truncate text-[10px] text-ink-muted">{hint}</span>}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Tutup panel ${title}`}
          className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-lg text-ink-muted outline-none transition-colors hover:bg-ink hover:text-ink-foreground focus-visible:ring-3 focus-visible:ring-brand-glow/40"
        >
          <X aria-hidden className="size-3.5" strokeWidth={2.4} />
        </button>
      </header>

      {/* Tanpa padding: isi panel ini punya rapatnya sendiri — inspector memberi
          jarak per grup field, palette per kelompok jalur. */}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </Panel>
  );
}

function CanvasButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="pointer-events-auto grid size-8 cursor-pointer place-items-center rounded-xl border border-ink-border bg-ink-soft/90 text-ink-muted outline-none backdrop-blur-sm transition-colors hover:text-ink-foreground focus-visible:ring-3 focus-visible:ring-brand-glow/40"
    >
      {children}
    </button>
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
    // Node wajib dikunci dari tombol Delete. Inspector sudah menolak menghapusnya,
    // tapi pintasan keyboard React Flow tidak lewat sana — tanpa ini, satu tekan
    // Delete bisa mencabut `llm.reasoner` dan membuat graph gagal publish.
    deletable: !definition.required,
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
