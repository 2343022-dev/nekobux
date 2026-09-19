import {
  ActionRowBuilder,
  ButtonInteraction,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  GuildMember,
  MessageFlags,
  ModalSubmitInteraction,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type Interaction
} from "discord.js";
import { config } from "./config.js";
import {
  getBalance,
  getLinkByDiscord,
  getLinkByRoblox,
  refreshEligibilityForUser,
  replaceLink,
  setCommunityAge,
  unlinkDiscord
} from "./db.js";
import { refreshMembership } from "./membership.js";
import { cashbackPanel, verificationPanel } from "./panels.js";
import { recordPurchase } from "./purchases.js";
import {
  getAvatarThumbnail,
  getRobloxUser,
  isCommunityMember,
  resolveRobloxUsername
} from "./roblox.js";
import { createClaimTicket, handleClaimAction } from "./tickets.js";
import { discordTimestamp, errorMessage, randomId } from "./utils.js";

function isAdmin(interaction: Interaction): boolean {
  return (
    interaction.member instanceof GuildMember &&
    (interaction.member.roles.cache.has(config.adminRoleId) ||
      interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
      interaction.member.permissions.has(PermissionFlagsBits.ManageGuild))
  );
}

function verificationSuccessRows(): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>();
  if (config.communityChannelId) {
    row.addComponents(
      new ButtonBuilder()
        .setLabel("Buka Channel Cashback")
        .setEmoji("📍")
        .setStyle(ButtonStyle.Link)
        .setURL(
          `https://discord.com/channels/${config.guildId}/${config.communityChannelId}`
        )
    );
  }
  row.addComponents(
    new ButtonBuilder()
      .setLabel("Masuk Community")
      .setEmoji("👥")
      .setStyle(ButtonStyle.Link)
      .setURL(`https://www.roblox.com/communities/${config.robloxGroupId}`)
  );
  return [row];
}

export async function handleInteraction(interaction: Interaction, client: Client): Promise<void> {
  try {
    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction, client);
      return;
    }
    if (interaction.isButton()) {
      if (interaction.customId === "verify:start") {
        const modal = new ModalBuilder()
          .setCustomId("verify:modal")
          .setTitle("Hubungkan Akun Roblox")
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId("username")
                .setLabel("Username Roblox (bukan display name)")
                .setPlaceholder("Contoh: nekobux")
                .setMinLength(3)
                .setMaxLength(20)
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            )
          );
        await interaction.showModal(modal);
        return;
      }
      if (interaction.customId.startsWith("verify:confirm:")) {
        await confirmLink(interaction, Number(interaction.customId.split(":")[2]));
        return;
      }
      if (interaction.customId === "verify:cancel") {
        await interaction.update({ content: "Penghubungan akun dibatalkan.", embeds: [], components: [] });
        return;
      }
      if (interaction.customId === "cashback:balance") {
        await showBalance(interaction);
        return;
      }
      if (interaction.customId === "cashback:claim") {
        await createClaimTicket(interaction);
        return;
      }
      if (interaction.customId.startsWith("claim:")) {
        await handleClaimAction(interaction, client);
      }
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId === "verify:modal") {
      await previewLink(interaction);
    }
  } catch (error) {
    console.error("[interaction]", error);
    const message = `Terjadi kesalahan: ${errorMessage(error)}`;
    if (!interaction.isRepliable()) return;
    if (interaction.replied || interaction.deferred) await interaction.editReply(message).catch(() => undefined);
    else await interaction.reply({ content: message, flags: MessageFlags.Ephemeral }).catch(() => undefined);
  }
}

async function previewLink(interaction: ModalSubmitInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const username = interaction.fields.getTextInputValue("username").trim();
  const user = await resolveRobloxUsername(username);
  if (!user) {
    await interaction.editReply("Username Roblox tidak ditemukan. Pastikan memakai username, bukan display name.");
    return;
  }
  const existing = await getLinkByDiscord(interaction.user.id);
  const linked = await getLinkByRoblox(user.id);
  if (linked && linked.discordUserId !== interaction.user.id) {
    await interaction.editReply("Akun Roblox ini sudah terhubung ke akun Discord lain.");
    return;
  }
  const avatar = await getAvatarThumbnail(user.id).catch(() => null);
  const embed = new EmbedBuilder()
    .setColor(0xc98b8e)
    .setTitle("Apakah akun ini benar?")
    .setDescription(
      [
        `**${user.displayName}** (@${user.name})`,
        `Roblox User ID: **${user.id}**`,
        "",
        existing && existing.robloxUserId !== user.id
          ? `Akun saat ini **@${existing.robloxUsername}** akan diganti. Penggantian mandiri hanya diizinkan jika akun lama belum memiliki transaksi atau claim.`
          : "Saldo dan payout akan terkunci ke akun ini."
      ].join("\n")
    )
    .setThumbnail(avatar);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`verify:confirm:${user.id}`)
      .setLabel(existing && existing.robloxUserId !== user.id ? "Ya, Ganti Akun" : "Ya, Hubungkan")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("verify:cancel")
      .setLabel("Batal")
      .setStyle(ButtonStyle.Secondary)
  );
  await interaction.editReply({ embeds: [embed], components: [row] });
}

