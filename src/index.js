import { Client, IntentsBitField, Collection, MessageFlags } from "discord.js";

import "dotenv/config";
import db from "./services/firebase.js";

// import commands in ./commands/
import glaze from "./commands/glaze.js";
import diss from "./commands/diss.js";
import leaderboard from "./commands/leaderboard.js";
import recap from "./commands/recap.js";
import { whosent, guesswhosent } from "./commands/whosent.js";

// import utils in ./utils/
import { startReminderCron } from "./utils/reminder.js";
import checkCooldown from "./utils/checkCooldown.js";

// import events in ./events/
import handleMessage from "./events/messageCreate.js";

const commandHandlers = {
  glaze,
  diss,
  recap,
  whosent,
};

const guessGameHandlers = {
  guesswhosent,
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

client.on("ready", async (c) => {
  console.log(`✅ ${c.user.tag} is online.`);

  startReminderCron(client);
});

client.on("messageCreate", async (msg) => {
  await handleMessage(msg, db);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // interaction cooldown
  const passedCooldown = await checkCooldown(interaction);
  if (!passedCooldown) return;

  let command = interaction.commandName;

  if (commandHandlers[command]) {
    return commandHandlers[command](interaction, client);
  }
  if (guessGameHandlers[command]) {
    return guessGameHandlers[command](interaction, db);
  }

  if (["leaderboard", "gameleaderboard", "strokes"].includes(command)) {
    return leaderboard(interaction, db);
  }
});

client.login(process.env.TOKEN);
