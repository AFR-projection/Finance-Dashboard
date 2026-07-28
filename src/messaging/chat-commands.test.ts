import { describe, expect, it } from "vitest";
import { AGENT_COMMAND_LIST, resolveChatCommand } from "./chat-commands";

describe("resolveChatCommand", () => {
  it("maps a slash command to an agent prompt", () => {
    expect(resolveChatCommand("/balance")).toEqual({
      kind: "agent",
      prompt: "Berapa ringkasan saldo, income, dan expense bulan ini?",
    });
  });

  it("answers help without calling the agent", () => {
    const result = resolveChatCommand("/help");
    expect(result?.kind).toBe("text");
  });

  it("ignores a bare word so it can still be a wallet reply", () => {
    expect(resolveChatCommand("balance")).toBeNull();
    expect(resolveChatCommand("budget")).toBeNull();
    expect(resolveChatCommand("BCA")).toBeNull();
  });

  it("ignores commands that carry an argument", () => {
    expect(resolveChatCommand("/link ABC123")).toBeNull();
  });

  it("ignores an unknown command", () => {
    expect(resolveChatCommand("/whatever")).toBeNull();
  });

  it("keeps every listed command resolvable", () => {
    for (const { command, prompt } of AGENT_COMMAND_LIST) {
      expect(resolveChatCommand(`/${command}`)).toEqual({ kind: "agent", prompt });
    }
  });
});
