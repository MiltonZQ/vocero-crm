import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { publish } from "@/server/events/bus";

/**
 * Transcripción de audios con Whisper (OpenAI).
 * Resuelve la clave desde WHISPER o OPENAI_API_KEY.
 */

export function getWhisperApiKey(): string | null {
  try {
    const env = getEnv();
    return (
      env.WHISPER ||
      env.OPENAI_API_KEY ||
      process.env.WHISPER ||
      process.env.OPENAI_API_KEY ||
      null
    );
  } catch {
    return process.env.WHISPER || process.env.OPENAI_API_KEY || null;
  }
}

export function isWhisperConfigured(): boolean {
  return !!getWhisperApiKey();
}

/**
 * Mapea el mimeType al nombre de archivo con extensión reconocida por OpenAI Whisper:
 * ['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm']
 */
function getFilenameForMime(mimeType?: string | null): string {
  if (!mimeType) return "audio.ogg";
  const lower = mimeType.toLowerCase();
  if (lower.includes("ogg") || lower.includes("opus")) return "audio.ogg";
  if (lower.includes("mp4") || lower.includes("m4a") || lower.includes("aac"))
    return "audio.m4a";
  if (lower.includes("mpeg") || lower.includes("mp3")) return "audio.mp3";
  if (lower.includes("wav")) return "audio.wav";
  if (lower.includes("webm")) return "audio.webm";
  if (lower.includes("flac")) return "audio.flac";
  return "audio.ogg";
}

/**
 * Envía el buffer a la API de OpenAI Whisper para transcribir.
 * Retorna el texto transcrito o null si falla / no está configurado.
 */
export async function transcribeAudio(
  data: Buffer | Uint8Array,
  mimeType?: string | null
): Promise<string | null> {
  const apiKey = getWhisperApiKey();
  if (!apiKey) return null;

  try {
    const filename = getFilenameForMime(mimeType);
    const form = new FormData();
    const bytes = new Uint8Array(data);
    form.set(
      "file",
      new Blob([bytes], { type: mimeType || "audio/ogg" }),
      filename
    );
    form.set("model", "whisper-1");
    form.set("language", "es");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(`[whisper] error en transcripción (${res.status}): ${errText}`);
      return null;
    }

    const json = (await res.json()) as { text?: string };
    const text = json.text?.trim();
    return text || null;
  } catch (err) {
    console.warn("[whisper] fallo inesperado transcribiendo audio:", err);
    return null;
  }
}

/**
 * Procesa la transcripción de un mediaAsset de tipo audio recién descargado
 * y actualiza los mensajes correspondientes con el texto transcrito.
 */
export async function handleAudioAssetTranscription(
  organizationId: string,
  assetId: string,
  data: Buffer | Uint8Array,
  mimeType?: string | null
): Promise<string | null> {
  if (!isWhisperConfigured()) return null;

  const transcript = await transcribeAudio(data, mimeType);
  if (!transcript) return null;

  try {
    const db = getDb();
    const messages = await db
      .select({
        id: schema.message.id,
        conversationId: schema.message.conversationId,
        text: schema.message.text,
      })
      .from(schema.message)
      .where(
        and(
          eq(schema.message.organizationId, organizationId),
          eq(schema.message.mediaAssetId, assetId)
        )
      );

    const formattedText = `[Nota de voz]: ${transcript}`;

    for (const msg of messages) {
      if (!msg.text) {
        await db
          .update(schema.message)
          .set({ text: formattedText })
          .where(eq(schema.message.id, msg.id));

        publish(organizationId, {
          type: "conversation.updated",
          data: { conversation: { id: msg.conversationId } },
        });
      }
    }

    return transcript;
  } catch (err) {
    console.warn("[whisper] error persistiendo transcripción en mensaje:", err);
    return transcript;
  }
}
