import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import sitemap from '@astrojs/sitemap';
import { readFileSync } from 'node:fs';
const notes = JSON.parse(readFileSync(new URL('./.generated/notes.json', import.meta.url)));
const categories = { 'typ/real': '实分析', 'typ/topology': '拓扑', 'typ/geometry': '几何', 'typ/lie': '李群与李代数', 'models': '数学建模' };
const sidebar = [{ label: '全部笔记', link: '/' }, ...Object.entries(categories).map(([prefix, label]) => ({
  label, items: notes.filter(n => n.file.startsWith(prefix + '/')).map(n => ({ label: n.title, link: '/' + n.file }))
})).filter(group => group.items.length)];
const known = notes.filter(n => !Object.keys(categories).some(prefix => n.file.startsWith(prefix + '/')));
if (known.length) sidebar.push({ label: '其他笔记', items: known.map(n => ({ label: n.title, link: '/' + n.file })) });
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
    title: 'zzj', description: 'Lean 4 形式化证明与 Typst 数学笔记。',
    defaultLocale: 'root', locales: { root: { label: '简体中文', lang: 'zh-CN' } },
    sidebar, social: [{ icon: 'github', label: '笔记源码', href: 'https://github.com/zzjrabbit/notes' }],
    customCss: ['./src/styles/notes.css'],
    editLink: { baseUrl: 'https://github.com/zzjrabbit/notes/edit/main/' },
    lastUpdated: false,
    components: { Footer: './src/components/Footer.astro', Head: './src/components/Head.astro' },
  })],
});
