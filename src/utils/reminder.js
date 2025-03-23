import cron from "node-cron";
import moment from "moment-timezone";

export function startReminderCron(client) {
  const startDate = new Date("2025-02-23");

  cron.schedule(
    "0 22 * * *", // 10 PM PST
    async () => {
      try {
        const userId = process.env.PRNEETA_CLIENT_ID;
        const user = await client.users.fetch(userId);

        if (!user) {
          console.error("Could not find the user to DM.");
          return;
        }

        const today = moment().tz("America/Los_Angeles").toDate();
        const diffTime = Math.abs(today - startDate);
        const dayCount = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        await user.send(`Day ${dayCount} of reminding you to journal 🔥`);
        console.log(
          `DM sent at ${today.toLocaleString("en-US", {
            timeZone: "America/Los_Angeles",
          })}`
        );
      } catch (error) {
        console.error("Failed to send daily reminder DM:", error);
      }
    },
    {
      scheduled: true,
      timezone: "America/Los_Angeles",
    }
  );

  console.log("Daily DM schedule set for 10 PM PST.");
}
