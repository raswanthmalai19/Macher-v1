# How to Get Your AWS API Gateway URLs

## Option 1: AWS Console (Easiest)

### For WebSocket URL:
1. Go to [AWS Console](https://console.aws.amazon.com/)
2. Navigate to **API Gateway**
3. Find your WebSocket API (should be named "VocalShield" or similar)
4. Click on **Stages** in the left menu
5. Click on **production** (or **dev**)
6. Copy the **WebSocket URL** - it looks like:
   ```
   wss://abc123xyz.execute-api.us-east-1.amazonaws.com/production
   ```

### For REST API URL:
1. In API Gateway console
2. Find your REST API (if you have one)
3. Click on **Stages**
4. Click on **production** (or **dev**)
5. Copy the **Invoke URL** - it looks like:
   ```
   https://abc123xyz.execute-api.us-east-1.amazonaws.com/production
   ```

## Option 2: Install AWS CLI and Run Command

If you want to install AWS CLI:

```bash
# Install AWS CLI on Mac
brew install awscli

# Configure AWS credentials
aws configure

# Get stack outputs
aws cloudformation describe-stacks \
  --stack-name VocalShield-dev \
  --query 'Stacks[0].Outputs' \
  --output json
```

This will show you all the outputs including:
- WebSocketApiEndpoint
- ConnectionsTableName
- MetadataTableName
- etc.

## Option 3: Check CloudFormation Console

1. Go to [AWS CloudFormation Console](https://console.aws.amazon.com/cloudformation)
2. Find stack named **VocalShield-dev**
3. Click on the stack
4. Go to **Outputs** tab
5. Look for:
   - `WebSocketApiEndpoint` - Copy this value
   - `RestApiEndpoint` - Copy this value (if exists)

## What to Do Next

Once you have the URLs, provide them to me in this format:

```
WebSocket URL: wss://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/production
REST API URL: https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/production
```

Then I'll:
1. Update Config.kt with your real URLs
2. Set DEMO_MODE = false
3. Rebuild the APK
4. You can test with real AWS backend!

## Important Notes

- The URLs should start with `wss://` (WebSocket) and `https://` (REST)
- Make sure your AWS infrastructure is actually deployed
- If you haven't deployed yet, run: `cd /path/to/project && npm run deploy`
