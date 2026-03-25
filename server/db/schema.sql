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
  FOREIGN KEY(manager_id) REFERENCES managers(id)
);

CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  position TEXT,
  skill INTEGER,
  age INTEGER,
  form INTEGER DEFAULT 100,
  aggressiveness TEXT,
  nationality TEXT,
  value INTEGER,
  wage INTEGER,
  goals INTEGER DEFAULT 0,
  red_cards INTEGER DEFAULT 0,
  injuries INTEGER DEFAULT 0,
  suspension_games INTEGER DEFAULT 0,
  injury_weeks INTEGER DEFAULT 0,
  suspension_until_matchweek INTEGER DEFAULT 0,
  injury_until_matchweek INTEGER DEFAULT 0,
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
  FOREIGN KEY(home_team_id) REFERENCES teams(id),
  FOREIGN KEY(away_team_id) REFERENCES teams(id)
);

CREATE TABLE IF NOT EXISTS game_state (
  key TEXT PRIMARY KEY,
  value TEXT
);
