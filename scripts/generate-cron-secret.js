const crypto = require("crypto");

// Generate a secure random string
const secret = crypto.randomBytes(32).toString("hex");

console.log("Generated CRON_SECRET:");
console.log(secret);
console.log("\nMake sure to add this to your Vercel environment variables!");
