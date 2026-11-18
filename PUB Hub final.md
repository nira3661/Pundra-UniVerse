
**Project Name:** Pundra UniVerse (PUB Hub)  
**System Classification:** Campus Collaboration, Anonymous Feedback & Achievement Portal
**Target Environment:** University-Wide Deployment (Students, Faculty, Department Heads, System Administrators)

### 1. System Architecture

Pundra UniVerse (PUB Hub) is built as a lightweight, serverless web application designed around clean web standards and rapid deployment. The frontend is constructed using semantic HTML5, modern CSS3, and Vanilla JavaScript (ES6+), connecting directly to **Supabase** (Backend-as-a-Service) via its official client SDK for authentication, relational data storage, real-time updates, and file hosting.


Plaintext

```
                        [ FRONTEND CLIENT (Browser) ]
                    Semantic HTML5 / CSS3 / Vanilla JS
                   • Responsive Grid & Flexbox Layouts
                   • Dynamic Viewer Email Watermark Overlay
                   • Client-Side Keyword & Profanity Filter
                                      │
                                      ▼ (HTTPS / WebSockets)
                   [ SUPABASE BACKEND-AS-A-SERVICE ]
             ┌──────────────────────────────────────────────┐
             │ Supabase Auth                                │
             │   • University Email (.edu / .ac.bd) Signup  │
             │   • JWT Session & Role-Based Access          │
             ├──────────────────────────────────────────────┤
             │ PostgreSQL Database & Row-Level Security     │
             │   • User Profiles & Project Pitches          │
             │   • Decoupled Anonymous Feedback Threads     │
             │   • Automated 20-Day Lock / 60-Day Purge     │
             ├──────────────────────────────────────────────┤
             │ Supabase Storage & Realtime                  │
             │   • Project Thumbnails & Attachments         │
             │   • Live Upvote & Workspace Chat Listeners   │
             └──────────────────────────────────────────────┘
```

- **Restricted Campus Access:** Supabase Row-Level Security (RLS) policies ensure that only authenticated users with a verified university email address can view, post, or interact with campus boards.
    
- **Decoupled Anonymous Feedback:** Feedback posts do not store foreign keys linking back to user accounts; instead, the frontend generates session-based department pseudonyms (e.g., _Anon-CSE-442_) before insertion.
    
- **Realtime Interactions:** Live project discussions, upvote counters, and "Cheer" reactions update automatically using Supabase's built-in PostgreSQL change listeners.

### 2. Technology Stack & Component Specifications

|**Layer / Subsystem**|**Technology Component**|**Technical Function & Rationale**|
|---|---|---|
|**Frontend Structure**|**Semantic HTML5**|Provides accessible, well-structured multi-page layouts (`index.html`, `collab.html`, `feedback.html`, `hall-of-fame.html`).|
|**Styling & UI Design**|**Modern CSS3 (Variables, Grid, Flexbox)**|Delivers a responsive layout, clean card components, modal dialogs, and consistent light/dark theme styling without heavy framework overhead.|
|**Viewer Watermark Overlay**|**CSS3 Fixed Overlay + JS**|Renders a faint, low-opacity background layer repeating the active user's email and session timestamp across sensitive boards to deter phone camera leaks.|
|**Client Logic & Filtering**|**Vanilla JavaScript (ES6+)**|Handles DOM rendering, form validation, pseudonym generation, and a regex-based profanity/name filter before database submission.|
|**Backend & Database**|**Supabase (PostgreSQL + RLS)**|Replaces a custom server by providing secure API endpoints, relational tables, Row-Level Security rules, and scheduled database functions.|
|**Authentication**|**Supabase Auth**|Manages user registration, login sessions, and restricts signups to approved university email domains (`.edu` / `.ac.bd`).|
|**File / Media Storage**|**Supabase Storage**|Hosts student showcase thumbnails, project screenshots, and milestone attachments securely.|

### 3. Webpage Blueprints & User Interface Structure