async function confirmLink(interaction: ButtonInteraction, robloxUserId: number): Promise<void> {
  await interaction.deferUpdate();
  if (!interaction.guild) throw new Error("Verifikasi hanya dapat dilakukan di server.");
  const existingDiscord = await getLinkByDiscord(interaction.user.id);
  const existingRoblox = await getLinkByRoblox(robloxUserId);
  if (existingRoblox && existingRoblox.discordUserId !== interaction.user.id) {
    await interaction.editReply({
      content: "Akun Roblox ini sudah terhubung ke Discord lain.",
      embeds: [],
      components: []
    });
    return;
  }
  const user = await getRobloxUser(robloxUserId);
  const member = await isCommunityMember(user.id, config.robloxGroupId);
  const link = await replaceLink({
    discordUserId: interaction.user.id,
    robloxUserId: user.id,
    robloxUsername: user.name,
    robloxDisplayName: user.displayName,
    communityMember: member
  });
  const guildMember = await interaction.guild.members.fetch(interaction.user.id);
  await guildMember.roles.add(config.verifiedRoleId, "Roblox account linked");
  await refreshEligibilityForUser(user.id);
  const guide = config.communityChannelId
    ? `<#${config.communityChannelId}>`
    : "channel panduan map dan komunitas";
  const readyAt = link.communitySince
    ? new Date(link.communitySince.getTime() + config.communityWaitDays * 86_400_000)
    : null;
  const membershipStatus = link.communityMember && link.communitySince
    ? [
        "⚠️ **Status Community Roblox:** ✅ **SUDAH BERGABUNG!**",
        `🕒 Pertama terdeteksi: ${discordTimestamp(link.communitySince, "F")}`,
        readyAt && readyAt > new Date()
          ? [
              "⏳ **Belum bisa klaim cashback.**",
              `Akunmu masih menjalani masa tunggu **${config.communityWaitDays} hari** sejak pertama terdeteksi bergabung.`,
              `📅 **Klaim akan terbuka pada:** ${discordTimestamp(readyAt, "F")}`
            ].join("\n")
          : `✅ Masa tunggu **${config.communityWaitDays} hari** selesai. Cashback sekarang **sudah dapat diklaim**.`
      ].join("\n")
    : [
        "⚠️ **Status Community Roblox:** ❌ **BELUM BERGABUNG!**",
        `👉 Tekan tombol **Masuk Community**. Hitungan **${config.communityWaitDays} hari** belum dimulai.`,
        `Bot memeriksa status setiap ${config.membershipCheckMinutes} menit.`
      ].join("\n");
  const replacementNotice = existingDiscord && existingDiscord.robloxUserId !== user.id
    ? `🔄 Akun sebelumnya: **@${existingDiscord.robloxUsername}**`
    : null;
  await interaction.editReply({
    content: [
      "✅ **Berhasil Terhubung!**",
      `👤 Username Roblox: **${user.name}**`,
      `🪪 Roblox User ID: **${user.id}**`,
      `⛔ Nickname Discord: **${guildMember.displayName}** (@${interaction.user.username})`,
      replacementNotice,
      "",
      membershipStatus,
      "",
      "💸 **Channel Map & Cashback:**",
      `Kamu sekarang memiliki role terverifikasi dan dapat mengakses ${guide} untuk membuka map dan layanan cashback **${config.cashbackPercent}%**.`
    ].filter((line): line is string => line !== null).join("\n"),
    embeds: [],
    components: verificationSuccessRows()
  });
}

async function showBalance(
  interaction: ButtonInteraction | ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const original = await getLinkByDiscord(interaction.user.id);
  if (!original) {
    await interaction.editReply("Hubungkan akun Roblox kamu terlebih dahulu.");
    return;
  }
  const link = await refreshMembership(original);
  await refreshEligibilityForUser(link.robloxUserId);
  const balance = await getBalance(link.robloxUserId);
  const readyAt = link.communitySince
    ? new Date(link.communitySince.getTime() + config.communityWaitDays * 86_400_000)
    : null;
  const communityStatus = !link.communityMember
    ? `Belum terdeteksi — hitungan ${config.communityWaitDays} hari belum dimulai`
    : readyAt && readyAt > new Date()
      ? `Terdeteksi ${discordTimestamp(link.communitySince!, "F")}\nMemenuhi syarat ${discordTimestamp(readyAt, "R")}`
      : `Memenuhi syarat\nTerdeteksi ${discordTimestamp(link.communitySince!, "F")}`;
  const embed = new EmbedBuilder()
    .setColor(0x6f9f82)
    .setTitle(`Saldo @${link.robloxUsername}`)
    .addFields(
      { name: "Bisa dicairkan", value: `**${balance.available} R$**`, inline: true },
      { name: "Pending", value: `**${balance.pending} R$**`, inline: true },
      { name: "Dalam claim", value: `**${balance.locked} R$**`, inline: true },
      { name: "Sudah dibayar", value: `**${balance.paid} R$**`, inline: true },
      { name: "Total belanja", value: `**${balance.totalSpent} R$**`, inline: true },
      { name: "Komunitas", value: communityStatus, inline: false }
    )
    .setFooter({ text: `Payout hanya ke Roblox ID ${link.robloxUserId}` });
  await interaction.editReply({ embeds: [embed] });
}

