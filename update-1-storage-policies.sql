-- =========================================================
-- Update 1: neue Storage-Policies (ersetzt storage-policies.sql)
-- =========================================================
-- Nach update-1.sql ausführen. Setzt voraus, dass Uploads jetzt in
-- Unterordnern nach Schüler-ID abgelegt werden (macht die neue
-- App-Version automatisch).

drop policy if exists "Lehrer verwaltet Aufgaben-Dateien" on storage.objects;
drop policy if exists "Alle lesen Aufgaben-Dateien" on storage.objects;
drop policy if exists "Anon lädt Abgaben hoch" on storage.objects;
drop policy if exists "Lehrer liest Abgaben" on storage.objects;
drop policy if exists "Lehrer verwaltet Feedback-Dateien" on storage.objects;
drop policy if exists "Alle lesen Feedback-Dateien" on storage.objects;

-- aufgaben: nur Lehrer schreiben, jede angemeldete Person (Lehrer
-- oder eingeloggter Schüler) darf lesen
create policy "Lehrer verwaltet Aufgaben-Dateien" on storage.objects for all
using (bucket_id = 'aufgaben' and exists (select 1 from classes where teacher_id = auth.uid()))
with check (bucket_id = 'aufgaben' and exists (select 1 from classes where teacher_id = auth.uid()));

create policy "Angemeldete lesen Aufgaben-Dateien" on storage.objects for select
using (bucket_id = 'aufgaben' and auth.role() = 'authenticated');

-- abgaben: Schüler dürfen nur in ihren EIGENEN Ordner (erster
-- Pfadteil = eigene Schüler-ID) hochladen und ihn lesen. Lehrer lesen
-- alles.
create policy "Schueler laedt eigene Abgabe hoch" on storage.objects for insert
with check (
  bucket_id = 'abgaben'
  and (storage.foldername(name))[1] = (select id::text from students where auth_uid = auth.uid())
);

create policy "Schueler liest eigene Abgaben" on storage.objects for select
using (
  bucket_id = 'abgaben'
  and (storage.foldername(name))[1] = (select id::text from students where auth_uid = auth.uid())
);

create policy "Lehrer liest alle Abgaben" on storage.objects for select
using (bucket_id = 'abgaben' and exists (select 1 from classes where teacher_id = auth.uid()));

-- feedback: nur Lehrer schreibt, Schüler lesen nur ihren eigenen Ordner
create policy "Lehrer verwaltet Feedback-Dateien" on storage.objects for all
using (bucket_id = 'feedback' and exists (select 1 from classes where teacher_id = auth.uid()))
with check (bucket_id = 'feedback' and exists (select 1 from classes where teacher_id = auth.uid()));

create policy "Schueler liest eigenes Feedback" on storage.objects for select
using (
  bucket_id = 'feedback'
  and (storage.foldername(name))[1] = (select id::text from students where auth_uid = auth.uid())
);
