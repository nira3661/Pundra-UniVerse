-- ============================================================================
-- PUB HUB — MIGRATION V2
-- Idempotent. Paste the entire block into Supabase SQL Editor and run once.
-- Generated: 2026-11-19
-- ============================================================================

-- ============================================================================
-- SECTION 0: Required Extensions & Reaction Tracking Tables
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Ensure JSONB count columns & missing columns exist
ALTER TABLE public.achievement_posts ADD COLUMN IF NOT EXISTS cheer_counts JSONB DEFAULT '{"shipped": 0, "big_brain": 0, "winner": 0}'::jsonb;
ALTER TABLE public.hall_of_fame ADD COLUMN IF NOT EXISTS reaction_counts JSONB DEFAULT '{"applaud": 0, "celebrate": 0, "inspiring": 0}'::jsonb;
ALTER TABLE public.campus_feedback ADD COLUMN IF NOT EXISTS upvotes_count INT DEFAULT 0;
ALTER TABLE public.project_pitches ADD COLUMN IF NOT EXISTS team_size INT DEFAULT 4;

CREATE TABLE IF NOT EXISTS public.achievement_cheers (
    post_id UUID NOT NULL REFERENCES public.achievement_posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    cheer_type TEXT NOT NULL CHECK (cheer_type IN ('shipped', 'big_brain', 'winner')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (post_id, user_id, cheer_type)
);

CREATE INDEX IF NOT EXISTS idx_achievement_cheers_user ON public.achievement_cheers(user_id);
CREATE INDEX IF NOT EXISTS idx_achievement_cheers_post ON public.achievement_cheers(post_id);

ALTER TABLE public.achievement_cheers ENABLE ROW LEVEL SECURITY;

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

CREATE TABLE IF NOT EXISTS public.hall_of_fame_reactions (
    hof_id UUID NOT NULL REFERENCES public.hall_of_fame(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reaction_type TEXT NOT NULL CHECK (reaction_type IN ('applaud', 'celebrate', 'inspiring')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (hof_id, user_id, reaction_type)
);

CREATE INDEX IF NOT EXISTS idx_hof_reactions_user ON public.hall_of_fame_reactions(user_id);
CREATE INDEX IF NOT EXISTS idx_hof_reactions_hof ON public.hall_of_fame_reactions(hof_id);

ALTER TABLE public.hall_of_fame_reactions ENABLE ROW LEVEL SECURITY;

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
-- SECTION 1: campus_feedback — add author_hash column
-- ============================================================================

ALTER TABLE public.campus_feedback ADD COLUMN IF NOT EXISTS author_hash TEXT;

-- ============================================================================
-- SECTION 2: campus_feedback_votes — new table (anonymous vote tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.campus_feedback_votes (
    feedback_id UUID NOT NULL REFERENCES public.campus_feedback(id) ON DELETE CASCADE,
    voter_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (feedback_id, voter_hash)
);

ALTER TABLE public.campus_feedback_votes ENABLE ROW LEVEL SECURITY;
-- NO SELECT policy for public — only SECURITY DEFINER RPCs access this table

CREATE INDEX IF NOT EXISTS idx_feedback_votes_hash ON public.campus_feedback_votes(voter_hash);

-- ============================================================================
-- SECTION 3: hall_of_fame — add DELETE policy (was missing)
-- ============================================================================

DROP POLICY IF EXISTS "Publishers or Admins can delete hall of fame" ON public.hall_of_fame;
CREATE POLICY "Publishers or Admins can delete hall of fame"
    ON public.hall_of_fame FOR DELETE TO authenticated
    USING (
        publisher_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
    );

-- ============================================================================
-- SECTION 4: increment_cheer — race-condition-safe recompute version
-- ============================================================================

CREATE OR REPLACE FUNCTION public.increment_cheer(p_post_id UUID, p_cheer_type TEXT)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id UUID;
    v_exists  BOOLEAN;
    v_active  BOOLEAN;
    v_counts  JSONB;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Must be authenticated');
    END IF;

    IF p_cheer_type NOT IN ('shipped', 'big_brain', 'winner') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid cheer type');
    END IF;

    -- Confirm post exists
    IF NOT EXISTS (SELECT 1 FROM public.achievement_posts WHERE id = p_post_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Post not found');
    END IF;

    -- Toggle
    SELECT EXISTS (
        SELECT 1 FROM public.achievement_cheers
        WHERE post_id = p_post_id AND user_id = v_user_id AND cheer_type = p_cheer_type
    ) INTO v_exists;

    IF v_exists THEN
        DELETE FROM public.achievement_cheers
        WHERE post_id = p_post_id AND user_id = v_user_id AND cheer_type = p_cheer_type;
        v_active := false;
    ELSE
        INSERT INTO public.achievement_cheers (post_id, user_id, cheer_type)
        VALUES (p_post_id, v_user_id, p_cheer_type)
        ON CONFLICT DO NOTHING;
        v_active := true;
    END IF;

    -- Recompute all 3 counts from source of truth
    SELECT jsonb_build_object(
        'shipped',   COUNT(*) FILTER (WHERE cheer_type = 'shipped'),
        'big_brain', COUNT(*) FILTER (WHERE cheer_type = 'big_brain'),
        'winner',    COUNT(*) FILTER (WHERE cheer_type = 'winner')
    )
    INTO v_counts
    FROM public.achievement_cheers
    WHERE post_id = p_post_id;

    UPDATE public.achievement_posts
    SET cheer_counts = v_counts
    WHERE id = p_post_id;

    RETURN jsonb_build_object(
        'success', true,
        'active', v_active,
        'cheer_type', p_cheer_type,
        'cheer_counts', v_counts
    );
END;
$$;

-- ============================================================================
-- SECTION 5: increment_hof_reaction — race-condition-safe recompute version
-- ============================================================================

CREATE OR REPLACE FUNCTION public.increment_hof_reaction(p_hof_id UUID, p_reaction_type TEXT)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id UUID;
    v_exists  BOOLEAN;
    v_active  BOOLEAN;
    v_counts  JSONB;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Must be authenticated');
    END IF;

    IF p_reaction_type NOT IN ('applaud', 'celebrate', 'inspiring') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid reaction type');
    END IF;

    -- Confirm HOF entry exists
    IF NOT EXISTS (SELECT 1 FROM public.hall_of_fame WHERE id = p_hof_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Announcement not found');
    END IF;

    -- Toggle
    SELECT EXISTS (
        SELECT 1 FROM public.hall_of_fame_reactions
        WHERE hof_id = p_hof_id AND user_id = v_user_id AND reaction_type = p_reaction_type
    ) INTO v_exists;

    IF v_exists THEN
        DELETE FROM public.hall_of_fame_reactions
        WHERE hof_id = p_hof_id AND user_id = v_user_id AND reaction_type = p_reaction_type;
        v_active := false;
    ELSE
        INSERT INTO public.hall_of_fame_reactions (hof_id, user_id, reaction_type)
        VALUES (p_hof_id, v_user_id, p_reaction_type)
        ON CONFLICT DO NOTHING;
        v_active := true;
    END IF;

    -- Recompute all 3 counts from source of truth
    SELECT jsonb_build_object(
        'applaud',   COUNT(*) FILTER (WHERE reaction_type = 'applaud'),
        'celebrate', COUNT(*) FILTER (WHERE reaction_type = 'celebrate'),
        'inspiring', COUNT(*) FILTER (WHERE reaction_type = 'inspiring')
    )
    INTO v_counts
    FROM public.hall_of_fame_reactions
    WHERE hof_id = p_hof_id;

    UPDATE public.hall_of_fame
    SET reaction_counts = v_counts
    WHERE id = p_hof_id;

    RETURN jsonb_build_object(
        'success', true,
        'active', v_active,
        'reaction_type', p_reaction_type,
        'reaction_counts', v_counts
    );
END;
$$;

-- ============================================================================
-- SECTION 6: toggle_feedback_upvote — replaces increment_feedback_upvote
-- ============================================================================

CREATE OR REPLACE FUNCTION public.toggle_feedback_upvote(p_feedback_id UUID)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, extensions
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id      UUID;
    v_voter_hash   TEXT;
    v_locked       BOOLEAN;
    v_age_days     FLOAT;
    v_new_count    INT;
    v_already_voted BOOLEAN;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Must be authenticated');
    END IF;

    -- Compute salted hash of user+feedback using PostgreSQL core sha256 (never store raw user_id)
    v_voter_hash := encode(sha256((v_user_id::text || ':' || p_feedback_id::text || ':pub-hub-vote-salt')::bytea), 'hex');

    SELECT is_locked, EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400
    INTO v_locked, v_age_days
    FROM public.campus_feedback
    WHERE id = p_feedback_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Feedback item not found');
    END IF;

    IF v_locked OR v_age_days >= 20 THEN
        RETURN jsonb_build_object('success', false, 'error', 'This thread is locked');
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM public.campus_feedback_votes
        WHERE feedback_id = p_feedback_id AND voter_hash = v_voter_hash
    ) INTO v_already_voted;

    IF v_already_voted THEN
        -- Toggle OFF: remove vote
        DELETE FROM public.campus_feedback_votes
        WHERE feedback_id = p_feedback_id AND voter_hash = v_voter_hash;
    ELSE
        -- Toggle ON: add vote
        INSERT INTO public.campus_feedback_votes (feedback_id, voter_hash)
        VALUES (p_feedback_id, v_voter_hash)
        ON CONFLICT DO NOTHING;
    END IF;

    -- Recompute from source of truth
    SELECT COUNT(*) INTO v_new_count
    FROM public.campus_feedback_votes
    WHERE feedback_id = p_feedback_id;

    UPDATE public.campus_feedback
    SET upvotes_count = v_new_count
    WHERE id = p_feedback_id;

    RETURN jsonb_build_object(
        'success', true,
        'active', NOT v_already_voted,
        'upvotes_count', v_new_count
    );
END;
$$;

-- ============================================================================
-- SECTION 7: get_my_feedback_votes — returns UUIDs of posts current user voted
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_my_feedback_votes()
RETURNS UUID[]
SECURITY DEFINER
SET search_path = public, extensions
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN RETURN '{}'::UUID[]; END IF;

    RETURN ARRAY(
        SELECT cfv.feedback_id
        FROM public.campus_feedback_votes cfv
        WHERE cfv.voter_hash = encode(
            sha256((v_user_id::text || ':' || cfv.feedback_id::text || ':pub-hub-vote-salt')::bytea),
            'hex'
        )
    );
END;
$$;

-- ============================================================================
-- SECTION 8: submit_feedback — server-side insert with author_hash
-- ============================================================================

CREATE OR REPLACE FUNCTION public.submit_feedback(
    p_anonymous_handle TEXT,
    p_category TEXT,
    p_content TEXT
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, extensions
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id     UUID;
    v_author_hash TEXT;
    v_new_id      UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Must be authenticated');
    END IF;

    IF p_category NOT IN ('faculty', 'labs', 'facilities', 'admin') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid category');
    END IF;

    v_author_hash := encode(sha256((v_user_id::text || ':pub-hub-author-salt')::bytea), 'hex');

    INSERT INTO public.campus_feedback (anonymous_handle, category, content, upvotes_count, is_locked, admin_keep, author_hash)
    VALUES (p_anonymous_handle, p_category, p_content, 0, false, false, v_author_hash)
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object('success', true, 'id', v_new_id);
END;
$$;

-- ============================================================================
-- SECTION 9: delete_my_feedback — anonymous delete (also allows admins)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.delete_my_feedback(p_feedback_id UUID)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, extensions
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id     UUID;
    v_author_hash TEXT;
    v_is_locked   BOOLEAN;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Must be authenticated');
    END IF;

    v_author_hash := encode(sha256((v_user_id::text || ':pub-hub-author-salt')::bytea), 'hex');

    SELECT is_locked INTO v_is_locked
    FROM public.campus_feedback
    WHERE id = p_feedback_id AND author_hash = v_author_hash;

    IF NOT FOUND THEN
        -- Also allow admins
        IF EXISTS(SELECT 1 FROM public.profiles WHERE id = v_user_id AND is_admin = TRUE) THEN
            DELETE FROM public.campus_feedback WHERE id = p_feedback_id;
            RETURN jsonb_build_object('success', true);
        END IF;
        RETURN jsonb_build_object('success', false, 'error', 'Not found or not your post');
    END IF;

    IF v_is_locked THEN
        RETURN jsonb_build_object('success', false, 'error', 'Post is locked and cannot be deleted');
    END IF;

    DELETE FROM public.campus_feedback WHERE id = p_feedback_id AND author_hash = v_author_hash;
    RETURN jsonb_build_object('success', true);
END;
$$;

-- ============================================================================
-- SECTION 10: edit_my_feedback — anonymous edit (locked posts blocked)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.edit_my_feedback(p_feedback_id UUID, p_content TEXT)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, extensions
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id     UUID;
    v_author_hash TEXT;
    v_is_locked   BOOLEAN;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Must be authenticated');
    END IF;

    IF LENGTH(TRIM(p_content)) < 20 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Content too short');
    END IF;

    v_author_hash := encode(sha256((v_user_id::text || ':pub-hub-author-salt')::bytea), 'hex');

    SELECT is_locked INTO v_is_locked
    FROM public.campus_feedback
    WHERE id = p_feedback_id AND author_hash = v_author_hash;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not found or not your post');
    END IF;

    IF v_is_locked THEN
        RETURN jsonb_build_object('success', false, 'error', 'Post is locked and cannot be edited');
    END IF;

    UPDATE public.campus_feedback
    SET content = p_content
    WHERE id = p_feedback_id AND author_hash = v_author_hash;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- ============================================================================
-- SECTION 11: get_my_feedback_ids — returns UUIDs the current user authored
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_my_feedback_ids()
RETURNS UUID[]
SECURITY DEFINER
SET search_path = public, extensions
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id     UUID;
    v_author_hash TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN RETURN '{}'::UUID[]; END IF;

    v_author_hash := encode(sha256((v_user_id::text || ':pub-hub-author-salt')::bytea), 'hex');

    RETURN ARRAY(
        SELECT id FROM public.campus_feedback WHERE author_hash = v_author_hash
    );
END;
$$;

-- ============================================================================
-- END OF MIGRATION V2
-- ============================================================================
