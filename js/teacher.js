const loginBereich = document.getElementById('login-bereich');
const dashboard = document.getElementById('dashboard');
const loginFehler = document.getElementById('login-fehler');

let aktuelleKlasse = null;
let aktuelleKaskade = null;
let aufnahme = null; // {recorder, chunks}

// ---------- Auth ----------

async function pruefeSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) { zeigeDashboard(); }
}

async function login() {
  loginFehler.textContent = '';
  const email = document.getElementById('email').value.trim();
  const passwort = document.getElementById('passwort').value;
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password: passwort });
  if (error) { loginFehler.textContent = 'Anmeldung fehlgeschlagen: ' + error.message; return; }
  zeigeDashboard();
}

async function registrieren() {
  loginFehler.textContent = '';
  const email = document.getElementById('email').value.trim();
  const passwort = document.getElementById('passwort').value;
  const { error } = await supabaseClient.auth.signUp({ email, password: passwort });
  if (error) { loginFehler.textContent = 'Registrierung fehlgeschlagen: ' + error.message; return; }
  loginFehler.textContent = '';
  alert('Konto erstellt. Falls E-Mail-Bestätigung aktiv ist, bitte Postfach prüfen, dann anmelden.');
}

document.getElementById('login-knopf').addEventListener('click', login);
document.getElementById('registrieren-knopf').addEventListener('click', registrieren);
document.getElementById('abmelden-knopf').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  location.reload();
});

function zeigeDashboard() {
  loginBereich.style.display = 'none';
  dashboard.style.display = 'block';
  ladeKlassen();
}

// ---------- Klassen ----------

async function ladeKlassen() {
  const { data, error } = await supabaseClient.from('classes').select('*').order('name');
  if (error) { console.error(error); return; }
  const liste = document.getElementById('klassen-liste');
  if (!data.length) { liste.innerHTML = '<p class="hinweis">Noch keine Klasse angelegt.</p>'; return; }
  liste.innerHTML = data.map(k => `<button class="sekundaer" onclick="klasseAuswaehlen('${k.id}','${escapeAttr(k.name)}')">${escapeHtml(k.name)}</button>`).join(' ');
}

document.getElementById('klasse-anlegen-knopf').addEventListener('click', async () => {
  const name = document.getElementById('neue-klasse').value.trim();
  if (!name) return;
  const { data: { user } } = await supabaseClient.auth.getUser();
  const { error } = await supabaseClient.from('classes').insert({ name, teacher_id: user.id });
  if (error) { alert('Fehler: ' + error.message); return; }
  document.getElementById('neue-klasse').value = '';
  ladeKlassen();
});

async function klasseAuswaehlen(id, name) {
  aktuelleKlasse = id;
  document.getElementById('klassen-detail').style.display = 'block';
  document.getElementById('klassen-detail-titel').textContent = 'Klasse: ' + name;
  document.getElementById('kaskade-detail').style.display = 'none';
  ladeSchueler();
  ladeKaskaden();
}

// ---------- Schüler ----------

async function ladeSchueler() {
  const { data, error } = await supabaseClient.from('students').select('*').eq('class_id', aktuelleKlasse).order('first_name');
  const tbody = document.querySelector('#schueler-tabelle tbody');
  if (error || !data.length) { tbody.innerHTML = '<tr><td class="hinweis">Noch keine Schüler.</td></tr>'; return; }
  tbody.innerHTML = data.map(s => `
    <tr>
      <td>${escapeHtml(s.first_name)}</td>
      <td><button class="sekundaer" onclick="passwortZuruecksetzen('${s.id}')">Passwort zurücksetzen</button></td>
    </tr>
  `).join('');
}

document.getElementById('schueler-anlegen-knopf').addEventListener('click', async () => {
  const name = document.getElementById('neuer-schueler-name').value.trim();
  const passwort = document.getElementById('neues-schueler-passwort').value;
  if (!name || !passwort) return;
  const { error } = await supabaseClient.rpc('create_student', {
    p_class_id: aktuelleKlasse, p_first_name: name, p_password: passwort
  });
  if (error) { alert('Fehler: ' + error.message); return; }
  document.getElementById('neuer-schueler-name').value = '';
  document.getElementById('neues-schueler-passwort').value = '';
  ladeSchueler();
});

