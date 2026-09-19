import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} from "discord.js";
import { config } from "./config.js";

export function verificationPanel(): {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const embed = new EmbedBuilder()
    .setColor(0xc98b8e)
    .setTitle("🔗 Hubungkan Akun Roblox")
    .setDescription(
      [
        "Hubungkan akun Discord kamu ke akun Roblox agar channel komunitas dan saldo cashback dapat diakses.",
        "",
        "Kamu hanya perlu memasukkan **username Roblox**—bot tidak pernah meminta password.",
        "",
        "⚠️ Pastikan akunnya benar. Kamu dapat mengganti akun sendiri selama akun lama belum mempunyai transaksi atau claim."
      ].join("\n")
    )
    .setFooter({ text: "Saldo dan payout selalu terkunci ke Roblox User ID yang terhubung." });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("verify:start")
      .setLabel("Hubungkan Akun")
      .setEmoji("🔗")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setLabel("Masuk Community")
      .setEmoji("👥")
      .setStyle(ButtonStyle.Link)
      .setURL(`https://www.roblox.com/communities/${config.robloxGroupId}`)
  );
  return { embeds: [embed], components: [row] };
}

export function cashbackPanel(): {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const embed = new EmbedBuilder()
    .setColor(0x6f9f82)
    .setTitle("💰 Saldo & Claim Cashback")
    .setDescription(
      [
        `Cashback **${config.cashbackPercent}%** dari item minimal **${config.minimumItemPrice} Robux** akan digabung menjadi satu saldo.`,
        "",
        `Syarat pencairan: tetap menjadi anggota Community Roblox selama **${config.communityWaitDays} hari**.`,
        "",
        "Gunakan panel ticket claim yang disediakan server. Setelah bukti diperiksa, admin akan memasukkan saldomu ke antrean pencairan."
      ].join("\n")
    );
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("cashback:balance")
      .setLabel("Cek Saldo")
      .setEmoji("💳")
      .setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [embed], components: [row] };
}
