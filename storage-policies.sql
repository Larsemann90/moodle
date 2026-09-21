-- =========================================================
-- Storage-Buckets & Policies
-- =========================================================
-- Lege VORHER im Supabase-Dashboard unter "Storage" folgende drei
-- Buckets an (jeweils "Public bucket" AUS lassen, also privat):
--   aufgaben      (Aufgaben- und Lösungsdateien der Lehrkraft)
--   abgaben       (Uploads der Schüler)
--   feedback      (Feedback-Dateien und Audio der Lehrkraft)
--
-- Danach diese Datei im SQL Editor ausführen.

-- Lehrer dürfen in "aufgaben" alles, wenn sie eingeloggt sind
create policy "Lehrer verwaltet Aufgaben-Dateien"
on storage.objects for all
using (bucket_id = 'aufgaben' and auth.role() = 'authenticated')
with check (bucket_id = 'aufgaben' and auth.role() = 'authenticated');

-- Jeder (auch anon, also Schüler) darf Aufgaben-Dateien LESEN (Download)
create policy "Alle lesen Aufgaben-Dateien"
on storage.objects for select
using (bucket_id = 'aufgaben');

-- Schüler (anon-Key) dürfen in "abgaben" hochladen und ihre eigenen Dateien lesen.
-- Da Schüler keinen echten Supabase-Auth-Login haben, wird hier nur grob auf
-- Bucket-Ebene erlaubt; die eigentliche Zuordnung passiert über die RPCs
-- (submit_task etc.) und den zufälligen Dateipfad. Für höhere Sicherheit
-- können Uploads zusätzlich über eine Edge Function laufen (siehe README).
create policy "Anon lädt Abgaben hoch"
on storage.objects for insert
with check (bucket_id = 'abgaben');

create policy "Lehrer liest Abgaben"
on storage.objects for select
using (bucket_id = 'abgaben' and auth.role() = 'authenticated');

-- Feedback: nur Lehrer schreibt, lesen erlauben wir offen (Datei-URL ist
-- lang & zufällig genug, wird aber nur an den jeweiligen Schüler ausgegeben)
create policy "Lehrer verwaltet Feedback-Dateien"
on storage.objects for all
using (bucket_id = 'feedback' and auth.role() = 'authenticated')
with check (bucket_id = 'feedback' and auth.role() = 'authenticated');

create policy "Alle lesen Feedback-Dateien"
on storage.objects for select
using (bucket_id = 'feedback');
