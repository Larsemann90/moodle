const loginBereich = document.getElementById('login-bereich');
const aufgabenBereich = document.getElementById('aufgaben-bereich');
const klassenAuswahl = document.getElementById('klassen-auswahl');
const loginFehler = document.getElementById('login-fehler');

const SESSION_KEY = 'kaskaden_student_session';
const NAME_KEY = 'kaskaden_student_name';

async function ladeKlassen() {
  const { data, error } = await supabaseClient.rpc('list_classes');
  if (error) { console.error(error); return; }
  klassenAuswahl.innerHTML = data.map(k => `<option value="${k.id}">${k.name}</option>`).join('');
}

async function login() {
  loginFehler.textContent = '';
  const classId = klassenAuswahl.value;
  const vorname = document.getElementById('vorname').value.trim();
  const passwort = document.getElementById('passwort').value;

  if (!vorname || !passwort) {
    loginFehler.textContent = 'Bitte Vorname und Passwort eingeben.';
    return;
  }

  const { data, error } = await supabaseClient.rpc('login_student', {
    p_class_id: classId, p_first_name: vorname, p_password: passwort
  });

  if (error) {
    loginFehler.textContent = 'Anmeldung fehlgeschlagen. Bitte Angaben prüfen.';
    return;
  }

  sessionStorage.setItem(SESSION_KEY, data);
  sessionStorage.setItem(NAME_KEY, vorname);
  zeigeAufgaben();
}

async function zeigeAufgaben() {
  const token = sessionStorage.getItem(SESSION_KEY);
  if (!token) return;

  loginBereich.style.display = 'none';
  aufgabenBereich.style.display = 'block';
  document.getElementById('unterzeile').textContent = 'Hallo ' + sessionStorage.getItem(NAME_KEY) + '!';

  const { data, error } = await supabaseClient.rpc('get_my_tasks', { p_token: token });
  const liste = document.getElementById('aufgaben-liste');

  if (error) {
    liste.innerHTML = `<div class="karte fehlermeldung">Sitzung abgelaufen. Bitte neu anmelden.</div>`;
    sessionStorage.removeItem(SESSION_KEY);
    return;
  }

  if (!data.length) {
    liste.innerHTML = `<div class="karte hinweis">Aktuell sind keine Aufgaben für dich hinterlegt.</div>`;
    return;
  }

  liste.innerHTML = data.map(t => aufgabenKarte(t)).join('');

  data.forEach(t => {
    const form = document.getElementById('upload-form-' + t.task_id);
    if (form) form.addEventListener('submit', (e) => hochladen(e, t.task_id));
  });
}

function aufgabenKarte(t) {
  const status = t.submission_status || 'offen';
  const statusText = { offen: 'noch nicht bearbeitet', eingereicht: 'eingereicht – warte auf Freigabe', freigegeben: 'freigegeben' }[status];

  let inhalt = `
    <div class="karte">
      <div class="reihe" style="justify-content:space-between;">
        <h3><span class="stufe-marke">${t.reihenfolge}</span>${escapeHtml(t.title)}</h3>
        <span class="status ${status}">${statusText}</span>
      </div>`;

  if (t.task_text) inhalt += `<p>${escapeHtml(t.task_text)}</p>`;
  if (t.task_file_url) inhalt += `<p><a class="knopf sekundaer" href="${t.task_file_url}" target="_blank">Aufgabe herunterladen</a></p>`;

  if (status !== 'freigegeben') {
    inhalt += `
      <form id="upload-form-${t.task_id}">
        <label>Deine Bearbeitung hochladen</label>
        <input type="file" name="datei" required>
        <button type="submit">Einreichen</button>
      </form>`;
  }

  if (status === 'freigegeben') {
    if (t.solution_text) inhalt += `<p><strong>Lösung:</strong> ${escapeHtml(t.solution_text)}</p>`;
    if (t.solution_file_url) inhalt += `<p><a class="knopf akzent" href="${t.solution_file_url}" target="_blank">Lösung herunterladen</a></p>`;
    inhalt += `<div id="feedback-${t.task_id}" class="hinweis">Feedback wird geladen …</div>`;
    ladeFeedback(t.task_id);
  }

  inhalt += `</div>`;
  return inhalt;
}

async function ladeFeedback(taskId) {
  const token = sessionStorage.getItem(SESSION_KEY);
  const { data } = await supabaseClient.rpc('get_my_feedback', { p_token: token, p_task_id: taskId });
  const ziel = document.getElementById('feedback-' + taskId);
  if (!ziel) return;
  if (!data || !data.length) { ziel.textContent = 'Noch kein Feedback vorhanden.'; return; }

  ziel.innerHTML = data.map(f => `
    <div class="aufgabe-block">
      ${f.text_feedback ? `<p>${escapeHtml(f.text_feedback)}</p>` : ''}
      ${f.audio_url ? `<audio controls src="${f.audio_url}"></audio>` : ''}
      ${f.file_url ? `<p><a class="knopf sekundaer" href="${f.file_url}" target="_blank">Feedback-Datei öffnen</a></p>` : ''}
    </div>
  `).join('');
}

async function hochladen(event, taskId) {
  event.preventDefault();
  const input = event.target.querySelector('input[type=file]');
  const datei = input.files[0];
  if (!datei) return;

  const token = sessionStorage.getItem(SESSION_KEY);
  const pfad = `abgaben-${taskId}/${crypto.randomUUID()}-${datei.name}`;

  const { error: uploadFehler } = await supabaseClient.storage.from('abgaben').upload(pfad, datei);
  if (uploadFehler) { alert('Upload fehlgeschlagen: ' + uploadFehler.message); return; }

  const { data: pub } = supabaseClient.storage.from('abgaben').getPublicUrl(pfad);

  const { error } = await supabaseClient.rpc('submit_task', {
    p_token: token, p_task_id: taskId, p_file_url: pub.publicUrl
  });

  if (error) { alert('Einreichen fehlgeschlagen: ' + error.message); return; }
  zeigeAufgaben();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

document.getElementById('login-knopf').addEventListener('click', login);
document.getElementById('abmelden-knopf').addEventListener('click', () => {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(NAME_KEY);
  aufgabenBereich.style.display = 'none';
  loginBereich.style.display = 'block';
});

ladeKlassen();
if (sessionStorage.getItem(SESSION_KEY)) zeigeAufgaben();
