# Pundra UniVerse (PUB Hub) 🎓

> **Unified Campus Collaboration, Anonymous Feedback & Achievement Portal**  
> *Crafted for verified students, faculty, and administrators of Pundra University of Science & Technology (PUB), Bogura.*

---

## 🌟 Overview

**Pundra UniVerse (PUB Hub)** is a lightweight, zero-build, serverless web application engineered to connect campus builders, foster constructive institutional feedback, and broadcast student and faculty milestones.

Built on pure web standards (Semantic HTML5, Modern CSS3, Vanilla ES6+ JavaScript) and powered by **Supabase** (PostgreSQL, Auth, Storage, Realtime), PUB Hub provides enterprise-grade authentication, Row-Level Security (RLS), real-time team collaboration, and cryptographic privacy without the overhead of heavy JavaScript frameworks or bundling tools.

---

## 🚀 Core Modules & Features

### 1. 🌟 Student Spotlight (`index.html`)
- **Peer Recognition & Milestones:** Showcase shipped projects, hackathon victories, research publications, and career milestones.
- **Dynamic Metrics & Counters:** Live monthly milestone counters, active builders metrics, and campus cheers tally dynamically computed from Supabase.
- **Strict 1-Reaction Server Enforcement:** Atomic `increment_cheer` RPC backed by `achievement_cheers` table ensures each student account can react at most once per post across all devices.
- **Post Ownership & Moderation:** Authors can edit or delete their milestones with instant feed and stats refresh; administrators possess global delete privileges.

### 2. 🤝 Collab Hub & Team Workspaces (`collab.html`)
- **Structured Project Pitches:** Filter pitches by status (Recruiting, Reviewing, Full) and required roles (UI/UX, Frontend, Backend, Mobile, ML/Data).
- **1-Click Application Pipeline:** Students apply to open positions using their unified Builder Profile; pitch creators review applicant portfolios and accept or decline with a single click.
- **Real-Time Team Workspaces:** Accepting an applicant automatically unlocks an encrypted workspace containing:
  - **Live Team Chat:** Low-latency discussion thread powered by Supabase Realtime WebSockets.
  - **Shared Task Checklist:** Interactive, persistent task progress with completion percentages.
  - **Dynamic Team Avatar Stack:** Round avatar heads in the header dynamically reflect current teammates (Lead + accepted members) with department and role tooltips.
  - **Interactive Team Roster Drawer:** Clicking the project name in the top left corner reveals an inline subtitle and expands a clean card grid listing all team members along with their project roles and departments.
- **Pitch Management:** Project leads can edit their pitch scope/tech stack or delete their pitch; deletion cascades cleanly.

### 3. 🛡️ Anonymous Campus Board (`feedback.html`)
- **Constructive Issue Tracking:** Categorized feeds for *Faculty & Grading*, *Labs & Equipment*, *Facilities*, and *Administration*.
- **Trending & Top-Voted Filter:** Surface pressing campus concerns for department heads and student representatives.
- **Client-Side Keyword & Profanity Sanitization:** Proactive regex-based filtering blocks profanity, slurs, and individual names prior to submission.
- **Cryptographic Voter Anonymity:** Server-side `campus_feedback_votes` table records one-way SHA-256 hashes (`voter_hash = sha256(user_id || feedback_id || salt)`). Users cannot vote more than once across browsers/devices, yet their identity is mathematically decoupled from their votes.
- **Anonymous Self-Service Edit & Delete:** Unlocked posts can be edited or deleted across devices by their original authors via `author_hash = sha256(user_id || salt)` without storing any `user_id` in the feedback table.
- **Anti-Leak Security Watermark:** Low-opacity, repeating CSS overlay displays the viewer's university email and session timestamp across sensitive boards to deter camera leaks.
- **Automated Lifecycle Policy:** Posts automatically lock after **20 days** (blocking new votes/edits) and purge after **60 days** unless preserved by an admin (`admin_keep = TRUE`).

