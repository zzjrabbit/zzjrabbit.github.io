import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import sitemap from '@astrojs/sitemap';
import { readFileSync } from 'node:fs';
import { buildLibrary, sidebar } from './src/lib/notebook.mjs';
const read = file => {
  try { return JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8')); }
  catch { return {}; }
};
// Subjects, note order and navigation all come from the published notes, so a
// new folder in the notes repository shows up without editing this file.
const library = buildLibrary(read('./.generated/notes.json'), read('./.generated/subjects.json'));
export default defineConfig({
  site: 'https://zzjrabbit.github.io',
  outDir: './_site', publicDir: './.generated/public',
  build: { format: 'file' }, trailingSlash: 'never',
  integrations: [sitemap({
    // Astro custom routes are extensionless internally; public URLs retain .html.
    serialize(item) {
      const url = new URL(item.url);
      if (url.pathname !== '/' && !url.pathname.endsWith('.html')) url.pathname += '.html';
      return { ...item, url: url.href };
    },
  }), starlight({
    title: 'zzj', description: 'Lean 4 formal proofs and Typst mathematical notes.',
    defaultLocale: 'root', locales: { root: { label: 'English', lang: 'en' } },
    sidebar: sidebar(library), social: [{ icon: 'github', label: 'Notes source', href: 'https://github.com/zzjrabbit/notes' }],
    customCss: ['./src/styles/notes.css'],
    editLink: { baseUrl: 'https://github.com/zzjrabbit/notes/edit/main/' },
    lastUpdated: false,
    components: {
      Footer: './src/components/Footer.astro',
      Head: './src/components/Head.astro',
      ThemeSelect: './src/components/ThemeSelect.astro',
    },
  })],
});
