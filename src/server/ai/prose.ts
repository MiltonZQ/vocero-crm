/**
 * Guardia para la salida en prosa del modelo (cuando ignora el formato JSON).
 * Solo es presentable al cliente si es texto corto y limpio: nada vacío,
 * nada que parezca JSON/código, nada desmedido.
 */
const MAX_PROSE_CHARS = 1500;

export function usableProse(raw: string): string | null {
  const text = raw.trim();
  if (!text || text.length > MAX_PROSE_CHARS) return null;
  if (text.includes("{") || text.startsWith("```")) return null;
  return text;
}
