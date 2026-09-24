const loginBereich = document.getElementById('login-bereich');
const aufgabenBereich = document.getElementById('aufgaben-bereich');
const klassenAuswahl = document.getElementById('klassen-auswahl');
const loginFehler = document.getElementById('login-fehler');
const loginKnopf = document.getElementById('login-knopf');

const NAME_KEY = 'kaskaden_student_name';
let meineSchuelerId = null;

function setzeLadezustand(button, ladeText) {
  button.dataset.originalText = button.dataset.originalText || button.textContent;
  button.textContent = ladeText;
  button.disabled = true;
}
function loeseLadezustand(button) {
  button.textContent = button.dataset.originalText || button.textContent;
  button.disabled = false;
}

// Stellt sicher, dass eine (anonyme) Supabase-Sitzung existiert, bevor
// irgendetwas anderes passiert – notwendig, damit die Datenbank später
// Dateien eindeutig diesem Gerät/Schüler zuordnen kann.
async function stelleSitzungSicher() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    const { error } = await supabaseClient.auth.signInAnonymously();
    if (error) {
      loginFehler.textContent = 'Verbindung fehlgeschlagen: ' + error.message;
    }
  }
}

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

  setzeLadezustand(loginKnopf, 'Melde an …');
  await stelleSitzungSicher();

  const { data, error } = await supabaseClient.rpc('login_student', {
    p_class_id: classId, p_first_name: vorname, p_password: passwort
  });

  loeseLadezustand(loginKnopf);

  if (error) {
    loginFehler.textContent = 'Anmeldung fehlgeschlagen. Bitte Vorname/Passwort/Klasse prüfen.';
    return;
  }

  meineSchuelerId = data;
  localStorage.setItem(NAME_KEY, vorname);
  zeigeAufgaben();
}

async function zeigeAufgaben() {
  loginBereich.style.display = 'none';
  aufgabenBereich.style.display = 'block';
  document.getElementById('unterzeile').textContent = 'Hallo ' + (localStorage.getItem(NAME_KEY) || '') + '!';

  const liste = document.getElementById('aufgaben-liste');
  liste.innerHTML = '<p class="hinweis">Lädt …</p>';

  if (!meineSchuelerId) {
    const { data } = await supabaseClient.rpc('whoami');
    meineSchuelerId = data;
  }

  const { data, error } = await supabaseClient.rpc('get_my_tasks');

  if (error || !meineSchuelerId) {
    liste.innerHTML = `<div class="karte fehlermeldung">Sitzung abgelaufen oder nicht angemeldet. Bitte neu anmelden.</div>`;
    aufgabenBereich.style.display = 'none';
    loginBereich.style.display = 'block';
    return;
  }

  if (!data.length) {
    liste.innerHTML = `<div class="karte hinweis">Aktuell sind keine Aufgaben für dich hinterlegt.</div>`;
    return;
  }

  liste.innerHTML = data.map(t => aufgabenKarteGeruest(t)).join('');

  for (const t of data) {
    await befuelleAufgabenKarte(t);
    const form = document.getElementById('upload-form-' + t.task_id);
    if (form) form.addEventListener('submit', (e) => hochladen(e, t.task_id));
  }
}

function aufgabenKarteGeruest(t) {
  const status = t.submission_status || 'offen';
  const statusText = { offen: 'noch nicht bearbeitet', eingereicht: 'eingereicht – warte auf Freigabe', freigegeben: 'freigegeben' }[status];

  let inhalt = `
    <div class="karte" id="karte-${t.task_id}">
      <div class="reihe" style="justify-content:space-between;">
        <h3><span class="stufe-marke">${t.reihenfolge}</span>${escapeHtml(t.title)}</h3>
        <span class="status ${status}">${statusText}</span>
      </div>`;

  if (t.task_text) inhalt += `<p>${escapeHtml(t.task_text)}</p>`;
  inhalt += `<div id="aufgabe-link-${t.task_id}"></div>`;

  if (status !== 'freigegeben') {
    inhalt += `
      <form id="upload-form-${t.task_id}">
        <label>Deine Bearbeitung hochladen</label>
        <input type="file" name="datei" required>
        <button type="submit">Einreichen</button>
      </form>`;
  } else {
    if (t.solution_text) inhalt += `<p><strong>Lösung:</strong> ${escapeHtml(t.solution_text)}</p>`;
    inhalt += `<div id="loesung-link-${t.task_id}"></div>`;
    inhalt += `<div id="feedback-${t.task_id}" class="hinweis">Feedback wird geladen …</div>`;
  }

  inhalt += `</div>`;
  return inhalt;
}

