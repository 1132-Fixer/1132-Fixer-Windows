-- Browser-specific product codes for the 1132 Fixer browser extension
-- (1132-Fixer/browser: Chrome, Edge, Brave, Firefox packages from one source).
-- Additive only: existing CHROME principals, cases, and ratings are untouched,
-- and clients that keep sending CHROME keep working. ADD VALUE is permitted
-- inside the migration transaction on PostgreSQL 12+; the new values become
-- usable once the migration commits, which is before the server listens.
ALTER TYPE product ADD VALUE IF NOT EXISTS 'EDGE';
ALTER TYPE product ADD VALUE IF NOT EXISTS 'FIREFOX';
ALTER TYPE product ADD VALUE IF NOT EXISTS 'BRAVE';
