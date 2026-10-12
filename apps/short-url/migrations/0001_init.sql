-- 短縮 URL。data は Message Editor の URL の #d= より後ろの値をそのまま持つ（プロトタイプでは暗号化しない）
CREATE TABLE links (
  id         TEXT PRIMARY KEY,       -- UUID v4
  data       TEXT NOT NULL,          -- #d= より後ろの値（base64url）
  created_at INTEGER NOT NULL        -- UNIX 秒
);