|**Module**|**Core Purpose**|**Finalized Feature Set**|
|---|---|---|
|**1. Identity & Access Control**|Verification & persona isolation|• **Verified University Onboarding:** Access restricted via university email authentication.<br><br>  <br>  <br><br>• **Builder Profile:** Public student profile displaying department, batch year, skill tags, and GitHub/portfolio links.<br><br>  <br>  <br><br>• **Anonymous Batch Pseudonyms:** Auto-generates unlinked department handles (e.g., _Anon-CSE-442_) for feedback boards.|
|**2. Collab Hub (Project Matchmaking)**|Structured team recruitment & spaces|• **Structured Pitch Cards:** Standardized cards listing project scope, open roles (UI/UX, Frontend, Backend), and tech stack.<br><br>  <br>  <br><br>• **1-Click Application Pipeline:** Quick modal form allowing students to apply to open roles using their builder profile.<br><br>  <br>  <br><br>• **Team Workspaces:** Dedicated discussion threads and task checklists unlocked once a pitch owner accepts applicants.|
|**3. The Campus Board (Feedback)**|Constructive, safe feedback loops|• **Categorized Streams:** Filterable feeds for _Faculty & Grading_, _Labs & Equipment_, _Facilities_, and _Administration_.<br><br>  <br>  <br><br>• **Trending Feedback Filter:** Sorts top-upvoted issues so student representatives and faculty can easily review major campus concerns.<br><br>  <br>  <br><br>• **Automated Keyword & Profanity Filter:** Client-side string sanitization that blocks profanity and targeted personal names before posting.|
|**4. Privacy & Content Protection**|Anti-leak deterrence & lifecycle|• **Dynamic User-Info Watermark Overlay:** Faint background text displaying the viewer’s email across sensitive boards.<br><br>  <br>  <br><br>• **Auto-Expiring Lifecycle:** Posts automatically lock (read-only) after **20 days** and are permanently deleted from the database after **60 days** via PostgreSQL scheduled jobs, unless flagged for retention by an admin.<br><br>  <br>  <br><br>• **Restricted Access:** Blocks unauthenticated visitors from viewing internal campus pages.|
|**5. The Student Spotlight**|Peer recognition & portfolio sync|• **Milestone Tags:** Categories for Hackathon wins, research papers, app launches, and internships.<br><br>  <br>  <br><br>• **Project & Link Cards:** Clean cards linking to GitHub repositories, live demos, and papers.<br><br>  <br>  <br><br>• **Custom "Cheer" Badges:** Interactive reaction pills (🚀 Shipped, 🧠 Big Brain, 🏆 Winner) synced to the student's profile.|
|**6. The Hall of Fame**|Institutional broadcasting|• **Role-Gated Publishing:** Posting restricted to authorized accounts (Department Heads, Student Council, Club Leads) via Supabase RLS.<br><br>  <br>  <br><br>• **Official Accolade Feeds:** Highlights major contest wins (e.g., ICPC), grants, and club championships.<br><br>  <br>  <br><br>• **Read-Only Broadcasts:** Clean announcement feed where students can view and react without comment clutter.|

### 4. Roles & Simplified Database Design

#### User Roles & Permission Matrix

|**Role**|**Onboarding Method**|**Permissions & System Scope**|
|---|---|---|
|**Verified Student**|Verified University Email|Create project pitches, apply to teams, post peer achievements, upvote feedback, and post anonymously under batch pseudonyms.|
|**Project Lead**|Automatic upon pitch creation|Review incoming pitch applications, accept/reject teammates, and manage their team's workspace thread.|
|**Authorized Publisher**|Database Role Flag (`is_publisher`)|Publish official milestone announcements to the Institutional Hall of Fame.|
|**System Administrator**|Supabase Admin / Role Flag (`is_admin`)|Moderate flagged posts, toggle `admin_keep` to preserve important feedback past 60 days, and manage system settings.|

#### Relational Database Schema (PostgreSQL via Supabase)

Plaintext

