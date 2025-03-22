import openai from "../services/openai.js";

export default async function diss(interaction, client) {
  const id = interaction.options.get("user")?.value;
  const tag = (await client.users.fetch(id)).globalName;

  if (id === process.env.CLIENT_ID) {
    return interaction.reply("I am undissable.");
  }

  const prompt = `Write an over-the-top hate rant for a person named "${tag}" in a few sentences with emojis.`;

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
