import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js/lib/common' // ~35 langages courants (python, js/ts, bash, json, sql…), pas les 190

// Rendu Markdown des réponses du chat.
// html: false → le HTML brut écrit par le modèle est affiché comme du texte, jamais interprété : une réponse
// ne peut pas injecter de balise ni de script dans la page (le résultat part dans un v-html).
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true, // un retour à la ligne du modèle = un retour à la ligne affiché
  highlight(code, lang) {
    const language = lang && hljs.getLanguage(lang) ? lang : null
    const body = language
      ? hljs.highlight(code, { language, ignoreIllegals: true }).value
      : md.utils.escapeHtml(code)
    const label = md.utils.escapeHtml(lang || 'texte')
    // bloc complet renvoyé ici (markdown-it ne l'enveloppe pas s'il commence par <pre) : en-tête avec le
    // langage et un bouton Copier, géré par délégation d'événement dans ChatMessage.vue
    return `<pre class="bc-code"><div class="bc-code-head"><span>${label}</span><button type="button" data-copy-code>Copier</button></div><code class="hljs">${body}</code></pre>`
  },
})

// liens ouverts dans un nouvel onglet, sans donner accès à la page d'origine
const defaultLinkOpen = md.renderer.rules.link_open ?? ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options))
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet('target', '_blank')
  tokens[idx].attrSet('rel', 'noopener noreferrer')
  return defaultLinkOpen(tokens, idx, options, env, self)
}

export function renderMarkdown(text) {
  return md.render(text ?? '')
}
