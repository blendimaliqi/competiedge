# CompetieEdge - Competitor Website Monitoring

CompetieEdge is a powerful web application that helps businesses monitor their competitors' websites for new content, articles, and updates. Built with Next.js, TypeScript, and Supabase, it provides real-time monitoring and notification capabilities.

## Features

- **Website Monitoring**: Track multiple competitor websites simultaneously
- **Automatic Content Detection**: Uses both RSS feeds and dynamic web scraping
- **Smart Article Detection**: Identifies new articles and content updates
- **Category Management**: Organize competitors into custom categories
- **Custom Pattern Matching**: Define custom patterns for content matching and filtering
- **Email Notifications**: Get alerts when new content is detected
- **Monitoring Rules**: Set up custom rules for different types of monitoring:
  - Article count thresholds
  - Keyword detection
  - Content changes
  - Social media mentions

## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript
- **Backend**: Next.js API Routes
- **Database**: Supabase (PostgreSQL)
- **Web Scraping**: Puppeteer, Cheerio
- **State Management**: TanStack Query (React Query)
- **Styling**: Tailwind CSS
- **Email**: Resend
- **Deployment**: Vercel

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account
- Resend account (for email notifications)

### Environment Variables

Create a `.env.local` file with the following variables:
