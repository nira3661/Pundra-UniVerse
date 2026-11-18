-- ============================================================================
-- PUNDRA UNIVERSE (PUB HUB) - POSTGRESQL DATABASE SCHEMA
-- Target Backend: Supabase (PostgreSQL with Row-Level Security)
-- ============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 2. CORE RELATIONAL TABLES
-- ============================================================================

-- PROFILES (Builder Profile & University Identity)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    edu_email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    department TEXT,
    batch_year INT,
    skills TEXT[] DEFAULT '{}'::TEXT[],
    github_url TEXT,
    role TEXT DEFAULT 'student',
    is_publisher BOOLEAN DEFAULT FALSE,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- PROJECT_PITCHES (Collab Hub - Project Recruitment)
CREATE TABLE IF NOT EXISTS public.project_pitches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    roles_needed TEXT[] DEFAULT '{}'::TEXT[],
    tech_stack TEXT[] DEFAULT '{}'::TEXT[],
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'closed')),
    thumbnail_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- PITCH_APPLICATIONS (1-Click Application Pipeline)
CREATE TABLE IF NOT EXISTS public.pitch_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pitch_id UUID NOT NULL REFERENCES public.project_pitches(id) ON DELETE CASCADE,
    applicant_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role_applied TEXT NOT NULL,
    message TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_pitch_applicant UNIQUE (pitch_id, applicant_id)
);

-- WORKSPACE_MESSAGES (Internal Team Workspace Thread)
CREATE TABLE IF NOT EXISTS public.workspace_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pitch_id UUID NOT NULL REFERENCES public.project_pitches(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    message_text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- WORKSPACE_TASKS (Internal Team Workspace Task Checklist)
CREATE TABLE IF NOT EXISTS public.workspace_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pitch_id UUID NOT NULL REFERENCES public.project_pitches(id) ON DELETE CASCADE,
    creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    assignee_name TEXT,
    title TEXT NOT NULL,
    is_done BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- CAMPUS_FEEDBACK (Decoupled Anonymous Campus Board)
-- Intentionally unlinked from profiles/auth.users to preserve anonymous privacy.
CREATE TABLE IF NOT EXISTS public.campus_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anonymous_handle TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('faculty', 'labs', 'facilities', 'admin')),
    content TEXT NOT NULL,
    upvotes_count INT DEFAULT 0 CHECK (upvotes_count >= 0),
    is_locked BOOLEAN DEFAULT FALSE,
    admin_keep BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- HALL_OF_FAME (Institutional Broadcasting - Role-Gated)
CREATE TABLE IF NOT EXISTS public.hall_of_fame (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    publisher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    proof_link TEXT,
    image_url TEXT,
    is_featured BOOLEAN DEFAULT FALSE,
    reaction_counts JSONB DEFAULT '{"applaud": 0, "celebrate": 0, "inspiring": 0}'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ACHIEVEMENT_POSTS (The Student Spotlight & Cheer Badges)
CREATE TABLE IF NOT EXISTS public.achievement_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    milestone_tag TEXT NOT NULL CHECK (milestone_tag IN ('hackathon', 'research', 'launch', 'internship')),
    proof_link TEXT,
    thumbnail_url TEXT,
    cheer_counts JSONB DEFAULT '{"shipped": 0, "big_brain": 0, "winner": 0}'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ACHIEVEMENT_CHEERS (Cheer badge reactions tracking)
CREATE TABLE IF NOT EXISTS public.achievement_cheers (
    post_id UUID NOT NULL REFERENCES public.achievement_posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    cheer_type TEXT NOT NULL CHECK (cheer_type IN ('shipped', 'big_brain', 'winner')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (post_id, user_id, cheer_type)
);

-- HALL_OF_FAME_REACTIONS (Official announcement reactions tracking)
CREATE TABLE IF NOT EXISTS public.hall_of_fame_reactions (
    hof_id UUID NOT NULL REFERENCES public.hall_of_fame(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reaction_type TEXT NOT NULL CHECK (reaction_type IN ('applaud', 'celebrate', 'inspiring')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (hof_id, user_id, reaction_type)
);

-- ============================================================================
-- 3. INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_pitches_creator ON public.project_pitches(creator_id);
CREATE INDEX IF NOT EXISTS idx_applications_pitch ON public.pitch_applications(pitch_id);
CREATE INDEX IF NOT EXISTS idx_applications_applicant ON public.pitch_applications(applicant_id);
CREATE INDEX IF NOT EXISTS idx_workspace_pitch ON public.workspace_messages(pitch_id);
CREATE INDEX IF NOT EXISTS idx_workspace_tasks_pitch ON public.workspace_tasks(pitch_id);
CREATE INDEX IF NOT EXISTS idx_feedback_category ON public.campus_feedback(category);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON public.campus_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_achievements_author ON public.achievement_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_achievement_cheers_user ON public.achievement_cheers(user_id);
CREATE INDEX IF NOT EXISTS idx_achievement_cheers_post ON public.achievement_cheers(post_id);
CREATE INDEX IF NOT EXISTS idx_hall_of_fame_created ON public.hall_of_fame(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hof_reactions_user ON public.hall_of_fame_reactions(user_id);
CREATE INDEX IF NOT EXISTS idx_hof_reactions_hof ON public.hall_of_fame_reactions(hof_id);

-- ============================================================================
-- 4. ROW-LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_pitches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pitch_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hall_of_fame ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievement_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievement_cheers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hall_of_fame_reactions ENABLE ROW LEVEL SECURITY;

-- PROFILES POLICIES
CREATE POLICY "Authenticated users can view profiles"
    ON public.profiles FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
    ON public.profiles FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = id);

-- PROJECT_PITCHES POLICIES
CREATE POLICY "Authenticated users can view pitches"
    ON public.project_pitches FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Users can create pitches"
    ON public.project_pitches FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Creators can update own pitches"
    ON public.project_pitches FOR UPDATE TO authenticated
    USING (auth.uid() = creator_id)
    WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Creators or Admins can delete pitches"
    ON public.project_pitches FOR DELETE TO authenticated
    USING (
        auth.uid() = creator_id
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
    );

-- PITCH_APPLICATIONS POLICIES
CREATE POLICY "Applicants and pitch owners can view applications"
    ON public.pitch_applications FOR SELECT TO authenticated
    USING (
        applicant_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.project_pitches
            WHERE project_pitches.id = pitch_applications.pitch_id
            AND project_pitches.creator_id = auth.uid()
        )
    );

CREATE POLICY "Students can apply to pitches"
    ON public.pitch_applications FOR INSERT TO authenticated
    WITH CHECK (
        applicant_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.project_pitches
            WHERE project_pitches.id = pitch_id
            AND project_pitches.creator_id != auth.uid()
            AND project_pitches.status = 'open'
        )
    );

CREATE POLICY "Pitch owners and applicants can update applications"
    ON public.pitch_applications FOR UPDATE TO authenticated
    USING (
        applicant_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.project_pitches
            WHERE project_pitches.id = pitch_applications.pitch_id
            AND project_pitches.creator_id = auth.uid()
        )
    );

-- WORKSPACE_MESSAGES POLICIES
CREATE POLICY "Team members can view workspace messages"
    ON public.workspace_messages FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.project_pitches
            WHERE project_pitches.id = workspace_messages.pitch_id
            AND project_pitches.creator_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.pitch_applications
            WHERE pitch_applications.pitch_id = workspace_messages.pitch_id
            AND pitch_applications.applicant_id = auth.uid()
            AND pitch_applications.status = 'accepted'
        )
    );

CREATE POLICY "Team members can post workspace messages"
    ON public.workspace_messages FOR INSERT TO authenticated
    WITH CHECK (
        sender_id = auth.uid()
        AND (
            EXISTS (
                SELECT 1 FROM public.project_pitches
                WHERE project_pitches.id = workspace_messages.pitch_id
                AND project_pitches.creator_id = auth.uid()
            )
            OR EXISTS (
                SELECT 1 FROM public.pitch_applications
                WHERE pitch_applications.pitch_id = workspace_messages.pitch_id
                AND pitch_applications.applicant_id = auth.uid()
                AND pitch_applications.status = 'accepted'
            )
        )
    );

