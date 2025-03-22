import openai from "../services/openai.js";

export default async function glaze(interaction, client) {
  const id = interaction.options.get("user")?.value;
  const tag = (await client.users.fetch(id)).globalName;

  if (id === process.env.CLIENT_ID) {
    return interaction.reply("I am unglazable.");
  }

  const prompt = `Write over-the-top praise for a person named "${tag}" with emojis in a few sentences. Choose a very different style and form of writing than before.`;

  await interaction.deferReply();
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: prompt },
    ],
    store: true,
  });

  await interaction.editReply(completion.choices[0].message.content);
}
