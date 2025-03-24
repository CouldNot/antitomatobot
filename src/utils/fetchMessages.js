export default async function fetchAllMessages(
  client,
  minLength,
  lowerBound,
  upperBound
) {
  const channel = client.channels.cache.get(process.env.WHOSENT_CHANNEL_ID);
  let messages = [];

  let lastMessage = await channel.messages
    .fetch({ limit: 1 })
    .then((page) => (page.size ? page.first() : null));

  while (lastMessage && messages.length < upperBound) {
    const page = await channel.messages.fetch({
      limit: 100,
      before: lastMessage.id,
    });

    page.forEach((msg) => {
      if (
        !msg.author.bot &&
        msg.content.length > minLength &&
        !msg.mentions.users.some((user) => user.bot)
      ) {
        messages.push(msg);
      }
    });

    lastMessage = page.size > 0 ? page.last() : null;
  }

  return messages.slice(lowerBound, upperBound);
}

export default async function fetchMessagesByUser(
  client,
  userId,
  minLength = 10,
  maxMessages = 50
) {
  const channel = client.channels.cache.get(process.env.WHOSENT_CHANNEL_ID);
  if (!channel) throw new Error("Invalid channel ID.");

  let messages = [];
  let lastMessage = await channel.messages
    .fetch({ limit: 1 })
    .then((page) => (page.size ? page.first() : null));

  while (lastMessage && messages.length < maxMessages) {
    const page = await channel.messages.fetch({
      limit: 100,
      before: lastMessage.id,
    });

    page.forEach((msg) => {
      if (
        msg.author.id === userId &&
        !msg.author.bot &&
        msg.content.length >= minLength &&
        !msg.mentions.users.some((u) => u.bot)
      ) {
        messages.push(msg.content);
      }
    });

    lastMessage = page.size > 0 ? page.last() : null;
  }

  return messages;
}
