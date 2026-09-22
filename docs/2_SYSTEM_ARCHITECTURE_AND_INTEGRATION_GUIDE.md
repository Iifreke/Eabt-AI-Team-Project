# System Architecture, Data Flows & Technical Integration Guide
## Edutech Babcock & ABU Admissions Intelligence Platform

---

## 🏛️ 1. High-Level System Architecture

The platform provides an omni-channel admissions automation infrastructure connecting prospective students to university admissions staff across **Web Chat**, **WhatsApp Business Cloud API**, **Supabase PostgreSQL & Vector Engine**, **OpenRouter AI LLM**, **Zoho CRM**, **Zoho Cliq**, and **Resend / SMTP Email Services**.

```
                           ┌───────────────────────────────────────────────┐
                           │              PROSPECTIVE STUDENTS             │
                           └───────────────┬───────────────────────────────┘
                                           │
                    ┌──────────────────────┴──────────────────────┐
                    ▼                                             ▼
        ┌───────────────────────┐                     ┌───────────────────────┐
        │  Web Chat Widget      │                     │ WhatsApp Business API │
        │  (Vite + React)       │                     │ (Meta Cloud Webhook)  │
        └───────────┬───────────┘                     └───────────┬───────────┘
                    │                                             │
                    └──────────────────────┬──────────────────────┘
                                           │
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                          VERCEL SERVERLESS BACKEND APIS (Node.js)                           │
│                                                                                             │
│  • /api/chat/start          • /api/chat/index        • /api/whatsapp/webhook                │
│  • /api/admin/tickets       • /api/admin/reply       • /api/admin/escalations               │
│  • /api/documents           • /api/admin/me          • /api/admin/stats                     │
└──────────────┬───────────────────────────┬───────────────────────────┬──────────────────────┘
               │                           │                           │
               ▼                           ▼                           ▼
┌─────────────────────────────┐ ┌─────────────────────┐ ┌─────────────────────────────────────┐
│    SUPABASE DATABASE & RAG  │ │   OPENROUTER AI     │ │      EXTERNAL INTEGRATIONS          │
│                             │ │                     │ │                                     │
│  • PostgreSQL Tables        │ │  • Model: Gemini 2.5│ │  • Zoho CRM (Leads, Contacts, Notes)│
│  • pgvector Embedding Index │ │  • Closed-Domain RAG│ │  • Zoho Cliq (Live Advisor Alerts)  │
│  • Supabase Realtime WS     │ │  • Zero Hallucinate │ │  • Resend API / Nodemailer (Emails) │
│  • Row Level Security (RLS) │ │                     │ │                                     │
└─────────────────────────────┘ └─────────────────────┘ └─────────────────────────────────────┘
```

---

## 🔄 2. End-to-End Interaction Flows

### Flow A: Web Chat Lead Capture & Closed-Domain RAG Answering
```mermaid
sequenceDiagram
    autonumber
    actor Student as Prospective Student
    participant Widget as Web Chat Widget
    participant API as Backend (/api/chat)
    participant DB as Supabase pgvector
    participant LLM as OpenRouter LLM
    participant Zoho as Zoho CRM

    Student->>Widget: Opens widget & fills Pre-Chat Form (Name, Email, Phone)
    Widget->>API: POST /api/chat/start
    API->>DB: Upsert Lead & Initialize Conversation
    API->>Zoho: Sync Lead to Zoho CRM (Background)
    API-->>Widget: Returns Session ID & Welcome Message
    Student->>Widget: Sends question ("What are the fees for Computer Science?")
    Widget->>API: POST /api/chat
    API->>DB: Compute embedding & query match_chunks()
    DB-->>API: Returns verified brochure snippets
    API->>LLM: Ingest Context + Strict Persona Prompt
    LLM-->>API: Executive Answer (No hallucination)
    API->>DB: Append message to conversation transcript
    API-->>Widget: Renders answer in widget bubble
```

---

