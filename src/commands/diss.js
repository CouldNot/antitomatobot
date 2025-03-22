import openai from "../services/openai.js";

export default async function diss(interaction, client) {
  const id = interaction.options.get("user")?.value;
  const tag = (await client.users.fetch(id)).globalName;

  if (id === process.env.CLIENT_ID) {
    return interaction.reply("I am undissable.");
  }

  const prompt = `Write a few sentences long (brief), over-the-top hate rant for a person named "${tag}". Choose a **wildly different and unexpected style** or literary form (e.g. pirate slang, Shakespearean verse, tech bro rant, emo poetry, haiku, riddle, medieval curse, etc). Be creative and unpredictable.`;

  await interaction.deferReply();
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a creative and chaotic writer." },
      { role: "user", content: prompt },
    ],
    store: true,
  });

  await interaction.editReply(completion.choices[0].message.content);
}
