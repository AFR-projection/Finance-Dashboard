/**
 * Bentuk pipeline agent sebagai data.
 *
 * Node dan edge di sini adalah hal yang sama yang digambar admin di kanvas dan
 * yang dieksekusi runtime. Tidak ada terjemahan di antaranya — begitu ada dua
 * representasi, keduanya pasti berbeda pendapat cepat atau lambat.
 */

export const AGENT_TRACKS = ["chat", "heartbeat"] as const;
export type AgentTrack = (typeof AGENT_TRACKS)[number];

export const AGENT_NODE_KINDS = [
  // Jalur chat
  "trigger.chat",
  "context.loader",
  "memory.conversation",
  "policy.intent",
  "llm.reasoner",
  "tools.executor",
  "guard.grounding",
  "dispatch.reply",
  // Jalur heartbeat
  "trigger.schedule",
  "signals.collect",
  "llm.analyst",
  "dispatch.notify",
] as const;

export type AgentNodeKind = (typeof AGENT_NODE_KINDS)[number];

export type AgentNode = {
  id: string;
  kind: AgentNodeKind;
  /** Nama yang diberi admin. Kosong berarti pakai label bawaan dari katalog. */
  label?: string;
  /**
   * Node yang dimatikan tetap tergambar di kanvas tapi dilewati saat eksekusi.
   * Ini berbeda dari menghapusnya: admin bisa mematikan guard sebentar untuk
   * menguji sesuatu tanpa kehilangan config-nya.
   */
  enabled: boolean;
  position: { x: number; y: number };
  config: Record<string, unknown>;
};

export type AgentEdge = {
  id: string;
  source: string;
  target: string;
};

export type AgentGraphData = {
  nodes: AgentNode[];
  edges: AgentEdge[];
};

/**
 * Deskripsi satu kolom config.
 *
 * Dipakai dua arah: inspector di kanvas merender form dari daftar ini, dan
 * engine membaca nilainya lewat kunci yang sama. Menambah knob baru berarti
 * menambah satu entri di sini, bukan menyunting form dan runtime terpisah.
 */
export type ConfigField =
  | { key: string; label: string; type: "toggle"; default: boolean; hint?: string }
  | {
      key: string;
      label: string;
      type: "number";
      default: number;
      min: number;
      max: number;
      step?: number;
      hint?: string;
    }
  | { key: string; label: string; type: "text"; default: string; placeholder?: string; hint?: string }
  | {
      key: string;
      label: string;
      type: "multiselect";
      default: string[];
      options: Array<{ value: string; label: string; description?: string }>;
      hint?: string;
    };

export type NodeDefinition = {
  kind: AgentNodeKind;
  track: AgentTrack;
  label: string;
  /** Satu kalimat: apa yang benar-benar dilakukan node ini di runtime. */
  description: string;
  /** Nama ikon lucide, dipakai kanvas. */
  icon: string;
  /** Warna aksen semantik untuk kartu node. */
  accent: "trigger" | "context" | "reason" | "act" | "guard" | "output";
  hasInput: boolean;
  hasOutput: boolean;
  /** Node yang tanpanya jalur ini tidak berarti — tidak bisa dihapus dari kanvas. */
  required: boolean;
  /** Beberapa node hanya masuk akal satu per jalur (mis. trigger, LLM). */
  singleton: boolean;
  fields: ConfigField[];
};

/** Nilai default satu node, diturunkan dari katalog supaya tidak ada dua sumber. */
export function defaultConfigFor(definition: NodeDefinition): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  for (const field of definition.fields) {
    config[field.key] = Array.isArray(field.default) ? [...field.default] : field.default;
  }
  return config;
}
