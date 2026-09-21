import {
  AttachmentBuilder,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  MessageFlags
} from "discord.js";
import { sendAdminAuditLog } from "./adminAudit.js";
import { renderClaimLogCard } from "./claimLogCard.js";
import { config } from "./config.js";
import {
  cancelManagedClaim,
  getActiveClaim,
  getClaimById,
  getClaimPurchases,
  getLinkByDiscord,
  listManagedActiveClaims,
  listUnnotifiedFailedClaims,
  lockUnclaimedPurchases,
  markClaimPaid,
  markManagedClaimReady,
  saveClaimFailureMessage,
  saveClaimReadyMessage,
  type ClaimRecord,
  type RobloxLink
} from "./db.js";
import { refreshMembership } from "./membership.js";
import { getAvatarThumbnail } from "./roblox.js";
import { discordTimestamp, errorMessage } from "./utils.js";

function communityReadyAt(link: RobloxLink): Date | null {
  return link.communitySince
    ? new Date(link.communitySince.getTime() + config.communityWaitDays * 86_400_000)
    : null;
}

function sourceChannelLink(claim: ClaimRecord): string {
  return claim.sourceChannelId
    ? `[Buka ticket pemeriksaan](https://discord.com/channels/${config.guildId}/${claim.sourceChannelId})`
    : "Tidak tercatat";
}

async function sendReadyNotification(
  client: Client,
  claim: ClaimRecord,
  link: RobloxLink
): Promise<void> {
  const channel = await client.channels.fetch(config.payoutQueueChannelId);
  if (!channel?.isSendable()) {
    throw new Error("Channel list-pencairan tidak ditemukan atau bot tidak dapat mengirim pesan.");
  }
  const purchases = await getClaimPurchases(claim.id);
  const embed = new EmbedBuilder()
    .setColor(0xd8b56f)
    .setTitle(`💸 Klaim #${claim.id} Siap Dicairkan`)
    .setDescription(
      [
        `👤 **Discord:** <@${claim.discordUserId}>`,
        `🎮 **Username Roblox:** **${link.robloxUsername}**`,
        `🪪 **Roblox User ID:** **${claim.robloxUserId}**`,
        `💰 **Total pencairan:** **${claim.amountRobux.toLocaleString("id-ID")} Robux**`,
        `🛍️ **Jumlah pembelian:** **${purchases.length} item**`,
        `🕒 **Disetujui:** ${discordTimestamp(claim.createdAt, "F")}`,
        `🧑‍💼 **Dimasukkan oleh:** ${claim.approvedByDiscordId ? `<@${claim.approvedByDiscordId}>` : "Admin"}`,
        `🎫 **Sumber pemeriksaan:** ${sourceChannelLink(claim)}`,
        "",
        `✅ Akun telah terdeteksi berada di Community selama minimal **${config.communityWaitDays} hari**.`,
        `Setelah Robux dikirim manual, jalankan \`/claim-dibayar id:${claim.id}\`.`
      ].join("\n")
    )
    .setFooter({ text: "Pastikan payout dikirim ke username dan Roblox User ID di atas." })
    .setTimestamp();
  const message = await channel.send({
    content: `<@&${config.adminRoleId}> klaim baru siap dibayar.`,
    embeds: [embed],
    allowedMentions: { roles: [config.adminRoleId] }
  });
  await saveClaimReadyMessage(claim.id, channel.id, message.id);
}

