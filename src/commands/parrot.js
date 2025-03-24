import { fetchMessagesByUser } from "../utils/fetchMessages.js";
import openai from "../services/openai.js";
import { doc, getDoc, setDoc } from "firebase/firestore";

let parrotGame = {
  running: false,
  targetUser: null,
  imitatorCount: 0,
};

async function generateImitation(messages) {
  const prompt = `Mimic the tone, style, and phrasing of the following user's Discord messages. Write a single, short-medium message that could've realistically been sent by them, but do not name them:\n\n${messages
    .map((m) => m.content)
    .join("\n")}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are mimicking Discord users casually." },
      { role: "user", content: prompt },
    ],
    store: true,
  });

  return completion.choices[0].message.content;
}

export async function parrot(interaction, client) {
  if (parrotGame.running) {
    return interaction.reply("A parrot game is already running!");
  }

  parrotGame.running = true;
  await interaction.reply(
    "🦜 Let's play a parrot game. Guess who texts like this..."
  );

  const members = await interaction.guild.members.fetch();
  const filteredMembers = members.filter(
    (m) => !m.user.bot && m.id !== client.user.id
  );

  const tried = new Set();
  let randomMember = null;
  let messages = [];

  // Max 10 times to find a person to imitate
  while (tried.size < 10) {
    randomMember = filteredMembers.random();
    if (tried.has(randomMember.id)) continue;
    tried.add(randomMember.id);

    messages = await fetchMessagesByUser(client, randomMember.id, 15, 100);
    if (messages.length >= 5) break;
  }

  if (messages.length < 5) {
    parrotGame.running = false;
    return interaction.followUp("Couldn't find a good user to imitate 😔");
  }

  const imitation = await generateImitation(messages);

  parrotGame.targetUser = randomMember.user;
  parrotGame.imitatorCount = 1;

  return interaction.channel.send(imitation);
}

export async function guessparrot(interaction, db) {
  if (!parrotGame.running) {
    return interaction.reply("There's no parrot game running right now lol");
  }

  const guessId = interaction.options.get("user")?.value;

  if (guessId === parrotGame.targetUser.id) {
    parrotGame.running = false;

    const userRef = doc(db, "users", interaction.user.id);
    try {
      const docSnap = await getDoc(userRef);
      const currentWins = docSnap.exists()
        ? Number(docSnap.data().gamewins ?? 0)
        : 0;
      await setDoc(userRef, { gamewins: currentWins + 5 }, { merge: true });
    } catch (error) {
      console.error("Error updating parrot wins:", error);
    }

    return interaction.reply(
      `✅ Ur right. I was imitating **${parrotGame.targetUser.globalName}**. You earned 5 game points!`
    );
  } else {
    const guessedUser = interaction.guild.members.cache.get(guessId);
    parrotGame.imitatorCount++;

    const messages = await fetchMessagesByUser(
      interaction.client,
      parrotGame.targetUser.id,
      15
    );
    const imitation = await generateImitation(messages);

    await interaction.reply(
      `❌ Nope, it's not **${guessedUser.displayName}**. Try again.`
    );

    return interaction.channel.send(imitation);
  }
}