-- WORKSPACE_TASKS POLICIES
CREATE POLICY "Team members can view workspace tasks"
    ON public.workspace_tasks FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.project_pitches
            WHERE project_pitches.id = workspace_tasks.pitch_id
            AND project_pitches.creator_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.pitch_applications
            WHERE pitch_applications.pitch_id = workspace_tasks.pitch_id
            AND pitch_applications.applicant_id = auth.uid()
            AND pitch_applications.status = 'accepted'
        )
    );

CREATE POLICY "Team members can insert workspace tasks"
    ON public.workspace_tasks FOR INSERT TO authenticated
    WITH CHECK (
        creator_id = auth.uid()
        AND (
            EXISTS (
                SELECT 1 FROM public.project_pitches
                WHERE project_pitches.id = workspace_tasks.pitch_id
                AND project_pitches.creator_id = auth.uid()
            )
            OR EXISTS (
                SELECT 1 FROM public.pitch_applications
                WHERE pitch_applications.pitch_id = workspace_tasks.pitch_id
                AND pitch_applications.applicant_id = auth.uid()
                AND pitch_applications.status = 'accepted'
            )
        )
    );

CREATE POLICY "Team members can update workspace tasks"
    ON public.workspace_tasks FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.project_pitches
            WHERE project_pitches.id = workspace_tasks.pitch_id
            AND project_pitches.creator_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.pitch_applications
            WHERE pitch_applications.pitch_id = workspace_tasks.pitch_id
            AND pitch_applications.applicant_id = auth.uid()
            AND pitch_applications.status = 'accepted'
        )
    );

CREATE POLICY "Team members can delete workspace tasks"
    ON public.workspace_tasks FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.project_pitches
            WHERE project_pitches.id = workspace_tasks.pitch_id
            AND project_pitches.creator_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.pitch_applications
            WHERE pitch_applications.pitch_id = workspace_tasks.pitch_id
            AND pitch_applications.applicant_id = auth.uid()
            AND pitch_applications.status = 'accepted'
        )
    );

-- CAMPUS_FEEDBACK POLICIES (Decoupled Anonymous Feed)
CREATE POLICY "Authenticated users can read feedback"
    ON public.campus_feedback FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Authenticated users can post feedback"
    ON public.campus_feedback FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY "Admins can update feedback records"
    ON public.campus_feedback FOR UPDATE TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
    );

CREATE POLICY "Admins can delete feedback records"
    ON public.campus_feedback FOR DELETE TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
    );

-- HALL_OF_FAME POLICIES
CREATE POLICY "Authenticated users can view hall of fame"
    ON public.hall_of_fame FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Authorized publishers can insert hall of fame broadcasts"
    ON public.hall_of_fame FOR INSERT TO authenticated
    WITH CHECK (
        publisher_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND (is_publisher = TRUE OR is_admin = TRUE)
        )
    );

CREATE POLICY "Publishers or Admins can update hall of fame"
    ON public.hall_of_fame FOR UPDATE TO authenticated
    USING (
        publisher_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
    );

-- ACHIEVEMENT_POSTS POLICIES
CREATE POLICY "Authenticated users can view achievements"
    ON public.achievement_posts FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Students can post achievements"
    ON public.achievement_posts FOR INSERT TO authenticated
    WITH CHECK (author_id = auth.uid());

CREATE POLICY "Authors can update own achievements"
    ON public.achievement_posts FOR UPDATE TO authenticated
    USING (author_id = auth.uid())
    WITH CHECK (author_id = auth.uid());

CREATE POLICY "Authors can delete own achievements"
    ON public.achievement_posts FOR DELETE TO authenticated
    USING (
        author_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
    );

-- ACHIEVEMENT_CHEERS POLICIES
DROP POLICY IF EXISTS "Users can view achievement cheers" ON public.achievement_cheers;
CREATE POLICY "Users can view achievement cheers"
    ON public.achievement_cheers FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Users can insert own achievement cheers" ON public.achievement_cheers;
CREATE POLICY "Users can insert own achievement cheers"
    ON public.achievement_cheers FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own achievement cheers" ON public.achievement_cheers;
CREATE POLICY "Users can delete own achievement cheers"
    ON public.achievement_cheers FOR DELETE TO authenticated
    USING (auth.uid() = user_id);

