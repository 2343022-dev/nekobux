import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client
} from "discord.js";
import { renderPurchaseCard } from "./card.js";
import { config } from "./config.js";
import {
  claimPurchasesForDiscordDelivery,
  getBalance,
  getLinkByRoblox,
  insertPurchase,
  markPurchaseDiscordDeliveryFailed,
  refreshEligibilityForUser,
  savePurchaseMessage,
  type PurchaseDeliveryRecord
} from "./db.js";
import { getAvatarThumbnail, getItemThumbnail } from "./roblox.js";
import type {
  BalanceSummary,
  PurchaseInput,
  PurchaseItemType,
  PurchaseRecord
} from "./types.js";
import { calculateCashback, errorMessage } from "./utils.js";

export interface RecordPurchaseResult {
  duplicate: boolean;
  purchase: PurchaseRecord | null;
}

let purchaseDeliveryRunning = false;

export async function recordPurchase(
  client: Client,
  input: PurchaseInput
): Promise<RecordPurchaseResult> {
  if (!Number.isInteger(input.priceRobux) || input.priceRobux < config.minimumItemPrice) {
    throw new Error(`Harga item minimal ${config.minimumItemPrice} Robux.`);
  }

  const purchase = await insertPurchase(input);
  if (!purchase) return { duplicate: true, purchase: null };

  await refreshEligibilityForUser(input.robloxUserId);
  void processPurchaseCardQueue(client, purchase.id).catch((error) =>
    console.error(`[purchase-delivery] ${purchase.eventId}: ${errorMessage(error)}`)
  );
  return { duplicate: false, purchase };
}

function retryDelaySeconds(attempt: number): number {
  const base = Math.max(5, Math.floor(config.purchaseCardRetrySeconds));
  return Math.min(30 * 60, base * 2 ** Math.min(Math.max(attempt - 1, 0), 6));
}

async function deliverPurchaseCard(
  client: Client,
  purchase: PurchaseDeliveryRecord
): Promise<void> {
  try {
    await publishPurchase(client, purchase);
  } catch (error) {
    const message = errorMessage(error);
    await markPurchaseDiscordDeliveryFailed(
      purchase.id,
      message,
      retryDelaySeconds(purchase.deliveryAttempts)
    );
    console.error(
      `[purchase-card-retry] ${purchase.eventId} attempt ${purchase.deliveryAttempts}: ${message}`
    );
  }
}

export async function processPurchaseCardQueue(
  client: Client,
  purchaseId?: number
): Promise<void> {
  if (purchaseDeliveryRunning) return;
  purchaseDeliveryRunning = true;
  try {
    const purchases = await claimPurchasesForDiscordDelivery({
      limit: purchaseId
        ? 1
        : Math.max(1, Math.floor(config.purchaseCardRetryBatchSize)),
      purchaseId
    });
    for (const purchase of purchases) {
      await deliverPurchaseCard(client, purchase);
    }
  } finally {
    purchaseDeliveryRunning = false;
  }
}

export function startPurchaseCardRetryScheduler(client: Client): NodeJS.Timeout {
  const run = (): void => {
    void processPurchaseCardQueue(client).catch((error) =>
      console.error(`[purchase-card-scheduler] ${errorMessage(error)}`)
    );
  };
  run();
  return setInterval(
    run,
    Math.max(5, Math.floor(config.purchaseCardRetrySeconds)) * 1000
  );
}

