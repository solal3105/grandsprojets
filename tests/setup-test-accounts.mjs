/**
 * Setup script — creates the two E2E test accounts in Supabase.
 *
 * Usage:  node tests/setup-test-accounts.mjs
 *
 * Prerequisites:
 *   - .env.test must exist with TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD,
 *     TEST_INVITED_EMAIL, TEST_INVITED_PASSWORD
 *   - Supabase email+password sign-ups must be enabled (Dashboard → Auth → Providers → Email)
 *
 * What this script does:
 *   1. Signs up both accounts (idempotent — skips if they already exist)
 *   2. Signs in to obtain user IDs
 *   3. Checks profiles exist with correct roles
 *   4. If profiles are wrong, prints SQL to run in Supabase SQL Editor
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env.test') });

const SUPABASE_URL = 'https://wqqsuybmyqemhojsamgq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxcXN1eWJteXFlbWhvanNhbWdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzAxNDYzMDQsImV4cCI6MjA0NTcyMjMwNH0.OpsuMB9GfVip2BjlrERFA_CpCOLsjNGn-ifhqwiqLl0';

const TEST_CITY = 'test-e2e';

const accounts = [
  {
    label: 'admin',
    email: process.env.TEST_ADMIN_EMAIL,
    password: process.env.TEST_ADMIN_PASSWORD,
    role: 'admin',
    ville: [TEST_CITY],
  },
  {
    label: 'invited',
    email: process.env.TEST_INVITED_EMAIL,
    password: process.env.TEST_INVITED_PASSWORD,
    role: 'invited',
    ville: [TEST_CITY],
  },
];

async function main() {
  for (const acct of accounts) {
    if (!acct.email || !acct.password) {
      console.error(`❌ Missing env vars for ${acct.label} account`);
      process.exit(1);
    }
  }

  console.log('🔧 Setting up E2E test accounts…\n');

  const sqlFixes = [];
  const userIds = {};

  for (const acct of accounts) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // --- 1. Sign-up (idempotent) ---
    console.log(`[${acct.label}] Signing up ${acct.email}…`);
    const { error: signUpError } = await supabase.auth.signUp({
      email: acct.email,
      password: acct.password,
    });

    if (signUpError && !/already registered|already exists/i.test(signUpError.message)) {
      console.error(`[${acct.label}] ❌ signUp failed:`, signUpError.message);
      process.exit(1);
    }

    // --- 2. Sign-in ---
    console.log(`[${acct.label}] Signing in…`);
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: acct.email,
      password: acct.password,
    });

    if (signInError) {
      if (/email not confirmed/i.test(signInError.message)) {
        console.error(`[${acct.label}] ❌ Email not confirmed. Go to Supabase Dashboard → Auth → Users → confirm ${acct.email}`);
      } else {
        console.error(`[${acct.label}] ❌ signIn failed:`, signInError.message);
      }
      process.exit(1);
    }

    const userId = signInData.user.id;
    userIds[acct.label] = userId;
    console.log(`[${acct.label}] ✅ Signed in — id: ${userId}`);

    // --- 3. Check profile ---
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, ville')
      .eq('id', userId)
      .single();

    const villeOk = Array.isArray(profile?.ville) && profile.ville.includes(TEST_CITY);
    const roleOk = profile?.role === acct.role;

    if (roleOk && villeOk) {
      console.log(`[${acct.label}] ✅ Profile OK — role: ${profile.role}, ville: ${JSON.stringify(profile.ville)}`);
    } else {
      console.warn(`[${acct.label}] ⚠️  Profile needs fix — current: role=${profile?.role}, ville=${JSON.stringify(profile?.ville)}`);
      sqlFixes.push(
        `UPDATE profiles SET role = '${acct.role}', ville = '{"${acct.ville.join('","')}"}' WHERE id = '${userId}';`
      );
    }

    await supabase.auth.signOut();
  }

  // --- 4. Check city_branding ---
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  await supabase.auth.signInWithPassword({
    email: accounts[0].email,
    password: accounts[0].password,
  });

  const { data: cityData } = await supabase
    .from('city_branding')
    .select('ville, brand_name')
    .eq('ville', TEST_CITY)
    .maybeSingle();

  if (cityData) {
    console.log(`\n✅ City "${TEST_CITY}" exists — brand_name: ${cityData.brand_name}`);
  } else {
    console.warn(`\n⚠️  City "${TEST_CITY}" does NOT exist in city_branding.`);
    sqlFixes.push(
      `INSERT INTO city_branding (ville, brand_name, primary_color, center_lat, center_lng)\nVALUES ('${TEST_CITY}', 'Test E2E', '#14AE5C', 45.764, 4.835);`
    );
  }

  await supabase.auth.signOut();

  // --- 5. Print SQL if needed ---
  if (sqlFixes.length > 0) {
    console.log('\n' + '='.repeat(60));
    console.log('📋 Run this SQL in Supabase Dashboard → SQL Editor:');
    console.log('='.repeat(60));
    console.log('\n' + sqlFixes.join('\n\n') + '\n');
    console.log('='.repeat(60));
    console.log('Then re-run: node tests/setup-test-accounts.mjs');
  } else {
    console.log('\n🎉 Everything is ready! Run: npm test');
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