async function updateReadyMessage(
  client: Client,
  claim: ClaimRecord,
  state: "paid" | "cancelled",
  actorId?: string
): Promise<void> {
  if (!claim.readyChannelId || !claim.readyMessageId) return;
  const channel = await client.channels.fetch(claim.readyChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  const message = await channel.messages.fetch(claim.readyMessageId).catch(() => null);
  if (!message) return;
  const embed = message.embeds[0]
    ? EmbedBuilder.from(message.embeds[0])
    : new EmbedBuilder().setDescription(`Klaim #${claim.id}`);
  if (state === "paid") {
    embed
      .setColor(0x6f9f82)
      .setTitle(`✅ Klaim #${claim.id} Sudah Dibayar`)
      .setFooter({ text: "Pencairan selesai dan saldo telah dicatat sebagai dibayar." });
    await message.edit({
      content: actorId ? `✅ Dibayar oleh <@${actorId}>.` : "✅ Klaim sudah dibayar.",
      embeds: [embed],
      allowedMentions: { parse: [] }
    });
    return;
  }
  embed
    .setColor(0xc85f65)
    .setTitle(`❌ Klaim #${claim.id} Dibatalkan`)
    .setFooter({ text: "Jangan lakukan payout untuk klaim ini." });
  await message.edit({
    content: "❌ Klaim dibatalkan. Jangan lakukan payout dari pesan ini.",
    embeds: [embed],
    allowedMentions: { parse: [] }
  });
}

async function sendFailureNotification(client: Client, claim: ClaimRecord): Promise<void> {
  const channel = await client.channels.fetch(config.failedClaimChannelId);
  if (!channel?.isSendable()) {
    throw new Error("Channel gagal-claim tidak ditemukan atau bot tidak dapat mengirim pesan.");
  }
  const link = await getLinkByDiscord(claim.discordUserId);
  const purchases = await getClaimPurchases(claim.id);
  const username = link?.robloxUserId === claim.robloxUserId
    ? link.robloxUsername
    : purchases[0]?.robloxUsername ?? "Tidak diketahui";
  const embed = new EmbedBuilder()
    .setColor(0xc85f65)
    .setTitle(`❌ Klaim #${claim.id} Gagal`)
    .setDescription(
      [
        `👤 **Discord:** <@${claim.discordUserId}>`,
        `🎮 **Username Roblox:** **${username}**`,
        `🪪 **Roblox User ID:** **${claim.robloxUserId}**`,
        `💰 **Saldo dikembalikan:** **${claim.amountRobux.toLocaleString("id-ID")} Robux**`,
        `🛍️ **Jumlah pembelian:** **${purchases.length} item**`,
        `🎫 **Sumber pemeriksaan:** ${sourceChannelLink(claim)}`,
        "",
        `📌 **Alasan:** ${claim.failureReason ?? "Tidak diketahui"}`,
        "Saldo tidak hangus. User harus memenuhi kembali syarat Community dan membuat ticket claim baru."
      ].join("\n")
    )
    .setTimestamp(claim.closedAt ?? new Date());
  let message;
  try {
    const avatarUrl = await getAvatarThumbnail(claim.robloxUserId).catch(() => null);
    const card = await renderClaimLogCard({
      variant: "failed",
      claimId: claim.id,
      discordUserId: claim.discordUserId,
      robloxUserId: claim.robloxUserId,
      robloxUsername: username,
      amountRobux: claim.amountRobux,
      purchaseCount: purchases.length,
      avatarUrl,
      reason: claim.failureReason ?? "Tidak diketahui",
      createdAt: claim.closedAt ?? new Date()
    });
    message = await channel.send({
      content: [
        "## ❌ CLAIM CASHBACK GAGAL",
        `<@${claim.discordUserId}> • Klaim **#${claim.id}** dibatalkan.`,
        `Saldo **${claim.amountRobux.toLocaleString("id-ID")} Robux** sudah dikembalikan dan tidak hangus.`,
        `Alasan: ${claim.failureReason ?? "Tidak diketahui"}`
      ].join("\n"),
      files: [
        new AttachmentBuilder(card, {
          name: `gagal-claim-${claim.id}.png`
        })
      ],
      allowedMentions: { parse: [] }
    });
  } catch (cardError) {
    console.error(`[failed-claim-card] #${claim.id}: ${errorMessage(cardError)}`);
    message = await channel.send({
      embeds: [embed],
      allowedMentions: { parse: [] }
    });
  }
  if (claim.readyChannelId && claim.readyMessageId) {
    const queueChannel = await client.channels.fetch(claim.readyChannelId).catch(() => null);
    if (queueChannel?.isSendable()) {
      await queueChannel.send({
        content: `❌ Klaim **#${claim.id}** dibatalkan. Abaikan pesan pencairan sebelumnya.`,
        allowedMentions: { parse: [] }
      }).catch(() => undefined);
    }
  }
  await updateReadyMessage(client, claim, "cancelled").catch((error) =>
    console.error(`[claim-cancelled-message] #${claim.id}: ${errorMessage(error)}`)
  );
  await saveClaimFailureMessage(claim.id, channel.id, message.id);
}

async function cancelForQueue(
  claimId: number,
  reason: string
): Promise<ClaimRecord | null> {
  return cancelManagedClaim(claimId, reason);
}

export async function sendPayoutLog(
  client: Client,
  claim: ClaimRecord,
  link: RobloxLink,
  actorId: string,
  actorName: string
): Promise<void> {
  if (!config.payoutLogChannelId) return;

  const channel = await client.channels.fetch(config.payoutLogChannelId);
  if (!channel?.isSendable()) {
    throw new Error("Channel payout-log tidak ditemukan atau bot tidak dapat mengirim pesan.");
  }

  const [purchases, avatarUrl] = await Promise.all([
    getClaimPurchases(claim.id),
    getAvatarThumbnail(claim.robloxUserId).catch(() => null)
  ]);

  try {
    const card = await renderClaimLogCard({
      variant: "payout",
      claimId: claim.id,
      discordUserId: claim.discordUserId,
      robloxUserId: claim.robloxUserId,
      robloxUsername: link.robloxUsername,
      amountRobux: claim.amountRobux,
      purchaseCount: purchases.length,
      avatarUrl,
      actorName,
      createdAt: claim.closedAt ?? new Date()
    });

    await channel.send({
      content: [
        "## 💸 PAYOUT LOG",
        `Klaim **#${claim.id}** milik <@${claim.discordUserId}> telah selesai dibayar.`,
        `Akun Roblox: **@${link.robloxUsername}** • Nominal: **${claim.amountRobux.toLocaleString("id-ID")} Robux**`,
        `Diproses oleh: <@${actorId}>`
      ].join("\n"),
      files: [
        new AttachmentBuilder(card, {
          name: `payout-log-${claim.id}.png`
        })
      ],
      allowedMentions: { parse: [] }
    });
  } catch (cardError) {
    console.error(`[payout-log-card] #${claim.id}: ${errorMessage(cardError)}`);
    await channel.send({
      content: [
        "## 💸 PAYOUT LOG",
        `✅ Klaim **#${claim.id}** selesai dibayar.`,
        `Discord: <@${claim.discordUserId}>`,
        `Roblox: **@${link.robloxUsername}** (ID ${claim.robloxUserId})`,
        `Nominal: **${claim.amountRobux.toLocaleString("id-ID")} Robux**`,
        `Admin: <@${actorId}>`
      ].join("\n"),
      allowedMentions: { parse: [] }
    });
  }
}

export async function processClaimQueue(client: Client, onlyClaimId?: number): Promise<void> {
  const claims = await listManagedActiveClaims(onlyClaimId);
  for (const originalClaim of claims) {
    try {
      let claim = originalClaim;
      const link = await getLinkByDiscord(claim.discordUserId);
      if (!link || link.robloxUserId !== claim.robloxUserId) {
        await cancelForQueue(
          claim.id,
          "Akun Roblox klaim tidak lagi terhubung ke akun Discord tersebut."
        );
        continue;
      }
      if (!link.communityMember || !link.communitySince) {
        await cancelForQueue(
          claim.id,
          "User keluar atau tidak lagi terdeteksi sebagai anggota Community sebelum payout."
        );
        continue;
      }
      const readyAt = communityReadyAt(link);
      if (!readyAt || readyAt > new Date()) continue;
      if (claim.status === "open") {
        claim = (await markManagedClaimReady(claim.id)) ?? claim;
      }
      if (claim.status === "verified" && !claim.readyMessageId) {
        await sendReadyNotification(client, claim, link);
      }
    } catch (error) {
      console.error(`[claim-queue] claim #${originalClaim.id}: ${errorMessage(error)}`);
    }
  }

  const failedClaims = await listUnnotifiedFailedClaims();
  for (const claim of failedClaims) {
    try {
      await sendFailureNotification(client, claim);
    } catch (error) {
      console.error(`[failed-claim] claim #${claim.id}: ${errorMessage(error)}`);
    }
  }
}

export async function approveClaim(
  interaction: ChatInputCommandInteraction,
  client: Client
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const target = interaction.options.getUser("user", true);
  if (target.bot) {
    await interaction.editReply("Bot tidak dapat dimasukkan ke antrean cashback.");
    return;
  }
  const active = await getActiveClaim(target.id);
  if (active) {
    await interaction.editReply(
      `${target} masih memiliki klaim aktif **#${active.id}** dengan status **${active.status}**.`
    );
    return;
  }
  const originalLink = await getLinkByDiscord(target.id);
  if (!originalLink) {
    await interaction.editReply(`${target} belum menghubungkan akun Roblox.`);
    return;
  }
  const link = await refreshMembership(originalLink);
  if (!link.communityMember || !link.communitySince) {
    await interaction.editReply(
      `@${link.robloxUsername} belum terdeteksi bergabung ke Community. Claim belum dapat disetujui.`
    );
    return;
  }
  const { claim, purchases } = await lockUnclaimedPurchases({
    discordUserId: target.id,
    robloxUserId: link.robloxUserId,
    approvedByDiscordId: interaction.user.id,
    sourceChannelId: interaction.channelId
  });
  await processClaimQueue(client, claim.id);
  const updated = (await getClaimById(claim.id)) ?? claim;
  const readyAt = communityReadyAt(link)!;
  const statusText = updated.status === "verified" && updated.readyMessageId
    ? `✅ Syarat Community sudah terpenuhi dan klaim telah dikirim ke <#${config.payoutQueueChannelId}>.`
    : updated.status === "verified"
      ? `⚠️ Klaim sudah siap, tetapi notifikasi channel belum berhasil dikirim. Bot akan mencoba kembali otomatis.`
      : updated.status === "rejected"
        ? "❌ Klaim langsung dibatalkan karena status Community berubah saat pemeriksaan."
        : [
        `⏳ Klaim menunggu masa Community **${config.communityWaitDays} hari**.`,
        `📅 Akan siap pada: ${discordTimestamp(readyAt, "F")}`
          ].join("\n");
  await sendAdminAuditLog(client, {
    title: "✅ Klaim Dimasukkan ke Antrean",
    command: "acc-claim",
    adminDiscordId: interaction.user.id,
    color: 0xd8b56f,
    fields: [
      { name: "ID Klaim", value: `#${claim.id}`, inline: true },
      { name: "Status", value: updated.status, inline: true },
      {
        name: "User Discord",
        value: `<@${target.id}> (\`${target.id}\`)`
      },
      {
        name: "Akun Roblox",
        value: `@${link.robloxUsername} (\`${link.robloxUserId}\`)`
      },
      {
        name: "Saldo Dikunci",
        value: `${claim.amountRobux.toLocaleString("id-ID")} Robux`,
        inline: true
      },
      {
        name: "Jumlah Pembelian",
        value: `${purchases.length} item`,
        inline: true
      },
      { name: "Sumber", value: `<#${interaction.channelId}>` }
    ]
  });

  await interaction.editReply(
    [
      `✅ **Klaim #${claim.id} masuk antrean.**`,
      `Discord: ${target}`,
      `Username Roblox: **${link.robloxUsername}**`,
      `Roblox User ID: **${link.robloxUserId}**`,
      `Saldo dikunci: **${claim.amountRobux.toLocaleString("id-ID")} Robux**`,
      `Pembelian: **${purchases.length} item**`,
      "",
      statusText
    ].join("\n")
  );
}

export async function completeClaimPayment(
  interaction: ChatInputCommandInteraction,
  client: Client
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const claimId = interaction.options.getInteger("id", true);
  const claim = await getClaimById(claimId);
  if (!claim || !claim.queueManaged) {
    await interaction.editReply(`Klaim antrean **#${claimId}** tidak ditemukan.`);
    return;
  }
  if (claim.status === "paid") {
    await interaction.editReply(`Klaim **#${claimId}** sudah pernah ditandai dibayar.`);
    return;
  }
  if (claim.status === "rejected") {
    await interaction.editReply(`Klaim **#${claimId}** sudah dibatalkan.`);
    return;
  }
  if (claim.status !== "verified") {
    await interaction.editReply(
      `Klaim **#${claimId}** belum masuk list pencairan dan belum boleh ditandai dibayar.`
    );
    return;
  }
  const originalLink = await getLinkByDiscord(claim.discordUserId);
  const link = originalLink ? await refreshMembership(originalLink) : null;
  const readyAt = link ? communityReadyAt(link) : null;
  if (
    !link ||
    link.robloxUserId !== claim.robloxUserId ||
    !link.communityMember ||
    !readyAt ||
    readyAt > new Date()
  ) {
    await cancelForQueue(
      claim.id,
      "Status Community tidak lagi memenuhi syarat ketika admin akan menyelesaikan payout."
    );
    await processClaimQueue(client);
    await interaction.editReply(
      `Klaim **#${claim.id}** dibatalkan karena status Community tidak lagi memenuhi syarat. Saldo dikembalikan.`
    );
    return;
  }
  await markClaimPaid(claim.id, interaction.user.id);
  const paidClaim = (await getClaimById(claim.id)) ?? claim;
  await updateReadyMessage(client, paidClaim, "paid", interaction.user.id).catch((error) =>
    console.error(`[claim-paid-message] #${claim.id}: ${errorMessage(error)}`)
  );
  await sendPayoutLog(
    client,
    paidClaim,
    link,
    interaction.user.id,
    interaction.user.globalName ?? interaction.user.username
  ).catch((error) =>
    console.error(`[payout-log] #${claim.id}: ${errorMessage(error)}`)
  );
  await interaction.editReply(
    `✅ Klaim **#${claim.id}** sebesar **${claim.amountRobux.toLocaleString("id-ID")} Robux** berhasil ditandai dibayar.`
  );
}

export async function cancelClaimByAdmin(
  interaction: ChatInputCommandInteraction,
  client: Client
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const claimId = interaction.options.getInteger("id", true);
  const reason = interaction.options.getString("alasan", true).trim();
  const cancelled = await cancelForQueue(
    claimId,
    `Dibatalkan oleh admin <@${interaction.user.id}>: ${reason}`
  );
  if (!cancelled) {
    await interaction.editReply(
      `Klaim aktif **#${claimId}** tidak ditemukan atau statusnya sudah selesai.`
    );
    return;
  }
  await processClaimQueue(client);
  const link = await getLinkByDiscord(cancelled.discordUserId);

  await sendAdminAuditLog(client, {
    title: "❌ Klaim Dibatalkan",
    command: "batal-claim",
    adminDiscordId: interaction.user.id,
    color: 0xc85f65,
    fields: [
      { name: "ID Klaim", value: `#${cancelled.id}`, inline: true },
      {
        name: "Saldo Dikembalikan",
        value: `${cancelled.amountRobux.toLocaleString("id-ID")} Robux`,
        inline: true
      },
      {
        name: "User Discord",
        value: `<@${cancelled.discordUserId}> (\`${cancelled.discordUserId}\`)`
      },
      {
        name: "Akun Roblox",
        value:
          link?.robloxUserId === cancelled.robloxUserId
            ? `@${link.robloxUsername} (\`${cancelled.robloxUserId}\`)`
            : `Roblox ID \`${cancelled.robloxUserId}\``
      },
      { name: "Alasan", value: reason }
    ]
  });

  await interaction.editReply(
    `❌ Klaim **#${claimId}** dibatalkan. Saldo dikembalikan dan laporan dikirim ke <#${config.failedClaimChannelId}>.`
  );
}
