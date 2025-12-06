# Deploy OAuth Callback to Vercel

This guide helps you deploy a simple OAuth callback handler to Vercel.

## Prerequisites

- Vercel account (sign up at https://vercel.com)
- Vercel CLI installed (optional, but recommended)

## Option 1: Deploy via Vercel CLI (Recommended)

### Step 1: Install Vercel CLI

```bash
npm install -g vercel
```

### Step 2: Login to Vercel

```bash
vercel login
```

### Step 3: Deploy

```bash
vercel
```

Follow the prompts:
- Set up and deploy? **Y**
- Which scope? Select your account
- Link to existing project? **N**
- What's your project's name? `tsheets-mcp-oauth` (or any name you prefer)
- In which directory is your code located? `./` (press Enter)
- Want to override the settings? **N**

### Step 4: Get Your Production URL

After the first deployment, deploy to production:

```bash
vercel --prod
```

You'll get a URL like: `https://tsheets-mcp-oauth.vercel.app`

## Option 2: Deploy via Vercel Dashboard (Web UI)

### Step 1: Push to GitHub

```bash
git add vercel.json api/ .vercelignore
git commit -m "Add Vercel OAuth callback handler"
git push origin main
```

### Step 2: Import to Vercel

1. Go to https://vercel.com/dashboard
2. Click "Add New" → "Project"
3. Import your GitHub repository
4. Click "Deploy"

### Step 3: Get Your Production URL

After deployment, you'll see your production URL like:
`https://tsheets-mcp-oauth.vercel.app`

## Configure Your App

### Step 1: Update Intuit Developer Portal

1. Go to https://developer.intuit.com/app/developer/dashboard
2. Select your app → Keys & OAuth
3. Add this redirect URI:
   ```
   https://your-vercel-url.vercel.app/oauth/callback
   ```

### Step 2: Update Your .env File

Update the redirect URI in your `.env` file:

```env
INTUIT_REDIRECT_URI=https://your-vercel-url.vercel.app/oauth/callback
```

Replace `your-vercel-url` with your actual Vercel domain.

## Test the OAuth Flow

1. Run the auth script:
   ```bash
   npm run auth
   ```

2. Open the authorization URL in your browser

3. Authorize the app in QuickBooks

4. You'll be redirected to your Vercel callback page with:
   - A nicely formatted display of the callback URL
   - A "Copy to Clipboard" button
   - Extracted parameters (code, realmId, state)

5. Copy the full URL and paste it into your terminal

6. Complete the authentication!

## Custom Domain (Optional)

You can add a custom domain in Vercel:

1. Go to your project in Vercel Dashboard
2. Settings → Domains
3. Add your custom domain (e.g., `oauth.yourdomain.com`)

Then update both Intuit and your `.env` file with the custom domain.

## Troubleshooting

### Deployment Failed
- Make sure `vercel.json` and `api/oauth-callback.js` exist
- Check Vercel dashboard for build logs

### Redirect URI Mismatch
- Ensure the URI in Intuit portal exactly matches the one in `.env`
- Include the full path: `/oauth/callback`
- Use HTTPS (Vercel provides this automatically)

### 404 Error on Callback
- Check that `vercel.json` routes are configured correctly
- Verify the deployment completed successfully