```
  +--------------------+                         +----------------------+
  |      PROFILES      | 1                     * |  PITCH_APPLICATIONS  |
  |--------------------|------------------------<|----------------------|
  | id (UUID, PK/FK)   |                         | id (UUID, PK)        |
  | edu_email (TEXT)   |                         | pitch_id (UUID, FK)  |
  | full_name (TEXT)   |                         | applicant_id(UUID,FK)|
  | department (TEXT)  |                         | role_applied (TEXT)  |
  | batch_year (INT)   |                         | message (TEXT)       |
  | skills (TEXT[])    |                         | status (TEXT)        |
  | github_url (TEXT)  |                         +----------------------+
  | role (TEXT)        |                                    *
  +--------------------+                                    │
            │ 1                                             │
            │                                               │
            ▼ *                                             ▼ 1
  +--------------------+ 1                     * +----------------------+
  |  PROJECT_PITCHES   |<------------------------|  WORKSPACE_MESSAGES  |
  |--------------------|                         |----------------------|
  | id (UUID, PK)      |                         | id (UUID, PK)        |
  | creator_id(UUID,FK)|                         | pitch_id (UUID, FK)  |
  | title (TEXT)       |                         | sender_id (UUID, FK) |
  | description (TEXT) |                         | message_text (TEXT)  |
  | roles_needed(TEXT[])                         | created_at (TS)      |
  | status (TEXT)      |                         +----------------------+
  +--------------------+

  +--------------------+ (Unlinked Table)        +----------------------+
  |  CAMPUS_FEEDBACK   |                         |     HALL_OF_FAME     |
  |--------------------|                         |----------------------|
  | id (UUID, PK)      |                         | id (UUID, PK)        |
  | anonymous_handle   |                         | publisher_id(UUID,FK)|
  | category (TEXT)    |                         | category (TEXT)      |
  | content (TEXT)     |                         | title (TEXT)         |
  | upvotes_count (INT)|                         | proof_link (TEXT)    |
  | is_locked (BOOL)   |                         | created_at (TS)      |
  | admin_keep (BOOL)  |                         +----------------------+
  | created_at (TS)    |
  +--------------------+                         +----------------------+
                                                 |  ACHIEVEMENT_POSTS   |
                                                 |----------------------|
                                                 | id (UUID, PK)        |
                                                 | author_id(UUID, FK)  |
                                                 | title (TEXT)         |
                                                 | proof_link (TEXT)    |
                                                 | cheer_counts (JSONB) |
                                                 | created_at (TS)      |
                                                 +----------------------+
```

#### Database Rules & Automation

- **`PROFILES`, `PROJECT_PITCHES` & `PITCH_APPLICATIONS`:** Managed via PostgreSQL foreign keys and Supabase Row-Level Security (RLS) so users can only edit their own profiles, pitches, or applications.
    
- **`CAMPUS_FEEDBACK` (Unlinked Design):** Contains no `user_id` column, ensuring anonymous posts cannot be traced back to a student profile inside the database.
    
- **Automated Lifecycle (PostgreSQL `pg_cron`):**  
    - **Day 20 Lock:** A daily SQL function marks posts older than 20 days as `is_locked = TRUE`, blocking new upvotes or replies via RLS policies.  
    - **Day 60 Purge:** A daily SQL job deletes records where `created_at < NOW() - INTERVAL '60 days' AND admin_keep = FALSE`.



---

### 5. AI Implementation & Code Generation Rules

* **Strict Tech Stack:** Use ONLY Semantic HTML5, Modern CSS3 (Variables, Grid/Flexbox), Vanilla JavaScript (ES6+), and the Supabase JS v2 CDN (`@supabase/supabase-js`). Do NOT use React, Next.js, Node/Express, Tailwind CSS, or npm build tools.
* **Email Validation Mode:** Include a boolean toggle `const STRICT_EDU_ONLY = false;` at the top of `js/auth.js` so `@gmail.com` addresses work during testing and `.edu` / `.ac.bd` restrictions can be enabled later.
* **Required File Structure:**
  ```text
  ├── index.html          (Student Spotlight & Main Feed)
  ├── collab.html         (Project Matchmaking & Workspaces)
  ├── feedback.html       (Anonymous Campus Board)
  ├── hall-of-fame.html   (Institutional Broadcasts)
  ├── css/
  │   ├── style.css       (Global variables, responsive cards, modals)
  │   └── watermark.css   (Fixed low-opacity viewer email overlay)
  ├── js/
  │   ├── supabaseClient.js (Supabase initialization with URL/ANON_KEY placeholders)
  │   ├── auth.js           (Login/Signup, session checks, watermark renderer)
  │   └── app.js            (DOM rendering, pseudonym generator, profanity filter, CRUD)
  └── schema.sql            (PostgreSQL tables, RLS policies, and triggers)