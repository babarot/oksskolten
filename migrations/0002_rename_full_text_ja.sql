ALTER TABLE articles RENAME COLUMN full_text_ja TO full_text_translated;
ALTER TABLE articles ADD COLUMN translated_lang TEXT;
