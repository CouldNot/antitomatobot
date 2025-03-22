import { collection, doc, getDoc, setDoc, getDocs } from "firebase/firestore";
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
import openai from "./services/openai.js";

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

  if (
    interaction.commandName === "glaze" ||
    interaction.commandName === "diss"
  ) {
    var prompt = "";
    const isGlaze = interaction.commandName === "glaze";
    const id = interaction.options.get("user")?.value;
    const tag = (await client.users.fetch(id)).globalName;

    if (id === process.env.CLIENT_ID) {
      if (isGlaze) return interaction.reply("I am unglazable.");
      else return interaction.reply("I am undissable.");
    }

    if (isGlaze) {
      prompt = `Write over-the-top praise for a person named "${tag}" with emojis in a few sentences.`;
    } else {
      prompt = `Write an over-the-top hate rant for a person named "${tag}" in a few sentences with emojis.`;
    }

    await interaction.deferReply();

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        {
          role: "user",
          content: prompt,
        },
      ],
      store: true,
    });

    await interaction.editReply(completion.choices[0].message.content);
  }

  if (interaction.commandName === "leaderboard") {
    sendLeaderboard(
      interaction,
      "points",
      "points",
      "🏆 Points Leaderboard",
      "#FF0000"
    );
  }

  if (interaction.commandName === "gameleaderboard") {
    sendLeaderboard(
      interaction,
      "gamewins",
      "wins",
      "🎲 Game Wins Leaderboard",
      "#0000FF"
    );
  }

  if (interaction.commandName === "strokes") {
    sendLeaderboard(
      interaction,
      "strokes",
      "strokes",
      "💔 Strokes Leaderboard",
      "#FFA500"
    );
  }

  if (interaction.commandName === "whosent") {
    if (gameRunning) {
      return interaction.reply("U can't start a new game dawg");
    }
    gameRunning = true;
    await interaction.deferReply();
    const messages = await fetchAllMessages(10, 300, 600);
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

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "recap")
    return;

  await interaction.deferReply();

  const messages = await interaction.channel.messages.fetch({ limit: 100 });
  const messagesToSummarize = [];

  messages.forEach((msg) => {
    if (!msg.author.bot && msg.content.length > 0) {
      messagesToSummarize.push(
        `${msg.member?.displayName || msg.author.username}: ${msg.content}`
      );
    }
  });

  messagesToSummarize.reverse();

  if (messagesToSummarize.length === 0) {
    return interaction.editReply("An error occurred...");
  }

  // Format messages for OpenAI
  const prompt = `Summarize the following online conversation casually, mimicking the language used: \n\n ${messagesToSummarize.join(
    "\n"
  )}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a summarizer tool that specializes in dealing with casual, online conversation.",
        },
        { role: "user", content: prompt },
      ],
      store: true,
    });

    await interaction.editReply(completion.choices[0].message.content);
  } catch (error) {
    console.error("Error calling OpenAI API:", error);
    await interaction.editReply(
      "An error occurred while generating the summary >:("
    );
  }
});

client.login(process.env.TOKEN);

async function fetchAllMessages(minLength, lowerBound, upperBound) {
  const channel = client.channels.cache.get(process.env.WHOSENT_CHANNEL_ID);
  let messages = [];

  let lastMessage = await channel.messages
    .fetch({ limit: 1 })
    .then((messagePage) => (messagePage.size ? messagePage.first() : null));

  // Fetch messages until we have at least upperBound messages (or run out)
  while (lastMessage && messages.length < upperBound) {
    const messagePage = await channel.messages.fetch({
      limit: 100,
      before: lastMessage.id,
    });

    messagePage.forEach((msg) => {
      if (
        !msg.author.bot &&
        msg.content.length > minLength &&
        !msg.mentions.users.some((user) => user.bot)
      ) {
        messages.push(msg);
      }
    });

    lastMessage = messagePage.size > 0 ? messagePage.last() : null;
  }

  // Return the messages in the range [lowerBound, upperBound)
  return messages.slice(lowerBound, upperBound);
}

async function sendLeaderboard(
  interaction,
  field,
  unitLabel,
  leaderboardTitle,
  color
) {
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
            console.log(`Could not fetch member ${docSnap.id}`, err);
          }
        }
        const displayName = member?.displayName || "Unknown";
        leaderboard.push({
          userId: docSnap.id,
          displayName,
          value: data[field],
        });
      }
    }

    leaderboard.sort((a, b) => b.value - a.value);

    let description = "";
    if (leaderboard.length === 0) {
      description = `⚠️ No users have ${unitLabel} yet.`;
    } else {
      leaderboard.forEach((entry, index) => {
        const prefix = index === 0 ? "👑" : `${index + 1}.`;
        const cleanName = entry.displayName.trim();
        let line = `${prefix} ${cleanName}  -  **${entry.value}** ${unitLabel}`;
        if (entry.userId === interaction.user.id) {
          line = `${prefix} ➡️ ${cleanName}  -  **${entry.value}** ${unitLabel}`;
        }
        description += line + "\n";
      });
    }
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(leaderboardTitle)
      .setDescription(description);

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    interaction.reply("❌ Failed to fetch the leaderboard. Please try again.");
  }
}

async function givePoints(db, userId, pointsToAdd) {
  try {
    const userRef = doc(db, "users", userId);
    const docSnap = await getDoc(userRef);

    let currentPoints = docSnap.exists()
      ? Number(docSnap.data().points ?? 0)
      : 0;

    const newTotal = currentPoints + pointsToAdd;
    await setDoc(userRef, { points: newTotal }, { merge: true });
  } catch (error) {
    console.error("Error updating points:", error);
    throw error;
  }
}

async function giveStrokes(db, userId, pointsToAdd) {
  try {
    const userRef = doc(db, "users", userId);
    const docSnap = await getDoc(userRef);

    let currentPoints = docSnap.exists()
      ? Number(docSnap.data().strokes ?? 0)
      : 0;

    const newTotal = currentPoints + pointsToAdd;
    await setDoc(userRef, { strokes: newTotal }, { merge: true });
  } catch (error) {
    console.error("Error updating strokes:", error);
    throw error;
  }
}
