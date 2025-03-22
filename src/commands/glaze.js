import openai from "../services/openai.js";

export default async function glaze(interaction, client) {
  const id = interaction.options.get("user")?.value;
  const tag = (await client.users.fetch(id)).globalName;

  if (id === process.env.CLIENT_ID) {
    return interaction.reply("I am unglazable.");
  }

  const prompt = `Write a short, over-the-top praise message for a person named "${tag}". Each time, use a **different and wildly unique writing style or format** (e.g. Shakespearean sonnet, pirate talk, Gen Z slang, formal royal decree, rap verse, fantasy prophecy, anime monologue, haiku, etc). Be unpredictable and over-the-top.`;

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
