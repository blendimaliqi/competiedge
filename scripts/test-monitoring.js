const https = require("https");
const http = require("http");
const { URL } = require("url");

// Configuration
const CONFIG = {
  MAX_RETRIES: 3,
  TIMEOUT_MS: 30000,
  RETRY_DELAY_MS: 5000,
  MAX_REDIRECTS: 5,
};

// Helper function to wait for a specified time
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function makeRequest(url, options, retryCount = 0, redirectCount = 0) {
  try {
    const parsedUrl = new URL(url);
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
              reject(
                new Error(
                  `Request failed with status ${res.statusCode}: ${data}`
                )
              );
            }
          });
        }
      );

      req.on("error", (error) => {
        console.error("Network error:", error);
        reject(error);
      });

      req.on("timeout", () => {
        console.error("Request timeout");
        req.destroy();
        reject(new Error("Request timed out"));
      });

      req.end();
    });
  } catch (error) {
    console.error("Error in makeRequest:", error);
    throw error;
  }
}

// Main function to test monitoring
async function testMonitoring() {
  const WEBSITE_ID = "1"; // Replace with your website ID
  const APP_URL = "https://z0skg48kc0c8occw0g800cwk.blendimaliqi.com";
  const CRON_SECRET =
    "dea197156dde6ee29965381b8a1e5ab79274b5d071efb338feffdadec9f42e3b";
  const SERVICE_ROLE_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ieGRhc3dsd2p0bm1jZWFnbWdxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMDQxOTEzNywiZXhwIjoyMDQ1OTk1MTM3fQ.LPwkDWgI2HU5yz9mLGrOvQH3lWYe6c-6gcYgqw1Kq3c";

  try {
    console.log("Testing monitoring update...");

    const updateResponse = await makeRequest(
      `${APP_URL}/api/websites/${WEBSITE_ID}/update?secret=${CRON_SECRET}`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
      }
    );

    console.log("Update response:", updateResponse);
  } catch (error) {
    console.error("Test failed:", error);
  }
}

// Run the test
testMonitoring();
