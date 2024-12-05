const fs = require("fs");
const path = require("path");

async function main() {
  try {
    console.log("Starting data update...");

    // Write to a log file with timestamp
    const timestamp = new Date().toISOString();
    const logMessage = `GitHub Action ran successfully at ${timestamp}\n`;

    // Append to log file
    fs.appendFileSync(path.join(__dirname, "cron-test.log"), logMessage);

    console.log("Data update completed successfully");
    console.log(logMessage);
  } catch (error) {
    console.error("Error updating data:", error);
    process.exit(1);
  }
}

main();