### 4. 🏆 Institutional Hall of Fame (`hall-of-fame.html`)
- **Official University Broadcasts:** Highlights ICPC regionals, government grants, club championships, and research breakthroughs.
- **Standardized Card Grid Layout:** Announcements render in responsive cards sharing the exact rhythm, typography, and card-grid structure of Collab Hub pitches.
- **Publisher Role Seals & Verification:** Posts display authenticated departmental seals, official roles, and links to verified contest proofs.
- **Atomic Accolade Reactions:** Server-side 1-reaction tracking (`hall_of_fame_reactions`) for *Applaud*, *Celebrate*, and *Inspiring* badges.
- **Role-Gated Publishing:** Restricted to authorized university publishers (`is_publisher = TRUE`) and administrators.

---

## 🏗️ System Architecture

```
                    [ CLIENT BROWSER (Desktop & Mobile) ]
             Semantic HTML5 · Modern CSS3 · Vanilla ES6+ JS
          • Custom Design System (CSS Variables & Light/Dark Theme)
          • Anti-Leak Email Session Watermark Overlay
          • Client-Side Keyword & Name Sanitization Filter
                                   │
                                   ▼ HTTPS / WebSockets (Supabase JS v2 CDN)
          ┌─────────────────────────────────────────────────────────┐
          │               SUPABASE CLOUD / BACKEND                  │
          ├─────────────────────────────────────────────────────────┤
          │ Supabase Auth                                           │
          │   • Email / Password Authentication                     │
          │   • Role-based Access Tokens (Student, Lead, Publisher) │
          ├─────────────────────────────────────────────────────────┤
          │ PostgreSQL Relational Engine & RLS                      │
          │   • Strict Row-Level Security Policies on all tables    │
          │   • Cryptographic Hash Functions (SHA-256)              │
          │   • Atomic Stored Procedures (SECURITY DEFINER RPCs)    │
          │   • Automated 20-Day Lock / 60-Day Purge Triggers       │
          ├─────────────────────────────────────────────────────────┤
          │ Supabase Storage & Realtime                             │
          │   • Media Buckets (thumbnails, proof docs, avatars)     │
          │   • Realtime Channels (chat thread, teammate changes)   │
          └─────────────────────────────────────────────────────────┘
```

---

## 🔐 Privacy & Security Design

| Feature | Mechanism | Security Guarantee |
|---|---|---|
| **Campus Privacy** | Row-Level Security (RLS) | Only authenticated accounts can access campus feeds, pitch applications, and workspace threads. |
| **Leak Deterrence** | Dynamic Session Watermark | Renders viewer's email and timestamp repeatedly across viewports to disincentivize camera snapshots. |
| **Anonymous Upvotes** | Zero-Knowledge Voter Hashing | `campus_feedback_votes` uses `sha256(user_id || feedback_id || salt)`. Prevents duplicate votes with zero linkability to user accounts. |
| **Anonymous Edits** | Pseudonymous Author Hashing | `campus_feedback` stores `author_hash = sha256(user_id || salt)`. Anonymous authors can edit/delete their own posts without storing `user_id`. |
| **Cheer / Reaction Limits** | Server-Side Dedup Tables | `achievement_cheers` & `hall_of_fame_reactions` enforce 1-reaction per post per user natively in PostgreSQL. |

---

## 📊 Database Schema Summary

```
   ┌────────────────────┐                   ┌─────────────────────┐
   │      PROFILES      │ 1               * │  PITCH_APPLICATIONS │
   │────────────────────│──────────────────<│─────────────────────│
   │ id (UUID, PK)      │                   │ id (UUID, PK)       │
   │ edu_email (TEXT)   │                   │ pitch_id (UUID, FK) │
   │ full_name (TEXT)   │                   │ applicant_id (UUID) │
   │ department (TEXT)  │                   │ role_applied (TEXT) │
   │ batch_year (INT)   │                   │ status (TEXT)       │
   │ is_admin (BOOL)    │                   └─────────────────────┘
   │ is_publisher(BOOL) │                              │ *
   └────────────────────┘                              │
             │ 1                                       │
             ▼ *                                       ▼ 1
   ┌────────────────────┐ 1               * ┌─────────────────────┐
   │  PROJECT_PITCHES   │<──────────────────│ WORKSPACE_MESSAGES  │
   │────────────────────│                   │ WORKSPACE_TASKS     │
   │ id (UUID, PK)      │                   └─────────────────────┘
   │ creator_id (UUID)  │
   │ title (TEXT)       │                   ┌─────────────────────┐
   │ team_size (INT)    │                   │   HALL_OF_FAME      │
   │ roles_needed(TEXT[])                   │   & REACTIONS       │
   └────────────────────┘                   └─────────────────────┘
             
   ┌────────────────────────────────┐       ┌─────────────────────┐
   │        CAMPUS_FEEDBACK         │       │  ACHIEVEMENT_POSTS  │
   │────────────────────────────────│       │     & CHEERS        │
   │ id (UUID, PK)                  │       └─────────────────────┘
   │ category, content, upvotes     │
   │ author_hash (Cryptographic)    │       ┌─────────────────────┐
   │ is_locked, admin_keep          │       │CAMPUS_FEEDBACK_VOTES│
   └────────────────────────────────┘       └─────────────────────┘
```

