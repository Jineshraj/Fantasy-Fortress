-- =========================================================
-- FANTASY FORTRESS - CORE SUPABASE POSTGRESQL PRODUCTION SCHEMA
-- =========================================================

-- 1. Teams Table (16 Fantasy Franchises)
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    short_code TEXT,
    stadium_name TEXT,
    home_club TEXT,
    crest_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Players Master Registry
CREATE TABLE IF NOT EXISTS players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    club TEXT NOT NULL,
    position TEXT NOT NULL CHECK (position IN ('GK', 'GKP', 'DEF', 'MID', 'FWD')),
    sofascore_id TEXT,
    api_football_id TEXT,
    transfermarkt_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_player_name_club UNIQUE (name, club)
);

-- 3. Submitted Lineups (15 Players per Team per GW)
CREATE TABLE IF NOT EXISTS lineups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_name TEXT NOT NULL,
    gameweek INT NOT NULL,
    player_name TEXT NOT NULL,
    position TEXT NOT NULL,
    role TEXT NOT NULL, -- STARTER, BENCH_1, BENCH_2, BENCH_3, BENCH_4
    is_captain BOOLEAN DEFAULT FALSE,
    is_vice BOOLEAN DEFAULT FALSE,
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_team_gw_player UNIQUE (team_name, gameweek, player_name)
);

-- 4. Player Gameweek Points & Stats Breakdown
CREATE TABLE IF NOT EXISTS player_gameweek_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gameweek INT NOT NULL,
    team_name TEXT NOT NULL,
    player_name TEXT NOT NULL,
    position TEXT NOT NULL,
    role TEXT NOT NULL,
    minutes INT DEFAULT 0,
    goals INT DEFAULT 0,
    assists INT DEFAULT 0,
    clean_sheet BOOLEAN DEFAULT FALSE,
    yellow_cards INT DEFAULT 0,
    red_cards INT DEFAULT 0,
    own_goals INT DEFAULT 0,
    penalty_miss INT DEFAULT 0,
    penalty_save INT DEFAULT 0,
    base_points INT DEFAULT 0,
    stadium_bonus INT DEFAULT 0,
    multiplier INT DEFAULT 1,
    final_points INT DEFAULT 0,
    is_effective_starter BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_gw_team_player UNIQUE (gameweek, team_name, player_name)
);

-- 5. Gameweek Team Scores (Weekly Snapshot & Stadium Bonus)
CREATE TABLE IF NOT EXISTS gameweek_team_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_name TEXT NOT NULL,
    gameweek INT NOT NULL,
    captain_name TEXT,
    effective_captain_name TEXT,
    stadium_name TEXT,
    stadium_bonus INT DEFAULT 0,
    stadium_result_label TEXT,
    player_base_points INT DEFAULT 0,
    player_stadium_bonus INT DEFAULT 0,
    total_points INT DEFAULT 0,
    rank_in_gw INT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_team_gw_score UNIQUE (team_name, gameweek)
);

-- 6. Master Season Standings (Cumulative League Table)
CREATE TABLE IF NOT EXISTS standings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_name TEXT UNIQUE NOT NULL,
    season_rank INT NOT NULL,
    season_total INT NOT NULL,
    gw_scores JSONB NOT NULL DEFAULT '[]'::JSONB, -- Array of 38 numbers [gw1, gw2, ...]
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Fixture Staging (Top 5 Leagues Match Schedule & Results)
CREATE TABLE IF NOT EXISTS fixtures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gameweek INT NOT NULL,
    match_id TEXT,
    league TEXT NOT NULL,
    home_team TEXT NOT NULL,
    away_team TEXT NOT NULL,
    home_score INT,
    away_score INT,
    match_date TEXT,
    status TEXT NOT NULL, -- SCHEDULED, LIVE, FINISHED
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_gw_match UNIQUE (gameweek, match_id, home_team, away_team)
);

-- =========================================================
-- DATABASE PERFORMANCE INDEXES
-- =========================================================
CREATE INDEX IF NOT EXISTS idx_lineups_gw ON lineups(gameweek);
CREATE INDEX IF NOT EXISTS idx_lineups_team ON lineups(team_name);
CREATE INDEX IF NOT EXISTS idx_player_stats_gw ON player_gameweek_stats(gameweek);
CREATE INDEX IF NOT EXISTS idx_player_stats_team ON player_gameweek_stats(team_name);
CREATE INDEX IF NOT EXISTS idx_team_scores_gw ON gameweek_team_scores(gameweek);
CREATE INDEX IF NOT EXISTS idx_fixtures_gw ON fixtures(gameweek);
CREATE INDEX IF NOT EXISTS idx_standings_rank ON standings(season_rank);

-- =========================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =========================================================
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE lineups ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_gameweek_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE gameweek_team_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE standings ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixtures ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if already created
DROP POLICY IF EXISTS "Allow public read access to teams" ON teams;
DROP POLICY IF EXISTS "Allow public read access to players" ON players;
DROP POLICY IF EXISTS "Allow public read access to lineups" ON lineups;
DROP POLICY IF EXISTS "Allow public read access to player_gameweek_stats" ON player_gameweek_stats;
DROP POLICY IF EXISTS "Allow public read access to gameweek_team_scores" ON gameweek_team_scores;
DROP POLICY IF EXISTS "Allow public read access to standings" ON standings;
DROP POLICY IF EXISTS "Allow public read access to fixtures" ON fixtures;

DROP POLICY IF EXISTS "Allow full access for service_role to teams" ON teams;
DROP POLICY IF EXISTS "Allow full access for service_role to players" ON players;
DROP POLICY IF EXISTS "Allow full access for service_role to lineups" ON lineups;
DROP POLICY IF EXISTS "Allow full access for service_role to player_gameweek_stats" ON player_gameweek_stats;
DROP POLICY IF EXISTS "Allow full access for service_role to gameweek_team_scores" ON gameweek_team_scores;
DROP POLICY IF EXISTS "Allow full access for service_role to standings" ON standings;
DROP POLICY IF EXISTS "Allow full access for service_role to fixtures" ON fixtures;

-- Create Public Read-Only Policies (For React Frontend)
CREATE POLICY "Allow public read access to teams" ON teams FOR SELECT USING (true);
CREATE POLICY "Allow public read access to players" ON players FOR SELECT USING (true);
CREATE POLICY "Allow public read access to lineups" ON lineups FOR SELECT USING (true);
CREATE POLICY "Allow public read access to player_gameweek_stats" ON player_gameweek_stats FOR SELECT USING (true);
CREATE POLICY "Allow public read access to gameweek_team_scores" ON gameweek_team_scores FOR SELECT USING (true);
CREATE POLICY "Allow public read access to standings" ON standings FOR SELECT USING (true);
CREATE POLICY "Allow public read access to fixtures" ON fixtures FOR SELECT USING (true);

-- Create Full Access Policies for Service Role (For Sync Engine)
CREATE POLICY "Allow full access for service_role to teams" ON teams FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Allow full access for service_role to players" ON players FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Allow full access for service_role to lineups" ON lineups FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Allow full access for service_role to player_gameweek_stats" ON player_gameweek_stats FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Allow full access for service_role to gameweek_team_scores" ON gameweek_team_scores FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Allow full access for service_role to standings" ON standings FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Allow full access for service_role to fixtures" ON fixtures FOR ALL USING (auth.role() = 'service_role');
