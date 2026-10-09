import { describe, expect, it } from "vitest";
import { usableProse } from "@/server/ai/prose";

describe("usableProse (guardia de salida en prosa)", () => {
  it("devuelve el texto recortado", () => {
    expect(usableProse("  Hola, ¿en qué te ayudo?\n")).toBe("Hola, ¿en qué te ayudo?");
  });
  it("vacío o solo espacios → null", () => {
    expect(usableProse("   \n")).toBeNull();
  });
  it("demasiado largo → null", () => {
    expect(usableProse("a".repeat(1501))).toBeNull();
    expect(usableProse("a".repeat(1500))).not.toBeNull();
  });
  it("con llaves o bloque de código → null", () => {
    expect(usableProse('Claro {"action":')).toBeNull();
    expect(usableProse("```\nhola\n```")).toBeNull();
  });
});
