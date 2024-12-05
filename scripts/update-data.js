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

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function makeRequest(url, options, retryCount = 0, redirectCount = 0) {
  const client = url.startsWith("https") ? https : http;

  return new Promise((resolve, reject) => {
    console.log(`Attempt ${retryCount + 1} of ${CONFIG.MAX_RETRIES}`);

    const req = client.get(
      url,
      {
        ...options,
        timeout: CONFIG.TIMEOUT_MS,
        headers: {
          "User-Agent": "CompetieEdge-Monitoring/1.0",
          Accept: "application/json",
        },
      },
      (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", async () => {
          // Handle redirects (301, 302, 307, 308)
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

            const redirectUrl = new URL(res.headers.location, url).href;
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
            console.log("Response:", data);
            resolve(data);
          } else {
            const error = new Error(
              `Request failed with status ${res.statusCode}: ${data}`
            );

            // Retry on 5xx errors or specific 4xx errors
            if (
              retryCount < CONFIG.MAX_RETRIES - 1 &&
              (res.statusCode >= 500 || res.statusCode === 429)
            ) {
              console.log(`Retrying after ${CONFIG.RETRY_DELAY_MS}ms...`);
              await sleep(CONFIG.RETRY_DELAY_MS);
              try {
                const result = await makeRequest(
                  url,
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

    req.on("error", async (error) => {
      if (retryCount < CONFIG.MAX_RETRIES - 1) {
        console.log(
          `Network error, retrying after ${CONFIG.RETRY_DELAY_MS}ms...`,
          error
        );
        await sleep(CONFIG.RETRY_DELAY_MS);
        try {
          const result = await makeRequest(
            url,
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
      req.destroy();
      if (retryCount < CONFIG.MAX_RETRIES - 1) {
        console.log(`Request timeout, retrying...`);
        makeRequest(url, options, retryCount + 1, redirectCount)
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
}

async function main() {
  try {
    console.log("Starting monitoring check...");

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    const cronSecret = process.env.CRON_SECRET;

    if (!appUrl || !cronSecret) {
      throw new Error(
        "Missing required environment variables: NEXT_PUBLIC_APP_URL or CRON_SECRET"
      );
    }

    // Validate URL
    try {
      new URL(appUrl);
    } catch (error) {
      throw new Error(`Invalid APP_URL: ${appUrl}`);
    }

    console.log("Making request to monitoring endpoint...");

    // Construct the URL with the secret
    const url = `${appUrl}/api/cron/check-monitoring?secret=${cronSecret}`;

    await makeRequest(url, {});

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
