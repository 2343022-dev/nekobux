import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  GuildMember,
  MessageFlags,
  PermissionFlagsBits
} from "discord.js";
import { sendPayoutLog } from "./claimQueue.js";
import { config } from "./config.js";
import {
  getActiveClaim,
  getBalance,
  getClaimById,
  getClaimPurchases,
  getLinkByDiscord,
  lockAvailablePurchases,
  markClaimPaid,
  refreshEligibilityForUser,
  rejectClaim,
  setClaimChannel,
  verifyClaim
} from "./db.js";
import { refreshMembership } from "./membership.js";
import { discordTimestamp, safeChannelName } from "./utils.js";

function isAdmin(member: GuildMember): boolean {
  return (
    member.roles.cache.has(config.adminRoleId) ||
    member.permissions.has(PermissionFlagsBits.Administrator)
  );
}

export async function createClaimTicket(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guild || !(interaction.member instanceof GuildMember)) {
    await interaction.reply({ content: "Fitur ini hanya tersedia di server.", flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const originalLink = await getLinkByDiscord(interaction.user.id);
  if (!originalLink) {
    await interaction.editReply("Hubungkan akun Roblox kamu terlebih dahulu.");
    return;
  }
  const existing = await getActiveClaim(interaction.user.id);
  if (existing) {
    await interaction.editReply(
      existing.channelId
        ? `Kamu masih memiliki ticket aktif: <#${existing.channelId}>.`
        : "Claim kamu sedang dibuat. Tunggu sebentar lalu coba cek kembali."
    );
    return;
  }

  const link = await refreshMembership(originalLink);
  if (!link.communityMember || !link.communitySince) {
    await interaction.editReply("Kamu belum menjadi anggota komunitas Roblox Nekobuxx.");
    return;
  }
  const communityReadyAt = new Date(
    link.communitySince.getTime() + config.communityWaitDays * 86_400_000
  );
  if (communityReadyAt > new Date()) {
    await interaction.editReply(
      `Masa anggota komunitas belum ${config.communityWaitDays} hari. Bisa claim ${discordTimestamp(communityReadyAt, "R")}.`
    );
    return;
  }

  await refreshEligibilityForUser(link.robloxUserId);
  const balance = await getBalance(link.robloxUserId);
  if (balance.available <= 0) {
    await interaction.editReply(
      `Belum ada saldo yang bisa dicairkan. Pending: **${balance.pending} R$**.`
    );
    return;
  }

  const { claim, purchases } = await lockAvailablePurchases(
    interaction.user.id,
    link.robloxUserId
  );
  try {
    const channel = await interaction.guild.channels.create({
      name: safeChannelName(`claim-${link.robloxUsername}-${claim.id}`),
      type: ChannelType.GuildText,
      parent: config.ticketCategoryId,
      permissionOverwrites: [
        {
          id: interaction.guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles
          ]
        },
        {
          id: config.adminRoleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageMessages
          ]
        },
        {
          id: interaction.guild.members.me!.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.ManageChannels
          ]
        }
      ]
    });
    await setClaimChannel(claim.id, channel.id);

    const embed = new EmbedBuilder()
      .setColor(0xc98b8e)
      .setTitle(`Ticket Cashback #${claim.id}`)
      .setDescription(
        [
          `Customer: <@${interaction.user.id}>`,
          `Akun payout: **${link.robloxDisplayName} (@${link.robloxUsername})**`,
          `Roblox User ID: **${link.robloxUserId}**`,
          `Jumlah: **${claim.amountRobux} Robux**`,
          `Transaksi: **${purchases.length} item**`,
          "",
          "Silakan kirim screenshot bukti pembelian. Admin akan memeriksa bukti dan melakukan payout manual ke akun Roblox di atas."
        ].join("\n")
      );
    const row = claimButtons(claim.id);
    await channel.send({
      content: `<@${interaction.user.id}> <@&${config.adminRoleId}>`,
      embeds: [embed],
      components: [row],
      allowedMentions: { users: [interaction.user.id], roles: [config.adminRoleId] }
    });
    await interaction.editReply(`Ticket berhasil dibuat: ${channel}.`);
  } catch (error) {
    await rejectClaim(claim.id);
    throw error;
  }
}