-- HALL_OF_FAME_REACTIONS POLICIES
DROP POLICY IF EXISTS "Users can view hall of fame reactions" ON public.hall_of_fame_reactions;
CREATE POLICY "Users can view hall of fame reactions"
    ON public.hall_of_fame_reactions FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Users can insert own hall of fame reactions" ON public.hall_of_fame_reactions;
CREATE POLICY "Users can insert own hall of fame reactions"
    ON public.hall_of_fame_reactions FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own hall of fame reactions" ON public.hall_of_fame_reactions;
CREATE POLICY "Users can delete own hall of fame reactions"
    ON public.hall_of_fame_reactions FOR DELETE TO authenticated
    USING (auth.uid() = user_id);

-- ============================================================================
-- 5. AUTO-PROFILE TRIGGER ON SUPABASE AUTH SIGNUP
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    extracted_dept TEXT;
    extracted_name TEXT;
BEGIN
    extracted_name := COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        split_part(NEW.email, '@', 1)
    );
    
    extracted_dept := COALESCE(
        NEW.raw_user_meta_data->>'department',
        'General'
    );

    INSERT INTO public.profiles (
        id,
        edu_email,
        full_name,
        department,
        batch_year,
        skills,
        github_url,
        role,
        is_publisher,
        is_admin
    )
    VALUES (
        NEW.id,
        NEW.email,
        extracted_name,
        extracted_dept,
        (NEW.raw_user_meta_data->>'batch_year')::INT,
        COALESCE((NEW.raw_user_meta_data->>'skills')::TEXT[], '{}'::TEXT[]),
        NEW.raw_user_meta_data->>'github_url',
        'student',
        FALSE,
        FALSE
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 6. AUTOMATED 20-DAY LOCK & 60-DAY PURGE FUNCTIONS
-- ============================================================================

-- Function to lock feedback threads older than 20 days
CREATE OR REPLACE FUNCTION public.lock_expired_feedback()
RETURNS INT
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    locked_count INT;
BEGIN
    UPDATE public.campus_feedback
    SET is_locked = TRUE
    WHERE created_at < NOW() - INTERVAL '20 days'
      AND is_locked = FALSE;
      
    GET DIAGNOSTICS locked_count = ROW_COUNT;
    RETURN locked_count;
END;
$$;

-- Function to purge feedback threads older than 60 days (unless admin_keep is true)
CREATE OR REPLACE FUNCTION public.purge_expired_feedback()
RETURNS INT
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    purged_count INT;
BEGIN
    DELETE FROM public.campus_feedback
    WHERE created_at < NOW() - INTERVAL '60 days'
      AND admin_keep = FALSE;
      
    GET DIAGNOSTICS purged_count = ROW_COUNT;
    RETURN purged_count;
END;
$$;

-- ============================================================================
-- 7. ATOMIC RPC HELPER FUNCTIONS FOR CLIENT CALLS
-- ============================================================================

-- Safely upvote a feedback item (blocks if locked)
CREATE OR REPLACE FUNCTION public.increment_feedback_upvote(p_feedback_id UUID)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_locked BOOLEAN;
    v_new_count INT;
BEGIN
    SELECT is_locked, upvotes_count
    INTO v_locked, v_new_count
    FROM public.campus_feedback
    WHERE id = p_feedback_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Feedback item not found');
    END IF;

    IF v_locked THEN
        RETURN jsonb_build_object('success', false, 'error', 'This thread is locked after 20 days');
    END IF;

    UPDATE public.campus_feedback
    SET upvotes_count = upvotes_count + 1
    WHERE id = p_feedback_id
    RETURNING upvotes_count INTO v_new_count;

    RETURN jsonb_build_object('success', true, 'upvotes_count', v_new_count);
END;
$$;

-- Safely toggle cheer badge counters on achievement posts
CREATE OR REPLACE FUNCTION public.increment_cheer(p_post_id UUID, p_cheer_type TEXT)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id UUID;
    v_current JSONB;
    v_count INT;
    v_exists BOOLEAN;
    v_active BOOLEAN;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Must be authenticated');
    END IF;

    IF p_cheer_type NOT IN ('shipped', 'big_brain', 'winner') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid cheer type');
    END IF;

    SELECT cheer_counts INTO v_current
    FROM public.achievement_posts
    WHERE id = p_post_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Post not found');
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.achievement_cheers
        WHERE post_id = p_post_id AND user_id = v_user_id AND cheer_type = p_cheer_type
    ) INTO v_exists;

    v_count := COALESCE((v_current->>p_cheer_type)::INT, 0);

    IF v_exists THEN
        DELETE FROM public.achievement_cheers
        WHERE post_id = p_post_id AND user_id = v_user_id AND cheer_type = p_cheer_type;

        v_count := GREATEST(0, v_count - 1);
        v_active := false;
    ELSE
        INSERT INTO public.achievement_cheers (post_id, user_id, cheer_type)
        VALUES (p_post_id, v_user_id, p_cheer_type)
        ON CONFLICT DO NOTHING;

        v_count := v_count + 1;
        v_active := true;
    END IF;

    v_current := jsonb_set(COALESCE(v_current, '{}'::JSONB), ARRAY[p_cheer_type], to_jsonb(v_count));

    UPDATE public.achievement_posts
    SET cheer_counts = v_current
    WHERE id = p_post_id;

    RETURN jsonb_build_object(
        'success', true,
        'active', v_active,
        'cheer_type', p_cheer_type,
        'cheer_counts', v_current
    );
