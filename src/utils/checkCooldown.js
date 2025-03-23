import { Collection, MessageFlags } from "discord.js";

const commandCooldowns = {
  leaderboard: 10,
  whosent: 15,
  guesswhosent: 5,
  glaze: 30,
  diss: 30,
  gameleaderboard: 10,
  recap: 20,
};

export default async function checkCooldown(interaction) {
  const { cooldowns } = interaction.client;
  const command = interaction.commandName;

  if (!cooldowns.has(command)) {
    cooldowns.set(command, new Collection());
  }

  const now = Date.now();
  const timestamps = cooldowns.get(command);
  const defaultCooldown = 3;
  const cooldownAmount = (commandCooldowns[command] ?? defaultCooldown) * 1000;

  if (timestamps.has(interaction.user.id)) {
    const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;
    if (now < expirationTime) {
      const remaining = Math.ceil((expirationTime - now) / 1000);
      await interaction.reply({
        content: `Bro chill out wait **${remaining}s** 😭🙏`,
        flags: MessageFlags.Ephemeral,
      });
      return false;
    }
  }

  timestamps.set(interaction.user.id, now);
  setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);
  return true;
}
