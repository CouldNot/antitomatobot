import { EmbedBuilder } from "discord.js";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { fetchAllMessages } from "../utils/fetchMessages.js";

let gameRunning = false;
let chosenMessage = "";
let chosenAuthor = "";
let chosenDate = "";

export async function whosent(interaction, client) {
  if (gameRunning) {
    return interaction.reply("U can't start a new game dawg");
  }

  gameRunning = true;
  await interaction.deferReply();

  const messages = await fetchAllMessages(client, 10, 300, 600);
  if (messages.length === 0) {
    gameRunning = false;
    return interaction.editReply("I couldn't find any valid messages.");
  }

  chosenMessage = messages[Math.floor(Math.random() * messages.length)];
  chosenAuthor = chosenMessage.author;
  chosenDate = chosenMessage.createdAt;

  const embed = new EmbedBuilder()
    .setColor("#FF0000")
    .setTitle("🤔🎲 Let's play a game!")
    .setDescription(
      "Use /guesswhosent to guess who sent this message.\n\n> **" +
        chosenMessage.content +
        "**"
    );

  return interaction.editReply({ embeds: [embed] });
}

export async function guesswhosent(interaction, db) {
  if (!gameRunning) {
    return interaction.reply(
      "Someone got it already 😱 (or there's no game happening)"
    );
  }

  const guessId = interaction.options.get("user")?.value;
  if (guessId === chosenAuthor.id) {
    gameRunning = false;

    const formattedDate = chosenDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const userRef = doc(db, "users", interaction.user.id);
    try {
      const docSnap = await getDoc(userRef);
      const currentWins = docSnap.exists()
        ? Number(docSnap.data().gamewins ?? 0)
        : 0;
      await setDoc(userRef, { gamewins: currentWins + 1 }, { merge: true });
    } catch (error) {
      console.error("Error updating game wins:", error);
    }

    return interaction.reply(
      `✅ Correct! The message was sent by ${chosenAuthor.displayName}.\n > "${chosenMessage.content}"\n > ${chosenAuthor.displayName}, ${formattedDate}`
    );
  } else {
    const user = interaction.guild.members.cache.get(guessId);
    return interaction.reply(`❌ Lol try again, it's not ${user.displayName}.`);
  }
}