async function passwortZuruecksetzen(studentId) {
  const neu = prompt('Neues Passwort eingeben:');
  if (!neu) return;
  const { error } = await supabaseClient.rpc('reset_student_password', { p_student_id: studentId, p_password: neu });
  if (error) alert('Fehler: ' + error.message); else alert('Passwort geändert.');
}

// ---------- Kaskaden ----------

async function ladeKaskaden() {
  const { data, error } = await supabaseClient.from('cascades').select('*').eq('class_id', aktuelleKlasse).order('title');
  const liste = document.getElementById('kaskaden-liste');
  if (error || !data.length) { liste.innerHTML = '<p class="hinweis">Noch keine Kaskade angelegt.</p>'; return; }
  liste.innerHTML = data.map(k => `<button class="sekundaer" onclick="kaskadeAuswaehlen('${k.id}','${escapeAttr(k.title)}')">${escapeHtml(k.title)}</button>`).join(' ');
}

document.getElementById('kaskade-anlegen-knopf').addEventListener('click', async () => {
  const title = document.getElementById('neue-kaskade-titel').value.trim();
  const modus = document.getElementById('neue-kaskade-modus').value;
  if (!title) return;
  const { error } = await supabaseClient.from('cascades').insert({ class_id: aktuelleKlasse, title, release_mode: modus });
  if (error) { alert('Fehler: ' + error.message); return; }
  document.getElementById('neue-kaskade-titel').value = '';
  ladeKaskaden();
});

async function kaskadeAuswaehlen(id, title) {
  aktuelleKaskade = id;
  document.getElementById('kaskade-detail').style.display = 'block';
  document.getElementById('kaskade-detail-titel').textContent = 'Kaskade: ' + title;
  ladeAufgaben();
  ladeEinreichungen();
}

// ---------- Aufgaben ----------

async function ladeAufgaben() {
  const { data, error } = await supabaseClient.from('tasks').select('*').eq('cascade_id', aktuelleKaskade).order('reihenfolge');
  const liste = document.getElementById('aufgaben-liste');
  if (error || !data.length) { liste.innerHTML = '<p class="hinweis">Noch keine Stufe angelegt.</p>'; return; }
  liste.innerHTML = data.map(t => `<div class="aufgabe-block"><span class="stufe-marke">${t.reihenfolge}</span>${escapeHtml(t.title)}</div>`).join('');
}

document.getElementById('aufgabe-anlegen-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const titel = document.getElementById('neue-aufgabe-titel').value.trim();
  const aufgabeText = document.getElementById('neue-aufgabe-text').value.trim();
  const loesungText = document.getElementById('neue-loesung-text').value.trim();
  const aufgabeDatei = document.getElementById('neue-aufgabe-datei').files[0];
  const loesungDatei = document.getElementById('neue-loesung-datei').files[0];

  const { count } = await supabaseClient.from('tasks').select('*', { count: 'exact', head: true }).eq('cascade_id', aktuelleKaskade);
  const reihenfolge = (count || 0) + 1;

  let aufgabeUrl = null, loesungUrl = null;
  if (aufgabeDatei) aufgabeUrl = await dateiHochladen('aufgaben', aufgabeDatei);
  if (loesungDatei) loesungUrl = await dateiHochladen('aufgaben', loesungDatei);

  const { error } = await supabaseClient.from('tasks').insert({
    cascade_id: aktuelleKaskade, reihenfolge, title: titel,
    task_text: aufgabeText || null, task_file_url: aufgabeUrl,
    solution_text: loesungText || null, solution_file_url: loesungUrl
  });
  if (error) { alert('Fehler: ' + error.message); return; }
  e.target.reset();
  ladeAufgaben();
});

async function dateiHochladen(bucket, datei) {
  const pfad = `${crypto.randomUUID()}-${datei.name}`;
  const { error } = await supabaseClient.storage.from(bucket).upload(pfad, datei);
  if (error) { alert('Datei-Upload fehlgeschlagen: ' + error.message); return null; }
  const { data } = supabaseClient.storage.from(bucket).getPublicUrl(pfad);
  return data.publicUrl;
}

// ---------- Einreichungen & Feedback ----------

