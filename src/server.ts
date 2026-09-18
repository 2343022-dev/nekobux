import { timingSafeEqual } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { config } from "./config.js";
import type { PurchaseInput } from "./types.js";

interface PurchaseBody {
  eventId?: unknown;
  robloxUserId?: unknown;
  robloxUsername?: unknown;
  assetId?: unknown;
  assetName?: unknown;
  priceRobux?: unknown;
  purchasedAt?: unknown;
}

function authorized(header: string | undefined): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(config.apiSecret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function parsePurchase(body: PurchaseBody): PurchaseInput {
  const eventId = String(body.eventId ?? "").trim();
  const robloxUserId = Number(body.robloxUserId);
  const robloxUsername = String(body.robloxUsername ?? "").trim();
  const assetId = Number(body.assetId);
  const assetName = String(body.assetName ?? "").trim();
  const priceRobux = Number(body.priceRobux);
  const purchasedAt = body.purchasedAt ? new Date(String(body.purchasedAt)) : new Date();

  if (!eventId || eventId.length > 200) throw new Error("eventId tidak valid.");
  if (!Number.isSafeInteger(robloxUserId) || robloxUserId <= 0) throw new Error("robloxUserId tidak valid.");
  if (!robloxUsername || robloxUsername.length > 40) throw new Error("robloxUsername tidak valid.");
  if (!Number.isSafeInteger(assetId) || assetId <= 0) throw new Error("assetId tidak valid.");
  if (!assetName || assetName.length > 200) throw new Error("assetName tidak valid.");
  if (!Number.isInteger(priceRobux) || priceRobux <= 0) throw new Error("priceRobux tidak valid.");
  if (Number.isNaN(purchasedAt.getTime())) throw new Error("purchasedAt tidak valid.");

  return { eventId, robloxUserId, robloxUsername, assetId, assetName, priceRobux, purchasedAt };
}

export async function startApiServer(
  onPurchase: (purchase: PurchaseInput) => Promise<{ duplicate: boolean }>
): Promise<FastifyInstance> {
  const app = Fastify({ logger: true, bodyLimit: 64 * 1024 });

  app.get("/health", async () => ({ ok: true, service: "nekobuxx-cashback" }));
  app.post<{ Body: PurchaseBody }>("/api/purchases", async (request, reply) => {
    if (!authorized(request.headers.authorization)) {
      return reply.code(401).send({ ok: false, error: "Unauthorized" });
    }
    let purchase: PurchaseInput;
    try {
      purchase = parsePurchase(request.body ?? {});
    } catch (error) {
      const message = error instanceof Error ? error.message : "Payload tidak valid.";
      return reply.code(400).send({ ok: false, error: message });
    }
    try {
      const result = await onPurchase(purchase);
      return reply.code(result.duplicate ? 200 : 201).send({
        ok: true,
        duplicate: result.duplicate
      });
    } catch (error) {
      request.log.error(error);
      const message = error instanceof Error ? error.message : "Gagal menyimpan transaksi.";
      return reply.code(500).send({ ok: false, error: message });
    }
  });

  await app.listen({ port: config.port, host: "0.0.0.0" });
  return app;
}
