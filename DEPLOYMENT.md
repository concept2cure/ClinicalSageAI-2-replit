# TrialSage™ Deployment Guide

## Vercel Deployment

TrialSage is configured for seamless deployment using Vercel. Follow these steps to deploy:

### Prerequisites

1. Create a [Vercel account](https://vercel.com/signup) if you don't have one
2. Install the Vercel CLI: `npm install -g vercel`
3. Log in to Vercel: `vercel login`

### Environment Variables

Make sure to set up the following environment variables in your Vercel project:

```
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_key
JWT_SECRET=your_jwt_secret
OPENAI_API_KEY=your_openai_api_key
```

### Deployment Steps

#### Option 1: Using Vercel CLI

1. Run `vercel` in the project root directory
2. Follow the prompts to configure your project
3. Once deployed, run `vercel --prod` to deploy to production

#### Option 2: Using Vercel Web Interface

1. Push your code to GitHub
2. In Vercel dashboard, click "New Project"
3. Import your GitHub repository
4. Configure build settings (Vercel should auto-detect the configuration)
5. Add all required environment variables
6. Deploy

### Post-Deployment

After deployment, you'll need to:

1. Add your production domain to any service configurations (OAuth, etc.)
2. Set up any additional services (databases, authentication, etc.)
3. Configure monitoring and logging

## Alternative Deployment Options

### Render.com

1. Create a web service for the Express backend
2. Create a static site for the React frontend
3. Configure environment variables
4. Set up the build command and start command

### Railway.app

1. Create a new project
2. Connect your GitHub repository
3. Configure environment variables
4. Set up the build command and start command

## Database Migration

If you're using a database, make sure to:

1. Run migrations on your production database
2. Set up proper connection pooling
3. Configure backup strategies

## SSL and Domain Setup

Vercel provides SSL certificates automatically for all deployments. If you're using a custom domain:

1. Add your custom domain in the Vercel dashboard
2. Update DNS settings as instructed by Vercel
3. Wait for SSL certificate provisioning (usually automatic)
