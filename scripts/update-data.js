const path = require("path");
const { monitoringService } = require(path.join(
  process.cwd(),
  "lib",
  "services",
  "monitoring-service"
));

async function main() {
  try {
    console.log("Starting monitoring check...");
    console.log("Current directory:", process.cwd());
    console.log(
      "Monitoring service path:",
      path.join(process.cwd(), "lib", "services", "monitoring-service")
    );

    // Use the existing monitoring service to check all rules
    await monitoringService.checkAllRules();

    console.log("Monitoring check completed successfully");
  } catch (error) {
    console.error("Error in monitoring check:", error);
    process.exit(1);
  }
}

main();
