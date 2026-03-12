UPDATE articles SET translated_lang = 'ja' WHERE full_text_translated IS NOT NULL AND translated_lang IS NULL;
