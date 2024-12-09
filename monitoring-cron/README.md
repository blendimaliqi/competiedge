# CompetIEdge Monitoring Cron

This service runs periodic checks on monitored websites to detect new content and send notifications.

## Features

- Configurable timeouts (up to 5 minutes per website)
- Automatic retries for failed requests
- Detailed logging
- Error handling and recovery
- Environment-based configuration

## Setup

1. Clone this repository
2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and configure:

   ```bash
   cp .env.example .env
   ```

4. Edit `.env` with your values:
   - `NEXT_PUBLIC_APP_URL`: Your Vercel app URL
   - `CRON_SECRET`: Secret key (must match Vercel)
   - `UPDATE_TIMEOUT`: Maximum time per website (default: 4 minutes)
   - `RETRY_COUNT`: Number of retries (default: 3)

## Deployment to Railway

1. Create a Railway account at https://railway.app
2. Create a new project
3. Connect your GitHub repository
4. Add environment variables from your `.env` file
5. Add a cron job service:
   - Command: `npm start`
   - Schedule: `0 * * * *` (every hour)

## Local Development

Run the script locally:

```bash
npm start
```

## Logs

The script provides detailed logs for:

- Environment checks
- Website updates
- New content detection
- Notifications
- Errors and retries

## Error Handling

The script handles:

- Network timeouts
- API errors
- Partial successes
- Invalid responses
- And continues processing other websites even if one fails
