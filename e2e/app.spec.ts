import { expect, test, type Page } from '@playwright/test';
import type { DrawResponse, Participant, TaskDetail } from '../src/shared/contracts';
import { calendarDate } from '../src/shared/scheduling';

async function openApp(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /^Aufgaben/, level: 1 })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Rotator – Aufgabenübersicht', exact: true }),
  ).toBeVisible();
  await expect(page).toHaveTitle(/Rotator/);
}
async function write<T>(page: Page, path: string, data: unknown, method = 'POST'): Promise<T> {
  const response = await page.request.fetch(path, { method, data });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json() as Promise<T>;
}
async function seed(page: Page, name: string, people: string[]): Promise<TaskDetail> {
  let task = await write<TaskDetail>(page, '/api/tasks', {
    name,
    description: 'Gemeinsam fair entscheiden.',
  });
  for (const name of people) {
    const person = await write<Participant>(page, '/api/participants', { name });
    task = await write<TaskDetail>(page, `/api/tasks/${task.id}/members`, {
      participantId: person.id,
      expectedVersion: task.version,
    });
  }
  return task;
}
async function current(page: Page, id: number): Promise<TaskDetail> {
  return (await page.request.get(`/api/tasks/${id}`)).json() as Promise<TaskDetail>;
}
async function openHistory(page: Page) {
  const history = page.locator('details.history');
  if ((await history.getAttribute('open')) === null)
    await history.locator('summary').first().click();
}

async function addPerson(page: Page, name: string) {
  await page.getByRole('button', { name: '+ Teilnehmer hinzufügen', exact: true }).click();
  await page.getByLabel('Neue Person (optional)', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Zur Aufgabe hinzufügen', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page
      .getByRole('list', { name: 'Teilnehmer', exact: true })
      .getByRole('listitem')
      .filter({ hasText: name }),
  ).toBeVisible();
}

