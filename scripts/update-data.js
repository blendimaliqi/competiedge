const https = require("https");
const http = require("http");
const { URL } = require("url");
const { createClient } = require("@supabase/supabase-js");

// Configuration
const CONFIG = {
  MAX_RETRIES: 3,
  TIMEOUT_MS: 30000, // 30 seconds
  RETRY_DELAY_MS: 5000, // 5 seconds between retries
  BATCH_SIZE: 3, // Number of websites to process in parallel
  BATCH_DELAY_MS: 1000, // Delay between batches
  MAX_REDIRECTS: 5,
  RATE_LIMIT_DELAY_MS: 2000, // Minimum delay between requests
};

// Helper function to wait for a specified time
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Helper function for rate limiting
async function rateLimitedRequest(fn) {
  await sleep(CONFIG.RATE_LIMIT_DELAY_MS);
  return fn();
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
    // Make the update request with extended timeout
    console.log(
      "Making update request to:",
      `${appUrl}/api/websites/${website.id}/update?secret=${cronSecret}`
    );

    const updateResponse = await rateLimitedRequest(() =>
      makeRequest(
        `${appUrl}/api/websites/${website.id}/update?secret=${cronSecret}`,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
          },
        }
      )
    );

    // Check for errors
    if (updateResponse.error) {
      throw new Error(`Update failed: ${updateResponse.error}`);
    }

    // Log success
    if (updateResponse.newArticles?.length > 0) {
      console.log(
        `Found ${updateResponse.newArticles.length} new articles for ${website.name}`
      );
    } else {
      console.log(`No new articles found for ${website.name}`);
    }

    return updateResponse;
  } catch (error) {
    console.error(`Error checking website ${website.name}:`, error);
    throw error;
  }
}

async function main() {
  try {
    // Validate environment variables
    const requiredEnvVars = [
      "NEXT_PUBLIC_APP_URL",
      "CRON_SECRET",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ];

    const missingEnvVars = requiredEnvVars.filter((name) => !process.env[name]);
    if (missingEnvVars.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missingEnvVars.join(", ")}`
      );
    }

    console.log("Starting monitoring check...");
    console.log("Environment check: All required variables are set");

    // Initialize Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          persistSession: false,
        },
      }
    );

    // Fetch all active websites
    console.log("Fetching websites...");
    const { data: websites, error: websitesError } = await supabase
      .from("websites")
      .select("*")
      .order("last_checked", { ascending: true });

    if (websitesError) {
      throw new Error(`Failed to fetch websites: ${websitesError.message}`);
    }

    if (!websites || websites.length === 0) {
      console.log("No websites found to check");
      return;
    }

    console.log(`Found ${websites.length} websites to check`);

    // Process websites in batches
    const results = {
      success: 0,
      failed: 0,
      errors: [],
    };

    for (let i = 0; i < websites.length; i += CONFIG.BATCH_SIZE) {
      const batch = websites.slice(i, i + CONFIG.BATCH_SIZE);
      console.log(
        `Processing batch ${
          Math.floor(i / CONFIG.BATCH_SIZE) + 1
        } of ${Math.ceil(websites.length / CONFIG.BATCH_SIZE)}`
      );

      try {
        const batchResults = await Promise.allSettled(
          batch.map((website) =>
            checkWebsite(
              website,
              process.env.NEXT_PUBLIC_APP_URL,
              process.env.CRON_SECRET,
              process.env.SUPABASE_SERVICE_ROLE_KEY
            )
          )
        );

        // Process batch results
        batchResults.forEach((result, index) => {
          const website = batch[index];
          if (result.status === "fulfilled") {
            results.success++;
            console.log(`Successfully checked ${website.name}`);
          } else {
            results.failed++;
            results.errors.push({
              website: website.name,
              error: result.reason?.message || "Unknown error",
            });
            console.error(
              `Failed to check ${website.name}:`,
              result.reason?.message || "Unknown error"
            );
          }
        });

        // Add delay between batches if not the last batch
        if (i + CONFIG.BATCH_SIZE < websites.length) {
          console.log(
            `Waiting ${CONFIG.BATCH_DELAY_MS}ms before next batch...`
          );
          await sleep(CONFIG.BATCH_DELAY_MS);
        }
      } catch (error) {
        console.error(`Error processing batch:`, error);
        results.failed += batch.length;
        batch.forEach((website) => {
          results.errors.push({
            website: website.name,
            error: error.message || "Batch processing error",
          });
        });
      }
    }

    // Log final results
    console.log("\nUpdate completed!");
    console.log("Results:");
    console.log(`- Successful updates: ${results.success}`);
    console.log(`- Failed updates: ${results.failed}`);
    if (results.errors.length > 0) {
      console.log("\nErrors:");
      results.errors.forEach(({ website, error }) => {
        console.log(`- ${website}: ${error}`);
      });
    }
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

// Run the script
main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
