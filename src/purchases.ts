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
  getBalance,
  getLinkByRoblox,
  insertPurchase,
  refreshEligibilityForUser,
  savePurchaseMessage
} from "./db.js";
import { getAvatarThumbnail, getItemThumbnail } from "./roblox.js";
import type { PurchaseInput, PurchaseRecord } from "./types.js";
import { errorMessage } from "./utils.js";

export interface RecordPurchaseResult {
  duplicate: boolean;
  purchase: PurchaseRecord | null;
}

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
  try {
    await publishPurchase(client, purchase);
  } catch (error) {
    console.error(`[purchase-card] ${purchase.eventId}: ${errorMessage(error)}`);
  }
  return { duplicate: false, purchase };
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
