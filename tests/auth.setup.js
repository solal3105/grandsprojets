// @ts-check
import { test as setup } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wqqsuybmyqemhojsamgq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxcXN1eWJteXFlbWhvanNhbWdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzAxNDYzMDQsImV4cCI6MjA0NTcyMjMwNH0.OpsuMB9GfVip2BjlrERFA_CpCOLsjNGn-ifhqwiqLl0';
const STORAGE_KEY = 'grandsprojets-auth';

/**
 * Sign in via Supabase signInWithPassword and inject the session
 * into the browser's localStorage so the app picks it up on load.
 */
async function loginAndSaveState(page, email, password, storageStatePath) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Supabase login failed for ${email}: ${error.message}`);

  // Supabase client stores session as a stringified object under STORAGE_KEY
  const storageValue = JSON.stringify(data.session);

  // Navigate to the origin so localStorage is scoped correctly
  await page.goto('/');
  await page.evaluate(({ key, value }) => {
    localStorage.setItem(key, value);
  }, { key: STORAGE_KEY, value: storageValue });

  // Save the full browser context (cookies + localStorage) for reuse
  await page.context().storageState({ path: storageStatePath });
}

setup('authenticate as admin', async ({ page }) => {
  const email = process.env.TEST_ADMIN_EMAIL;
  const password = process.env.TEST_ADMIN_PASSWORD;
  if (!email || !password) throw new Error('Missing TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD env vars');
  await loginAndSaveState(page, email, password, 'tests/.auth/admin.json');
});

setup('authenticate as invited', async ({ page }) => {
  const email = process.env.TEST_INVITED_EMAIL;
  const password = process.env.TEST_INVITED_PASSWORD;
  if (!email || !password) throw new Error('Missing TEST_INVITED_EMAIL / TEST_INVITED_PASSWORD env vars');
  await loginAndSaveState(page, email, password, 'tests/.auth/invited.json');
});
