/**
 * ポケソル偵察スクリプト: UI構造を調べてスクリーンショットを撮る
 */
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

console.log('Navigating to pokesol calc...');
await page.goto('https://sv.pokesol.com/calc', { waitUntil: 'networkidle', timeout: 30000 });

// Screenshot the initial state
await page.screenshot({ path: 'scripts/pokesol-initial.png', fullPage: false });
console.log('Screenshot saved: pokesol-initial.png');

// Dump all input/select/button elements with useful attributes
const elements = await page.evaluate(() => {
  const results = [];
  const selectors = ['input', 'select', 'button', 'textarea', '[role="combobox"]', '[role="listbox"]', '[contenteditable]'];
  for (const sel of selectors) {
    for (const el of document.querySelectorAll(sel)) {
      results.push({
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type') || '',
        id: el.id || '',
        name: el.getAttribute('name') || '',
        class: el.className?.toString()?.slice(0, 100) || '',
        placeholder: el.getAttribute('placeholder') || '',
        ariaLabel: el.getAttribute('aria-label') || '',
        role: el.getAttribute('role') || '',
        value: el.value?.toString()?.slice(0, 50) || '',
        text: el.textContent?.trim()?.slice(0, 60) || '',
        dataTestId: el.getAttribute('data-testid') || '',
      });
    }
  }
  return results;
});

console.log('\n=== Form Elements Found ===');
for (const el of elements) {
  const attrs = Object.entries(el).filter(([,v]) => v).map(([k,v]) => `${k}="${v}"`).join(' ');
  console.log(`  <${el.tag} ${attrs}>`);
}

// Also check for MUI Autocomplete or similar components
const muiElements = await page.evaluate(() => {
  const results = [];
  for (const el of document.querySelectorAll('[class*="MuiAutocomplete"], [class*="MuiSelect"], [class*="MuiInput"]')) {
    results.push({
      tag: el.tagName.toLowerCase(),
      class: el.className?.toString()?.slice(0, 120) || '',
      role: el.getAttribute('role') || '',
      id: el.id || '',
    });
  }
  return results;
});

console.log('\n=== MUI Components ===');
for (const el of muiElements) {
  console.log(`  <${el.tag} class="${el.class}" role="${el.role}" id="${el.id}">`);
}

// Check all visible text labels near inputs
const labels = await page.evaluate(() => {
  const results = [];
  for (const el of document.querySelectorAll('label, [class*="label"], [class*="Label"]')) {
    const text = el.textContent?.trim();
    if (text && text.length < 50) {
      results.push({ text, for: el.getAttribute('for') || '', class: el.className?.toString()?.slice(0, 80) || '' });
    }
  }
  return results;
});

console.log('\n=== Labels ===');
for (const l of labels) {
  console.log(`  "${l.text}" for="${l.for}" class="${l.class}"`);
}

// Get page title and any prominent headings
const headings = await page.evaluate(() => {
  return {
    title: document.title,
    h1: [...document.querySelectorAll('h1')].map(h => h.textContent?.trim()),
    h2: [...document.querySelectorAll('h2')].map(h => h.textContent?.trim()),
  };
});
console.log('\n=== Page Info ===');
console.log('Title:', headings.title);
console.log('H1:', headings.h1);
console.log('H2:', headings.h2);

await browser.close();
console.log('\nDone.');
