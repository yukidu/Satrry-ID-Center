-- 0007: bind every newly issued Starry service token to its authenticated
-- CENTRAL login session. Revoking one session invalidates only its descendants.
-- Historical candidate token rows with NULL parent become unusable by the
-- private introspection verifier until revoked/expired, NOT silently grandfathered.
ALTER TABLE central_service_access_tokens
 ADD COLUMN parent_session_sha256 TEXT
 REFERENCES auth_sessions(session_id_hash)
 CHECK(parent_session_sha256 IS NULL OR
       (length(parent_session_sha256)=64 AND parent_session_sha256 NOT GLOB '*[^0-9a-f]*'));

CREATE INDEX IF NOT EXISTS idx_central_service_token_session
 ON central_service_access_tokens(parent_session_sha256,revoked_at_ms);
