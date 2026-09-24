-- =========================================================
-- Update 1: echte Zugriffsbeschränkung, Klasse umbenennen
-- =========================================================
-- Im SQL Editor NACH dem ursprünglichen schema.sql einmal ausführen.
-- Voraussetzung: Unter Authentication -> Sign In / Providers die
-- Option "Allow anonymous sign-ins" aktivieren (sonst funktioniert
-- der Schüler-Login danach nicht mehr).

-- Schüler bekommen zusätzlich zur Vorname+Passwort-Prüfung eine
-- echte (aber unsichtbare) anonyme Supabase-Identität, an die ihre
-- Dateien gebunden werden. Damit kann die Datenbank pro Datei genau
-- prüfen, ob sie wirklich dem anfragenden Schüler gehört, statt sich
-- nur auf schwer erratbare Links zu verlassen.

alter table students add column if not exists auth_uid uuid unique;

-- login_student setzt jetzt zusätzlich die auth_uid des aktuellen
-- (anonymen) Logins auf den erkannten Schüler.
create or replace function login_student(p_class_id uuid, p_first_name text, p_password text)
returns uuid
language plpgsql security definer as $$
declare
  v_student students%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Keine gültige Sitzung. Bitte Seite neu laden.';
  end if;

  select * into v_student from students
    where class_id = p_class_id and first_name = p_first_name;

  if v_student.id is null or v_student.password_hash <> crypt(p_password, v_student.password_hash) then
    raise exception 'Anmeldung fehlgeschlagen';
  end if;

  update students set auth_uid = auth.uid() where id = v_student.id;
  return v_student.id;
end;
$$;

-- Alle Schüler-RPCs laufen jetzt über auth.uid() statt über ein
-- eigenes Session-Token.

create or replace function get_my_tasks()
returns table (
  task_id uuid, cascade_title text, reihenfolge int, title text,
  task_file_url text, task_text text,
  solution_file_url text, solution_text text,
  submission_status text, submitted_at timestamptz
)
language plpgsql security definer as $$
declare
  v_student_id uuid := (select id from students where auth_uid = auth.uid());
  v_class_id uuid;
begin
  if v_student_id is null then
    raise exception 'Nicht angemeldet';
  end if;

  select class_id into v_class_id from students where id = v_student_id;

  return query
  select t.id, c.title, t.reihenfolge, t.title,
         t.task_file_url, t.task_text,
         case when s.status = 'freigegeben' then t.solution_file_url else null end,
         case when s.status = 'freigegeben' then t.solution_text else null end,
         s.status, s.submitted_at
  from tasks t
  join cascades c on c.id = t.cascade_id
  left join submissions s on s.task_id = t.id and s.student_id = v_student_id
  where c.class_id = v_class_id
  order by c.title, t.reihenfolge;
end;
$$;

create or replace function submit_task(p_task_id uuid, p_file_path text)
returns void
language plpgsql security definer as $$
declare
  v_student_id uuid := (select id from students where auth_uid = auth.uid());
  v_release_mode text;
begin
  if v_student_id is null then
    raise exception 'Nicht angemeldet';
  end if;

  insert into submissions (student_id, task_id, file_url, status, submitted_at)
  values (v_student_id, p_task_id, p_file_path, 'eingereicht', now())
  on conflict (student_id, task_id)
  do update set file_url = excluded.file_url, submitted_at = now(), status = 'eingereicht';

  select cs.release_mode into v_release_mode
  from tasks t join cascades cs on cs.id = t.cascade_id where t.id = p_task_id;

  if v_release_mode = 'auto' then
    update submissions set status = 'freigegeben', released_at = now()
      where student_id = v_student_id and task_id = p_task_id;
  end if;
end;
$$;

create or replace function get_my_feedback(p_task_id uuid)
returns table (text_feedback text, file_url text, audio_url text, created_at timestamptz)
language plpgsql security definer as $$
declare
  v_student_id uuid := (select id from students where auth_uid = auth.uid());
begin
  if v_student_id is null then
    raise exception 'Nicht angemeldet';
  end if;

  return query
  select f.text_feedback, f.file_url, f.audio_url, f.created_at
  from feedback f
  join submissions s on s.id = f.submission_id
  where s.student_id = v_student_id and s.task_id = p_task_id
  order by f.created_at desc;
end;
$$;

-- Liefert die eigene Schüler-ID, damit die App Datei-Pfade im
-- richtigen (eigenen) Ordner anlegen kann.
create or replace function whoami()
returns uuid
language sql security definer as $$
  select id from students where auth_uid = auth.uid();
$$;

-- Alte, token-basierte Varianten (andere Parameter-Anzahl) aufräumen;
-- login_student selbst wurde oben schon per "create or replace" ersetzt.
drop function if exists get_my_tasks(uuid);
drop function if exists submit_task(uuid, uuid, text);
drop function if exists get_my_feedback(uuid, uuid);
drop function if exists _student_from_token(uuid);

grant execute on function whoami, get_my_tasks, submit_task, get_my_feedback to anon, authenticated;
grant execute on function login_student(uuid, text, text) to anon, authenticated;

-- Klasse umbenennen dürfen Lehrer bereits über normales UPDATE
-- (RLS-Policy "Lehrer verwalten eigene Klassen" erlaubt das schon) –
-- hier ist keine neue Funktion nötig, nur das Frontend wurde erweitert.
