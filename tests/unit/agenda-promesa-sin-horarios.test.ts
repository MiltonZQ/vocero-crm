import { describe, expect, it } from "vitest";
import {
  AGENDA_UNAVAILABLE_TEXT,
  agentActionSchema,
  degradeAction,
} from "@/server/ai/actions";
import { buildAgentSystemPrompt, JSON_REMINDER } from "@/server/ai/prompts";

/**
 * 015 — El agente prometía horarios que nunca llegaban.
 *
 * Caso real: el cliente mandó nombre y correo en un mensaje; el modelo eligió
 * `update_lead` (UNA acción por turno) y su reply decía "te comparto los
 * horarios disponibles:" sin que `offer_slots` corriera. La conversación se
 * quedó esperando una lista que no existía.
 */

const profile = {
  id: "agp_test",
  organizationId: "org_test",
  enabled: true,
  name: "Asistente",
  tone: null,
  instructions: null,
  escalationRules: null,
  greeting: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("offer_slots con nota", () => {
  it("acepta guardar datos del lead en el mismo turno en que ofrece", () => {
    const parsed = agentActionSchema(true).parse({
      action: "offer_slots",
      reply: "Perfecto Juan, estos son los horarios:",
      note: "Nombre: Juan Gomez, Email: juan@example.com",
    });
    expect(parsed).toMatchObject({ action: "offer_slots", note: expect.any(String) });
  });
});

describe("degradeAction en acciones de agenda", () => {
  it("offer_slots NO reenvía su intro, que anuncia una lista inexistente", () => {
    const out = degradeAction({
      action: "offer_slots",
      reply: "Te comparto los horarios disponibles:",
    });
    expect(out).toEqual({ action: "reply", text: AGENDA_UNAVAILABLE_TEXT });
  });

  it("book_slot NO reenvía una confirmación de una cita que no se creó", () => {
    const out = degradeAction({
      action: "book_slot",
      startUtc: "2026-10-05T14:00:00.000Z",
      reply: "¡Listo! Te agendé.",
    });
    expect(out).toEqual({ action: "reply", text: AGENDA_UNAVAILABLE_TEXT });
  });

  it("move_stage sigue degradando a su reply", () => {
    expect(
      degradeAction({ action: "move_stage", stage: "x", reply: "Hola" })
    ).toEqual({ action: "reply", text: "Hola" });
  });
});

describe("reglas del prompt con agenda", () => {
  const prompt = buildAgentSystemPrompt({
    profile,
    kb: [],
    stages: [],
    agenda: true,
  });

  it("prohíbe prometer horarios fuera de offer_slots", () => {
    expect(prompt).toContain("NUNCA prometas horarios en un reply, update_lead o move_stage");
  });

  it("prohíbe decir que la confirmación llega por correo", () => {
    expect(prompt).toContain("NUNCA digas que la confirmación");
  });

  it("sin agenda, no habla de horarios", () => {
    const sin = buildAgentSystemPrompt({ profile, kb: [], stages: [], agenda: false });
    expect(sin).not.toContain("offer_slots");
  });
});

describe("recordatorio de formato", () => {
  it("exige JSON puro y explica por qué el historial es texto plano", () => {
    expect(JSON_REMINDER).toContain("ÚNICAMENTE el objeto JSON");
    expect(JSON_REMINDER).toContain("texto plano");
  });
});