---

## 🛠️ Technology Stack

- **Frontend:** Semantic HTML5, CSS3 (Custom Design System with CSS Variables, Flexbox, Grid), Vanilla JavaScript (ES6+).
- **Backend / BaaS:** [Supabase](https://supabase.com/)
  - **Database:** PostgreSQL with Row-Level Security (RLS).
  - **Auth:** Supabase Auth with session persistence.
  - **Realtime:** WebSockets for internal team workspace threads.
  - **Storage:** Supabase Storage for project screenshots and avatars.
- **Architecture Principle:** **Zero-Build, Pure Web Standards**. No npm/Webpack/Vite build steps; runs natively in any modern browser.

---

## ⚡ Quick Start & Local Setup

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/pub-hub.git
cd pub-hub/lovable
```

### 2. Configure Supabase Credentials
Open `js/supabaseClient.js` and insert your Supabase project URL and anon public key:
```javascript
const SUPABASE_URL = "https://your-project-id.supabase.co";
const SUPABASE_ANON_KEY = "your-anon-key";
```

### 3. Run Database Migrations
1. Log in to your [Supabase Dashboard](https://supabase.com/dashboard).
2. Navigate to the **SQL Editor**.
3. Run `schema.sql` (for full baseline setup).
4. Run `migration_v2.sql` (applies the latest reaction deduping tables, author hash security, dynamic workspace team RPCs, and realtime publication bindings).

### 4. Serve the Application Locally
Because the project uses standard ES6 modules and modern web APIs, serve the folder with any static HTTP server:

**Using Python:**
```bash
python -m http.server 8000
```

**Using Node.js (`npx serve`):**
```bash
npx serve .
```

**Using VS Code Live Server:**
Right-click `index.html` and select **"Open with Live Server"**.

Visit `http://localhost:8000` in your browser.

---

## 📁 Project Structure

```
.
├── index.html              # Student Spotlight (milestones, cheers & stats)
├── collab.html             # Collab Hub (pitches, applications & team workspaces)
├── feedback.html           # Campus Board (anonymous feedback & upvotes)
├── hall-of-fame.html       # Hall of Fame (institutional broadcasts & awards)
├── schema.sql              # Master database schema, RLS policies & triggers
├── migration_v2.sql        # Incremental migration script (RPCs & security tables)
├── css/
│   └── style.css           # Master stylesheet, design tokens, light/dark themes
├── js/
│   ├── app.js              # Application logic, feeds, workspaces & UI orchestration
│   ├── auth.js             # Authentication, builder profiles & session watermark
│   └── supabaseClient.js   # Supabase client initialization via CDN
└── README.md               # Project documentation
```

---

## 👥 Roles & Permissions

- **Verified Student:** Default account created upon registration. Can publish pitches, apply to teams, participate in team workspaces, post milestones, and submit/upvote feedback.
- **Project Lead:** Pitch creator. Can review applications, accept teammates, and manage project workspace discussions and tasks.
- **Authorized Publisher (`is_publisher = TRUE`):** Faculty, council, or club leads permitted to publish official Hall of Fame announcements.
- **System Administrator (`is_admin = TRUE`):** Can moderate content, delete posts across any module, and retain campus feedback past the 60-day automatic expiration.

---

## 📄 License & Attribution

Crafted for **Pundra University of Science & Technology (PUB)**.  
Released under the **MIT License**. Built with pride for student builders and campus community collaboration.
