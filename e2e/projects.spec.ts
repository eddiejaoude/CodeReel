import { expect, test, type Page } from '@playwright/test'
import { codePanel, expectNoPageErrors, openApp, pausePreview } from './app.js'

// Each Playwright test runs in a fresh browser context, so localStorage starts
// empty — no cross-test cleanup needed. The one intra-test persistence check
// (reload keeps the draft) relies on the reload happening in the same context.

const modal = (page: Page) => page.locator('.modal-pop')
const topBar = (page: Page) => page.locator('header')

async function openProjects(page: Page): Promise<void> {
  await topBar(page).getByRole('button', { name: 'Projects' }).click()
  await expect(modal(page).getByRole('heading', { name: 'Projects' })).toBeVisible()
}

async function saveCurrentAs(page: Page, name: string): Promise<void> {
  const m = modal(page)
  await m.getByRole('button', { name: 'Save current as…' }).click()
  const input = m.getByPlaceholder('Project name')
  await input.fill(name)
  await input.press('Enter')
  await expect(row(page, name)).toBeVisible()
}

/** A project row in the list, located by the project name it contains. */
function row(page: Page, name: string) {
  return modal(page).locator('.overflow-y-auto > div').filter({ hasText: name })
}

test.describe('Projects (local persistence)', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page)
    // Project persistence is the behaviour under test here. Freeze the animated
    // WebGL preview so software rendering cannot starve unrelated modal actions.
    await pausePreview(page)
  })

  test.afterEach(async ({ page }) => {
    await expectNoPageErrors(page)
  })

  test('starts as an unsaved draft with an empty library', async ({ page }) => {
    await expect(topBar(page).getByText('Unsaved draft')).toBeVisible()
    await openProjects(page)
    await expect(modal(page).getByText('No saved projects yet.', { exact: false })).toBeVisible()
  })

  test('saving names the project, lists it as open, and shows it in the top bar', async ({
    page,
  }) => {
    await openProjects(page)
    await saveCurrentAs(page, 'Alpha Demo')

    const created = row(page, 'Alpha Demo')
    await expect(created).toBeVisible()
    await expect(created.getByText('open', { exact: true })).toBeVisible()
    // metadata line reflects the default project (sequence mode, TypeScript)
    await expect(created.getByText('TypeScript · Sequence', { exact: false })).toBeVisible()

    await modal(page).getByRole('button', { name: 'Close projects' }).click()
    await expect(topBar(page).getByText('Alpha Demo')).toBeVisible()
  })

  test('reloading restores the working draft and the open project', async ({ page }) => {
    await openProjects(page)
    await saveCurrentAs(page, 'Persisted')
    await modal(page).getByRole('button', { name: 'Close projects' }).click()

    await page.reload()
    await expect(page.getByText('CodeReel', { exact: true })).toBeVisible()
    // the draft remembered the open project id; the name is re-resolved from the store
    await expect(topBar(page).getByText('Persisted')).toBeVisible()
  })

  test('opening a different project switches the editor', async ({ page }) => {
    // project 1: the default sequence-mode project
    await openProjects(page)
    await saveCurrentAs(page, 'Seq Project')
    await modal(page).getByRole('button', { name: 'Close projects' }).click()

    // switch to steps mode, then save as project 2
    await codePanel(page).getByRole('button', { name: 'Steps' }).click()
    await expect(codePanel(page).getByText('Step 1 / 3', { exact: true })).toBeVisible()
    // Changing editor mode restarts playback. Pause it again before the second
    // modal interaction for the same reason as the beforeEach setup above.
    await pausePreview(page)
    await openProjects(page)
    await saveCurrentAs(page, 'Steps Project')

    // open project 1 again → editor returns to sequence mode
    await row(page, 'Seq Project').getByRole('button', { name: 'Open' }).click()
    await expect(topBar(page).getByText('Seq Project')).toBeVisible()
    await expect(codePanel(page).getByText('Step 1 / 3', { exact: true })).toBeHidden()
  })

  test('renaming a project updates the list', async ({ page }) => {
    await openProjects(page)
    await saveCurrentAs(page, 'Old Name')

    await row(page, 'Old Name').getByRole('button', { name: 'Rename' }).click()
    const input = modal(page).getByRole('textbox')
    await input.fill('New Name')
    await input.press('Enter')

    await expect(row(page, 'New Name')).toBeVisible()
    await expect(modal(page).getByText('Old Name', { exact: true })).toBeHidden()
  })

  test('deleting a project removes it after confirmation', async ({ page }) => {
    await openProjects(page)
    await saveCurrentAs(page, 'Doomed')

    await row(page, 'Doomed').getByRole('button', { name: 'Delete' }).click()
    await modal(page).getByRole('button', { name: 'Yes' }).click()

    await expect(modal(page).getByText('No saved projects yet.', { exact: false })).toBeVisible()
    await expect(topBar(page).getByText('Unsaved draft')).toBeVisible()
  })

  test('New starts a fresh unsaved draft', async ({ page }) => {
    await openProjects(page)
    await saveCurrentAs(page, 'Temp')
    await modal(page).getByRole('button', { name: 'Close projects' }).click()
    await expect(topBar(page).getByText('Temp')).toBeVisible()

    await openProjects(page)
    await modal(page).getByRole('button', { name: 'New', exact: true }).click()
    await expect(topBar(page).getByText('Unsaved draft')).toBeVisible()
  })
})
