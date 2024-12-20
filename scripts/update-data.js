const https = require("https");
const http = require("http");
const { URL } = require("url");

// Configuration
const CONFIG = {
  MAX_RETRIES: 3,
  TIMEOUT_MS: 30000, // 30 seconds
  RETRY_DELAY_MS: 5000, // 5 seconds
  MAX_REDIRECTS: 5,
};

// Helper function to wait for a specified time
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function makeRequest(url, options, retryCount = 0, redirectCount = 0) {
  try {
    // Ensure URL is absolute and has protocol
    const parsedUrl = new URL(url, process.env.NEXT_PUBLIC_APP_URL);
    const client = parsedUrl.protocol === "https:" ? https : http;

    return new Promise((resolve, reject) => {
      console.log(`Attempt ${retryCount + 1} of ${CONFIG.MAX_RETRIES}`);
      console.log(`Making request to: ${parsedUrl.href}`);

      const req = client.request(
        parsedUrl,
        {
          ...options,
          method: options.method || "GET",
          timeout: CONFIG.TIMEOUT_MS,
          headers: {
            "User-Agent": "CompetieEdge-Monitoring/1.0",
            Accept: "application/json",
            ...(options.headers || {}),
          },
        },
        (res) => {
          console.log(`Response status: ${res.statusCode}`);
          console.log("Response headers:", res.headers);

          let data = "";

          res.on("data", (chunk) => {
            data += chunk;
          });

          res.on("end", async () => {
            // Handle redirects
            if (
              [301, 302, 307, 308].includes(res.statusCode) &&
              res.headers.location
            ) {
              if (redirectCount >= CONFIG.MAX_REDIRECTS) {
                reject(
                  new Error(`Too many redirects (max: ${CONFIG.MAX_REDIRECTS})`)
                );
                return;
              }

              const redirectUrl = new URL(
                res.headers.location,
                parsedUrl.origin
              ).href;
              console.log(
                `Following redirect (${res.statusCode}) to: ${redirectUrl}`
              );

              try {
                const result = await makeRequest(
                  redirectUrl,
                  options,
                  retryCount,
                  redirectCount + 1
                );
                resolve(result);
              } catch (redirectError) {
                reject(redirectError);
              }
              return;
            }

            if (res.statusCode >= 200 && res.statusCode < 300) {
              try {
                const jsonData = JSON.parse(data);
                console.log("Parsed response:", jsonData);
                resolve(jsonData);
              } catch (e) {
                console.log("Raw response:", data);
                resolve(data);
              }
            } else {
              console.error(`Request failed with status ${res.statusCode}`);
              console.error("Response data:", data);

              const error = new Error(
                `Request failed with status ${res.statusCode}: ${data}`
              );

              if (
                retryCount < CONFIG.MAX_RETRIES - 1 &&
                (res.statusCode >= 500 || res.statusCode === 429)
              ) {
                console.log(`Retrying after ${CONFIG.RETRY_DELAY_MS}ms...`);
                await sleep(CONFIG.RETRY_DELAY_MS);
                try {
                  const result = await makeRequest(
                    parsedUrl.href,
                    options,
                    retryCount + 1,
                    redirectCount
                  );
                  resolve(result);
                } catch (retryError) {
                  reject(retryError);
                }
              } else {
                reject(error);
              }
            }
          });
        }
      );

      // If it's a POST request with a body
      if (options.method === "POST" && options.body) {
        req.write(options.body);
      }

      req.on("error", async (error) => {
        console.error("Network error:", error);
        if (retryCount < CONFIG.MAX_RETRIES - 1) {
          console.log(
            `Network error, retrying after ${CONFIG.RETRY_DELAY_MS}ms...`,
            error
          );
          await sleep(CONFIG.RETRY_DELAY_MS);
          try {
            const result = await makeRequest(
              parsedUrl.href,
              options,
              retryCount + 1,
              redirectCount
            );
            resolve(result);
          } catch (retryError) {
            reject(retryError);
          }
        } else {
          reject(error);
        }
      });

      req.on("timeout", () => {
        console.error("Request timeout");
        req.destroy();
        if (retryCount < CONFIG.MAX_RETRIES - 1) {
          console.log(`Request timeout, retrying...`);
          makeRequest(parsedUrl.href, options, retryCount + 1, redirectCount)
            .then(resolve)
            .catch(reject);
        } else {
          reject(
            new Error(`Request timed out after ${CONFIG.MAX_RETRIES} attempts`)
          );
        }
      });

      req.end();
    });
  } catch (error) {
    console.error("Error in makeRequest:", error);
    throw error;
  }
}