export async function sendPurchaseCardPreview(
  client: Client,
  input: {
    robloxUserId: number;
    robloxUsername: string;
    assetId: number;
    assetName: string;
    itemType: PurchaseItemType;
    priceRobux: number;
  }
): Promise<string> {
  const channel = await client.channels.fetch(config.purchaseLogChannelId);

  if (!channel?.isSendable()) {
    throw new Error("Channel log pembelian tidak dapat dikirimi pesan.");
  }

  const cashbackRobux = calculateCashback(
    input.priceRobux,
    config.cashbackPercent
  );

  const now = new Date();

  const purchase: PurchaseRecord = {
    id: 0,
    eventId: `preview-${now.getTime()}`,
    robloxUserId: input.robloxUserId,
    robloxUsername: input.robloxUsername,
    assetId: input.assetId,
    assetName: input.assetName,
    itemType: input.itemType,
    priceRobux: input.priceRobux,
    purchasedAt: now,
    cashbackRobux,
    status: "pending",
    fundsAvailableAt: now
  };

  const balance: BalanceSummary = {
    pending: cashbackRobux,
    available: 0,
    locked: 0,
    paid: 0,
    totalSpent: input.priceRobux,
    totalCashback: cashbackRobux
  };

  const [avatarUrl, itemUrl] = await Promise.all([
    getAvatarThumbnail(input.robloxUserId).catch(() => null),
    getItemThumbnail(input.assetId, input.itemType).catch(() => null)
  ]);

  const card = await renderPurchaseCard({
    purchase,
    link: null,
    balance,
    avatarUrl,
    itemUrl
  });

  const itemUrlTarget =
    input.itemType === "bundle"
      ? `https://www.roblox.com/bundles/${input.assetId}`
      : `https://www.roblox.com/catalog/${input.assetId}`;

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel(
        input.itemType === "bundle"
          ? "Lihat Bundle di Roblox"
          : "Lihat Item di Roblox"
      )
      .setStyle(ButtonStyle.Link)
      .setURL(itemUrlTarget)
  );

  const message = await channel.send({
    content: [
      "## 🧪 PREVIEW CARD PEMBELIAN",
      "**Ini hanya pengujian admin—tidak ada transaksi atau saldo yang ditambahkan.**",
      `**@${input.robloxUsername}** membeli **${input.assetName}** seharga **${input.priceRobux} Robux**`,
      `Preview cashback: **+${cashbackRobux} Robux**`
    ].join("\n"),
    files: [
      new AttachmentBuilder(card, {
        name: "purchase-preview.png"
      })
    ],
    components: [row],
    allowedMentions: { parse: [] }
  });

  return message.url;
}
async function publishPurchase(client: Client, purchase: PurchaseRecord): Promise<void> {
  const channel = await client.channels.fetch(config.purchaseLogChannelId);
  if (!channel?.isSendable()) throw new Error("Channel log pembelian tidak dapat dikirimi pesan.");

  const link = await getLinkByRoblox(purchase.robloxUserId);
  const balance = await getBalance(purchase.robloxUserId);
  const [avatarUrl, itemUrl] = await Promise.all([
    getAvatarThumbnail(purchase.robloxUserId).catch(() => null),
    getItemThumbnail(purchase.assetId, purchase.itemType).catch(() => null)
  ]);
  const card = await renderPurchaseCard({ purchase, link, balance, avatarUrl, itemUrl });
  const mention = link ? `<@${link.discordUserId}>` : `**@${purchase.robloxUsername}**`;
  const content = [
    "## 🛒 PEMBELIAN BARU DARI NEKOBUXX!",
    `${mention} membeli **${purchase.assetName}** seharga **${purchase.priceRobux} Robux**`,
    `dan mendapatkan cashback **+${purchase.cashbackRobux} Robux** 🌿✨`
  ].join("\n");
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel(purchase.itemType === "bundle" ? "Lihat Bundle di Roblox" : "Lihat Item di Roblox")
      .setStyle(ButtonStyle.Link)
      .setURL(
        purchase.itemType === "bundle"
          ? `https://www.roblox.com/bundles/${purchase.assetId}`
          : `https://www.roblox.com/catalog/${purchase.assetId}`
      )
  );
  const message = await channel.send({
    content,
    files: [new AttachmentBuilder(card, { name: `purchase-${purchase.id}.png` })],
    components: [row],
    allowedMentions: link ? { users: [link.discordUserId] } : { parse: [] }
  });
  await savePurchaseMessage(purchase.id, message.channelId, message.id);
}
