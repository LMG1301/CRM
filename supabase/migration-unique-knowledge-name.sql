-- =============================================
-- Migration: UNIQUE constraint on knowledge_documents.name
-- Prevents duplicate document names at DB level
-- =============================================

-- Add UNIQUE constraint (will fail if duplicates exist — clean them first)
ALTER TABLE knowledge_documents
  ADD CONSTRAINT unique_document_name UNIQUE (name);
