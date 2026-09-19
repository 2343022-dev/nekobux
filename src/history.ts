import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  escapeMarkdown
} from "discord.js";
import {
  getBalance,
  getPurchaseHistory,
  refreshEligibilityForUser,
  type RobloxLink
} from "./db.js";
import type { PurchaseRecord, PurchaseStatus } from "./types.js";
import { discordTimestamp, truncate } from "./utils.js";

const HISTORY_PAGE_SIZE = 10;

function statusLabel(status: PurchaseStatus): string {
  switch (status) {
    case "pending":
      return "⏳ Menunggu syarat Community";
    case "available":
      return "✅ Bisa diklaim";
    case "locked":
      return "🔒 Dalam antrean pencairan";
    case "paid":
      return "💚 Sudah dibayar";
    case "rejected":
      return "❌ Dibatalkan";
  }
}

function itemUrl(purchase: PurchaseRecord): string {
  return purchase.itemType === "bundle"
    ? `https://www.roblox.com/bundles/${purchase.assetId}`
    : `https://www.roblox.com/catalog/${purchase.assetId}`;
}

function purchaseLine(purchase: PurchaseRecord): string {
  const name = escapeMarkdown(truncate(purchase.assetName, 70));

  return [
    `**#${purchase.id} · [${name}](${itemUrl(purchase)})**`,
    `🛒 ${purchase.priceRobux.toLocaleString("id-ID")} R$ → 💸 +${purchase.cashbackRobux.toLocaleString("id-ID")} R$`,
    `${statusLabel(purchase.status)} · ${discordTimestamp(purchase.purchasedAt, "F")}`
  ].join("\n");
}

export async function buildPurchaseHistoryView(
  link: RobloxLink,
  requestedPage = 0
): Promise<{
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
}> {
  await refreshEligibilityForUser(link.robloxUserId);

  const [history, balance] = await Promise.all([
    getPurchaseHistory({
      robloxUserId: link.robloxUserId,
      page: requestedPage,
      pageSize: HISTORY_PAGE_SIZE
    }),
    getBalance(link.robloxUserId)
  ]);

  const description =
    history.purchases.length > 0
      ? history.purchases.map(purchaseLine).join("\n\n")
      : "Belum ada pembelian cashback yang tercatat untuk akun ini.";

  const embed = new EmbedBuilder()
    .setColor(0x8f8589)
    .setTitle(`Riwayat Cashback @${link.robloxUsername}`)
    .setDescription(description)
    .addFields(
      {
        name: "Bisa dicairkan",
        value: `**${balance.available.toLocaleString("id-ID")} R$**`,
        inline: true
      },
      {
        name: "Pending",
        value: `**${balance.pending.toLocaleString("id-ID")} R$**`,
        inline: true
      },
      {
        name: "Dalam antrean",
        value: `**${balance.locked.toLocaleString("id-ID")} R$**`,
        inline: true
      },
      {
        name: "Sudah dibayar",
        value: `**${balance.paid.toLocaleString("id-ID")} R$**`,
        inline: true
      },
      {
        name: "Total belanja",
        value: `**${balance.totalSpent.toLocaleString("id-ID")} R$**`,
        inline: true
      },
      {
        name: "Total cashback",
        value: `**${balance.totalCashback.toLocaleString("id-ID")} R$**`,
        inline: true
      }
    )
    .setFooter({
      text: `Halaman ${history.page + 1}/${history.totalPages} • ${history.totalItems} transaksi • Roblox ID ${link.robloxUserId}`
    });

  if (history.totalPages <= 1) {
    return {
      embeds: [embed],
      components: []
    };
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`history:${link.robloxUserId}:${history.page - 1}`)
      .setLabel("Sebelumnya")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(history.page <= 0),
    new ButtonBuilder()
      .setCustomId(`history:${link.robloxUserId}:${history.page + 1}`)
      .setLabel("Berikutnya")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(history.page >= history.totalPages - 1)
  );

  return {
    embeds: [embed],
    components: [row]
  };
}