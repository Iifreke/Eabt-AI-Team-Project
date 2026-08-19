# School RAG Agent

A production-ready RAG-powered support chatbot for Backock School and ABU, deployed entirely on Vercel.

## Architecture

- **Widget** — React + Vite compiled to a single `widget.js` IIFE. Embed with one `<script>` tag.
- **API** — Vercel serverless functions in `api/`. LLM via OpenRouter (claude-sonnet-4-5). Embeddings via OpenAI directly (text-embedding-3-small).
- **Admin** — React + Vite + Tailwind SPA for managing both schools.
- **Database** — Supabase Postgres + pgvector for leads, conversations, documents, escalations.
- **CRM** — Zoho CRM sync after visitor onboarding completes.
- **Email** — Resend for escalation notifications.

---

## Local Development

### 1. Clone and configure

```bash
git clone <your-repo-url>
cd school-rag-agent
cp .env.example .env
# Fill in all values in .env
```

### 2. Run the Supabase migration

1. Open your Supabase project → **SQL Editor**
2. Paste the contents of `src/db/migrations/001_schema.sql`
3. Click **Run**

### 3. Create the Supabase Storage bucket

1. Supabase dashboard → **Storage** → **New bucket**
2. Name: `documents`
3. Public: **No**
4. File size limit: `10MB`
5. Allowed MIME types: `application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document, text/plain`

### 4. Install root dependencies

```bash
npm install
```

> The root `package.json` only contains build scripts. Runtime deps (openai, supabase, resend, etc.) are installed at the root level and shared between `api/` and `src/`.

Install the shared runtime dependencies:

```bash
npm install openai @supabase/supabase-js resend uuid pdf-parse mammoth
```

### 5. Build the widget

```bash
npm run build:widget
```

This produces `widget/dist/widget.js` which is served via `/api/widget.js`.

### 6. Run the admin dashboard locally

```bash
npm run dev:admin
# Opens at http://localhost:5173
```

### 7. Run the API functions locally (Vercel CLI)

```bash
npx vercel dev
# API available at http://localhost:3000/api/*
```

---

## Deploy to Vercel

1. Push your code to a GitHub repository
2. Go to [vercel.com](https://vercel.com) → **New Project** → Import your repo
3. **Framework Preset**: Other
4. **Build Command**: `npm run build`
5. **Output Directory**: `admin/dist`
6. Add **all environment variables** from `.env` in the Vercel dashboard (Project Settings → Environment Variables)
7. Click **Deploy**

After deployment your URLs are:

| Resource | URL |
|----------|-----|
| Admin dashboard | `https://eabt-ai-team-project.vercel.app` |
| API | `https://eabt-ai-team-project.vercel.app/api/*` |
| Widget file | `https://eabt-ai-team-project.vercel.app/widget.js` |

---

## Embed on School Websites

Paste the appropriate snippet before `</body>` on each school's website:

### Backock School

```html
<script>
  window.SchoolBotConfig = {
    schoolId: 'backock',
    apiUrl: 'https://eabt-ai-team-project.vercel.app',
    theme: {
      primaryColor: '#1a73e8',
      name: 'Backock School'
    }
  };
</script>
<script src="https://eabt-ai-team-project.vercel.app/widget.js" async></script>
```

### ABU

```html
<script>
  window.SchoolBotConfig = {
    schoolId: 'abu',
    apiUrl: 'https://eabt-ai-team-project.vercel.app',
    theme: {
      primaryColor: '#e84118',
      name: 'ABU'
    }
  };
</script>
<script src="https://eabt-ai-team-project.vercel.app/widget.js" async></script>
```

---

## Zoho CRM Setup

To get a `ZOHO_REFRESH_TOKEN`:

1. Go to [https://api-console.zoho.com](https://api-console.zoho.com)
2. Click **Add Client** → **Server-based Applications**
3. Set **Authorized Redirect URI** to `https://eabt-ai-team-project.vercel.app`
4. Note your **Client ID** and **Client Secret**
5. Generate an authorization URL:
   ```
   https://accounts.zoho.com/oauth/v2/auth
     ?response_type=code
     &client_id=YOUR_CLIENT_ID
     &scope=ZohoCRM.modules.leads.ALL
     &redirect_uri=https://eabt-ai-team-project.vercel.app
     &access_type=offline
   ```
6. Visit the URL in your browser, approve the permissions, copy the `code` from the redirect URL
7. Exchange for a refresh token:
   ```bash
   curl -X POST "https://accounts.zoho.com/oauth/v2/token" \
     -d "code=YOUR_CODE" \
     -d "client_id=YOUR_CLIENT_ID" \
     -d "client_secret=YOUR_CLIENT_SECRET" \
     -d "redirect_uri=https://eabt-ai-team-project.vercel.app" \
     -d "grant_type=authorization_code"
   ```
8. Copy `refresh_token` from the response → set as `ZOHO_REFRESH_TOKEN`

---

## Supabase Auth — Admin Users

Create admin users manually in Supabase:

1. Supabase dashboard → **Authentication** → **Users** → **Invite user**
2. Enter the admin's email address
3. They will receive an invite email to set their password

---

## Environment Variables Reference

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Service role key (server-side only) |
| `SUPABASE_ANON_KEY` | Anon key (used for auth verification) |
| `OPENROUTER_API_KEY` | OpenRouter key for LLM completions |
| `OPENAI_API_KEY` | OpenAI key for embeddings only |
| `ZOHO_CLIENT_ID` | Zoho OAuth client ID |
| `ZOHO_CLIENT_SECRET` | Zoho OAuth client secret |
| `ZOHO_REFRESH_TOKEN` | Zoho OAuth refresh token |
| `ZOHO_ACCOUNTS_URL` | `https://accounts.zoho.com` (or regional) |
| `ZOHO_CLIQ_WEBHOOK_URL_BABCOCK` | Zoho Cliq channel webhook for Babcock alerts |
| `ZOHO_CLIQ_WEBHOOK_URL_ABU` | Zoho Cliq channel webhook for ABU alerts |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta WhatsApp Cloud API Phone Number ID |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Meta WhatsApp Cloud API Business Account ID |
| `WHATSAPP_ACCESS_TOKEN` | Meta WhatsApp System User / Permanent Access Token |
| `WHATSAPP_APP_SECRET` | Meta App Secret for signature verification |
| `WHATSAPP_VERIFY_TOKEN` | Webhook verification token |
| `WHATSAPP_BUSINESS_NUMBER` | WhatsApp phone number in E.164 format |
| `RESEND_API_KEY` | Resend API key for escalation emails |
| `ESCALATION_EMAIL_BACKOCK` | Override email for Backock escalations |
| `ESCALATION_EMAIL_ABU` | Override email for ABU escalations |
| `APP_URL` | Your Vercel deployment URL |
| `VITE_SUPABASE_URL` | Same as SUPABASE_URL (for browser) |
| `VITE_SUPABASE_ANON_KEY` | Same as SUPABASE_ANON_KEY (for browser) |
| `VITE_API_URL` | Your Vercel deployment URL (for browser) |
