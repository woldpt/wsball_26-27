CREATE TABLE IF NOT EXISTS managers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  reputation INTEGER DEFAULT 50
);

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  manager_id INTEGER,
  division INTEGER DEFAULT 4,
  points INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  draws INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  goals_for INTEGER DEFAULT 0,
  goals_against INTEGER DEFAULT 0,
  stadium_capacity INTEGER DEFAULT 10000,
  stadium_name TEXT DEFAULT '',
  budget INTEGER DEFAULT 15000,
  loan_amount INTEGER DEFAULT 0,
  color_primary TEXT,
  color_secondary TEXT,
  morale INTEGER DEFAULT 50,
  FOREIGN KEY(manager_id) REFERENCES managers(id)
);

CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  position TEXT,
  skill INTEGER,
  gk INTEGER DEFAULT 1,
  defesa INTEGER DEFAULT 1,
  passe INTEGER DEFAULT 1,
  finalizacao INTEGER DEFAULT 1,
  resistencia INTEGER DEFAULT 50,
  age INTEGER,
  form INTEGER DEFAULT 100,
  aggressiveness INTEGER DEFAULT 3,
  nationality TEXT,
  value INTEGER,
  wage INTEGER,
  goals INTEGER DEFAULT 0,
  red_cards INTEGER DEFAULT 0,
  injuries INTEGER DEFAULT 0,
  career_goals INTEGER DEFAULT 0,
  career_reds INTEGER DEFAULT 0,
  career_injuries INTEGER DEFAULT 0,
  suspension_games INTEGER DEFAULT 0,
  injury_weeks INTEGER DEFAULT 0,
  suspension_until_matchweek INTEGER DEFAULT 0,
  injury_until_matchweek INTEGER DEFAULT 0,
  contract_until_matchweek INTEGER DEFAULT 0,
  contract_request_pending INTEGER DEFAULT 0,
  contract_requested_wage INTEGER DEFAULT 0,
  joined_matchweek INTEGER DEFAULT 0,
  transfer_status TEXT DEFAULT 'none',
  transfer_price INTEGER DEFAULT 0,
  is_star INTEGER DEFAULT 0,
  prev_skill INTEGER DEFAULT NULL,
  last_auctioned_matchweek INTEGER DEFAULT 0,
  team_id INTEGER,
  FOREIGN KEY(team_id) REFERENCES teams(id)
);

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season INTEGER DEFAULT 1,
  matchweek INTEGER,
  home_team_id INTEGER,
  away_team_id INTEGER,
  home_score INTEGER,
  away_score INTEGER,
  played BOOLEAN DEFAULT 0,
  narrative TEXT,
  competition TEXT DEFAULT 'League',
  attendance INTEGER DEFAULT 0,
  home_lineup TEXT,
  away_lineup TEXT,
  FOREIGN KEY(home_team_id) REFERENCES teams(id),
  FOREIGN KEY(away_team_id) REFERENCES teams(id)
);

CREATE TABLE IF NOT EXISTS game_state (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS team_training_plan (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  season INTEGER NOT NULL,
  matchweek INTEGER NOT NULL,
  focus TEXT NOT NULL,
  intensity INTEGER NOT NULL DEFAULT 50,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(team_id, season, matchweek),
  FOREIGN KEY(team_id) REFERENCES teams(id)
);

CREATE TABLE IF NOT EXISTS cup_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season INTEGER NOT NULL,
  round INTEGER NOT NULL,
  home_team_id INTEGER,
  away_team_id INTEGER,
  home_score INTEGER DEFAULT 0,
  away_score INTEGER DEFAULT 0,
  home_et_score INTEGER DEFAULT 0,
  away_et_score INTEGER DEFAULT 0,
  home_penalties INTEGER DEFAULT 0,
  away_penalties INTEGER DEFAULT 0,
  winner_team_id INTEGER,
  played BOOLEAN DEFAULT 0,
  FOREIGN KEY(home_team_id) REFERENCES teams(id),
  FOREIGN KEY(away_team_id) REFERENCES teams(id)
);

CREATE TABLE IF NOT EXISTS palmares (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  season INTEGER NOT NULL,
  achievement TEXT NOT NULL,
  FOREIGN KEY(team_id) REFERENCES teams(id)
);

CREATE TABLE IF NOT EXISTS club_news (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  player_id INTEGER,
  player_name TEXT,
  related_team_id INTEGER,
  related_team_name TEXT,
  amount INTEGER,
  matchweek INTEGER,
  year INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(team_id) REFERENCES teams(id),
  FOREIGN KEY(player_id) REFERENCES players(id),
  FOREIGN KEY(related_team_id) REFERENCES teams(id)
);

CREATE INDEX IF NOT EXISTS idx_teams_manager_id ON teams(manager_id);
CREATE INDEX IF NOT EXISTS idx_players_team_id ON players(team_id);
CREATE INDEX IF NOT EXISTS idx_matches_home_team_id ON matches(home_team_id);
CREATE INDEX IF NOT EXISTS idx_matches_away_team_id ON matches(away_team_id);
CREATE INDEX IF NOT EXISTS idx_matches_matchweek ON matches(matchweek);
CREATE INDEX IF NOT EXISTS idx_matches_played ON matches(played);
CREATE INDEX IF NOT EXISTS idx_cup_matches_season_round ON cup_matches(season, round);
CREATE INDEX IF NOT EXISTS idx_palmares_team_id ON palmares(team_id);
CREATE INDEX IF NOT EXISTS idx_club_news_team_id ON club_news(team_id);
CREATE INDEX IF NOT EXISTS idx_club_news_player_id ON club_news(player_id);
CREATE INDEX IF NOT EXISTS idx_club_news_created_at ON club_news(created_at);
CREATE INDEX IF NOT EXISTS idx_training_plan_team_week ON team_training_plan(team_id, season, matchweek);
