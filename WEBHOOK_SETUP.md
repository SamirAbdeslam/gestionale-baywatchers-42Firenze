# 🔄 Webhook Setup Guide

## Overview

The application now supports automated deployment via webhooks. When you push to your repository (GitHub, GitLab, etc.), the webhook will trigger an automatic rebuild and restart of the application.

## Architecture

```
GitHub/GitLab Push → Cloudflare Tunnel → Baywatcher App (/webhook) → Deployer Container → Git Pull + Docker Rebuild
```

1. **GitHub/GitLab** sends a webhook to your Cloudflare tunnel URL
2. **Cloudflare Tunnel** forwards the request to the `baywatcher` container
3. **Baywatcher App** receives the webhook at `/webhook` endpoint
4. **Baywatcher** calls the internal `deployer` service
5. **Deployer** pulls the latest code and rebuilds the containers

## Setup Instructions

### 1. Configure Environment Variables

Add these to your `.env` file:

```bash
# Optional: URL del deployer (default is correct for Docker setup)
DEPLOYER_URL=http://webhook_listener:9000/webhook

# Optional but recommended: Webhook secret for security
WEBHOOK_SECRET=your_secret_here
```

To generate a secure webhook secret:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

### 2. Configure GitHub Webhook

1. Go to your repository on GitHub
2. Navigate to **Settings** → **Webhooks** → **Add webhook**
3. Configure:
   - **Payload URL**: `https://your-cloudflare-domain.com/webhook`
   - **Content type**: `application/json`
   - **Secret**: (paste the `WEBHOOK_SECRET` from your `.env`)
   - **Events**: Select "Just the push event"
   - **Active**: ✓ checked

4. Click **Add webhook**

### 3. Configure GitLab Webhook

1. Go to your repository on GitLab
2. Navigate to **Settings** → **Webhooks**
3. Configure:
   - **URL**: `https://your-cloudflare-domain.com/webhook`
   - **Secret token**: (paste the `WEBHOOK_SECRET` from your `.env`)
   - **Trigger**: Check "Push events"
   - **SSL verification**: ✓ Enable SSL verification

4. Click **Add webhook**

### 4. Test the Webhook

After configuration, you can test the webhook:

#### From GitHub/GitLab UI:
- GitHub: Go to the webhook settings and click "Recent Deliveries" → "Redeliver"
- GitLab: Go to the webhook settings and click "Test" → "Push events"

#### Manual Test with curl:
```bash
curl -X POST https://your-cloudflare-domain.com/webhook \
  -H "Content-Type: application/json" \
  -H "X-Gitlab-Token: your_secret_here" \
  -d '{"test": true}'
```

### 5. Monitor Deployment

Check the logs to verify the deployment:

```bash
# Check baywatcher logs for webhook reception
docker logs gestionaleBaywatcher

# Check deployer logs for git pull and rebuild
docker logs webhook_listener
```

You should see:
- In `gestionaleBaywatcher`: `📥 Webhook ricevuto, chiamata al deployer...` and `✓ Deployer chiamato con successo`
- In `webhook_listener`: Git pull output and Docker rebuild messages

## Security Notes

1. **Always use WEBHOOK_SECRET** in production to prevent unauthorized deployments
2. The deployer container has access to Docker socket - keep it secure
3. The webhook endpoint is publicly accessible but validates the secret
4. Use HTTPS (Cloudflare Tunnel provides this automatically)

## Troubleshooting

### Webhook receives 401 Unauthorized
- Check that `WEBHOOK_SECRET` in `.env` matches the secret configured in GitHub/GitLab
- Verify the secret is being sent in the `X-Gitlab-Token` or `X-Hub-Signature-256` header

### Deployer not reachable
- Ensure all containers are in the same Docker network (`baywatcher`)
- Check that `deployer` service is running: `docker ps | grep webhook_listener`
- Verify `DEPLOYER_URL` is set to `http://webhook_listener:9000/webhook`

### Git pull fails
- Check deployer logs: `docker logs webhook_listener`
- Ensure the repository is accessible (SSH keys or HTTPS credentials)
- Verify the volume mount is correct: `${PWD}:/repo`

### Docker rebuild fails
- Check deployer has access to Docker socket: `docker exec webhook_listener docker ps`
- Ensure deployer container has necessary permissions
- Check disk space: `df -h`

## Manual Deployment

If you need to deploy manually without webhook:

```bash
# SSH into your server
cd /path/to/gestionale-baywatchers-42Firenze

# Pull latest changes
git pull

# Rebuild and restart
docker compose up -d --build
```

## Architecture Diagram

```
┌─────────────────┐
│  GitHub/GitLab  │
└────────┬────────┘
         │ Webhook POST
         ▼
┌─────────────────────┐
│ Cloudflare Tunnel   │
└────────┬────────────┘
         │ Forwards to http://baywatcher:5000
         ▼
┌─────────────────────────────────────┐
│  Baywatcher Container (Flask)       │
│  ┌───────────────────────────────┐  │
│  │ /webhook endpoint             │  │
│  │ - Validates secret            │  │
│  │ - Calls deployer              │  │
│  └─────────────┬─────────────────┘  │
└────────────────┼────────────────────┘
                 │ HTTP POST to webhook_listener:9000
                 ▼
┌─────────────────────────────────────┐
│  Deployer Container                 │
│  ┌───────────────────────────────┐  │
│  │ /webhook endpoint             │  │
│  │ - git pull                    │  │
│  │ - docker compose up --build   │  │
│  └───────────────────────────────┘  │
│                                     │
│  Volumes:                           │
│  - /var/run/docker.sock (control)  │
│  - ${PWD}:/repo (code)             │
└─────────────────────────────────────┘
```
