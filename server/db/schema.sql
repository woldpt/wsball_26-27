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
  stadium_capacity INTEGER DEFAULT 10000,
  budget INTEGER DEFAULT 15000,
  loan_amount INTEGER DEFAULT 0,
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
