require("dotenv").config();
const fetch = require("node-fetch");
const pRetry = require("p-retry");
const pTimeout = require("p-timeout");

// Configuration
const APP_URL = process.env.NEXT_PUBLIC_APP_URL;
const CRON_SECRET = process.env.CRON_SECRET;
const UPDATE_TIMEOUT = parseInt(process.env.UPDATE_TIMEOUT || "240000"); // 4 minutes
const RETRY_COUNT = parseInt(process.env.RETRY_COUNT || "3");

// Helper function to handle redirects and retry on network errors
async function makeRequest(url, options = {}) {
  const run = async () => {
    let attempt = 1;
    let currentUrl = url;

    while (attempt <= 3) {
      console.log(`Attempt ${attempt} of 3`);
      console.log("Making request to:", currentUrl);

      const response = await fetch(currentUrl, options);
      console.log("Response status:", response.status);
      console.log("Response headers:", response.headers.raw());

      // Handle redirects manually (308 status)
      if (response.status === 308) {
        const location = response.headers.get("location");
        if (location) {
          console.log("Following redirect (308) to:", APP_URL + location);
          currentUrl = APP_URL + location;
          attempt++;
          continue;
        }
      }

      // For all other responses, parse the JSON
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          `Request failed with status ${response.status}: ${
            data.error || response.statusText
          }`
        );
      }

      return data;
    }

    throw new Error("Max redirect attempts reached");
  };

  // Add timeout and retry logic
  return pTimeout(
    pRetry(run, {
      retries: RETRY_COUNT,
      onFailedAttempt: (error) => {
        console.error(
          `Failed attempt ${error.attemptNumber}/${
            error.retriesLeft + error.attemptNumber
          }. Error: ${error.message}`
        );
      },
    }),
    UPDATE_TIMEOUT,
    "Request timed out"
  );
}

async function checkWebsite(website) {
  console.log(`\nChecking website: ${website.name} (${website.url})`);
  console.log(`Website ID: ${website.id}`);

  try {
    // Make the update request with extended timeout
    console.log(
      "Making update request to:",
      `${APP_URL}/api/websites/${website.id}/update?secret=${CRON_SECRET}`
    );

    const updateResponse = await makeRequest(
      `${APP_URL}/api/websites/${website.id}/update?secret=${CRON_SECRET}`,
      {}
    );

    // Log the full response for debugging
    console.log("Update response:", JSON.stringify(updateResponse, null, 2));

    // Check for errors
    if (updateResponse.error) {
      console.error("Update failed:", updateResponse.error);
      return;
    }

    // Handle partial success cases
    if (updateResponse.message && updateResponse.message.includes("but")) {
      console.warn("Warning:", updateResponse.message);
    }

    // Check for new links
    if (updateResponse.newLinks && updateResponse.newLinks.length > 0) {
      console.log(
        `Found ${updateResponse.newLinks.length} new links for ${website.name}:`,
        updateResponse.newLinks
      );

      // Send notification
      console.log("Sending notification for new links...");
      const notifyResponse = await makeRequest(
        `${APP_URL}/api/monitoring/notify?secret=${CRON_SECRET}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            websiteId: website.id,
            newLinks: updateResponse.newLinks,
          }),
        }
      );
      console.log("Notification sent:", notifyResponse);
    } else {
      console.log(`No new links found for ${website.name}`);
    }
  } catch (error) {
    console.error(`Error checking website ${website.name}:`, error);
    // Don't throw here - we want to continue with other websites
  }
}

async function main() {
  try {
    console.log("Starting monitoring check...");

    // Environment check
    console.log("Environment check:");
    console.log("- APP_URL set:", !!APP_URL);
    console.log("- CRON_SECRET set:", !!CRON_SECRET);
    console.log("- UPDATE_TIMEOUT:", UPDATE_TIMEOUT);
    console.log("- RETRY_COUNT:", RETRY_COUNT);

    if (!APP_URL || !CRON_SECRET) {
      throw new Error(
        "Missing required environment variables: NEXT_PUBLIC_APP_URL or CRON_SECRET"
      );
    }

    // Get all websites that need to be checked
    console.log("\nFetching websites to check...");
    const websitesResponse = await makeRequest(
      `${APP_URL}/api/websites?secret=${CRON_SECRET}`,
      {}
    );

    const websites = websitesResponse.data || [];
    console.log(`Found ${websites.length} websites to check`);

    // Check each website for updates
    for (const website of websites) {
      await checkWebsite(website);
    }

    console.log("\nMonitoring check completed successfully");
  } catch (error) {
    console.error("\nError in monitoring check:", error);
    process.exit(1);
  }
}

// Start the script
main();