function claimButtons(claimId: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`claim:verify:${claimId}`)
      .setLabel("Bukti Valid")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`claim:paid:${claimId}`)
      .setLabel("Sudah Dibayar")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`claim:reject:${claimId}`)
      .setLabel("Tolak Claim")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`claim:close:${claimId}`)
      .setLabel("Tutup Ticket")
      .setStyle(ButtonStyle.Secondary)
  );
}

export async function handleClaimAction(
  interaction: ButtonInteraction,
  client: Client
): Promise<void> {
  if (!(interaction.member instanceof GuildMember) || !isAdmin(interaction.member)) {
    await interaction.reply({ content: "Tombol ini khusus admin.", flags: MessageFlags.Ephemeral });
    return;
  }
  const [, action, rawId] = interaction.customId.split(":");
  const claimId = Number(rawId);
  const claim = await getClaimById(claimId);
  if (!claim) {
    await interaction.reply({ content: "Claim tidak ditemukan.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (action === "verify") {
    if (claim.status !== "open") {
      await interaction.reply({ content: `Status claim sudah **${claim.status}**.`, flags: MessageFlags.Ephemeral });
      return;
    }
    await verifyClaim(claimId);
    await interaction.reply(`✅ Bukti claim #${claimId} dinyatakan valid oleh ${interaction.user}.`);
    return;
  }

  if (action === "reject") {
    if (!["open", "verified"].includes(claim.status)) {
      await interaction.reply({ content: `Claim sudah **${claim.status}**.`, flags: MessageFlags.Ephemeral });
      return;
    }
    await rejectClaim(claimId);
    await interaction.reply(
      `❌ Claim #${claimId} ditolak oleh ${interaction.user}. Saldo dikembalikan ke available.`
    );
    return;
  }

  if (action === "paid") {
    if (claim.status !== "verified") {
      await interaction.reply({ content: "Tekan **Bukti Valid** terlebih dahulu.", flags: MessageFlags.Ephemeral });
      return;
    }
    await markClaimPaid(claimId);
    const purchases = await getClaimPurchases(claimId);
    await interaction.reply(
      `💸 Claim #${claimId} sebesar **${claim.amountRobux} Robux** telah dibayar oleh ${interaction.user}.`
    );
    if (config.payoutLogChannelId) {
      const link = await getLinkByDiscord(claim.discordUserId);
      if (link?.robloxUserId === claim.robloxUserId) {
        await sendPayoutLog(
          client,
          claim,
          link,
          interaction.user.id,
          interaction.user.globalName ?? interaction.user.username
        );
      } else {
        const log = await client.channels.fetch(config.payoutLogChannelId);
        if (log?.isSendable()) {
          await log.send(
            `💸 **PAYOUT LOG** • Claim **#${claimId}** • <@${claim.discordUserId}> • Roblox ID **${claim.robloxUserId}** • **${claim.amountRobux} R$** • ${purchases.length} item.`
          );
        }
      }
    }
    return;
  }

  if (action === "close") {
    if (!["paid", "rejected"].includes(claim.status)) {
      await interaction.reply({
        content: "Claim harus dibayar atau ditolak sebelum ticket ditutup.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
      await interaction.reply({ content: "Channel ticket tidak valid.", flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply("🔒 Ticket ditutup. Riwayat tetap disimpan untuk audit.");
    await interaction.channel.permissionOverwrites.edit(claim.discordUserId, {
      SendMessages: false
    });
    await interaction.channel.setName(safeChannelName(`closed-claim-${claimId}`));
  }
}
