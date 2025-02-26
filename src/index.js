import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { collection, doc, getDoc, setDoc, getDocs } from "firebase/firestore";
import {
  Client,
  IntentsBitField,
  EmbedBuilder,
  Collection,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { OpenAI } from "openai";
import "dotenv/config";
import { assassinlist } from "../assassinlist.js";
import cron from "node-cron";
import moment from "moment-timezone";

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_PROJECT_KEY,
});

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMembers,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent,
  ],
});

client.cooldowns = new Collection();

var waplayers = [
  // "824653557894479972",
  // "687670751893258252",
  // "547840354796175371",
  // "592084552323825683",
  // "925275963749724191",
  // "1018025282457841704",
  // "775091235764568084",
  // "960320792334331915",
  // "831637612166905867",
];
var alivewaplayers = [
  // "824653557894479972",
  // "687670751893258252",
  // "547840354796175371",
  // "592084552323825683",
  // "925275963749724191",
  // "1018025282457841704",
  // "775091235764568084",
  // "960320792334331915",
  // "831637612166905867",
];
// var waplayers = [
//   "dale",
//   "eli",
//   "rocky",
//   "izz",
//   "sean",
//   "prneeta",
//   "elgina",
//   "adam",
//   "steve",
// ];
// var alivewaplayers = [
//   "dale",
//   "eli",
//   "rocky",
//   "izz",
//   "sean",
//   "prneeta",
//   "elgina",
//   "adam",
//   "steve",
// ];

var watargets = {};
var eliminatedwaplayers = [];

const commandCooldowns = {
  leaderboard: 10,
  whosent: 15,
  guesswhosent: 5,
  glaze: 30,
  diss: 30,
  gameleaderboard: 10,
  wordassassin: 3,
};

