/**
 * Ranks stored memories against the current message instead of blindly taking
 * the newest ones, so a question about "kopi" surfaces the coffee preference
 * even if it was saved months ago. Deterministic and dependency-free — there is
 * no vector store in this deployment.
 */

type Memory = { key: string; content: string; updatedAt: Date };

const STOPWORDS = new Set([
  "yang", "untuk", "dari", "dengan", "pada", "atau", "juga", "saya", "aku", "kamu",
  "ini", "itu", "ada", "dan", "di", "ke", "the", "and", "for", "with", "apa",
  "bagaimana", "gimana", "berapa", "kalau", "kalo", "sudah", "udah", "belum",
  "bisa", "mau", "akan", "tolong", "coba", "aja", "saja", "nya", "dong", "sih",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

export function rankMemories(memories: Memory[], message: string, limit = 12): Memory[] {
  if (memories.length <= limit) return memories;

  const queryTokens = new Set(tokenize(message));
  const newest = memories.reduce((max, m) => Math.max(max, m.updatedAt.getTime()), 0);
  const oldest = memories.reduce((min, m) => Math.min(min, m.updatedAt.getTime()), newest);
  const span = Math.max(1, newest - oldest);

  return memories
    .map((memory) => {
      const tokens = tokenize(`${memory.key} ${memory.content}`);
      const overlap = tokens.filter((token) => queryTokens.has(token)).length;
      const recency = (memory.updatedAt.getTime() - oldest) / span;
      // Overlap dominates; recency only breaks ties between equally relevant rows.
      return { memory, score: overlap * 10 + recency };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.memory);
}
