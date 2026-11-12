import { expect, test, type Page } from '@playwright/test';
import type { DrawResponse, Participant, TaskDetail } from '../src/shared/contracts';

async function openApp(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Eure Aufgaben' })).toBeVisible();
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
async function addPerson(page: Page, name: string) {
  await page.getByRole('button', { name: '+ Teilnehmer hinzufügen', exact: true }).click();
  await page.getByLabel('Neue Person (optional)', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Zur Aufgabe hinzufügen', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('row').filter({ hasText: name })).toBeVisible();
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
  await page.getByRole('button', { name: 'Änderungsprotokoll', exact: true }).click();
  await expect(page.getByText(/Acht frühere Moderationen übernommen/)).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.screenshot({ path: 'test-results/orbit-desktop.png', fullPage: true });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Wer übernimmt?' })).toBeVisible();
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
  await expect(page.getByRole('heading', { name: 'Team', exact: true })).toBeVisible();
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
  await expect(page.getByRole('heading', { name: 'Team', exact: true })).toBeVisible();
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
