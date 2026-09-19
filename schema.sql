-- =========================================================
-- Kaskaden-App: Datenbankschema für Supabase (PostgreSQL)
-- =========================================================
-- Ausführen im Supabase-Projekt unter: SQL Editor -> New query
-- Diese Datei einmal komplett einfügen und ausführen.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------

create table classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  first_name text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table student_sessions (
  token uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '12 hours')
);

create table cascades (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  title text not null,
  release_mode text not null default 'manual' check (release_mode in ('auto','manual')),
  created_at timestamptz not null default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  cascade_id uuid not null references cascades(id) on delete cascade,
  reihenfolge int not null,
  title text not null,
  task_file_url text,
  task_text text,
  solution_file_url text,
  solution_text text,
  created_at timestamptz not null default now(),
  unique (cascade_id, reihenfolge)
);

create table submissions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  file_url text,
  status text not null default 'eingereicht' check (status in ('eingereicht','freigegeben')),
  submitted_at timestamptz not null default now(),
  released_at timestamptz,
  unique (student_id, task_id)
);

create table feedback (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  text_feedback text,
  file_url text,
  audio_url text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------
-- Prinzip: Lehrer greifen direkt über ihren Supabase-Auth-Login (auth.uid())
-- auf ihre eigenen Klassen zu. Schüler haben KEINEN direkten Tabellenzugriff,
-- sondern nur über die unten definierten RPC-Funktionen (security definer),
-- die einen gültigen Session-Token prüfen. So bleiben Passwörter serverseitig
-- gehasht und Schüler sehen nie Daten anderer Schüler.

alter table classes enable row level security;
alter table students enable row level security;
alter table student_sessions enable row level security;
alter table cascades enable row level security;
alter table tasks enable row level security;
alter table submissions enable row level security;
alter table feedback enable row level security;

create policy "Lehrer verwalten eigene Klassen" on classes
  for all using (auth.uid() = teacher_id) with check (auth.uid() = teacher_id);

create policy "Lehrer sehen Schüler eigener Klassen" on students
  for all using (class_id in (select id from classes where teacher_id = auth.uid()))
  with check (class_id in (select id from classes where teacher_id = auth.uid()));

create policy "Lehrer verwalten eigene Kaskaden" on cascades
  for all using (class_id in (select id from classes where teacher_id = auth.uid()))
  with check (class_id in (select id from classes where teacher_id = auth.uid()));

create policy "Lehrer verwalten eigene Aufgaben" on tasks
  for all using (cascade_id in (
    select c.id from cascades c join classes cl on cl.id = c.class_id where cl.teacher_id = auth.uid()
  ))
  with check (cascade_id in (
    select c.id from cascades c join classes cl on cl.id = c.class_id where cl.teacher_id = auth.uid()
  ));

create policy "Lehrer sehen Einreichungen eigener Klassen" on submissions
  for select using (task_id in (
    select t.id from tasks t
    join cascades c on c.id = t.cascade_id
    join classes cl on cl.id = c.class_id
    where cl.teacher_id = auth.uid()
  ));

create policy "Lehrer verwalten Feedback eigener Klassen" on feedback
  for all using (submission_id in (
    select s.id from submissions s
    join tasks t on t.id = s.task_id
    join cascades c on c.id = t.cascade_id
    join classes cl on cl.id = c.class_id
    where cl.teacher_id = auth.uid()
  ))
  with check (submission_id in (
    select s.id from submissions s
    join tasks t on t.id = s.task_id
    join cascades c on c.id = t.cascade_id
    join classes cl on cl.id = c.class_id
    where cl.teacher_id = auth.uid()
  ));

-- Für Schüler: keine direkten Policies -> kein Zugriff außer über RPCs unten.

-- ---------------------------------------------------------
-- RPC-Funktionen (security definer) für Schüler-Zugriff
-- ---------------------------------------------------------

-- Liste der Klassennamen für die Login-Auswahl der Schüler (keine sensiblen Daten)
create or replace function list_classes()
returns table (id uuid, name text)
language sql security definer as $$
  select id, name from classes order by name;
$$;

-- Schüler-Login: prüft Vorname + Passwort innerhalb einer Klasse
create or replace function login_student(p_class_id uuid, p_first_name text, p_password text)
returns uuid
language plpgsql security definer as $$
declare
  v_student students%rowtype;
  v_token uuid;
begin
  select * into v_student from students
    where class_id = p_class_id and first_name = p_first_name;

  if v_student.id is null or v_student.password_hash <> crypt(p_password, v_student.password_hash) then
    raise exception 'Anmeldung fehlgeschlagen';
  end if;

  insert into student_sessions (student_id) values (v_student.id) returning token into v_token;
  return v_token;
end;
$$;

-- Hilfsfunktion: Token -> student_id (nur intern verwendet)
create or replace function _student_from_token(p_token uuid)
returns uuid
language plpgsql security definer as $$
declare
  v_student_id uuid;
begin
  select student_id into v_student_id from student_sessions
    where token = p_token and expires_at > now();
  if v_student_id is null then
    raise exception 'Sitzung abgelaufen, bitte neu anmelden';
  end if;
  return v_student_id;
end;
$$;

-- Aktuelle(n) offene(n) Aufgabe(n) eines Schülers abrufen
create or replace function get_my_tasks(p_token uuid)
returns table (
  task_id uuid, cascade_title text, reihenfolge int, title text,
  task_file_url text, task_text text,
  solution_file_url text, solution_text text,
  submission_status text, submitted_at timestamptz
)
language plpgsql security definer as $$
declare
  v_student_id uuid := _student_from_token(p_token);
  v_class_id uuid;
begin
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

-- Ergebnis hochladen / einreichen
create or replace function submit_task(p_token uuid, p_task_id uuid, p_file_url text)
returns void
language plpgsql security definer as $$
declare
  v_student_id uuid := _student_from_token(p_token);
  v_release_mode text;
begin
  insert into submissions (student_id, task_id, file_url, status, submitted_at)
  values (v_student_id, p_task_id, p_file_url, 'eingereicht', now())
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

-- Feedback zu eigener Einreichung lesen
create or replace function get_my_feedback(p_token uuid, p_task_id uuid)
returns table (text_feedback text, file_url text, audio_url text, created_at timestamptz)
language plpgsql security definer as $$
declare
  v_student_id uuid := _student_from_token(p_token);
begin
  return query
  select f.text_feedback, f.file_url, f.audio_url, f.created_at
  from feedback f
  join submissions s on s.id = f.submission_id
  where s.student_id = v_student_id and s.task_id = p_task_id
  order by f.created_at desc;
end;
$$;

-- Lehrer: Schüler anlegen (Passwort wird serverseitig gehasht)
create or replace function create_student(p_class_id uuid, p_first_name text, p_password text)
returns uuid
language plpgsql security definer as $$
declare
  v_teacher uuid;
  v_id uuid;
begin
  select teacher_id into v_teacher from classes where id = p_class_id;
  if v_teacher is null or v_teacher <> auth.uid() then
    raise exception 'Keine Berechtigung für diese Klasse';
  end if;

  insert into students (class_id, first_name, password_hash)
  values (p_class_id, p_first_name, crypt(p_password, gen_salt('bf')))
  returning id into v_id;
  return v_id;
end;
$$;

-- Lehrer: Passwort eines Schülers zurücksetzen
create or replace function reset_student_password(p_student_id uuid, p_password text)
returns void
language plpgsql security definer as $$
declare
  v_teacher uuid;
begin
  select cl.teacher_id into v_teacher from students s join classes cl on cl.id = s.class_id
    where s.id = p_student_id;
  if v_teacher is null or v_teacher <> auth.uid() then
    raise exception 'Keine Berechtigung';
  end if;

  update students set password_hash = crypt(p_password, gen_salt('bf')) where id = p_student_id;
end;
$$;

-- anon-Rolle darf nur die RPCs ausführen, keine Tabellen direkt
grant execute on function list_classes, login_student, get_my_tasks, submit_task, get_my_feedback to anon;
grant execute on function create_student, reset_student_password to authenticated;
