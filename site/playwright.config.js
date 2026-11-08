// Browser tests for accessibility (#53): axe-core checks and mobile layout, against the
// built static site in build/. Run `npm run build` first, then `npm run test:a11y`.
// Docs: https://playwright.dev/docs/test-configuration and https://playwright.dev/docs/test-webserver
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
	testDir: 'e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['list'], ['github']] : 'list',
	use: { baseURL: `http://127.0.0.1:${PORT}` },
	// A desktop and the two phone sizes from #53 (360 x 800 and 390 x 844), all in Chromium.
	projects: [
		{ name: 'desktop', use: { ...devices['Desktop Chrome'] } },
		{ name: 'phone-360', use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true } },
		{ name: 'phone-390', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }
	],
	webServer: {
		// The same static server the README uses to look at a build.
		command: `python3 -m http.server ${PORT} --bind 127.0.0.1 --directory build`,
		url: `http://127.0.0.1:${PORT}/`,
		reuseExistingServer: !process.env.CI,
		timeout: 30_000,
		stderr: 'ignore'
	}
});