// Erzeugt zeitlich befristete, signierte Links für Aufgaben-/Lösungsdatei
// und lädt ggf. das Feedback nach.
async function befuelleAufgabenKarte(t) {
  if (t.task_file_url) {
    const url = await signierterLink('aufgaben', t.task_file_url);
    const ziel = document.getElementById('aufgabe-link-' + t.task_id);
    if (ziel && url) ziel.innerHTML = `<p><a class="knopf sekundaer" href="${url}" target="_blank">Aufgabe herunterladen</a></p>`;
  }
  if (t.submission_status === 'freigegeben') {
    if (t.solution_file_url) {
      const url = await signierterLink('aufgaben', t.solution_file_url);
      const ziel = document.getElementById('loesung-link-' + t.task_id);
      if (ziel && url) ziel.innerHTML = `<p><a class="knopf akzent" href="${url}" target="_blank">Lösung herunterladen</a></p>`;
    }
    ladeFeedback(t.task_id);
  }
}

async function signierterLink(bucket, pfad) {
  const { data, error } = await supabaseClient.storage.from(bucket).createSignedUrl(pfad, 600);
  if (error) { console.error(error); return null; }
  return data.signedUrl;
}

async function ladeFeedback(taskId) {
  const { data } = await supabaseClient.rpc('get_my_feedback', { p_task_id: taskId });
  const ziel = document.getElementById('feedback-' + taskId);
  if (!ziel) return;
  if (!data || !data.length) { ziel.textContent = 'Noch kein Feedback vorhanden.'; return; }

  let html = '';
  for (const f of data) {
    const audioUrl = f.audio_url ? await signierterLink('feedback', f.audio_url) : null;
    const fileUrl = f.file_url ? await signierterLink('feedback', f.file_url) : null;
    html += `
      <div class="aufgabe-block">
        ${f.text_feedback ? `<p>${escapeHtml(f.text_feedback)}</p>` : ''}
        ${audioUrl ? `<audio controls src="${audioUrl}"></audio>` : ''}
        ${fileUrl ? `<p><a class="knopf sekundaer" href="${fileUrl}" target="_blank">Feedback-Datei öffnen</a></p>` : ''}
      </div>`;
  }
  ziel.innerHTML = html;
}

async function hochladen(event, taskId) {
  event.preventDefault();
  const input = event.target.querySelector('input[type=file]');
  const datei = input.files[0];
  if (!datei || !meineSchuelerId) return;

  const knopf = event.target.querySelector('button[type=submit]');
  setzeLadezustand(knopf, 'Lädt hoch …');

  const pfad = `${meineSchuelerId}/${taskId}/${crypto.randomUUID()}-${datei.name}`;

  const { error: uploadFehler } = await supabaseClient.storage.from('abgaben').upload(pfad, datei);
  if (uploadFehler) {
    loeseLadezustand(knopf);
    alert('Upload fehlgeschlagen: ' + uploadFehler.message);
    return;
  }

  const { error } = await supabaseClient.rpc('submit_task', { p_task_id: taskId, p_file_path: pfad });

  if (error) {
    loeseLadezustand(knopf);
    alert('Einreichen fehlgeschlagen: ' + error.message);
    return;
  }
  zeigeAufgaben();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

document.getElementById('login-knopf').addEventListener('click', login);
document.getElementById('abmelden-knopf').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  localStorage.removeItem(NAME_KEY);
  meineSchuelerId = null;
  aufgabenBereich.style.display = 'none';
  loginBereich.style.display = 'block';
});

(async function start() {
  await stelleSitzungSicher();
  await ladeKlassen();
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    const { data } = await supabaseClient.rpc('whoami');
    if (data) { meineSchuelerId = data; zeigeAufgaben(); }
  }
})();
