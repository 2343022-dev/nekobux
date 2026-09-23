import {
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder
} from "discord.js";
import { config } from "./config.js";

const commands = [
  new SlashCommandBuilder()
    .setName("saldo")
    .setDescription("Lihat saldo cashback Roblox kamu."),
  new SlashCommandBuilder()
    .setName("riwayat")
    .setDescription("Lihat riwayat pembelian dan cashback Roblox kamu."),
  new SlashCommandBuilder()
    .setName("test-gagal-claim")
    .setDescription("Kirim preview gagal claim tanpa mengubah saldo atau klaim.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("test-payout-log")
    .setDescription("Menguji banner dan pengiriman payout log.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("panel")
    .setDescription("Kirim panel bot ke channel ini.")
    .addStringOption((option) =>
      option
        .setName("jenis")
        .setDescription("Panel yang ingin dikirim")
        .setRequired(true)
        .addChoices(
          { name: "Verifikasi Roblox", value: "verification" }
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("admin-unlink")
    .setDescription("Lepaskan hubungan Discord–Roblox milik user.")
    .addUserOption((option) =>
      option.setName("user").setDescription("User Discord").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("admin-riwayat")
    .setDescription("Lihat riwayat pembelian dan cashback milik user.")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User Discord")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("admin-add-purchase")
    .setDescription("Tambahkan pembelian yang tidak tercatat secara manual.")
    .addStringOption((option) =>
      option.setName("username").setDescription("Username Roblox").setRequired(true)
    )
    .addIntegerOption((option) =>
      option.setName("item-id").setDescription("Asset/catalog ID").setMinValue(1).setRequired(true)
    )
    .addStringOption((option) =>
      option.setName("item-name").setDescription("Nama item").setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("harga")
        .setDescription("Harga item dalam Robux")
        .setMinValue(config.minimumItemPrice)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("test-purchase-card")
    .setDescription("Kirim preview card pembelian tanpa menambah saldo.")
    .addStringOption((option) =>
      option.setName("username").setDescription("Username Roblox untuk preview").setRequired(true)
    )
    .addIntegerOption((option) =>
      option.setName("item-id").setDescription("Asset atau bundle ID").setMinValue(1).setRequired(true)
    )
    .addStringOption((option) =>
      option.setName("item-name").setDescription("Nama item untuk preview").setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("harga")
        .setDescription("Harga item dalam Robux")
        .setMinValue(config.minimumItemPrice)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("jenis")
        .setDescription("Jenis produk Roblox")
        .setRequired(false)
        .addChoices(
          { name: "Catalog item", value: "asset" },
          { name: "Bundle", value: "bundle" }
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("admin-community-age")
    .setDescription("Koreksi lama keanggotaan komunitas setelah admin memeriksa.")
    .addStringOption((option) =>
      option.setName("username").setDescription("Username Roblox").setRequired(true)
    )
    .addIntegerOption((option) =>
      option.setName("hari").setDescription("Sudah bergabung berapa hari").setMinValue(0).setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("admin-community-check")
    .setDescription("Periksa status komunitas terbaru langsung dari Roblox.")
    .addStringOption((option) =>
      option.setName("username").setDescription("Username Roblox").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("acc-claim")
    .setDescription("Setujui bukti dan masukkan seluruh saldo user ke antrean pencairan.")
    .addUserOption((option) =>
      option.setName("user").setDescription("User Discord pemilik klaim").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("claim-dibayar")
    .setDescription("Tandai klaim di list pencairan sebagai sudah dibayar manual.")
    .addIntegerOption((option) =>
      option.setName("id").setDescription("ID klaim").setMinValue(1).setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("batal-claim")
    .setDescription("Batalkan klaim aktif dan kembalikan saldonya.")
    .addIntegerOption((option) =>
      option.setName("id").setDescription("ID klaim").setMinValue(1).setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("alasan")
        .setDescription("Alasan pembatalan")
        .setMinLength(3)
        .setMaxLength(300)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
].map((command) => command.toJSON());

export async function registerCommands(): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(config.discordToken);
  await rest.put(Routes.applicationGuildCommands(config.discordClientId, config.guildId), {
    body: commands
  });
}
