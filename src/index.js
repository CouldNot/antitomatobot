import { doc, getDoc, setDoc, getDocs } from "firebase/firestore";
import {
  Client,
  IntentsBitField,
  EmbedBuilder,
  Collection,
  MessageFlags,
} from "discord.js";

import "dotenv/config";
import cron from "node-cron";
import moment from "moment-timezone";
import db from "./services/firebase.js";

// import all commands in ./commands/
import glaze from "./commands/glaze.js";
import diss from "./commands/diss.js";
import leaderboard from "./commands/leaderboard.js";
import recap from "./commands/recap.js";

// import utils in ./utils/
import fetchAllMessages from "./utils/fetchMessages.js";
import { givePoints, giveStrokes } from "./utils/points.js";

const commandHandlers = {
  glaze,
  diss,
  recap,
};

const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMembers,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent,
  ],
});

client.cooldowns = new Collection();

const commandCooldowns = {
  leaderboard: 10,
  whosent: 15,
  guesswhosent: 5,
  glaze: 30,
  diss: 30,
  gameleaderboard: 10,
  recap: 20,
};

// who sent
let gameRunning = false;
let chosenMessage = "";
let chosenAuthor = "";
let chosenDate = "";

client.on("ready", async (c) => {
  console.log(`✅ ${c.user.tag} is online.`);
  const startDate = new Date("2025-02-23");

  cron.schedule(
    "0 22 * * *", // 10 PM
    async () => {
      try {
        const userId = process.env.PRNEETA_CLIENT_ID;
        const user = await client.users.fetch(userId);

        if (!user) {
          console.error("Could not find the user to dm");
          return;
        }

        // Get the current time in PST
        const today = moment().tz("America/Los_Angeles").toDate();
        const diffTime = Math.abs(today - startDate);
        const dayCount = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // Convert milliseconds to days

        await user.send(`Day ${dayCount} of reminding you to journal 🔥`);
        console.log(
          `dm sent successfully at ${today.toLocaleString("en-US", {
            timeZone: "America/Los_Angeles",
          })}.`
        );
      } catch (error) {
        console.error("failed to send dm:", error);
      }
    },
    {
      scheduled: true,
      timezone: "America/Los_Angeles", // Set timezone to PST
    }
  );

  console.log("Daily DM schedule set for 10 PM PST.");
});

client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;

  if (msg.author.id === process.env.POINT_CLIENT_ID) {
    const match = msg.content.match(/^\+(\d+)$/);
    if (!match) return;

    const repliedUser = msg.mentions.repliedUser;
    if (!repliedUser) {
      return msg.reply("⚠️ Please reply to a user to give them points.");
    }
    if (repliedUser.id === process.env.CLIENT_ID) return;

    const number = parseInt(match[1], 10);

    try {
      await givePoints(db, repliedUser.id, number);
      msg.reply(
        `🤑 ${repliedUser} has gained ${number} points!\n> *Use /leaderboard to track progress.*`
      );
    } catch (error) {
      msg.reply("❌ Failed to update points. Please try again.");
    }
  }

  if (msg.author.id === process.env.IZZ_CLIENT_ID) {
    const match = msg.content.match(/^\+(\d+)$/);

    if (!match) return;

    const repliedUser = msg.mentions.repliedUser;
    if (!repliedUser) {
      return msg.reply("Reply to a user to stroke.");
    }
    if (repliedUser.id === process.env.CLIENT_ID) return;

    const number = parseInt(match[1], 10);

    try {
      await giveStrokes(db, repliedUser.id, number);
      msg.reply(
        `💔 ${repliedUser}'s message has been stroked to ${number} times (ts pmo) \n> *Use /strokes to track.*`
      );
    } catch (error) {
      msg.reply("Failed to update. Please try again.");
    }
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { cooldowns } = interaction.client;
  let command = interaction.commandName;
  if (!cooldowns.has(command)) {
    cooldowns.set(command, new Collection());
  }
  const now = Date.now();
  const timestamps = cooldowns.get(command);
  const defaultCooldownDuration = 3;
  const cooldownAmount =
    (commandCooldowns[command] ?? defaultCooldownDuration) * 1_000;

  if (timestamps.has(interaction.user.id)) {
    const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;

    if (now < expirationTime) {
      return interaction.reply({
        content: `Bro chill out wait a bit longer 😭🙏`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  timestamps.set(interaction.user.id, now);
  setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);

  if (commandHandlers[command]) {
    return commandHandlers[command](interaction, client);
  }
  if (["leaderboard", "gameleaderboard", "strokes"].includes(command)) {
    return leaderboard(interaction, db);
  }

  if (interaction.commandName === "whosent") {
    if (gameRunning) {
      return interaction.reply("U can't start a new game dawg");
    }
    gameRunning = true;
    await interaction.deferReply();
    const messages = await fetchAllMessages(client, 10, 300, 600); // from ./utils/
    if (messages.length === 0) {
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

  if (interaction.commandName === "guesswhosent") {
    if (!gameRunning) {
      return interaction.reply(
        "Someone got it already 😱 (or there's no game happening)"
      );
    }
    if (interaction.options.get("user")?.value === chosenAuthor.id) {
      gameRunning = false;
      const formattedDate = chosenDate.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      const userRef = doc(db, "users", interaction.user.id);

      try {
        const docSnap = await getDoc(userRef);
        let currentWins = docSnap.exists()
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
      let user = interaction.guild.members.cache.get(
        interaction.options.get("user")?.value
      );
      return interaction.reply(
        `❌ Lol try again, it's not ${user.displayName}.`
      );
    }
  }
});

client.login(process.env.TOKEN);
