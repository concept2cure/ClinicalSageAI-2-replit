# TrialSage™ Vercel Deployment Guide

## Quick Deployment Steps

1. **Connect your GitHub repository to Vercel**

   - Push your code to GitHub
   - Go to [Vercel](https://vercel.com/new) and import your repository

2. **Configure project settings in Vercel**

   - Framework Preset: Other
   - Root Directory: ./
   - Build Command: `cd client && npm install && npm run build`
   - Output Directory: `client/dist`
   - Install Command: `npm install`

3. **Set up environment variables**

   - Copy variables from `.env.production.example`
   - Add all required variables in Vercel's Environment Variables section

4. **Deploy**
   - Click "Deploy" and wait for the build to complete
   - Vercel will provide a production URL (e.g., trialsage.vercel.app)

## Pre-Deployment Checklist

- [ ] All API routes correctly point to `/api` endpoints
- [ ] Environment variables are properly set
- [ ] Frontend build completes successfully
- [ ] Database is properly configured
- [ ] Authentication services are set up
- [ ] SSL is configured (automatic with Vercel)

## Post-Deployment

1. **Testing**

   - Verify all functionality works on the deployed site
   - Test API endpoints using tools like Postman

2. **Setting up a custom domain**

   - In the Vercel dashboard, go to your project settings
   - Click on "Domains"
   - Add your custom domain and follow DNS configuration instructions

3. **Monitoring**
   - Set up Vercel Analytics for performance monitoring
   - Consider adding error tracking with Sentry

## Scaling Considerations

- For higher traffic, consider upgrading to Vercel Pro
- Database scaling may require additional configuration
- API rate limiting should be implemented for production use

## Troubleshooting

- **Build failures**: Check Vercel build logs for specific errors
- **API issues**: Verify environment variables and server configuration
- **Static asset problems**: Check path configurations in the frontend code

For more detailed instructions, refer to the full [DEPLOYMENT.md](./DEPLOYMENT.md) guide.
