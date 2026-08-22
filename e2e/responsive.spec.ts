import { expect, test, type Page } from '@playwright/test'
import { codePanel, expectNoPageErrors, openApp, pausePreview } from './app.js'

// Each responsive test mounts CodeReel's WebGL preview. Keep this file serial so
// local UI mode does not run several canvases at once and starve Playwright's
// actionability checks.
test.describe.configure({ mode: 'serial', timeout: 90_000 })

async function expectNoHorizontalPageOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow, 'the page should not overflow horizontally').toBeLessThanOrEqual(1)
}

for (const viewport of [
  { width: 320, height: 800 },
  { width: 375, height: 812 },
]) {
  test.describe(`mobile workspace at ${viewport.width}px`, () => {
    test.use({ viewport })

    test.beforeEach(async ({ page }) => {
      await openApp(page)
      await pausePreview(page)
    })

    test.afterEach(async ({ page }) => {
      await expectNoPageErrors(page)
    })

    test('keeps preview and primary controls usable without page overflow', async ({ page }) => {
      const workspaceNav = page.getByRole('navigation', { name: 'Editor workspace' })
      const previewTab = workspaceNav.getByRole('button', { name: 'Preview' })
      const playbackControls = page.getByRole('group', { name: 'Playback controls' })

      await expect(workspaceNav).toBeVisible()
      await expect(previewTab).toHaveAttribute('aria-pressed', 'true')
      await expect(page.locator('main')).toBeVisible()
      await expect(page.locator('main canvas')).toBeVisible({ timeout: 15_000 })
      await expect(playbackControls).toBeVisible()
      await expect(page.getByTitle('Restart (R)')).toBeVisible()
      await expect(page.getByTitle('Play / pause (Space)')).toBeVisible()
      await expect(
        playbackControls.getByRole('button', { name: 'Loop', exact: true }),
      ).toBeVisible()
      await expect(page.getByRole('button', { name: 'Open projects' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Save project' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Export GIF' })).toBeVisible()

      const playbackOverflow = await playbackControls.evaluate(
        (element) => element.scrollWidth - element.clientWidth,
      )
      expect(
        playbackOverflow,
        'playback controls should not scroll horizontally',
      ).toBeLessThanOrEqual(1)
      await expectNoHorizontalPageOverflow(page)
    })

    test('switches Code, Preview and Style without losing editor state', async ({ page }) => {
      const workspaceNav = page.getByRole('navigation', { name: 'Editor workspace' })
      const marker = `const mobileWidth = ${viewport.width}`

      await workspaceNav.getByRole('button', { name: 'Code' }).click()
      const editor = page.locator('textarea').first()
      await expect(editor).toBeVisible()
      await editor.fill(marker)
      // Editing code intentionally restarts playback. Freeze it again before the
      // remaining responsive interactions so WebGL cannot starve their clicks.
      await pausePreview(page)
      await expectNoHorizontalPageOverflow(page)

      await workspaceNav.getByRole('button', { name: 'Style' }).click()
      const stylePanel = page.locator('aside').last()
      await expect(stylePanel).toBeVisible()
      const styleToggle = stylePanel.getByRole('switch').first()
      await expect(styleToggle).toBeVisible()
      const wasChecked = await styleToggle.getAttribute('aria-checked')
      await styleToggle.click()
      await expect(styleToggle).toHaveAttribute(
        'aria-checked',
        wasChecked === 'true' ? 'false' : 'true',
      )
      await expectNoHorizontalPageOverflow(page)

      await workspaceNav.getByRole('button', { name: 'Code' }).click()
      await expect(editor).toHaveValue(marker)

      await workspaceNav.getByRole('button', { name: 'Preview' }).click()
      await expect(page.locator('main canvas')).toBeVisible({ timeout: 15_000 })
      await expectNoHorizontalPageOverflow(page)
    })
  })
}

test.describe('desktop workspace', () => {
  test.use({ viewport: { width: 1600, height: 900 } })

  test('preserves the existing three-column editor', async ({ page }) => {
    await openApp(page)

    await expect(page.getByRole('navigation', { name: 'Editor workspace' })).toBeHidden()
    await expect(codePanel(page)).toBeVisible()
    await expect(page.locator('main')).toBeVisible()
    await expect(page.locator('aside').last()).toBeVisible()
    await expectNoHorizontalPageOverflow(page)
    await expectNoPageErrors(page)
  })
})