async function handleCommand(
  interaction: ChatInputCommandInteraction,
  client: Client
): Promise<void> {
  if (interaction.commandName === "saldo") {
    await showBalance(interaction);
    return;
  }
  if (!isAdmin(interaction)) {
    await interaction.reply({ content: "Perintah ini khusus admin.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (interaction.commandName === "panel") {
    if (!interaction.channel?.isSendable()) throw new Error("Channel ini tidak dapat dikirimi pesan.");
    const kind = interaction.options.getString("jenis", true);
    await interaction.channel.send(kind === "verification" ? verificationPanel() : cashbackPanel());
    await interaction.reply({ content: "Panel berhasil dikirim.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (interaction.commandName === "admin-unlink") {
    const user = interaction.options.getUser("user", true);
    const removed = await unlinkDiscord(user.id);
    if (interaction.guild) {
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (member) await member.roles.remove(config.verifiedRoleId).catch(() => undefined);
    }
    await interaction.reply({
      content: removed ? `Hubungan akun ${user} dilepas.` : `${user} belum memiliki akun terhubung.`,
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (interaction.commandName === "admin-add-purchase") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const username = interaction.options.getString("username", true);
    const user = await resolveRobloxUsername(username);
    if (!user) {
      await interaction.editReply("Username Roblox tidak ditemukan.");
      return;
    }
    const result = await recordPurchase(client, {
      eventId: randomId(`manual-${interaction.user.id}`),
      robloxUserId: user.id,
      robloxUsername: user.name,
      assetId: interaction.options.getInteger("item-id", true),
      assetName: interaction.options.getString("item-name", true),
      itemType: "asset",
      priceRobux: interaction.options.getInteger("harga", true),
      purchasedAt: new Date()
    });
    await interaction.editReply(
      result.duplicate ? "Transaksi duplikat." : `Pembelian @${user.name} berhasil ditambahkan.`
    );
    return;
  }

  if (interaction.commandName === "admin-community-age") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const username = interaction.options.getString("username", true);
    const days = interaction.options.getInteger("hari", true);
    const user = await resolveRobloxUsername(username);
    if (!user) {
      await interaction.editReply("Username Roblox tidak ditemukan.");
      return;
    }
    const member = await isCommunityMember(user.id, config.robloxGroupId);
    if (!member) {
      await interaction.editReply(`@${user.name} saat ini tidak terdeteksi di komunitas Roblox.`);
      return;
    }
    const link = await setCommunityAge(user.id, days);
    await interaction.editReply(
      link
        ? `Usia komunitas @${user.name} dikoreksi menjadi **${days} hari**.`
        : `@${user.name} belum terhubung ke Discord.`
    );
    return;
  }

  if (interaction.commandName === "admin-community-check") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const username = interaction.options.getString("username", true);
    const user = await resolveRobloxUsername(username);
    if (!user) {
      await interaction.editReply("Username Roblox tidak ditemukan.");
      return;
    }
    const original = await getLinkByRoblox(user.id);
    if (!original) {
      await interaction.editReply(`@${user.name} belum terhubung ke akun Discord.`);
      return;
    }
    const link = await refreshMembership(original);
    const readyAt = link.communitySince
      ? new Date(link.communitySince.getTime() + config.communityWaitDays * 86_400_000)
      : null;
    await interaction.editReply(
      [
        `**Pemeriksaan Community @${link.robloxUsername}**`,
        `Community ID: **${config.robloxGroupId}**`,
        `Status API Roblox: **${link.communityMember ? "ANGGOTA" : "BUKAN ANGGOTA"}**`,
        `Pertama terdeteksi: ${link.communitySince ? discordTimestamp(link.communitySince, "F") : "belum tercatat"}`,
        `Syarat: **${config.communityWaitDays} hari**`,
        `Memenuhi syarat: ${readyAt ? discordTimestamp(readyAt, "F") : "belum dimulai"}`
      ].join("\n")
    );
  }
}