### Flow B: Live Human Handoff & Business Hours Escalation
```mermaid
sequenceDiagram
    autonumber
    actor Student as Prospective Student
    participant Bot as AI Concierge
    participant Router as Handoff Engine
    participant Cliq as Zoho Cliq Channel
    participant Admin as Admin Portal (/chats)
    actor Officer as Admissions Officer

    Student->>Bot: "I want to speak with an admissions advisor"
    Bot->>Router: Detects escalation intent / keyword
    Router->>Router: Checks isWithinBusinessHours() (Mon-Fri 8am-6pm WAT)
    alt Within Working Hours
        Router->>Cliq: Posts Alert Card with direct link: https://eabt-ai-team-project.vercel.app/chats?id=...
        Router->>Admin: Realtime WebSocket event fires on /chats
        Officer->>Admin: Clicks notification & opens live chat
        Officer->>Admin: Clicks "Attend / Take Over"
        Officer->>Admin: Types reply (e.g. using /takeover shortcut)
        Admin->>Student: Delivers officer message instantly
    else Outside Working Hours
        Router-->>Student: "Our advisors are offline. Would you like to open a ticket?"
    end
```

---

### Flow C: Offline Support Ticket & Automated Email Reply
```mermaid
sequenceDiagram
    autonumber
    actor Student as Prospective Student
    participant Widget as Chat Widget Modal
    participant API as /api/admin/tickets
    participant DB as Supabase DB
    participant Email as Email Service (Resend/SMTP)
    participant Admin as Admin Dashboard (/tickets)
    actor Officer as Admissions Officer

    Student->>Widget: Submits ticket (Name, Email, Subject, Message)
    Widget->>API: POST /api/admin/tickets (Validates RFC Email)
    API->>DB: Inserts into tickets table (status: 'open')
    API->>Email: Dispatches confirmation receipt to student
    API->>Email: Dispatches alert email to staff
    Officer->>Admin: Views ticket on /tickets page
    Officer->>Admin: Enters reply & clicks "Send Email Reply"
    Admin->>API: PATCH /api/admin/tickets
    API->>Email: Dispatches executive HTML response email to Student
    API->>DB: Updates ticket status to 'pending'/'closed'
    Student-->>Student: Receives official admissions email response in Inbox
```

---

## 🗄️ 3. Database Schema Overview

| Table | Primary Purpose | Key Columns |
|---|---|---|
| `schools` | Multi-tenant university configuration | `id`, `slug`, `name`, `staff_email`, `branding` |
| `leads` | Student contact profiles & scoring | `id`, `name`, `email`, `phone`, `lead_tier`, `lead_score`, `zoho_contact_id` |
| `conversations`| Full message transcript history | `id`, `session_id`, `lead_id`, `messages` (JSONB), `channel`, `stage` |
| `escalations` | Live human advisor handoff queue | `id`, `conversation_id`, `reason`, `status`, `sla_minutes`, `staff_notes` |
| `tickets` | Offline support inquiries & email replies| `id`, `name`, `email`, `subject`, `message`, `staff_reply`, `status` |
| `admin_profiles`| Staff user accounts & online presence | `id` (auth.users), `email`, `full_name`, `role`, `status`, `last_seen_at` |
| `shortcuts` | Canned responses & quick replies | `id`, `name`, `shortcut` (`/takeover`), `content`, `created_by` |
| `documents` | Knowledge base source PDF documents | `id`, `school_id`, `name`, `storage_path`, `chunk_count` |
| `document_chunks`| Vector embeddings for RAG retrieval | `id`, `content`, `embedding` (VECTOR 1536), `metadata` |

---

## ⚙️ 4. Environment Variables Checklist

Ensure the following variables are configured in **Vercel Project Settings → Environment Variables**:

```env
# ── SUPABASE CREDENTIALS ──
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJh...
SUPABASE_ANON_KEY=eyJh...

# ── OPENROUTER AI ──
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=google/gemini-2.5-flash

# ── ZOHO CRM INTEGRATION ──
ZOHO_CLIENT_ID=1000....
ZOHO_CLIENT_SECRET=...
ZOHO_REFRESH_TOKEN=1000....
ZOHO_ACCOUNTS_URL=https://accounts.zoho.com
ZOHO_API_DOMAIN=https://www.zohoapis.com

# ── ZOHO CLIQ ALERT WEBHOOKS ──
ZOHO_CLIQ_WEBHOOK_BABCOCK=https://cliq.zoho.com/api/v2/channelsbyname/...
ZOHO_CLIQ_WEBHOOK_ABU=https://cliq.zoho.com/api/v2/channelsbyname/...

# ── EMAIL DISPATCH (RESEND & SMTP FALLBACK) ──
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=admissions@eabt-ai-team-project.vercel.app
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=eabtconnect@gmail.com
SMTP_PASS=...

# ── WHATSAPP BUSINESS CLOUD API ──
WHATSAPP_TOKEN=EAAB...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_VERIFY_TOKEN=...
```
