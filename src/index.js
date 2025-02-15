import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { collection, doc, getDoc, setDoc, getDocs } from "firebase/firestore";
import { Client, IntentsBitField, EmbedBuilder, Collection, MessageFlags } from "discord.js";
import { OpenAI } from 'openai';

import "dotenv/config";

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
    ]
});

client.cooldowns = new Collection();

const commandCooldowns = {
    leaderboard: 10,
    whosent: 15,
    guesswhosent: 5,
    glaze: 30,
    diss: 30,
  };

let gameRunning = false;
let chosenMessage = "";
let chosenAuthor = "";
let chosenDate = "";

client.on('ready', (c) => {
    console.log(`✅ ${c.user.tag} is online.`)
})

client.on('messageCreate', async (msg) => {
    if (msg.author.bot) return;

    if (msg.author.id === process.env.POINT_CLIENT_ID) {
        var match = msg.content.match(/^\+(\d+)$/); // check to see if the message is in the format "+[integer]"
        if (match) {
            var repliedUser = msg.mentions.repliedUser;
            if (!repliedUser) return msg.reply("⚠️ Please reply to a user to give them points.");
            if (repliedUser.id === process.env.CLIENT_ID) return;

            var number = parseInt(match[1], 10); // extract the integer
            const userRef = doc(db, "users", repliedUser.id);

            try {
                const docSnap = await getDoc(userRef);
                let currentPoints = docSnap.exists() ? docSnap.data().points : 0; // Default to 0 if no record
        
                await setDoc(userRef, { points: currentPoints + number }, { merge: true });
        
                msg.reply(
                  `🤑 ${repliedUser} has gained ${number} points!\n> *Use /leaderboard to track progress.*`
                );
            } catch (error) {
                console.error("Error updating points:", error);
                msg.reply("❌ Failed to update points. Please try again.");
            }
        }
    }
})

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
    const cooldownAmount = (commandCooldowns[command] ?? defaultCooldownDuration) * 1_000;

    if (timestamps.has(interaction.user.id)) {
        const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;
    
        if (now < expirationTime) {
            return interaction.reply({ content: `Bro chill out wait a bit longer 😭🙏`, flags: MessageFlags.Ephemeral});
        }
    }
    
    timestamps.set(interaction.user.id, now);
    setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);

    if (interaction.commandName === "glaze" || interaction.commandName === "diss") {
        var prompt = ""
        const isGlaze = (interaction.commandName === "glaze")
        const id = interaction.options.get('user')?.value;
        const tag = (await client.users.fetch(id)).globalName;

        if (id === process.env.CLIENT_ID) {
            if (isGlaze) return interaction.reply("I am unglazable.")
            else return interaction.reply("I am undissable.")
        }

        if (isGlaze) {
            prompt = `Write over-the-top praise for a person named "${tag}" with emojis in a few sentences.`
        } else {
            prompt = `Write an over-the-top hate rant for a person named "${tag}" in a few sentences with emojis.`
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
      try {
        const usersRef = collection(db, "users");
        const snapshot = await getDocs(usersRef);
  
        const leaderboard = [];
        for (const docSnap of snapshot.docs) {
          const data = docSnap.data();
          if (data.points != null) {
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
              points: data.points,
            });
          }
        }
  
        // Sort by points (descending)
        leaderboard.sort((a, b) => b.points - a.points);
  
        // Build the message lines
        let description = "";
        if (leaderboard.length === 0) {
          description = "⚠️ No users have points yet.";
        } else {
          leaderboard.forEach((entry, index) => {
            // Use crown emoji for the highest user
            const prefix = index === 0 ? "👑" : `${index + 1}.`;
            
            // Create the line for the entry
            let line = `${prefix} ${entry.displayName} - ${entry.points} points`;
    
            // If the entry is the command sender, bold the entire line
            if (entry.userId === interaction.user.id) {
              line = `**${line}**`;
            }
    
            description += line + "\n";
          });
        }
    
        // Create the embed with a red bar on the left
        const embed = new EmbedBuilder()
          .setColor("#FF0000")
          .setTitle("🏆 Leaderboard")
          .setDescription(description);
    
        // Send the embed
        await interaction.reply({ embeds: [embed] });
      } catch (error) {
        console.error("Error fetching leaderboard:", error);
        interaction.reply("❌ Failed to fetch the leaderboard. Please try again.");
      }
    }

    if (interaction.commandName === "whosent") {
        if (gameRunning) {
          return interaction.reply("U can't start a new game dawg");
        }
        gameRunning = true;
        await interaction.deferReply();
        const messages = await fetchAllMessages(10);
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
            return interaction.reply("There's no game happening. What's that... what's a game... 💔💔")
        }
        if (interaction.options.get('user')?.value === chosenAuthor.id) {
            gameRunning = false;
            const formattedDate = chosenDate.toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric"
            });
            const formattedTime = chosenDate.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "numeric",
                hour12: true
            }).toLowerCase();
            const combined = `${formattedDate} at ${formattedTime}`;
            return interaction.reply(`✅ Correct! The message was sent by ${chosenAuthor.displayName}.\n > "${chosenMessage.content}"\n > ${chosenAuthor.displayName}, ${formattedDate}`)
        } else {
            return interaction.reply("❌ Lol try again.")
        }
    }
  });
client.login(process.env.TOKEN);

async function fetchAllMessages(minLength) {
  const channel = client.channels.cache.get(process.env.WHOSENT_CHANNEL_ID);
  let messages = [];

  // Fetch the most recent message to use as a starting point.
  let lastMessage = await channel.messages
    .fetch({ limit: 1 })
    .then(messagePage => (messagePage.size ? messagePage.first() : null));

  // Loop until we've gathered 200 messages or no more messages exist.
  while (lastMessage && messages.length < 200) {
    const messagePage = await channel.messages.fetch({
      limit: 100,
      before: lastMessage.id,
    });

    for (const msg of messagePage.values()) {
      if (
        !msg.author.bot &&
        msg.content.length > minLength &&
        !msg.mentions.users.some(user => user.bot)
      ) {
        messages.push(msg);
        if (messages.length >= 200) break;
      }
    }

    // Update the message pointer to the last message in the page.
    lastMessage = messagePage.size > 0 ? messagePage.last() : null;
  }

  // Return only the first 200 messages (if more were added, which shouldn't happen).
  return messages.slice(0, 200);
}