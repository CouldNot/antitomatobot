import openai from "../services/openai.js";

export default async function recap(interaction) {
  await interaction.deferReply();

  const messages = await interaction.channel.messages.fetch({ limit: 100 });
  const messagesToSummarize = [];

  messages.forEach((msg) => {
    if (!msg.author.bot && msg.content.length > 0) {
      messagesToSummarize.push(`${msg.author.displayName}: ${msg.content}`);
    }
  });

  messagesToSummarize.reverse();

  if (messagesToSummarize.length === 0) {
    return interaction.editReply("An error occurred...");
  }

  const prompt = `Summarize the following online conversation casually, mimicking the language used, and use only the full written name (no nicknames) when referring to people. Use they/them pronouns as you may not know the gender of each user: \n\n ${messagesToSummarize.join(
    "\n"
  )}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a summarizer tool that specializes in casual, online conversation.",
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
}
