import { givePoints, giveStrokes } from "../utils/points.js";

export default async function handleMessage(msg, db) {
  if (msg.author.bot) return;

  const match = msg.content.match(/^\+(\d+)$/);
  if (!match) return;

  const repliedUser = msg.mentions.repliedUser;
  if (!repliedUser || repliedUser.id === process.env.CLIENT_ID) return;

  const number = parseInt(match[1], 10);

  try {
    if (msg.author.id === process.env.POINT_CLIENT_ID) {
      await givePoints(db, repliedUser.id, number);
      msg.reply(
        `🤑 ${repliedUser} has gained ${number} points!\n> *Use /leaderboard to track progress.*`
      );
    } else if (msg.author.id === process.env.IZZ_CLIENT_ID) {
      await giveStrokes(db, repliedUser.id, number);
      msg.reply(
        `💔 ${repliedUser}'s message has been stroked to ${number} times (ts pmo) \n> *Use /strokes to track.*`
      );
    }
  } catch (error) {
    msg.reply("❌ Failed to update. Please try again.");
  }
}
