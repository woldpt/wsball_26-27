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
  transfer_status TEXT DEFAULT 'none',
  transfer_price INTEGER DEFAULT 0,
  is_star INTEGER DEFAULT 0,
  prev_skill INTEGER DEFAULT NULL,
  team_id INTEGER,
  FOREIGN KEY(team_id) REFERENCES teams(id)
);

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  matchweek INTEGER,
  home_team_id INTEGER,
  away_team_id INTEGER,
  home_score INTEGER,
  away_score INTEGER,
  played BOOLEAN DEFAULT 0,
  narrative TEXT,
  competition TEXT DEFAULT 'League',
  attendance INTEGER DEFAULT 0,
  FOREIGN KEY(home_team_id) REFERENCES teams(id),
  FOREIGN KEY(away_team_id) REFERENCES teams(id)
);

CREATE TABLE IF NOT EXISTS game_state (
  key TEXT PRIMARY KEY,
  value TEXT
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