let gameRunning = false;
let wordAssassinRunning = false;
let waRoundStarted = false;
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

  if (waRoundStarted) {
    let playerId = msg.author.id; // The person who sent the message

    // Check if the player is a target in the game
    if (watargets[playerId]) {
      let assassin = null;
      let killWord = null;

      for (let player in watargets) {
        if (watargets[player].target === playerId) {
          assassin = player;
          killWord = watargets[player].word;
          break;
        }
      }
      let messageText = msg.content.toLowerCase(); // raw msg in lowercase

      // typos not allowed but no spaces surrounding the word still count
      let wordRegex = new RegExp(`\\b${killWord}\\b|${killWord}`, "i");
      if (wordRegex.test(messageText)) {
        let assassin = null;

        // find the assassin (who was assigned to kill this player)
        for (let player in watargets) {
          if (watargets[player].target === playerId) {
            assassin = player;
            break;
          }
        }

        if (assassin) {
          let newTarget = watargets[playerId].target; // next target

          eliminatedwaplayers.unshift(playerId);
          eliminatePlayer(watargets, playerId);

          // Remove the dead player from alivewaplayers
          alivewaplayers = alivewaplayers.filter((id) => id !== playerId);

          // Check if only one player remains → Declare winner
          if (alivewaplayers.length === 1) {
            let winnerId = alivewaplayers[0];
            let winnerUser = client.users.cache.get(winnerId);

            eliminatedwaplayers.unshift(winnerId);

            let firstPlace =
              client.users.cache.get(eliminatedwaplayers[0]) || "Unknown";
            let secondPlace =
              client.users.cache.get(eliminatedwaplayers[1]) || "N/A";
            let thirdPlace =
              client.users.cache.get(eliminatedwaplayers[2]) || "N/A";

            const embed = new EmbedBuilder()
              .setColor("#FFD700") // Gold color for the victory theme
              .setTitle("🏆 Word Assassin winners")
              .setDescription(
                `With the word **"${killWord}"**, the assassin **${winnerUser}** has brutally KILLED ${msg.author} and won Word Assassin, what a sigma. \n\n` +
                  `🥇 **1st Place:** ${firstPlace} (+10 points)\n` +
                  `🥈 **2nd Place:** ${secondPlace} (+5 points)\n` +
                  `🥉 **3rd Place:** ${thirdPlace} (+3 points)\n`
              );

            msg.channel.send({ embeds: [embed] });

            await givePoints(db, eliminatedwaplayers[0], 10);
            await givePoints(db, eliminatedwaplayers[1], 5);
            await givePoints(db, eliminatedwaplayers[2], 3);

            // Reset the game
            waRoundStarted = false;
            wordAssassinRunning = false;
            watargets = {};
            alivewaplayers = [];
            waplayers = [];
            return;
          }

          // Announce the elimination in the channel
          msg.channel.send(
            `💀 **${msg.author}** has died of a mysterious cause for saying **${killWord}** (those who know). To a certain person, check your DMs...`
          );

          // DM the assassin their new target and word
          try {
            const assassinUser = await client.users.fetch(assassin);

            const embed = new EmbedBuilder()
              .setColor("#BF40BF")
              .setTitle("🔪 Word Assassin KILL!!!")
              .setDescription(
                `You killed ${msg.author} 💀\n\n` +
                  `🎯 Your new target: ${
                    client.users.cache.get(newTarget).displayName
                  }\n` +
                  `🗣️ Your new word: **${watargets[assassin].word}**\n\n`
              );

            await assassinUser.send({ embeds: [embed] });
          } catch (error) {
            console.error(`Failed to DM ${assassin}:`, error);
          }
        }
      }
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

  if (interaction.commandName == "wordassassin") {
    if (wordAssassinRunning) {
      let description = "";
      if (waplayers.length == 0) {
        description = "😢 Nobody has joined the game yet.";
      } else {
        if (waRoundStarted) {
          description += `The game is still ongoing!\n\nNote: player statuses are hidden to prevent people from predicting who is hunting them and spoiling the fun.`;
        } else {
          for (const i in waplayers) {
            const id = waplayers[i];
            const user = await interaction.guild.members.fetch(id);
            if (alivewaplayers.includes(id)) {
              description += `🟢 ${user.displayName}`;
            } else {
              description += `💀 ${user.displayName}`;
            }
            description += "\n";
          }
        }
      }
      const embed = new EmbedBuilder()
        .setColor("008000")
        .setTitle("⚔️ Word Assassin Players")
        .setDescription(description);
      await interaction.reply({ embeds: [embed] });
    } else {
      wordAssassinRunning = true;
      // waplayers = [];
      watargets = {};
      // alivewaplayers = [];
      const description =
        "Welcome to Word Assassin!\n\nIf you haven't already, read the rules below. By default, you are not playing, so **use /joinwa to be included.** After everyone has joined, someone will manually start it.\n\nAfter the game has started, your word will be sent to you through DM. Place top 3 for a reward!";
      const embed = new EmbedBuilder()
        .setColor("008000")
        .setTitle("🔪 Word Assassin")
        .setDescription(description);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("View Rules")
          .setStyle(ButtonStyle.Link)
          .setURL(
            "https://docs.google.com/document/d/1g8DD6LseAorGfkHovE-IK4wlZwrmVM64_rSmZNKkRso/edit?usp=sharing"
          )
      );

      await interaction.reply({ embeds: [embed], components: [row] });
    }
  }

  if (interaction.commandName == "joinwa") {
    if (!wordAssassinRunning) {
      interaction.reply(
        "⛔ A game isn't running, use **/wordassassin** to create one!"
      );
      return;
    }

    if (joinWaGame(interaction.user.id)) {
      if (waRoundStarted) {
        interaction.reply("Sorry, the round has already started.");
        return;
      }
      interaction.reply(
        `✏️ **${interaction.user.displayName}** has joined the word assassin game! (${waplayers.length} people so far)`
      );
    } else {
      interaction.reply("You've already joined the game 😹");
    }
  }

  if (interaction.commandName == "startwa") {
    if (waplayers.length < 2) {
      interaction.reply("Hmm, we need more players.");
      return;
    }

    if (interaction.user.id != "824653557894479972") {
      interaction.reply("YOU CANNOT START THE GAME!!!!!!!!!!");
      return;
    }

    if (waRoundStarted) {
      interaction.reply("Round's already started!");
      return;
    }

    waRoundStarted = true;
    // Assign targets and words
    watargets = assignTargetsAndWords(waplayers, alivewaplayers, assassinlist);
    console.log(`Initial assignments: ${JSON.stringify(watargets, null, 2)}`);

    // DM each player their target and the word they need them to say
    waplayers.forEach(async (playerId) => {
      if (watargets[playerId]) {
        try {
          const user = await interaction.guild.members.fetch(playerId); // The current player
          const targetUser = await interaction.guild.members.fetch(
            watargets[playerId].target
          ); // Their target

          // Find the word their target must avoid
          let killWord = null;
          for (let assassinId in watargets) {
            if (watargets[assassinId].target === targetUser.id) {
              killWord = watargets[assassinId].word;
              break;
            }
          }

          const embed = new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("🔪 Word Assassin assignment")
            .setDescription(
              `🎯 Your target: ${targetUser.displayName}\n` +
                `🗣️ Your target's forbidden word: **${killWord}**\n\n` +
                `💀 Trick them into saying this word to eliminate them`
            );

          await user.send({ embeds: [embed] });
        } catch (error) {
          console.error(`Failed to DM ${playerId}:`, error);
        }
      }
    });

    const embed = new EmbedBuilder()
      .setColor("#008000") // Green for "game started"
      .setTitle("💀 Word Assassin start")
      .setDescription(
        "The game has started fellas. Check your DMs for your target and kill word.\n\n" +
          "📝 **/wordassassin** will hide the status of the players to prevent people from finding out who is hunting them."
      );

    interaction.reply({ embeds: [embed] });
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

    // No return needed if you don't need to use newTotal outside this function
  } catch (error) {
    console.error("Error updating points:", error);
    throw error; // so the caller can still handle it
  }
}