async function checkWebsite(website, appUrl, cronSecret, serviceRoleKey) {
  console.log(`\nChecking website: ${website.name} (${website.url})`);
  console.log(`Website ID: ${website.id}`);

  try {
    // Add a random delay between 2-5 seconds before checking each website
    const delay = Math.floor(Math.random() * 3000) + 2000;
    console.log(`Waiting ${delay}ms before checking...`);
    await new Promise((resolve) => setTimeout(resolve, delay));

    // Make the update request with extended timeout
    console.log(
      "Making update request to:",
      `${appUrl}/api/websites/${website.id}/update?secret=${cronSecret}`
    );
    const updateResponse = await makeRequest(
      `${appUrl}/api/websites/${website.id}/update?secret=${cronSecret}`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      }
    );

    // Check for errors
    if (updateResponse.error) {
      console.error("Update failed:", updateResponse.error);
      return;
    }

    // Check for new links in the update response
    if (updateResponse.newLinks && updateResponse.newLinks.length > 0) {
      console.log(
        `Found ${updateResponse.newLinks.length} new links for ${website.name}:`,
        updateResponse.newLinks
      );

      // Send notification
      console.log("Sending notification for new links...");
      const notifyResponse = await makeRequest(
        `${appUrl}/api/monitoring/notify?secret=${cronSecret}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            websiteId: website.id,
            newLinks: updateResponse.newLinks,
          }),
        }
      );
      console.log("Notification response:", notifyResponse);
    } else {
      console.log(`No new links found for ${website.name}`);
    }
  } catch (error) {
    console.error(`Error checking website ${website.name}:`, error);
  }
}

async function main() {
  try {
    console.log("Starting monitoring check...");
    console.log("Environment check:");
    console.log("- APP_URL set:", !!process.env.NEXT_PUBLIC_APP_URL);
    console.log("- CRON_SECRET set:", !!process.env.CRON_SECRET);
    console.log("- RESEND_API_KEY set:", !!process.env.RESEND_API_KEY);
    console.log("- SUPABASE_URL set:", !!process.env.NEXT_PUBLIC_SUPABASE_URL);
    console.log(
      "- SUPABASE_ANON_KEY set:",
      !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    console.log(
      "- SUPABASE_SERVICE_ROLE_KEY set:",
      !!process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    const cronSecret = process.env.CRON_SECRET;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!appUrl || !cronSecret || !serviceRoleKey) {
      throw new Error(
        "Missing required environment variables: NEXT_PUBLIC_APP_URL, CRON_SECRET, or SUPABASE_SERVICE_ROLE_KEY"
      );
    }

    // Get all websites that need to be checked
    console.log("Fetching websites to check...");
    const websitesResponse = await makeRequest(
      `${appUrl}/api/websites?secret=${cronSecret}`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      }
    );

    const websites = websitesResponse.data || [];
    console.log(`Found ${websites.length} websites to check`);

    // Check each website for updates
    for (const website of websites) {
      await checkWebsite(website, appUrl, cronSecret, serviceRoleKey);
    }

    console.log("Monitoring check completed successfully");
  } catch (error) {
    console.error("Error in monitoring check:", error);
    process.exit(1);
  }
}

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (error) => {
  console.error("Unhandled Rejection:", error);
  process.exit(1);
});

main();
