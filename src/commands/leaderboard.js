import { collection, getDocs, doc } from "firebase/firestore";
import { EmbedBuilder } from "discord.js";

export default async function leaderboard(interaction, db) {
  const config = {
    leaderboard: {
      field: "points",
      label: "points",
      title: "🏆 Points Leaderboard",
      color: "#FF0000",
    },
    gameleaderboard: {
      field: "gamewins",
      label: "points",
      title: "🎲 Game Points Leaderboard",
      color: "#0000FF",
    },
    strokes: {
      field: "strokes",
      label: "strokes",
      title: "💔 Strokes Leaderboard",
      color: "#FFA500",
    },
  };

  const { commandName } = interaction;
  const { field, label, title, color } = config[commandName];

  try {
    const usersRef = collection(db, "users");
    const snapshot = await getDocs(usersRef);
    const leaderboard = [];

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      if (data[field] != null) {
        let member = interaction.guild.members.cache.get(docSnap.id);
        if (!member) {
          try {
            member = await interaction.guild.members.fetch(docSnap.id);
          } catch (err) {
            continue;
          }
        }
        leaderboard.push({
          userId: docSnap.id,
          displayName: member?.displayName || "Unknown",
          value: data[field],
        });
      }
    }

    leaderboard.sort((a, b) => b.value - a.value);

    let description = leaderboard.length
      ? leaderboard
          .map((entry, i) => {
            const prefix = i === 0 ? "👑" : `${i + 1}.`;
            const isYou = entry.userId === interaction.user.id;
            const display = isYou
              ? `➡️ ${entry.displayName}`
              : entry.displayName;
            return `${prefix} ${display} - **${entry.value}** ${label}`;
          })
          .join("\n")
      : `⚠️ No users have ${label} yet.`;

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(description);

    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    console.error("Error fetching leaderboard:", err);
    interaction.reply("❌ Failed to fetch the leaderboard.");
  }
}
