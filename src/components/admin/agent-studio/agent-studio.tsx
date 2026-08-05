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
 * Keputusan kedua menyangkut tata letak: file ini sekarang HANYA kanvas.
 * Sebelumnya ia juga menanggung rail metrik dan dok tiga tab, dan bertiga mereka
 * berebut satu tinggi viewport sampai tidak ada satu pun yang terlihat utuh —
 * kanvas, yang paling butuh ruang, justru yang paling banyak kehilangan. Metrik,
 * log eksekusi, siklus proaktif, uji coba, dan riwayat versi kini halaman
 * sendiri-sendiri. Yang tersisa di sini cuma tiga: palette, kanvas, inspector —
 * dan dua di antaranya bisa dilipat untuk mengembalikan lebarnya ke kanvas.
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
import {
  Blocks,
  Eye,
  EyeOff,
  Info,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Sliders,
  Trash2,
  TriangleAlert,
  Unlink,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Panel } from "@/components/admin/ui";
import { CanvasMenu, CanvasMenuItem } from "./canvas-menu";
import { EdgeActionsContext, LinkEdge, type EdgeActions } from "./edge-link";
import { diffGraphs, type GraphDiff } from "./graph-diff";
import { autoLayout, COLUMN_GAP, ROW_GAP } from "./layout";
import { NodeCard, type StudioNode, type StudioNodeData } from "./node-card";
import { NodeInspector } from "./node-inspector";
import { Palette, type PaletteNode } from "./palette";
import { PublishDialog } from "./publish-dialog";
import { Toolbar, type SaveState } from "./toolbar";
import { useAgentStream } from "./use-agent-stream";
import { useGraphHistory } from "./use-graph-history";
import {
  ACCENTS,
  EDGE_COLOR,
  iconFor,
  sameGraph,
  type AccentName,
  type AgentEdge,
  type AgentGraphData,
  type AgentNode,
  type AgentNodeKind,
  type AgentTelemetryEvent,
  type GraphIssue,
  type NodeDefinition,
  type StudioPayload,
} from "./shared";

const NODE_TYPES = { studio: NodeCard };
const EDGE_TYPES = { link: LinkEdge };

/** Lama pesan kanvas bertahan sebelum menghilang sendiri. */
const NOTICE_MS = 5_000;

type Notice = { tone: "info" | "warn"; text: string };

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
  // Tipe sendiri, bukan `smoothstep` bawaan: bentuk garisnya sama persis, tapi
  // titik tengahnya membawa tombol sisip dan putus.
  type: "link",
  animated: false,
  style: { stroke: EDGE_COLOR, strokeWidth: 1.8 },
  markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: EDGE_COLOR },
};

/** Sama alasannya dengan `EDGE_COLOR`: `fill` marker SVG tidak mewarisi custom property. */
const ACTIVE_EDGE_COLOR = "oklch(0.78 0.12 175)";