function joinWaGame(userId) {
  if (waplayers.includes(userId)) {
    return false;
  }
  waplayers.push(userId);
  alivewaplayers.push(userId);
  console.log(waplayers);
  return true;
}

function assignTargetsAndWords(waplayers, alivewaplayers, words) {
  let watargets = {};

  if (alivewaplayers.length < 2) {
    throw new Error("At least two players are required.");
  }

  // Shuffle function (Fisher-Yates)
  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  shuffle(alivewaplayers);
  shuffle(words);

  // Ensure we have enough words
  if (words.length < alivewaplayers.length) {
    throw new Error("Not enough words for all players.");
  }

  // Assign targets and words in a circular fashion
  for (let i = 0; i < alivewaplayers.length; i++) {
    let player = alivewaplayers[i];
    let target = alivewaplayers[(i + 1) % alivewaplayers.length]; // Circular assignment
    let word = words[i];

    watargets[player] = { target, word };
  }

  return watargets;
}

// Function to handle when a player is eliminated
function eliminatePlayer(watargets, deadPlayer) {
  if (!watargets[deadPlayer]) {
    console.warn(`Player ${deadPlayer} is not in the game.`);
    return;
  }

  let targetOfDead = watargets[deadPlayer].target; // Who the dead player was supposed to eliminate
  let wordOfDead = watargets[deadPlayer].word; // The forbidden word assigned to the dead player
  let assassin = null;

  // Find the assassin (who had the dead player as their target)
  for (let player in watargets) {
    if (watargets[player].target === deadPlayer) {
      assassin = player;
      break;
    }
  }

  // If an assassin exists, reassign their target AND word to the dead player's target
  if (assassin) {
    watargets[assassin].target = targetOfDead;
    watargets[assassin].word = wordOfDead;
  }

  // Remove the dead player from the targets list
  delete watargets[deadPlayer];

  console.log(
    `Player ${deadPlayer} has been eliminated. Their target (${targetOfDead}) and word ("${wordOfDead}") are now assigned to ${assassin}.`
  );
}
