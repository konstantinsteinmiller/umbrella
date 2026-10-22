-- Community levels: player-submitted levels, ratings and plays.
CREATE TABLE IF NOT EXISTS levels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  code TEXT NOT NULL,
  player TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  plays INTEGER NOT NULL DEFAULT 0,
  rating_sum INTEGER NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  rating_avg REAL NOT NULL DEFAULT 0,
  score REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS levels_score ON levels (score DESC, rating_count DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS levels_created ON levels (created_at DESC);
CREATE INDEX IF NOT EXISTS levels_plays ON levels (plays DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS levels_player ON levels (player, created_at);
CREATE INDEX IF NOT EXISTS levels_ip ON levels (ip_hash, created_at);

CREATE TABLE IF NOT EXISTS ratings (
  level_id TEXT NOT NULL,
  player TEXT NOT NULL,
  stars INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (level_id, player)
);

CREATE TABLE IF NOT EXISTS plays (
  level_id TEXT NOT NULL,
  player TEXT NOT NULL,
  day INTEGER NOT NULL,
  PRIMARY KEY (level_id, player, day)
);