END;
$$;

-- Safely toggle reaction counters on hall of fame announcements
CREATE OR REPLACE FUNCTION public.increment_hof_reaction(p_hof_id UUID, p_reaction_type TEXT)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id UUID;
    v_current JSONB;
    v_count INT;
    v_exists BOOLEAN;
    v_active BOOLEAN;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Must be authenticated');
    END IF;

    IF p_reaction_type NOT IN ('applaud', 'celebrate', 'inspiring') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid reaction type');
    END IF;

    SELECT reaction_counts INTO v_current
    FROM public.hall_of_fame
    WHERE id = p_hof_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Announcement not found');
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.hall_of_fame_reactions
        WHERE hof_id = p_hof_id AND user_id = v_user_id AND reaction_type = p_reaction_type
    ) INTO v_exists;

    v_count := COALESCE((v_current->>p_reaction_type)::INT, 0);

    IF v_exists THEN
        DELETE FROM public.hall_of_fame_reactions
        WHERE hof_id = p_hof_id AND user_id = v_user_id AND reaction_type = p_reaction_type;

        v_count := GREATEST(0, v_count - 1);
        v_active := false;
    ELSE
        INSERT INTO public.hall_of_fame_reactions (hof_id, user_id, reaction_type)
        VALUES (p_hof_id, v_user_id, p_reaction_type)
        ON CONFLICT DO NOTHING;

        v_count := v_count + 1;
        v_active := true;
    END IF;

    v_current := jsonb_set(COALESCE(v_current, '{"applaud": 0, "celebrate": 0, "inspiring": 0}'::JSONB), ARRAY[p_reaction_type], to_jsonb(v_count));

    UPDATE public.hall_of_fame
    SET reaction_counts = v_current
    WHERE id = p_hof_id;

    RETURN jsonb_build_object(
        'success', true,
        'active', v_active,
        'reaction_type', p_reaction_type,
        'reaction_counts', v_current
    );
END;
$$;

-- ============================================================================
-- 8. SUPABASE STORAGE BUCKET: pub-media
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('pub-media', 'pub-media', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    CREATE POLICY "Authenticated users can upload media"
        ON storage.objects FOR INSERT TO authenticated
        WITH CHECK (bucket_id = 'pub-media');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY "Authenticated users can read media"
        ON storage.objects FOR SELECT TO authenticated
        USING (bucket_id = 'pub-media');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Idempotent column migrations for existing instances
ALTER TABLE public.achievement_posts ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE public.project_pitches ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE public.hall_of_fame ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.hall_of_fame ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE;
ALTER TABLE public.hall_of_fame ADD COLUMN IF NOT EXISTS reaction_counts JSONB DEFAULT '{"applaud": 0, "celebrate": 0, "inspiring": 0}'::JSONB;

-- ============================================================================
-- 9. ENABLE REALTIME BROADCASTING
-- ============================================================================
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_messages;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_tasks;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.campus_feedback;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.achievement_posts;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.project_pitches;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