test('Aufgabe und Teilnehmer anlegen, Roulette überspringen, Rücknahme und begründete Korrektur', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openApp(page);
  await page.getByRole('button', { name: '+ Neue Aufgabe', exact: true }).click();
  await expect(page.getByText('Noch keine Personen im Team.', { exact: false })).toBeVisible();
  await page.getByLabel('Name der Aufgabe', { exact: true }).fill('Daily moderieren');
  await page
    .getByLabel('Beschreibung (optional)', { exact: true })
    .fill('Ein guter Start in den gemeinsamen Tag.');
  await page.getByRole('button', { name: 'Aufgabe anlegen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Daily moderieren', exact: true })).toBeVisible();
  const id = Number(new URL(page.url()).pathname.split('/').pop());
  await addPerson(page, 'Anna');
  await addPerson(page, 'Ben');
  const resultPromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/tasks/${id}/draws`) && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Nächste Person auswählen' }).click();
  const draw = (await (await resultPromise).json()) as DrawResponse;
  await expect(page.getByRole('dialog')).toBeVisible();
  expect((await current(page, id)).members.reduce((sum, member) => sum + member.count, 0)).toBe(1);
  await page.getByRole('button', { name: 'Animation überspringen' }).click();
  await expect(page.getByTestId('chooser-winner')).toHaveText(draw.draw.name);
  await page.screenshot({ path: 'test-results/orbit-roulette.png', fullPage: true });
  await page.getByRole('button', { name: 'Weiter zur Aufgabe' }).click();
  await page.reload();
  await expect(page.getByTestId('current-winner')).toHaveText(draw.draw.name);
  expect((await current(page, id)).members.reduce((sum, member) => sum + member.count, 0)).toBe(1);
  await openHistory(page);
  await page.getByRole('button', { name: 'Letzte Auswahl zurücknehmen' }).click();
  await page.getByRole('button', { name: 'Auswahl zurücknehmen', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await current(page, id)).currentDraw).toBeNull();
  await expect(page.getByText('Zurückgenommen', { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'Auswahlstand von Anna korrigieren', exact: true })
    .click();
  await page.getByLabel('Neuer Auswahlstand', { exact: true }).fill('8');
  await page
    .getByLabel('Begründung', { exact: true })
    .fill('Acht frühere Moderationen übernommen.');
  await page.getByRole('button', { name: 'Korrektur speichern', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Auswahlstand von Ben korrigieren', exact: true }).click();
  await page.getByLabel('Neuer Auswahlstand', { exact: true }).fill('10');
  await page
    .getByLabel('Begründung', { exact: true })
    .fill('Zehn frühere Moderationen übernommen.');
  await page.getByRole('button', { name: 'Korrektur speichern', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await addPerson(page, 'Clara');
  expect((await current(page, id)).members.find((member) => member.name === 'Clara')?.count).toBe(
    8,
  );
  await openHistory(page);
  await page.getByRole('button', { name: 'Änderungsprotokoll', exact: true }).click();
  await expect(page.getByText(/Acht frühere Moderationen übernommen/)).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.screenshot({ path: 'test-results/orbit-desktop.png', fullPage: true });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /^Aufgaben/, level: 1 })).toBeVisible();
  await page.screenshot({ path: 'test-results/orbit-overview.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('Mobilansicht, reduzierte Bewegung, Aktivstatus und direkte Auswahl', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openApp(page);
  const task = await seed(page, 'Support im Wechsel', ['Deniz', 'Emilia']);
  await page.goto(`/tasks/${task.id}`);
  await page.getByRole('button', { name: 'Emilia deaktivieren', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Emilia aktivieren', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Nächste Person auswählen' }).click();
  await expect(page.getByTestId('chooser-winner')).toHaveText('Deniz');
  await page.getByRole('button', { name: 'Weiter zur Aufgabe' }).click();
  await expect(page.getByTestId('current-winner')).toHaveText('Deniz');
  expect(
    (await current(page, task.id)).members.find((member) => member.name === 'Emilia')?.count,
  ).toBe(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflow).toBe(false);
  await page.screenshot({ path: 'test-results/orbit-mobile.png', fullPage: true });
  await page.goto('/team');
  await page.reload();
  await expect(page.getByRole('heading', { name: /^Team/, level: 1 })).toBeVisible();
});

test('Verlorene Auswahlantwort wird mit derselben Request-ID geprüft und nicht doppelt gezählt', async ({
  page,
}) => {
  await openApp(page);
  const task = await seed(page, 'Antwortverlust prüfen', ['Farah', 'Gregor']);
  await page.goto(`/tasks/${task.id}`);
  let interrupted = false;
  await page.route(`**/api/tasks/${task.id}/draws`, async (route) => {
    if (!interrupted) {
      interrupted = true;
      await route.fetch(); // Server has committed, but the browser never receives the response.
      await route.abort('failed');
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Nächste Person auswählen' }).click();
  await expect(page.getByRole('button', { name: 'Auswahl prüfen', exact: true })).toBeVisible();
  expect((await current(page, task.id)).history).toHaveLength(1);
  await page.getByRole('button', { name: 'Auswahl prüfen', exact: true }).click();
  await page.getByRole('button', { name: 'Animation überspringen' }).click();
  await page.getByRole('button', { name: 'Weiter zur Aufgabe' }).click();
  const after = await current(page, task.id);
  expect(after.history).toHaveLength(1);
  expect(after.members.reduce((sum, member) => sum + member.count, 0)).toBe(1);
});

test('Veraltete Auswahl wird ohne neue Auslosung abgelehnt, Archivierung sperrt Auswahl', async ({
  page,
}) => {
  await openApp(page);
  const task = await seed(page, 'Revisionsschutz', ['Hanna', 'Ibrahim']);
  await page.goto(`/tasks/${task.id}`);
  await expect(page.getByRole('button', { name: 'Nächste Person auswählen' })).toBeEnabled();
  await write(page, `/api/tasks/${task.id}/members/${task.members[0]!.id}/corrections`, {
    count: 2,
    reason: 'Änderung aus zweiter Ansicht',
    expectedVersion: task.version,
  });
  await page.getByRole('button', { name: 'Nächste Person auswählen' }).click();
  await expect(page.getByText(/Die Aufgabe wurde inzwischen geändert/)).toBeVisible();
  expect((await current(page, task.id)).history).toHaveLength(0);
  await page.getByRole('button', { name: 'Archivieren', exact: true }).click();
  await page.getByRole('button', { name: 'Aufgabe archivieren', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Nächste Person auswählen' })).toBeDisabled();
  await page.getByRole('button', { name: 'Wieder öffnen', exact: true }).first().click();
  await page.getByRole('button', { name: 'Aufgabe wieder öffnen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Nächste Person auswählen' })).toBeEnabled();
});

test('Space-Show endet natürlich und bleibt bei Vollbild und Größenänderung bedienbar', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openApp(page);
  const task = await seed(page, 'Die große Teamrunde', ['Jule', 'Kim', 'Luis']);
  await page.goto(`/tasks/${task.id}`);
  await page.getByText('Animationsoptionen', { exact: true }).click();
  await page.getByLabel('Sound', { exact: true }).check();
  await page.getByRole('button', { name: 'Nächste Person auswählen' }).click();
  const fullscreen = page.getByRole('button', { name: 'Vollbild' });
  if (await fullscreen.isVisible()) {
    await fullscreen.click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
  }
  await page.setViewportSize({ width: 900, height: 900 });
  await expect(page.getByRole('heading', { name: 'Bitte kurz festhalten.' })).toBeVisible();
  await page.screenshot({ path: 'test-results/rotator-asteroids.png' });
  await expect(page.getByRole('heading', { name: 'Sprung in den Hyperraum.' })).toBeVisible();
  await page.screenshot({ path: 'test-results/rotator-hyperspace.png' });
  await expect(page.getByRole('button', { name: 'Weiter zur Aufgabe' })).toBeVisible({
    timeout: 16_000,
  });
  const stage = page.getByTestId('roulette-stage');
  await expect(stage.locator('canvas')).toBeVisible();
  const sizes = await stage.evaluate((element) => {
    const canvas = element.querySelector('canvas')!;
    return {
      canvasWidth: canvas.getBoundingClientRect().width,
      stageWidth: element.getBoundingClientRect().width,
      backingWidth: canvas.width,
    };
  });
  expect(sizes.canvasWidth).toBeGreaterThan(0);
  expect(sizes.canvasWidth).toBeLessThanOrEqual(sizes.stageWidth + 1);
  expect(sizes.backingWidth).toBeGreaterThanOrEqual(sizes.canvasWidth);
  const saved = await current(page, task.id);
  await expect(page.getByTestId('chooser-winner')).toHaveText(saved.currentDraw!.name);
  await page.screenshot({ path: 'test-results/rotator-arrival.png' });
  await page.getByRole('button', { name: 'Weiter zur Aufgabe' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Person entfernen: linksbündiger Teamtext, sichere Bestätigung und erhaltener Verlauf', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openApp(page);
  const task = await seed(page, 'Entfernen im Team', ['Nora']);
  const chosen = await write<DrawResponse>(page, `/api/tasks/${task.id}/draws`, {
    requestId: crypto.randomUUID(),
    expectedVersion: task.version,
  });
  await page.goto('/team');
  await expect(page.getByRole('heading', { name: /^Team/, level: 1 })).toBeVisible();
  const description = page.locator('.page-description');
  expect(await description.evaluate((element) => getComputedStyle(element).textAlign)).toBe('left');
  expect(await description.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe(
    'normal',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/rotator-team-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Nora entfernen', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Nora');
  await expect(dialog).toContainText('allen Aufgaben');
  await expect(dialog.getByRole('button', { name: 'Abbrechen', exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Nora entfernen', exact: true })).toBeVisible();
  expect((await current(page, task.id)).currentDraw?.id).toBe(chosen.draw.id);
  await page.getByRole('button', { name: 'Nora entfernen', exact: true }).click();
  await page.getByRole('button', { name: 'Person entfernen', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Nora entfernen', exact: true })).toHaveCount(0);
  const after = await current(page, task.id);
  expect(after.members).toHaveLength(0);
  expect(after.currentDraw).toBeNull();
  expect(after.history[0]?.name).toBe('Nora');
  await page.goto(`/tasks/${task.id}`);
  await expect(page.getByRole('button', { name: 'Nächste Person auswählen' })).toBeDisabled();
  await openHistory(page);
  await expect(page.getByText('Nora', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Wiederholung einer verlorenen Auswahlantwort zeigt keine inzwischen entfernte Person als Gewinner', async ({
  page,
}) => {
  await openApp(page);
  const task = await seed(page, 'Auswahl und gleichzeitiges Entfernen', ['Olaf']);
  await page.goto(`/tasks/${task.id}`);
  let interrupted = false;
  await page.route(`**/api/tasks/${task.id}/draws`, async (route) => {
    if (!interrupted) {
      interrupted = true;
      await route.fetch();
      await route.abort('failed');
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Nächste Person auswählen' }).click();
  await expect(page.getByRole('button', { name: 'Auswahl prüfen', exact: true })).toBeVisible();
  await write(page, `/api/participants/${task.members[0]!.participantId}`, {}, 'DELETE');
  await page.getByRole('button', { name: 'Auswahl prüfen', exact: true }).click();
  await expect(
    page.getByText('Die ausgewählte Person wurde inzwischen aus dem Team entfernt.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await current(page, task.id)).history).toHaveLength(1);
});

test('Teilnehmer direkt beim Anlegen auswählen, alle markieren und Auswahl leeren', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openApp(page);
  const ada = await write<Participant>(page, '/api/participants', { name: 'Ada' });
  await write<Participant>(page, '/api/participants', { name: 'Bert' });
  const cleo = await write<Participant>(page, '/api/participants', { name: 'Cleo' });
  await page.reload();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '+ Neue Aufgabe', exact: true }).click();
  const picker = page.getByRole('group', { name: 'Teilnehmer auswählen (optional)' });
  await page.getByLabel('Name der Aufgabe', { exact: true }).fill('Gemeinsamer Wochenstart');
  await picker.getByRole('button', { name: 'Alle auswählen', exact: true }).click();
  expect(await picker.locator('input:checked').count()).toBe(
    await picker.getByRole('checkbox').count(),
  );
  await picker.getByRole('button', { name: 'Auswahl leeren', exact: true }).click();
  await expect(picker.locator('input:checked')).toHaveCount(0);
  await picker.getByRole('checkbox', { name: 'Ada', exact: true }).focus();
  await page.keyboard.press('Space');
  await picker.getByRole('checkbox', { name: 'Cleo', exact: true }).check();
  await expect(picker.getByRole('checkbox', { name: 'Bert', exact: true })).not.toBeChecked();
  await expect(picker.getByText(/2 von \d+ ausgewählt/)).toBeVisible();
  await page
    .getByRole('dialog')
    .screenshot({ path: 'test-results/rotator-task-participants-mobile.png' });
  await page.getByRole('button', { name: 'Aufgabe anlegen', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const task = await current(page, Number(new URL(page.url()).pathname.split('/').pop()));
  expect(
    task.members.map(({ participantId, count, active }) => ({ participantId, count, active })),
  ).toEqual([
    { participantId: ada.id, count: 0, active: true },
    { participantId: cleo.id, count: 0, active: true },
  ]);
  await page.getByRole('button', { name: 'Aufgabe bearbeiten', exact: true }).click();
  await expect(picker).toHaveCount(0);
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  expect(errors).toEqual([]);
});

test('Minimalistische Listen zeigen die Kerndaten, Optionen bleiben per Tastatur erreichbar', async ({
  page,
}) => {
  await openApp(page);
  const task = await seed(page, `Wochenplanung ${crypto.randomUUID().slice(0, 8)}`, [
    'Mara',
    'Tom',
  ]);
  const selected = await write<DrawResponse>(page, `/api/tasks/${task.id}/draws`, {
    requestId: crypto.randomUUID(),
    expectedVersion: task.version,
  });
  await page.reload();
  const row = page
    .getByRole('link')
    .filter({ has: page.getByRole('heading', { name: task.name, exact: true }) });
  await expect(row).toContainText(selected.draw.name);
  await expect(row).toContainText('2 von 2 verfügbar');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(row).toContainText('Aktuell dran');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('current-winner')).toHaveText(selected.draw.name);
  const memberList = page.getByRole('list', { name: 'Teilnehmer', exact: true });
  const memberRow = memberList.getByRole('listitem').filter({ hasText: 'Mara' });
  await expect(memberRow).toContainText('Status');
  await expect(memberRow).toContainText('Auswahlstand');
  const correction = memberRow.getByRole('button', { name: 'Auswahlstand von Mara korrigieren' });
  const bounds = await correction.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await correction.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await expect(correction).toBeFocused();
  await page.screenshot({ path: 'test-results/shared-list-mobile.png', fullPage: true });
  const rule = page.getByText('Wie wird ausgewählt?', { exact: true });
  await rule.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText(/jeweils 100 % Chance/)).toBeVisible();
  const options = page.getByText('Animationsoptionen', { exact: true });
  await expect(page.getByLabel('Tempo', { exact: true })).toBeHidden();
  await options.focus();
  await page.keyboard.press('Enter');
  await page.getByLabel('Tempo', { exact: true }).selectOption('quick');
  await page.getByLabel('Sound', { exact: true }).check();
  await page.reload();
  await page.getByText('Animationsoptionen', { exact: true }).click();
  await expect(page.getByLabel('Tempo', { exact: true })).toHaveValue('quick');
  await expect(page.getByLabel('Sound', { exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Nächste Person auswählen' }).click();
  await expect(page.getByRole('button', { name: 'Weiter zur Aufgabe' })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter zur Aufgabe' }).click();
  expect((await current(page, task.id)).history).toHaveLength(2);
  await page.getByRole('button', { name: 'Archivieren', exact: true }).click();
  await page.getByRole('button', { name: 'Aufgabe archivieren', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Hauptnavigation' })
    .getByRole('link', { name: 'Aufgaben', exact: true })
    .click();
  await expect(row).toHaveCount(0);
  await page.getByLabel('Archivierte anzeigen', { exact: true }).check();
  await expect(row).toContainText('Archiviert');
});

test('Entfernte Person beim Anlegen: keine Teilaufgabe und Eingaben bleiben korrigierbar', async ({
  page,
}) => {
  await openApp(page);
  const person = await write<Participant>(page, '/api/participants', { name: 'Dora' });
  await page.reload();
  await page.getByRole('button', { name: '+ Neue Aufgabe', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Name der Aufgabe', { exact: true })
    .fill('Aufgabe mit korrigierter Auswahl');
  await dialog.getByRole('checkbox', { name: 'Dora', exact: true }).check();
  const before = await (await page.request.get('/api/state')).json();
  await write(page, `/api/participants/${person.id}`, {}, 'DELETE');
  await dialog.getByRole('button', { name: 'Aufgabe anlegen', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText(
    'Eine ausgewählte Person ist nicht mehr im Team.',
  );
  await expect(dialog.getByLabel('Name der Aufgabe', { exact: true })).toHaveValue(
    'Aufgabe mit korrigierter Auswahl',
  );
  await expect(dialog.getByRole('checkbox', { name: 'Dora', exact: true })).toBeChecked();
  expect((await (await page.request.get('/api/state')).json()).tasks).toHaveLength(
    before.tasks.length,
  );
  await dialog.getByRole('checkbox', { name: 'Dora', exact: true }).uncheck();
  await dialog.getByRole('button', { name: 'Aufgabe anlegen', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const task = await current(page, Number(new URL(page.url()).pathname.split('/').pop()));
  expect(task.members).toEqual([]);
});

test('Teamliste und Dark Mode: Tastatur, Dialoge, mobile Aktionen und gespeicherte Auswahl', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await openApp(page);
  const task = await seed(page, 'Farbschema prüfen', ['Vera', 'Willi']);
  const theme = page.getByRole('switch', { name: 'Dark Mode', exact: true });
  await expect(theme).not.toBeChecked();
  await theme.focus();
  await page.keyboard.press('Space');
  await expect(theme).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page
    .getByRole('navigation', { name: 'Hauptnavigation' })
    .getByRole('link', { name: 'Team', exact: true })
    .click();
  const team = page.getByRole('list', { name: 'Team', exact: true });
  await expect(team).toBeVisible();
  const person = team.getByRole('listitem').filter({ hasText: 'Vera' });
  await person.getByRole('button', { name: 'Vera umbenennen', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByLabel('Anzeigename', { exact: true }).fill('Vera Müller');
  await page.getByRole('button', { name: 'Namen speichern', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(theme).toBeChecked();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  for (const name of ['Vera Müller umbenennen', 'Vera Müller entfernen']) {
    const bounds = await team.getByRole('button', { name, exact: true }).boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  }
  await page.screenshot({ path: 'test-results/team-dark-mobile.png', fullPage: true });
  await team.getByRole('button', { name: 'Vera Müller entfernen', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('allen Aufgaben');
  await page.getByRole('dialog').screenshot({ path: 'test-results/team-dark-dialog.png' });
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await page.goto(`/tasks/${task.id}`);
  await expect(page.getByRole('list', { name: 'Teilnehmer', exact: true })).toContainText(
    'Vera Müller',
  );
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.screenshot({ path: 'test-results/task-dark-desktop.png', fullPage: true });
  await page.getByText('Animationsoptionen', { exact: true }).click();
  await page.getByLabel('Tempo', { exact: true }).selectOption('quick');
  await page.getByRole('button', { name: 'Nächste Person auswählen' }).click();
  await expect(page.getByRole('button', { name: 'Weiter zur Aufgabe' })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter zur Aufgabe' }).click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await theme.click();
  await expect(theme).not.toBeChecked();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(theme).not.toBeChecked();
  expect(errors).toEqual([]);
});

test('Systemmodus funktioniert auch bei gesperrtem Browserspeicher', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error('Speicher gesperrt');
    };
    Storage.prototype.setItem = () => {
      throw new Error('Speicher gesperrt');
    };
  });
  await openApp(page);
  const theme = page.getByRole('switch', { name: 'Dark Mode', exact: true });
  await expect(theme).toBeChecked();
  expect(
    await page.locator('html').evaluate((element) => getComputedStyle(element).colorScheme),
  ).toBe('dark');
  await theme.focus();
  await page.keyboard.press('Enter');
  await expect(theme).not.toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(theme).toBeChecked();
});

test('Gespeicherter Dark Mode wird vor dem Anwendungsbundle angewendet', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => localStorage.setItem('reihum-dark', 'true'));
  await page.route('**/assets/index-*.js', (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(
    await page.locator('html').evaluate((element) => getComputedStyle(element).colorScheme),
  ).toBe('dark');
  await expect(page.getByRole('switch')).toHaveCount(0);
});

for (const mode of ['light', 'dark'] as const) {
  test(`Verlauf und Protokoll als gemeinsame Listen, hervorgehobene Auswahl (${mode})`, async ({
    page,
  }) => {
    await openApp(page);
    const name = `Alexandra Maximiliane von Musterhausen ${mode} ${crypto.randomUUID().slice(0, 4)}`;
    let task = await seed(page, `Verlaufsansicht ${mode}`, [name]);
    await page.goto(`/tasks/${task.id}`);
    await openHistory(page);
    await expect(page.getByText('Noch keine Auswahl gespeichert.', { exact: true })).toBeVisible();
    for (let i = 0; i < 6; i++) {
      task = await write<TaskDetail>(
        page,
        `/api/tasks/${task.id}/members/${task.members[0]!.id}`,
        {
          active: i % 2 !== 0,
          expectedVersion: task.version,
        },
        'PATCH',
      );
    }
    for (let i = 0; i < 8; i++) {
      task = (
        await write<DrawResponse>(page, `/api/tasks/${task.id}/draws`, {
          requestId: crypto.randomUUID(),
          expectedVersion: task.version,
        })
      ).task;
    }
    await page.reload();
    if (mode === 'dark') await page.getByRole('switch', { name: 'Dark Mode', exact: true }).click();
    const winner = page.getByRole('region', { name: 'Aktuell ausgewählte Person', exact: true });
    await expect(winner).toContainText(name);
    await expect(winner).toContainText('Ausgewählt am');
    await openHistory(page);
    const history = page.getByRole('list', { name: 'Auswahlverlauf', exact: true });
    await expect(history.getByRole('listitem')).toHaveCount(6);
    await expect(history.getByRole('listitem').first()).toContainText('7 → 8');
    await page.getByRole('button', { name: /Alle 8 geladenen Auswahlen anzeigen/ }).click();
    await expect(history.getByRole('listitem')).toHaveCount(8);
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.screenshot({
      path: `test-results/history-winner-${mode}-desktop.png`,
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Letzte Auswahl zurücknehmen' }).click();
    await page.getByRole('button', { name: 'Auswahl zurücknehmen', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(history.getByRole('listitem').first()).toContainText('Zurückgenommen');
    await expect(winner).toContainText(name);
    await page.getByRole('button', { name: `${name} deaktivieren`, exact: true }).click();
    await expect(winner).toContainText('derzeit inaktiv');
    await page.setViewportSize({ width: 320, height: 740 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );
    await expect(history.getByRole('listitem').first()).toContainText('Auswahlstand');
    await expect(history.getByRole('listitem').first()).toContainText('Zeitpunkt');
    await winner.screenshot({ path: `test-results/current-selection-${mode}-mobile.png` });
    const protocolButton = page.getByRole('button', { name: 'Änderungsprotokoll', exact: true });
    await protocolButton.focus();
    await page.keyboard.press('Enter');
    const protocol = page.getByRole('list', { name: 'Änderungsprotokoll', exact: true });
    await expect(protocol.getByRole('listitem')).toHaveCount(8);
    await expect(protocol).toContainText('wurde deaktiviert');
    await page.getByRole('button', { name: /Alle \d+ geladenen Änderungen anzeigen/ }).click();
    await expect(protocol.getByRole('listitem')).toHaveCount(
      (await current(page, task.id)).events.length,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );
    await protocol
      .getByRole('listitem')
      .first()
      .screenshot({ path: `test-results/protocol-${mode}-mobile.png` });
    await page.getByRole('button', { name: 'Auswahlverlauf', exact: true }).click();
    await expect(history.getByRole('listitem')).toHaveCount(6);
  });
}

test('Verlauf standardmäßig geschlossen, per Tastatur aufklappbar und nach Neuladen wieder geschlossen', async ({
  page,
}) => {
  await openApp(page);
  const task = await seed(page, 'Eingeklappte Historie', ['Stats Vorschau']);
  await write<DrawResponse>(page, `/api/tasks/${task.id}/draws`, {
    requestId: crypto.randomUUID(),
    expectedVersion: task.version,
  });
  await page.goto(`/tasks/${task.id}`);
  const disclosure = page.locator('details.history');
  await expect(disclosure).not.toHaveAttribute('open');
  await expect(page.getByRole('list', { name: 'Auswahlverlauf', exact: true })).toBeHidden();
  await disclosure.locator('summary').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('list', { name: 'Auswahlverlauf', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Änderungsprotokoll', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Änderungsprotokoll', exact: true })).toBeVisible();
  await page.reload();
  await expect(disclosure).not.toHaveAttribute('open');
  await expect(page.getByTestId('current-winner')).toBeVisible();
});

test('Stats: Personen, Aufgaben, Rücknahmen, Auswahlstand, Filter und gespeicherte Detailansicht', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openApp(page);
  const suffix = crypto.randomUUID().slice(0, 8);
  const personName = 'Stats Ada ' + suffix;
  const taskName = 'Stats Moderation ' + suffix;
  const anotherName = 'Stats Bereitschaft ' + suffix;
  let task = await seed(page, taskName, [personName]);
  const participantId = task.members[0]!.participantId;
  let draw = await write<DrawResponse>(page, `/api/tasks/${task.id}/draws`, {
    requestId: crypto.randomUUID(),
    expectedVersion: task.version,
  });
  task = draw.task;
  draw = await write<DrawResponse>(page, `/api/tasks/${task.id}/draws`, {
    requestId: crypto.randomUUID(),
    expectedVersion: task.version,
  });
  task = await write<TaskDetail>(page, `/api/tasks/${task.id}/draws/${draw.draw.id}/undo`, {
    expectedVersion: draw.task.version,
  });
  task = await write<TaskDetail>(
    page,
    `/api/tasks/${task.id}/members/${task.members[0]!.id}/corrections`,
    { expectedVersion: task.version, count: 7, reason: 'Vorleistungen in Stats separat anzeigen' },
  );
  let another = await write<TaskDetail>(page, '/api/tasks', {
    name: anotherName,
    participantIds: [participantId],
  });
  another = (
    await write<DrawResponse>(page, `/api/tasks/${another.id}/draws`, {
      requestId: crypto.randomUUID(),
      expectedVersion: another.version,
    })
  ).task;
  await write(
    page,
    `/api/tasks/${another.id}`,
    { archived: true, expectedVersion: another.version },
    'PATCH',
  );
  await write(page, `/api/participants/${participantId}`, {}, 'DELETE');
  await page
    .getByRole('navigation', { name: 'Hauptnavigation' })
    .getByRole('link', { name: 'Stats', exact: true })
    .click();
  await expect(page).toHaveTitle('Stats · Rotator');
  const person = page
    .getByRole('list', { name: 'Stats nach Personen' })
    .getByRole('listitem')
    .filter({ hasText: personName });
  await expect(person).toContainText('Entfernt');
  await expect(person.getByText('2', { exact: true })).toHaveCount(2);
  await expect(person).toContainText('1 zurückgenommen');
  await person
    .getByRole('button', { name: `Aufgaben von ${personName} anzeigen`, exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Übernahmen im Detail' })).toBeFocused();
  await expect(page.getByLabel('Person', { exact: true })).toHaveValue(String(participantId));
  const details = page.getByRole('list', {
    name: 'Übernahmen nach Person und Aufgabe',
    exact: true,
  });
  await expect(details.getByRole('listitem')).toHaveCount(2);
  await expect(details).toContainText('Archiviert');
  await page.getByLabel('Aufgabe', { exact: true }).selectOption(String(task.id));
  await expect(details.getByRole('listitem')).toHaveCount(1);
  await expect(details.getByText('7', { exact: true })).toBeVisible();
  await expect(details).toContainText('1 zurückgenommen');
  await page.reload();
  await expect(page.getByLabel('Person', { exact: true })).toHaveValue(String(participantId));
  await expect(page.getByLabel('Aufgabe', { exact: true })).toHaveValue(String(task.id));
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.screenshot({ path: 'test-results/stats-details-desktop.png', fullPage: true });
  await page.getByRole('switch', { name: 'Dark Mode', exact: true }).click();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.screenshot({ path: 'test-results/stats-details-mobile-dark.png', fullPage: true });
  await page.getByLabel('Person', { exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Filter zurücksetzen', exact: true }).click();
  await expect(page.getByLabel('Person', { exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Aufgaben', exact: true }).click();
  const taskRow = page
    .getByRole('list', { name: 'Stats nach Aufgaben' })
    .getByRole('listitem')
    .filter({ hasText: anotherName });
  await taskRow
    .getByRole('button', { name: `Personen für ${anotherName} anzeigen`, exact: true })
    .click();
  await expect(page.getByLabel('Aufgabe', { exact: true })).toHaveValue(String(another.id));
  await expect(details.getByRole('listitem')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('Stats: leere Ansicht und Wiederholung nach einem Ladefehler', async ({ page }) => {
  await page.route('**/api/stats', (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: 'BUSY', message: 'Stats sind gerade nicht verfügbar.' } },
    }),
  );
  await page.goto('/stats');
  await expect(page.getByText('Stats sind gerade nicht verfügbar.', { exact: true })).toBeVisible();
  await page.unroute('**/api/stats');
  await page.route('**/api/stats', (route) =>
    route.fulfill({ json: { participants: [], tasks: [], entries: [] } }),
  );
  await page.getByRole('button', { name: 'Erneut versuchen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Stats', exact: true })).toBeVisible();
  await expect(
    page.getByText('Noch keine Daten für diese Ansicht.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.getByText('Keine Zuordnungen gefunden.', { exact: true })).toBeVisible();
});

test('Stats-Zeitraum gilt für Übersichten und Details, bleibt nach Neuladen erhalten und zeigt Ladefehler', async ({
  page,
}) => {
  await openApp(page);
  let failWeek = false;
  const requested: string[] = [];
  await page.route('**/api/stats*', async (route) => {
    const period = new URL(route.request().url()).searchParams.get('period') || 'all';
    requested.push(period);
    if (failWeek && period === 'week')
      return route.fulfill({
        status: 503,
        json: { error: { code: 'BUSY', message: 'Zeitraum momentan nicht verfügbar.' } },
      });
    await route.fulfill({
      json: {
        period,
        from:
          period === 'week'
            ? '2026-03-24T12:00:00.000Z'
            : period === 'month'
              ? '2026-02-28T12:00:00.000Z'
              : null,
        to: '2026-03-31T12:00:00.000Z',
        participants: [{ id: 9001, name: 'Zeitraum Ada', removed: false }],
        tasks: [{ id: 9002, name: 'Zeitraum Daily', archived: false }],
        entries: [
          {
            id: 9003,
            participantId: 9001,
            taskId: 9002,
            active: true,
            count: 9,
            selections: period === 'week' ? 1 : period === 'month' ? 2 : 3,
            undoneSelections: 0,
            lastSelectedAt: '2026-03-31T12:00:00.000Z',
          },
        ],
      },
    });
  });
  await page.goto('/stats');
  const period = page.getByLabel('Zeitraum', { exact: true });
  await expect(period).toHaveValue('all');
  await expect(
    page.getByText('3 Übernahmen · 1 Person · 1 Aufgabe', { exact: true }),
  ).toBeVisible();
  await period.selectOption('week');
  await expect(period).toHaveValue('week');
  await expect(period).toBeFocused();
  await expect(page.getByText('1 Übernahme · 1 Person · 1 Aufgabe', { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'Aufgaben von Zeitraum Ada anzeigen', exact: true })
    .click();
  await expect(page.getByLabel('Person', { exact: true })).toHaveValue('9001');
  await period.selectOption('month');
  await expect(period).toHaveValue('month');
  await expect(page.getByLabel('Person', { exact: true })).toHaveValue('9001');
  const details = page.getByRole('list', {
    name: 'Übernahmen nach Person und Aufgabe',
    exact: true,
  });
  await expect(details.getByText('9', { exact: true })).toBeVisible();
  await expect(details.getByText('2', { exact: true })).toBeVisible();
  await page.reload();
  await expect(period).toHaveValue('month');
  await expect(page.getByLabel('Person', { exact: true })).toHaveValue('9001');
  expect(new URL(page.url()).searchParams.get('period')).toBe('month');
  await page.getByRole('switch', { name: 'Dark Mode', exact: true }).click();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.screenshot({ path: 'test-results/stats-period-mobile.png', fullPage: true });
  await period.selectOption('all');
  await expect(period).toHaveValue('all');
  await expect(details.getByText('3', { exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.has('period')).toBe(false);
  failWeek = true;
  await period.selectOption('week');
  await expect(page.getByText('Zeitraum momentan nicht verfügbar.', { exact: true })).toBeVisible();
  await expect(details).toHaveCount(0);
  failWeek = false;
  await page.getByRole('button', { name: 'Erneut versuchen', exact: true }).click();
  await expect(period).toHaveValue('week');
  await expect(details.getByText('1', { exact: true })).toBeVisible();
  expect(requested).toContain('week');
  expect(requested).toContain('month');
  expect(requested).toContain('all');
});

test('Eingabedialoge fokussieren das erste Input-Feld und stellen den Auslöser wieder her', async ({
  page,
}) => {
  await openApp(page);
  const suffix = crypto.randomUUID().slice(0, 6);
  const taskName = 'Fokus Aufgabe ' + suffix;
  const personName = 'Fokus Person ' + suffix;
  const create = page.getByRole('button', { name: '+ Neue Aufgabe', exact: true });
  await create.click();
  await expect(page.getByLabel('Name der Aufgabe', { exact: true })).toBeFocused();
  await page.keyboard.type(taskName);
  await page.getByRole('button', { name: 'Aufgabe anlegen', exact: true }).click();
  const edit = page.getByRole('button', { name: 'Aufgabe bearbeiten', exact: true });
  await edit.click();
  await expect(page.getByLabel('Name der Aufgabe', { exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(edit).toBeFocused();
  await page.getByRole('button', { name: '+ Teilnehmer hinzufügen', exact: true }).click();
  await expect(page.getByLabel('Neue Person (optional)', { exact: true })).toBeFocused();
  await page.keyboard.type(personName);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const correction = page.getByRole('button', {
    name: `Auswahlstand von ${personName} korrigieren`,
    exact: true,
  });
  await correction.click();
  await expect(page.getByLabel('Neuer Auswahlstand', { exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(correction).toBeFocused();
  await page
    .getByRole('navigation', { name: 'Hauptnavigation' })
    .getByRole('link', { name: 'Team', exact: true })
    .click();
  await page.getByRole('button', { name: `${personName} umbenennen`, exact: true }).click();
  await expect(page.getByLabel('Anzeigename', { exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '+ Person hinzufügen', exact: true }).click();
  await expect(page.getByLabel('Anzeigename', { exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: `${personName} entfernen`, exact: true }).click();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Abbrechen', exact: true }),
  ).toBeFocused();
});

test('Benutzerdefinierter Zeitraum: Datumsprüfung, Anwenden, Fehlerwiederholung und gespeicherte Filter', async ({
  page,
}) => {
  await openApp(page);
  const suffix = crypto.randomUUID().slice(0, 8);
  const name = 'Datumsbereich ' + suffix;
  const task = await seed(page, 'Datumsbereich Aufgabe ' + suffix, [name]);
  const result = await write<DrawResponse>(page, `/api/tasks/${task.id}/draws`, {
    expectedVersion: task.version,
    requestId: crypto.randomUUID(),
  });
  const config = await (await page.request.get('/api/config')).json();
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: config.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date(result.draw.createdAt))
      .map((part) => [part.type, part.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const previous = new Date(date + 'T00:00:00.000Z');
  previous.setUTCDate(previous.getUTCDate() - 1);
  let customRequests = 0;
  let failNext = true;
  await page.route('**/api/stats*', async (route) => {
    if (new URL(route.request().url()).searchParams.get('period') === 'custom') {
      customRequests++;
      if (failNext) {
        failNext = false;
        return route.fulfill({
          status: 503,
          json: {
            error: { code: 'BUSY', message: 'Datumsbereich vorübergehend nicht verfügbar.' },
          },
        });
      }
    }
    await route.continue();
  });
  await page.goto('/stats');
  await page.getByRole('button', { name: `Aufgaben von ${name} anzeigen`, exact: true }).click();
  const period = page.getByLabel('Zeitraum', { exact: true });
  await period.selectOption('custom');
  const start = page.getByLabel('Startdatum', { exact: true });
  const end = page.getByLabel('Enddatum', { exact: true });
  const apply = page.getByRole('button', { name: 'Anwenden', exact: true });
  await expect(start).toBeFocused();
  await apply.click();
  await expect(page.getByRole('alert')).toHaveText('Bitte gib ein gültiges Startdatum an.');
  await expect(start).toBeFocused();
  await start.fill(date);
  await apply.click();
  await expect(page.getByRole('alert')).toHaveText('Bitte gib ein gültiges Enddatum an.');
  await expect(end).toBeFocused();
  await end.fill(previous.toISOString().slice(0, 10));
  await apply.click();
  await expect(page.getByRole('alert')).toHaveText(
    'Das Enddatum darf nicht vor dem Startdatum liegen.',
  );
  await expect(end).toHaveAttribute('aria-invalid', 'true');
  expect(customRequests).toBe(0);
  await end.fill(date);
  await apply.click();
  await expect(
    page.getByText('Datumsbereich vorübergehend nicht verfügbar.', { exact: true }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get('start')).toBe(date);
  expect(new URL(page.url()).searchParams.get('end')).toBe(date);
  await page.getByRole('button', { name: 'Erneut versuchen', exact: true }).click();
  await expect(period).toHaveValue('custom');
  await expect(start).toHaveValue(date);
  await expect(end).toHaveValue(date);
  await expect(page.getByText('1 Zuordnung · 1 Übernahme', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Person', { exact: true })).toHaveValue(
    String(task.members[0]!.participantId),
  );
  await page.reload();
  await expect(start).toHaveValue(date);
  await expect(end).toHaveValue(date);
  await expect(page.getByText('1 Zuordnung · 1 Übernahme', { exact: true })).toBeVisible();
  const beforeDraft = customRequests;
  await start.fill(previous.toISOString().slice(0, 10));
  expect(new URL(page.url()).searchParams.get('start')).toBe(date);
  expect(customRequests).toBe(beforeDraft);
  await start.fill(date);
  const bounds = await start.boundingBox();
  await start.click({ position: { x: bounds!.width - 18, y: bounds!.height / 2 } });
  await page.screenshot({ path: 'test-results/custom-range-calendar.png', fullPage: true });
  await page.keyboard.press('Escape');
  await page.getByRole('switch', { name: 'Dark Mode', exact: true }).click();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.screenshot({ path: 'test-results/custom-range-mobile-dark.png', fullPage: true });
  await period.selectOption('week');
  await expect(period).toHaveValue('week');
  await expect(start).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has('start')).toBe(false);
  expect(new URL(page.url()).searchParams.has('end')).toBe(false);
});

test('Wiederkehrende Aufgabe anlegen, manuell übernehmen, zurücknehmen und duplizieren', async ({
  page,
}) => {
  await openApp(page);
  const suffix = crypto.randomUUID().slice(0, 8);
  const name = `Termin ${suffix}`;
  const person = await write<Participant>(page, '/api/participants', {
    name: `Terminperson ${suffix}`,
  });
  await page.reload();
  await page.getByRole('button', { name: '+ Neue Aufgabe', exact: true }).click();
  await expect(page.getByLabel('Name der Aufgabe', { exact: true })).toBeFocused();
  await page.getByLabel('Name der Aufgabe', { exact: true }).fill(name);
  await page.getByLabel('Beschreibung (optional)', { exact: true }).fill('Wöchentliche Moderation');
  await page.getByRole('checkbox', { name: person.name, exact: true }).check();
  await page.getByLabel('Wiederholung', { exact: true }).selectOption('weekly');
  const today = calendarDate(new Date().toISOString(), 'Europe/Berlin');
  await page.getByLabel('Erster Termin', { exact: true }).fill(today);
  await page.getByRole('button', { name: 'Aufgabe anlegen', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  const id = Number(new URL(page.url()).pathname.split('/').pop());
  await expect(page.getByText(/Wöchentlich · Fällig am/)).toBeVisible();
  await page.getByRole('button', { name: 'Manuell übernehmen', exact: true }).click();
  const select = page.getByLabel('Person für die Übernahme', { exact: true });
  await expect(select).toBeFocused();
  await select.selectOption({ label: `${person.name} · Stand 0` });
  await page.getByRole('button', { name: 'Übernahme speichern', exact: true }).click();
  await expect(page.getByText('MANUELLE ÜBERNAHME', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Animation überspringen' }).click();
  await page.getByRole('button', { name: 'Weiter zur Aufgabe' }).click();
  await expect(page.getByTestId('current-winner')).toHaveText(person.name);
  await expect(page.getByText(/Wöchentlich · Nächster Termin am/)).toBeVisible();
  await openHistory(page);
  await expect(page.getByText('Manuelle Übernahme', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Letzte Auswahl zurücknehmen' }).click();
  await page.getByRole('button', { name: 'Auswahl zurücknehmen', exact: true }).click();
  expect((await current(page, id)).dueDate).toBe(today);
  await page.getByRole('button', { name: 'Duplizieren', exact: true }).click();
  await expect(page.getByLabel('Name der Kopie', { exact: true })).toBeFocused();
  await page.getByLabel('Name der Kopie', { exact: true }).fill(`${name} Kopie`);
  await page.getByRole('button', { name: 'Kopie anlegen', exact: true }).click();
  await expect(page.getByRole('heading', { name: `${name} Kopie`, exact: true })).toBeVisible();
  const copyId = Number(new URL(page.url()).pathname.split('/').pop());
  const copy = await current(page, copyId);
  expect(copy.id).not.toBe(id);
  expect(copy.description).toBe('Wöchentliche Moderation');
  expect(copy.members[0]?.count).toBe(0);
  expect(copy.history).toEqual([]);
  expect(copy.currentDraw).toBeNull();
  expect(copy.schedule?.frequency).toBe('weekly');
  await page.goto('/');
  await expect(
    page
      .getByRole('list', { name: 'Aufgaben', exact: true })
      .getByRole('listitem')
      .filter({ hasText: `${name} Kopie` })
      .getByText(/Fällig ·/),
  ).toBeVisible();
});

test('Abwesenheiten: planen, validieren, abbrechen, teamweit pausieren und entfernen', async ({
  page,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const task = await seed(page, `Abwesenheit ${suffix}`, [
    `Urlaub ${suffix}`,
    `Vertretung ${suffix}`,
  ]);
  const person = task.members[0]!;
  await page.goto('/team');
  const trigger = page.getByRole('button', {
    name: `Abwesenheiten von ${person.name}`,
    exact: true,
  });
  await trigger.click();
  const start = page.getByLabel('Startdatum', { exact: true });
  const end = page.getByLabel('Enddatum', { exact: true });
  await expect(start).toBeFocused();
  await start.fill('2026-12-03');
  await end.fill('2026-12-01');
  await page.getByRole('button', { name: 'Zeitraum hinzufügen', exact: true }).click();
  await expect(start).toHaveAttribute('aria-invalid', 'true');
  await expect(start).toBeFocused();
  await expect(page.getByRole('alert').getByText(/Enddatum darf nicht vor/)).toBeVisible();
  await start.fill('2026-12-01');
  await end.fill('2026-12-03');
  await page.getByRole('button', { name: 'Zeitraum hinzufügen', exact: true }).click();
  await expect(
    page.getByRole('list', { name: 'Geplante Abwesenheiten', exact: true }).getByRole('listitem'),
  ).toHaveCount(1);
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await expect(trigger).toBeFocused();
  expect((await current(page, task.id)).candidates).toHaveLength(2);
  await trigger.click();
  await start.fill('2000-01-01');
  await end.fill('2099-12-31');
  // Saving also accepts a completed range without an additional Add click.
  await page.getByRole('button', { name: 'Abwesenheiten speichern', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  const row = page
    .getByRole('list', { name: 'Team', exact: true })
    .getByRole('listitem')
    .filter({ hasText: person.name });
  await expect(row.getByText('Derzeit abwesend', { exact: true })).toBeVisible();
  await page.goto(`/tasks/${task.id}`);
  await expect(page.getByText('Abwesend · pausiert automatisch', { exact: true })).toBeVisible();
  expect((await current(page, task.id)).candidates.map((member) => member.name)).not.toContain(
    person.name,
  );
  await page.getByRole('button', { name: 'Manuell übernehmen', exact: true }).click();
  await expect(
    page
      .getByLabel('Person für die Übernahme')
      .getByRole('option', { name: new RegExp(person.name) }),
  ).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.goto('/team');
  await trigger.click();
  await page
    .getByRole('button', { name: 'Abwesenheit ab 01.01.2000 entfernen', exact: true })
    .click();
  await page.getByRole('button', { name: 'Abwesenheiten speichern', exact: true }).click();
  expect((await current(page, task.id)).candidates).toHaveLength(2);
});

test('Manuelle Übernahme bleibt nach verlorener Antwort sicher prüfbar', async ({ page }) => {
  const task = await seed(page, 'Manueller Antwortverlust', ['Manuell A', 'Manuell B']);
  const person = task.members[0]!;
  await page.goto(`/tasks/${task.id}`);
  let interrupted = false;
  const bodies: unknown[] = [];
  await page.route(`**/api/tasks/${task.id}/draws`, async (route) => {
    bodies.push(route.request().postDataJSON());
    if (!interrupted) {
      interrupted = true;
      await route.fetch();
      await route.abort('failed');
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Manuell übernehmen', exact: true }).click();
  await page.getByLabel('Person für die Übernahme').selectOption(String(person.id));
  await page.getByRole('button', { name: 'Übernahme speichern', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Auswahl prüfen', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Auswahl prüfen', exact: true }).click();
  await page.getByRole('button', { name: 'Animation überspringen' }).click();
  await page.getByRole('button', { name: 'Weiter zur Aufgabe' }).click();
  expect(bodies[0]).toEqual(bodies[1]);
  const after = await current(page, task.id);
  expect(after.history).toHaveLength(1);
  expect(after.currentDraw?.method).toBe('manual');
  expect(after.currentDraw?.name).toBe(person.name);
  expect(after.members.reduce((sum, member) => sum + member.count, 0)).toBe(1);
});

test('Neue Dialoge bleiben auf schmalen Displays im Dark Mode bedienbar; Fehler erhalten Eingaben', async ({
  page,
}) => {
  const task = await seed(page, `Mobil ${crypto.randomUUID().slice(0, 8)}`, ['Mobilperson']);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(`/tasks/${task.id}`);
  await page.getByRole('button', { name: 'Aufgabe bearbeiten', exact: true }).click();
  await page.getByLabel('Wiederholung', { exact: true }).selectOption('monthly');
  await page.getByLabel('Erster Termin', { exact: true }).fill('2027-01-31');
  await page.getByRole('button', { name: 'Änderungen speichern', exact: true }).click();
  await expect(page.getByText(/Monatlich · Nächster Termin am 31.01.2027/)).toBeVisible();
  await page.screenshot({
    path: 'test-results/new-features-mobile-dark.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Duplizieren', exact: true }).click();
  await page.getByLabel('Name der Kopie', { exact: true }).fill('Entwurf bleibt');
  await page.route(`**/api/tasks/${task.id}/duplicate`, (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: 'BUSY', message: 'Kopieren gerade nicht möglich.' } },
    }),
  );
  await page.getByRole('button', { name: 'Kopie anlegen', exact: true }).click();
  await expect(page.getByRole('alert').getByText('Kopieren gerade nicht möglich.')).toBeVisible();
  await expect(page.getByLabel('Name der Kopie', { exact: true })).toHaveValue('Entwurf bleibt');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Duplizieren', exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/team');
  await page.getByRole('button', { name: 'Abwesenheiten von Mobilperson', exact: true }).click();
  await page.screenshot({
    path: 'test-results/absences-mobile-dark.png',
    fullPage: true,
    animations: 'disabled',
  });
  expect(await page.getByRole('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
});
