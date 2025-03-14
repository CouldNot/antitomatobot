import "dotenv/config";
import { ApplicationCommandOptionType, REST, Routes } from "discord.js";

const commands = [
  {
    name: "startwa",
    description: "Starts the word assassin game.",
  },
  {
    name: "wordassassin",
    description: "Shows the current word assassin game (or creates one).",
  },
  {
    name: "joinwa",
    description: "Joins a running word assassin game.",
  },
  {
    name: "leaderboard",
    description: "Shows the points leaderboard.",
  },
  {
    name: "strokes",
    description: "Shows the strokes leaderboard.",
  },
  {
    name: "gameleaderboard",
    description: "Shows the game wins leaderboard.",
  },
  {
    name: "glaze",
    description: "Glazes a person of your choice.",
    options: [
      {
        name: "user",
        description: "Chosen user",
        type: ApplicationCommandOptionType.User,
        required: true,
      },
    ],
  },
  {
    name: "diss",
    description: "Disses a person of your choice.",
    options: [
      {
        name: "user",
        description: "Chosen user",
        type: ApplicationCommandOptionType.User,
        required: true,
      },
    ],
  },
  {
    name: "whosent",
    description: "Play a game! Guess who sent a random message.",
  },
  {
    name: "guesswhosent",
    description: "Guess who sent the message in the Who Sent game.",
    options: [
      {
        name: "user",
        description: "Chosen user",
        type: ApplicationCommandOptionType.User,
        required: true,
      },
    ],
  },
];

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log("Registering slash commands...");

    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );

    console.log("Slash commands were registered successfully!");
  } catch (error) {
    console.log(`There was an error: ${error}`);
  }
})();
