# Setting Up UptimeRobot to Keep Your TrialSage App Awake

## Why UptimeRobot Is Needed

Replit's free tier applications hibernate after 5 minutes of inactivity, which can lead to slow loading times when users access your application after a period of inactivity. Our application already implements several internal mechanisms to prevent hibernation:

1. **Server-side prewarm endpoint** - The `/api/prewarm` endpoint that responds quickly
2. **Client-side prewarming** - Regular fetch requests every 4 minutes from the browser
3. **Resilience service** - Central JavaScript service that manages authentication and prewarming

However, a complete solution requires an external service that pings your application regularly even when no users are active. UptimeRobot is a free service that does exactly this.

## Step 1: Set Up UptimeRobot

1. Go to https://uptimerobot.com and create a free account
2. Click on "Add New Monitor"
3. Configure your monitor with the following settings:
   - **Monitor Type:** HTTP(s)
   - **Friendly Name:** TrialSage (or any name you prefer)
   - **URL:** Your Replit app URL (e.g., https://your-repl-name.your-username.repl.co)
   - **Monitoring Interval:** 5 minutes

The 5-minute interval is important as Replit's free tier applications hibernate after 5 minutes of inactivity.

## Step 2: Set Up a Dedicated Endpoint for UptimeRobot

While you can use the root URL `/` for your monitor, it's more efficient to create a dedicated lightweight endpoint just for UptimeRobot. We've already implemented the `/api/prewarm` endpoint for this purpose in the TrialSage application.

The `/api/prewarm` endpoint:

- Returns a quick, lightweight response
- Doesn't require authentication
- Doesn't consume many resources

You can simply point UptimeRobot at:

```
https://your-repl-name.your-username.repl.co/api/prewarm
```

## Step 3: Configure Alert Settings (Optional)

1. In UptimeRobot, click on your monitor
2. Navigate to "Alert Contacts"
3. Add your email or other contact methods
4. Set up alerts for when your application goes down or comes back up

## Step 4: Verify It's Working

1. After setting up the monitor, wait 5-10 minutes
2. Check the UptimeRobot dashboard to see if your monitor is showing as "UP"
3. Click on the monitor to see the response times - they should be consistent, not showing long delays that would indicate hibernation

## Additional Considerations

- **UptimeRobot Free Plan Limits:** The free plan allows up to 50 monitors with 5-minute check intervals, which is perfect for our needs.
- **Response Time:** The `/api/prewarm` endpoint is designed to respond quickly (usually under 100ms), so UptimeRobot won't time out.
- **Redundancy:** This external pinging works alongside our internal mechanisms for a robust anti-hibernation strategy.

By setting up UptimeRobot, you've added an essential external layer to the multi-layered approach for keeping your TrialSage application continuously awake and responsive for users.