export function AgentStudio(props: {
  payload: StudioPayload;
  initialEvents: AgentTelemetryEvent[];
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
}: {
  payload: StudioPayload;
  initialEvents: AgentTelemetryEvent[];
}) {
  const router = useRouter();
  const { screenToFlowPosition, getNode, setCenter, getZoom } = useReactFlow();

  const definitions = useMemo(
    () => new Map(payload.catalogue.map((definition) => [definition.kind, definition])),
    [payload.catalogue],
  );

  /**
   * Urutan tahap, dibaca dari urutan katalog.
   *
   * Katalog memang disusun mengikuti aliran tiap jalur — pemicu di atas,
   * pengirim di bawah — dan `validateGraph` memakai peringkat yang sama untuk
   * menolak edge yang mundur. Angka inilah yang membuat "pasang node" bisa
   * menyambungkan dirinya sendiri di tempat yang benar alih-alih menjatuhkan
   * kotak yatim di pojok kanvas. `catalogue-order.test.ts` yang menjaga kedua
   * urutan itu tidak diam-diam berpisah.
   */
  const orderOf = useMemo(
    () => new Map(payload.catalogue.map((definition, index) => [definition.kind, index])),
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
  const [published, setPublished] = useState(payload.published);

  const [paletteOpen, setPaletteOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);

  /**
   * Peta panas mati secara bawaan.
   *
   * Angka kesehatan menambah dua baris ke tiap kartu, dan saat yang dikerjakan
   * admin adalah menyusun ulang graph, dua baris itu murni kebisingan. Dinyalakan
   * ketika pertanyaannya berganti dari "bagaimana ini dirangkai" jadi "di mana
   * yang lambat".
   */
  const [healthOn, setHealthOn] = useState(false);
  const [pending, setPending] = useState<GraphDiff | null>(null);

  /**
   * Kanvas yang bicara.
   *
   * Ini yang paling terasa hilang di versi sebelumnya: menambah node yang sudah
   * ada, atau menghapus node wajib, sama-sama berakhir sebagai `return` diam.
   * Dari kursi admin, tidak ada bedanya antara "ditolak karena alasan tertentu"
   * dan "tombolnya rusak" — dan tebakan yang wajar adalah yang kedua.
   */
  const [notice, setNotice] = useState<Notice | null>(null);
  const [nodeMenu, setNodeMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [insertMenu, setInsertMenu] = useState<{ edgeId: string; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const { nodeStates, nodeHealth, status } = useAgentStream(initialEvents);

  const graph = useMemo<AgentGraphData>(() => toGraphData(nodes, edges), [nodes, edges]);
  const dirty = useMemo(() => !sameGraph(graph, published), [graph, published]);

  const invalidIds = useMemo(
    () => new Set(issues.filter((issue) => issue.level === "error" && issue.nodeId).map((i) => i.nodeId!)),
    [issues],
  );

  /**
   * Penyebut lebar batang kesehatan: rata-rata node terlambat di graph.
   *
   * Diambil dari seluruh node, bukan per kartu, supaya batang-batangnya bisa
   * dibandingkan satu sama lain. Skala per kartu akan membuat setiap node tampak
   * memenuhi batangnya sendiri — dan dengan begitu tidak memberi tahu apa pun.
   */
  const healthPeak = useMemo(
    () => Math.max(0, ...Object.values(nodeHealth).map((entry) => entry.avgMs)),
    [nodeHealth],
  );

  // Status live, penanda error, dan angka kesehatan ditulis balik ke `data` node —
  // React Flow hanya merender ulang kartu kalau objek datanya berganti, jadi
  // perbandingan di bawah yang menjaga kanvas tidak dirender ulang tiap 2 detik.
  useEffect(() => {
    setNodes((current) =>
      current.map((node) => {
        const run = nodeStates[node.id];
        const invalid = invalidIds.has(node.id);
        const health = healthOn ? nodeHealth[node.id] : undefined;
        const peak = healthOn ? healthPeak : undefined;
        if (
          node.data.run === run &&
          node.data.invalid === invalid &&
          node.data.health === health &&
          node.data.healthPeak === peak
        ) {
          return node;
        }
        return { ...node, data: { ...node.data, run, invalid, health, healthPeak: peak } };
      }),
    );
  }, [nodeStates, invalidIds, nodeHealth, healthPeak, healthOn, setNodes]);

  /**
   * Garis yang ikut menyala saat run lewat.
   *
   * Sebuah edge dianggap aktif kalau kedua ujungnya tersentuh run terakhir —
   * bukan hanya sumbernya. Node terakhir yang selesai punya edge keluar menuju
   * node yang belum tentu dijalankan (cabang yang dilewati, atau loop yang sudah
   * berhenti), dan menyalakannya akan menggambar aliran yang tidak pernah terjadi.
   */
  useEffect(() => {
    setEdges((current) =>
      current.map((edge) => {
        const active = Boolean(nodeStates[edge.source] && nodeStates[edge.target]);
        if (Boolean(edge.animated) === active) return edge;
        return {
          ...edge,
          animated: active,
          style: active
            ? { stroke: "var(--brand-glow)", strokeWidth: 2.2 }
            : EDGE_OPTIONS.style,
          markerEnd: active
            ? { type: MarkerType.ArrowClosed, width: 16, height: 16, color: ACTIVE_EDGE_COLOR }
            : EDGE_OPTIONS.markerEnd,
        };
      }),
    );
  }, [nodeStates, setEdges]);

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
        addEdge({ ...connection, ...linkEdge(connection.source, connection.target) }, current),
      );
    },
    [markTouched, setEdges],
  );

  /** Memilih node sekaligus membawanya ke tengah layar. */
  const focusNode = useCallback(
    (id: string) => {
      selectNode(id);
      const node = getNode(id);
      if (!node) return;
      // Titik tengah kartu, bukan sudut kirinya: memusatkan sudut membuat node
      // berhenti melenceng ke kanan-bawah dari tengah layar.
      const width = node.measured?.width ?? 232;
      const height = node.measured?.height ?? 120;
      setCenter(node.position.x + width / 2, node.position.y + height / 2, {
        // Zoom tidak pernah dikecilkan: admin yang sedang memperbesar satu sudut
        // graph tidak meminta pemandangan yang lebih luas, ia meminta node ini.
        zoom: Math.max(getZoom(), 0.75),
        duration: 320,
      });
    },
    [getNode, getZoom, selectNode, setCenter],
  );

  /**
   * Memasang node = menyisipkannya ke rantai, bukan menjatuhkannya di pojok.
   *
   * Node yatim tidak dieksekusi runtime, dan `validateGraph` hanya
   * memperingatkannya — jadi cara lama ("node muncul di kanvas, silakan tarik
   * sendiri kabelnya") menghasilkan graph yang terlihat bertambah tapi
   * berperilaku sama persis. Di sini tetangga terdekat dicari dari urutan tahap,
   * lalu kabel lama dipotong dan dua kabel baru dipasang di tempatnya.
   *
   * `position` diisi hanya kalau admin menjatuhkan node dengan tangan. Saat itu
   * terjadi, kolom di kanan TIDAK digeser: node harus mendarat persis di tempat
   * ia dilepas, apa pun akibatnya pada kerapian.
   */
  const insertNode = useCallback(
    (
      kind: AgentNodeKind,
      options?: { position?: { x: number; y: number }; between?: [string, string] },
    ) => {
      const definition = definitions.get(kind);
      if (!definition) {
        setNotice({ tone: "warn", text: `Tipe node "${kind}" tidak dikenal versi kode ini.` });
        return;
      }

      const existing = nodes.find((node) => node.data.kind === kind);
      if (definition.singleton && existing) {
        setNotice({
          tone: "warn",
          text: `${definition.label} sudah terpasang — tiap tahap hanya boleh satu per jalur. Node-nya saya bawa ke tengah layar.`,
        });
        focusNode(existing.id);
        return;
      }

      const track = definition.track;
      const rank = orderOf.get(kind) ?? 0;
      const sameTrack = nodes.filter((node) => definitions.get(node.data.kind)?.track === track);

      let pred: StudioNode | null = null;
      let succ: StudioNode | null = null;
      if (options?.between) {
        pred = sameTrack.find((node) => node.id === options.between![0]) ?? null;
        succ = sameTrack.find((node) => node.id === options.between![1]) ?? null;
      } else {
        for (const node of sameTrack) {
          const other = orderOf.get(node.data.kind) ?? 0;
          if (other < rank && (!pred || other > (orderOf.get(pred.data.kind) ?? 0))) pred = node;
          if (other > rank && (!succ || other < (orderOf.get(succ.data.kind) ?? 0))) succ = node;
        }
      }

      /*
       * Eksekutor tool adalah satu-satunya siklus yang sah di graph ini: model
       * memanggil tool, hasilnya masuk lagi ke model. Menyisipkannya sebagai
       * mata rantai lurus (penalaran → tool → penjaga) akan lolos validasi tapi
       * memutus lingkaran yang justru jadi alasan node ini ada. Jadi ia
       * dipasang di bawah penalaran dengan dua kabel bolak-balik, persis seperti
       * susunan bawaan.
       */
      const toolLoop = kind === "tools.executor" && pred?.data.kind === "llm.reasoner";

      let position = options?.position ?? null;
      const shiftFromX = !position && !toolLoop && succ ? succ.position.x : null;
      if (!position) {
        if (toolLoop && pred) position = { x: pred.position.x, y: pred.position.y + ROW_GAP };
        else if (succ) position = { ...succ.position };
        else if (pred) position = { x: pred.position.x + COLUMN_GAP, y: pred.position.y };
        else if (sameTrack.length > 0) {
          position = { x: 40, y: Math.max(...sameTrack.map((node) => node.position.y)) + ROW_GAP };
        } else position = { x: 40, y: 40 };
      }

      markTouched();
      const id = `${kind.replace(".", "-")}-${Math.random().toString(36).slice(2, 7)}`;
      const at = position;
      const predId = pred?.id ?? null;
      const succId = toolLoop ? null : succ?.id ?? null;

      setNodes((current) => {
        const shifted =
          shiftFromX === null
            ? current
            : current.map((node) =>
                node.id !== predId &&
                definitions.get(node.data.kind)?.track === track &&
                node.position.x >= shiftFromX
                  ? { ...node, position: { ...node.position, x: node.position.x + COLUMN_GAP } }
                  : node,
              );
        return [...shifted, toFlowNode(newAgentNode(id, definition, at), definition)];
      });

      setEdges((current) => {
        const kept =
          predId && succId
            ? current.filter((edge) => !(edge.source === predId && edge.target === succId))
            : current;
        const added: Edge[] = [];
        if (predId) added.push(linkEdge(predId, id));
        if (succId) added.push(linkEdge(id, succId));
        if (toolLoop && predId) added.push(linkEdge(id, predId));
        return [...kept, ...added.filter((edge) => !kept.some((old) => old.id === edge.id))];
      });

      selectNode(id);
      setNotice({
        tone: "info",
        text:
          predId || succId
            ? `${definition.label} dipasang dan disambungkan otomatis.`
            : `${definition.label} dipasang. Belum ada kabel — sambungkan ke jalurnya supaya ikut dieksekusi.`,
      });
    },
    [definitions, focusNode, markTouched, nodes, orderOf, selectNode, setEdges, setNodes],
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

  const setNodeEnabled = useCallback(
    (id: string, enabled: boolean) => {
      const node = nodes.find((entry) => entry.id === id);
      if (!node) return;
      if (!enabled && node.data.required) {
        setNotice({
          tone: "warn",
          text: `${node.data.label} wajib aktif — jalurnya gagal publish tanpa tahap ini.`,
        });
        return;
      }
      markTouched();
      setNodes((current) =>
        current.map((entry) => (entry.id === id ? { ...entry, data: { ...entry.data, enabled } } : entry)),
      );
    },
    [markTouched, nodes, setNodes],
  );

  /**
   * Mencabut node sekaligus menyambung kembali rantainya.
   *
   * Menghapus satu tahap di tengah jalur meninggalkan semua yang di belakangnya
   * yatim — dan node yatim tidak pernah dieksekusi. Jadi kalau node ini memang
   * duduk lurus di antara satu pendahulu dan satu penerus, keduanya disambungkan
   * langsung. Kasus tool loop dikecualikan: pendahulu dan penerusnya node yang
   * sama, dan menyambungnya akan melahirkan kabel dari sebuah node ke dirinya
   * sendiri.
   */
  const removeNode = useCallback(
    (id: string) => {
      const node = nodes.find((entry) => entry.id === id);
      if (!node) return;
      if (node.data.required) {
        setNotice({
          tone: "warn",
          text: `${node.data.label} tidak bisa dicabut — jalurnya wajib punya tahap ini untuk bisa dipublish.`,
        });
        return;
      }

      markTouched();
      setEdges((current) => {
        const incoming = current.filter((edge) => edge.target === id && edge.source !== id);
        const outgoing = current.filter((edge) => edge.source === id && edge.target !== id);
        const rest = current.filter((edge) => edge.source !== id && edge.target !== id);
        if (
          incoming.length === 1 &&
          outgoing.length === 1 &&
          incoming[0].source !== outgoing[0].target
        ) {
          const healed = linkEdge(incoming[0].source, outgoing[0].target);
          if (!rest.some((edge) => edge.id === healed.id)) return [...rest, healed];
        }
        return rest;
      });
      setNodes((current) => current.filter((entry) => entry.id !== id));
      setSelectedId((current) => (current === id ? null : current));
      setNotice({ tone: "info", text: `${node.data.label} dicabut dari kanvas.` });
    },
    [markTouched, nodes, setEdges, setNodes],
  );

  const detachNode = useCallback(
    (id: string) => {
      markTouched();
      setEdges((current) => current.filter((edge) => edge.source !== id && edge.target !== id));
      setNotice({ tone: "info", text: "Semua koneksi node itu dilepas." });
    },
    [markTouched, setEdges],
  );

  /**
   * Satu-satunya penjaga tombol Delete.
   *
   * Sebelumnya node wajib dikunci lewat `deletable: false`, dan React Flow
   * membuang node semacam itu SEBELUM hook ini dipanggil — artinya tekanan
   * Delete pada node wajib tidak menghasilkan apa pun, termasuk penjelasan.
   * Sekarang semua node bisa dihapus dari sisi React Flow, dan di sinilah yang
   * wajib disaring keluar beserta alasannya.
   */
  const onBeforeDelete = useCallback(
    async ({ nodes: doomed, edges: doomedEdges }: { nodes: StudioNode[]; edges: Edge[] }) => {
      const blocked = doomed.filter((node) => node.data.required);
      if (blocked.length === 0) return { nodes: doomed, edges: doomedEdges };

      setNotice({
        tone: "warn",
        text: `${blocked.map((node) => node.data.label).join(", ")} wajib ada dan tidak ikut dihapus.`,
      });
      const blockedIds = new Set(blocked.map((node) => node.id));
      return {
        nodes: doomed.filter((node) => !node.data.required),
        // Kabel milik node yang batal dihapus ikut diselamatkan; kalau tidak,
        // node-nya bertahan tapi berdiri terputus dari jalurnya.
        edges: doomedEdges.filter(
          (edge) => !blockedIds.has(edge.source) && !blockedIds.has(edge.target),
        ),
      };
    },
    [],
  );

  const loadGraph = useCallback(
    (next: AgentGraphData) => {
      setNodes(toFlowNodes(next, definitions));
      setEdges(toFlowEdges(next));
      setSelectedId(null);
    },
    [definitions, setEdges, setNodes],
  );

  const history = useGraphHistory(graph, loadGraph);

  /**
   * Rapikan susunan.
   *
   * Ditandai tersentuh supaya hasilnya ikut tersimpan ke draft: kalau tidak,
   * posisi baru hanya hidup di memori tab ini dan hilang saat halaman disegarkan
   * — dan admin sudah melihatnya rapi, jadi ia tidak akan menyimpannya sendiri.
   */
  const tidy = useCallback(() => {
    markTouched();
    loadGraph(autoLayout(graph, definitions));
  }, [definitions, graph, loadGraph, markTouched]);

  /* ── Server ──────────────────────────────────────────────────────────────── */

  const applyPayload = useCallback(
    (data: StudioPayload) => {
      setVersion(data.version);
      setPublishedAt(data.publishedAt);
      setPublished(data.published);
      setIssues(data.issues);
      const next = data.draft ?? data.published;
      loadGraph(next);
      // Riwayat dibuang saat graph datang dari server: langkah undo yang mengarah
      // ke keadaan sebelum publish/rollback akan mengembalikan susunan yang sudah
      // tidak punya hubungan dengan versi yang sekarang aktif.
      history.reset(next);
      touched.current = false;
    },
    [history, loadGraph],
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

  /**
   * Publish dibuka lewat dialog diff, bukan `confirm`.
   *
   * Yang ditanyakan `confirm` sebetulnya "apakah kamu ingat apa yang kamu ubah
   * setengah jam terakhir" — pertanyaan yang tidak bisa dijawab dengan jujur oleh
   * siapa pun, dan satu-satunya tombol yang tersedia adalah OK. Diff menjawabnya
   * untuk admin; kalau daftarnya berisi baris yang tidak ia kenali, itu justru
   * sinyal paling berharga di seluruh halaman ini.
   */
  const requestPublish = useCallback(() => {
    setPending(diffGraphs(published, graph, definitions));
  }, [definitions, graph, published]);

  const publish = useCallback(
    async (note: string) => {
      const done = await post(
        { action: "publish", graph, note: note.trim() || undefined },
        "Graph dipublish. Runtime sudah memakainya.",
      );
      setPending(null);
      if (done) router.refresh();
    },
    [graph, post, router],
  );

  const discardDraft = useCallback(async () => {
    if (!window.confirm("Buang semua perubahan yang belum dipublish?")) return;
    await post({ action: "discard-draft" }, "Draft dibuang.");
  }, [post]);

  /* ── Render ──────────────────────────────────────────────────────────────── */

  /**
   * Katalog ⇄ kanvas, dilihat dari sisi katalog.
   *
   * Daftar node butuh tahu bukan cuma "kind ini terpakai", tapi node mana
   * persisnya — tanpa itu ia tidak bisa menawarkan matikan, cabut, atau lompat
   * ke node-nya, dan kembali jadi daftar yang cuma bisa dipandangi.
   */
  const installed = useMemo(() => {
    const map = new Map<AgentNodeKind, PaletteNode>();
    for (const node of nodes) {
      if (!map.has(node.data.kind)) map.set(node.data.kind, { id: node.id, enabled: node.data.enabled });
    }
    return map;
  }, [nodes]);

  const edgeActions = useMemo<EdgeActions>(
    () => ({
      onInsert: (edgeId, at) => setInsertMenu({ edgeId, x: at.x, y: at.y }),
      onRemove: (edgeId) => {
        markTouched();
        setEdges((current) => current.filter((edge) => edge.id !== edgeId));
      },
    }),
    [markTouched, setEdges],
  );

  /**
   * Tahap yang boleh disisipkan di sebuah koneksi.
   *
   * Hanya yang peringkatnya benar-benar jatuh di antara kedua ujungnya. Menawarkan
   * penjaga di antara pemicu dan riwayat percakapan berarti menawarkan graph yang
   * langsung ditolak `validateGraph` — dan menu yang isinya tidak bisa dipakai
   * lebih buruk daripada menu yang pendek.
   */
  const insertCandidates = useMemo(() => {
    if (!insertMenu) return [];
    const edge = edges.find((entry) => entry.id === insertMenu.edgeId);
    if (!edge) return [];
    const source = nodes.find((node) => node.id === edge.source);
    const target = nodes.find((node) => node.id === edge.target);
    if (!source || !target) return [];
    const low = orderOf.get(source.data.kind) ?? 0;
    const high = orderOf.get(target.data.kind) ?? 0;
    const track = definitions.get(source.data.kind)?.track;
    return payload.catalogue.filter((definition) => {
      const rank = orderOf.get(definition.kind) ?? 0;
      return (
        definition.track === track && rank > low && rank < high && !installed.has(definition.kind)
      );
    });
  }, [definitions, edges, insertMenu, installed, nodes, orderOf, payload.catalogue]);

  const menuNode = useMemo(
    () => (nodeMenu ? nodes.find((node) => node.id === nodeMenu.id) ?? null : null),
    [nodeMenu, nodes],
  );

  const selectedIssues = useMemo(
    () => issues.filter((issue) => issue.nodeId === selectedId).map((issue) => issue.message),
    [issues, selectedId],
  );

  /**
   * Uji coba pindah ke halamannya sendiri, jadi tombolnya harus menyimpan dulu.
   *
   * Halaman itu memuat draft dari server, bukan dari memori tab ini — tanpa
   * simpan, admin akan menguji susunan yang lama sambil melihat susunan yang baru
   * di kanvas, dan hasilnya justru meyakinkan tentang hal yang salah.
   */
  const goTest = useCallback(async () => {
    if (touched.current || dirty) await saveDraft(true);
    router.push("/agent/uji-coba");
  }, [dirty, router, saveDraft]);

  const hasErrors = useMemo(() => issues.some((issue) => issue.level === "error"), [issues]);

  /**
   * Pintasan keyboard.
   *
   * Dipasang di `window` dan bukan pada wrapper: React Flow menyerap fokus ke
   * dalam kanvasnya sendiri, jadi handler pada div pembungkus tidak akan pernah
   * kebagian tombol saat admin baru saja menggeser node. Penyaring di baris
   * pertama yang menjaga Ctrl+Z tetap berarti "urungkan ketikan" ketika kursor
   * sedang berada di field inspector.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? "")) {
        return;
      }
      if (!event.ctrlKey && !event.metaKey) return;

      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        void saveDraft();
      } else if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) history.redo();
        else history.undo();
      } else if (key === "y") {
        event.preventDefault();
        history.redo();
      } else if (event.shiftKey && key === "l") {
        event.preventDefault();
        tidy();
      } else if (event.shiftKey && key === "h") {
        event.preventDefault();
        setHealthOn((prev) => !prev);
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (!hasErrors && state.kind !== "busy") requestPublish();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasErrors, history, requestPublish, saveDraft, state.kind, tidy]);

  return (
    /*
     * Tinggi dihitung, bukan dibiarkan mengalir: kanvas harus mengisi sisa layar
     * persis, dan React Flow butuh tinggi yang pasti dari induknya — `flex-1` di
     * dalam wadah yang tingginya auto akan menghasilkan kanvas setinggi nol.
     * Yang dikurangi: 4rem topbar panel, 3rem padding `main`, dan ~4.5rem baris
     * identitas plus tab seksi ini. `min-h` menjaganya tetap terpakai di layar
     * pendek — di bawah 32rem, satu kartu node saja sudah tidak muat.
     */
    <div className="flex h-[calc(100svh-11.5rem)] min-h-[32rem] flex-col gap-3 sm:h-[calc(100svh-12.5rem)]">
      <Toolbar
        version={version}
        publishedAt={publishedAt}
        dirty={dirty}
        issues={issues}
        state={state}
        onSaveDraft={() => void saveDraft()}
        onDiscardDraft={() => void discardDraft()}
        onPublish={requestPublish}
        onReset={() => {
          markTouched();
          loadGraph(payload.defaultGraph);
        }}
        onTest={() => void goTest()}
        live={status === "live"}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={history.undo}
        onRedo={history.redo}
        onTidy={tidy}
        healthOn={healthOn}
        onToggleHealth={() => setHealthOn((prev) => !prev)}
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
              <Palette
                catalogue={payload.catalogue}
                installed={installed}
                onAdd={(kind) => insertNode(kind)}
                onFocus={focusNode}
                onToggle={setNodeEnabled}
                onRemove={removeNode}
              />
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
              insertNode(kind, {
                position: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
              });
            }}
          >
            {/* Tombol sisip/putus di tiap koneksi mengambil aksinya dari sini. */}
            <EdgeActionsContext.Provider value={edgeActions}>
            <ReactFlow<StudioNode>
              nodes={nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              edgeTypes={EDGE_TYPES}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={(_, node) => selectNode(node.id)}
              onNodeContextMenu={(event, node) => {
                event.preventDefault();
                selectNode(node.id);
                setNodeMenu({ id: node.id, x: event.clientX, y: event.clientY });
              }}
              onPaneClick={() => setSelectedId(null)}
              onBeforeDelete={onBeforeDelete}
              // Delete dan Backspace sama-sama diterima: keduanya "hapus" di
              // kepala orang, dan mesin Windows tanpa tombol Delete bukan hal
              // langka. Kolom teks aman — React Flow mengabaikan tombol yang
              // datang dari input, textarea, dan elemen contenteditable.
              deleteKeyCode={["Delete", "Backspace"]}
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
            </EdgeActionsContext.Provider>
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

          {/*
            Status kanvas, bukan toast.
            Panel ini tidak pernah memakai toast, dan penolakan macam "node wajib
            tidak bisa dicabut" memang milik kanvas — bukan pesan global yang
            melayang di sudut layar jauh dari tempat kejadiannya.
          */}
          {notice && (
            <div
              role="status"
              aria-live="polite"
              className={cn(
                "absolute bottom-3 left-1/2 z-20 flex max-w-[min(28rem,calc(100%-1.5rem))] -translate-x-1/2 items-start gap-2 rounded-xl border px-3 py-2 backdrop-blur-sm",
                "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1",
                notice.tone === "warn"
                  ? "border-amber-400/35 bg-amber-500/12"
                  : "border-ink-border bg-ink-soft/95",
              )}
            >
              {notice.tone === "warn" ? (
                <TriangleAlert
                  aria-hidden
                  className="mt-px size-3.5 shrink-0 text-amber-300"
                  strokeWidth={2.2}
                />
              ) : (
                <Info aria-hidden className="mt-px size-3.5 shrink-0 text-ink-muted" strokeWidth={2.2} />
              )}
              <p className="text-[11px] leading-snug text-ink-foreground">{notice.text}</p>
              <button
                type="button"
                onClick={() => setNotice(null)}
                aria-label="Tutup pesan"
                className="-my-0.5 grid size-5 shrink-0 cursor-pointer place-items-center rounded-md text-ink-muted outline-none transition-colors hover:text-ink-foreground focus-visible:ring-3 focus-visible:ring-brand-glow/40"
              >
                <X aria-hidden className="size-3" strokeWidth={2.6} />
              </button>
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
              onDelete={() => selectedId && removeNode(selectedId)}
              onDetach={() => selectedId && detachNode(selectedId)}
            />
          </SidePanel>
        )}
      </div>

      {menuNode && nodeMenu && (
        <CanvasMenu
          x={nodeMenu.x}
          y={nodeMenu.y}
          label={menuNode.data.label}
          onClose={() => setNodeMenu(null)}
        >
          <CanvasMenuItem
            icon={Sliders}
            label="Buka pengaturan"
            hint="Knob node ini di panel kanan."
            onClick={() => {
              setInspectorOpen(true);
              setNodeMenu(null);
            }}
          />
          <CanvasMenuItem
            icon={menuNode.data.enabled ? EyeOff : Eye}
            label={menuNode.data.enabled ? "Matikan node" : "Nyalakan node"}
            hint={
              menuNode.data.enabled
                ? "Tetap tergambar, tapi dilewati saat eksekusi."
                : "Ikut dieksekusi lagi setelah dipublish."
            }
            disabledReason={
              menuNode.data.required ? "Node wajib — jalurnya tidak berarti tanpa tahap ini." : undefined
            }
            onClick={() => {
              setNodeEnabled(menuNode.id, !menuNode.data.enabled);
              setNodeMenu(null);
            }}
          />
          <CanvasMenuItem
            icon={Unlink}
            label="Lepas semua koneksi"
            hint="Node tetap ada, kabelnya dicabut."
            onClick={() => {
              detachNode(menuNode.id);
              setNodeMenu(null);
            }}
          />
          <CanvasMenuItem
            icon={Trash2}
            label="Cabut node"
            danger
            hint="Rantainya disambung kembali otomatis."
            disabledReason={
              menuNode.data.required ? "Node wajib — graph gagal publish tanpanya." : undefined
            }
            onClick={() => {
              removeNode(menuNode.id);
              setNodeMenu(null);
            }}
          />
        </CanvasMenu>
      )}

      {insertMenu && (
        <CanvasMenu
          x={insertMenu.x}
          y={insertMenu.y}
          label="Sisipkan di koneksi ini"
          onClose={() => setInsertMenu(null)}
        >
          {insertCandidates.length === 0 ? (
            <p className="px-3 py-2.5 text-[11px] leading-snug text-ink-muted">
              Tidak ada tahap yang bisa berdiri di antara kedua node ini — semuanya sudah terpasang,
              atau urutannya tidak mengizinkan.
            </p>
          ) : (
            insertCandidates.map((definition) => (
              <CanvasMenuItem
                key={definition.kind}
                icon={iconFor(definition.icon)}
                label={definition.label}
                hint={definition.description}
                onClick={() => {
                  const edge = edges.find((entry) => entry.id === insertMenu.edgeId);
                  setInsertMenu(null);
                  if (edge) insertNode(definition.kind, { between: [edge.source, edge.target] });
                }}
              />
            ))
          )}
        </CanvasMenu>
      )}

      {pending && (
        <PublishDialog
          diff={pending}
          version={version}
          busy={state.kind === "busy"}
          onCancel={() => setPending(null)}
          onConfirm={(note) => void publish(note)}
        />
      )}
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
    // Node wajib TIDAK dikunci lewat `deletable: false` di sini: React Flow
    // membuang node semacam itu sebelum `onBeforeDelete` dipanggil, jadi
    // penolakannya jadi senyap. Penjaganya ada di sana, lengkap dengan alasan.
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

/** Satu bentuk edge untuk semua jalur pembuatannya, supaya id-nya tidak berdua rupa. */
function linkEdge(source: string, target: string): Edge {
  return { id: `${source}->${target}`, source, target, type: "link" };
}

function toFlowEdges(graph: AgentGraphData): Edge[] {
  return graph.edges.map((edge) => ({ ...linkEdge(edge.source, edge.target), id: edge.id }));
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