async function ladeEinreichungen() {
  const { data, error } = await supabaseClient
    .from('submissions')
    .select('id, file_url, status, submitted_at, students(first_name), tasks!inner(title, reihenfolge, cascade_id)')
    .eq('tasks.cascade_id', aktuelleKaskade)
    .order('submitted_at', { ascending: false });

  const liste = document.getElementById('einreichungen-liste');
  if (error) { liste.innerHTML = '<p class="fehlermeldung">Fehler beim Laden.</p>'; console.error(error); return; }
  if (!data.length) { liste.innerHTML = '<p class="hinweis">Noch keine Einreichungen.</p>'; return; }

  liste.innerHTML = data.map(s => `
    <div class="aufgabe-block" id="einreichung-${s.id}">
      <div class="reihe" style="justify-content:space-between;">
        <strong>${escapeHtml(s.students.first_name)}</strong> – Stufe ${s.tasks.reihenfolge}: ${escapeHtml(s.tasks.title)}
        <span class="status ${s.status}">${s.status}</span>
      </div>
      <p><a class="knopf sekundaer" href="${s.file_url}" target="_blank">Abgabe öffnen</a>
      ${s.status !== 'freigegeben' ? `<button class="akzent" onclick="freigeben('${s.id}')">Lösung freigeben</button>` : ''}</p>

      <details>
        <summary>Feedback geben</summary>
        <label>Text</label>
        <textarea id="fb-text-${s.id}"></textarea>
        <label>Datei</label>
        <input type="file" id="fb-datei-${s.id}">
        <label>Audio</label>
        <div class="reihe">
          <button type="button" onclick="aufnahmeStarten('${s.id}')" id="fb-rec-start-${s.id}">Aufnahme starten</button>
          <button type="button" onclick="aufnahmeStoppen('${s.id}')" id="fb-rec-stop-${s.id}" style="display:none;"><span class="rec-punkt"></span>Aufnahme stoppen</button>
        </div>
        <audio id="fb-audio-preview-${s.id}" controls style="display:none;"></audio>
        <button onclick="feedbackSenden('${s.id}')">Feedback senden</button>
      </details>
    </div>
  `).join('');
}

async function freigeben(submissionId) {
  const { error } = await supabaseClient.from('submissions').update({ status: 'freigegeben', released_at: new Date().toISOString() }).eq('id', submissionId);
  if (error) { alert('Fehler: ' + error.message); return; }
  ladeEinreichungen();
}

let audioBlobs = {};

async function aufnahmeStarten(submissionId) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  const chunks = [];
  recorder.ondataavailable = e => chunks.push(e.data);
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: 'audio/webm' });
    audioBlobs[submissionId] = blob;
    const preview = document.getElementById('fb-audio-preview-' + submissionId);
    preview.src = URL.createObjectURL(blob);
    preview.style.display = 'block';
    stream.getTracks().forEach(t => t.stop());
  };
  recorder.start();
  aufnahme = { recorder };
  document.getElementById('fb-rec-start-' + submissionId).style.display = 'none';
  document.getElementById('fb-rec-stop-' + submissionId).style.display = 'inline-block';
}

function aufnahmeStoppen(submissionId) {
  if (aufnahme) aufnahme.recorder.stop();
  document.getElementById('fb-rec-start-' + submissionId).style.display = 'inline-block';
  document.getElementById('fb-rec-stop-' + submissionId).style.display = 'none';
}

async function feedbackSenden(submissionId) {
  const text = document.getElementById('fb-text-' + submissionId).value.trim();
  const datei = document.getElementById('fb-datei-' + submissionId).files[0];
  const audioBlob = audioBlobs[submissionId];

  let fileUrl = null, audioUrl = null;
  if (datei) fileUrl = await dateiHochladen('feedback', datei);
  if (audioBlob) {
    const audioDatei = new File([audioBlob], 'feedback-audio.webm', { type: 'audio/webm' });
    audioUrl = await dateiHochladen('feedback', audioDatei);
  }

  const { error } = await supabaseClient.from('feedback').insert({
    submission_id: submissionId, text_feedback: text || null, file_url: fileUrl, audio_url: audioUrl
  });
  if (error) { alert('Fehler: ' + error.message); return; }
  alert('Feedback gesendet.');
  delete audioBlobs[submissionId];
}

// ---------- Hilfsfunktionen ----------

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}
function escapeAttr(text) { return (text || '').replace(/'/g, "\\'"); }

pruefeSession();
