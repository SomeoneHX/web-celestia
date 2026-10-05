// The shell's own words.
//
// Celestia localises everything through gettext and the shell reads the same
// catalogue, so almost every label here is a msgid Celestia already has. A few
// are not: the colour mode is a web thing with no counterpart in the Qt front
// end, so its words are in no .po file and the catalogue can never answer for
// them. They live here instead.
//
// The table is what a catalogue would hold -- one entry per language, keyed by
// the msgid -- and a language that is not listed answers with the msgid itself,
// which is exactly what gettext does with an untranslated entry. The lookup in
// t() asks the catalogue first, so a msgid Celestia does translate is never
// shadowed by one of these.
//
// These were written by hand for the languages below and are worth a native
// speaker's eye; adding another is one entry, and a language left out is simply
// English until then.

export type ShellStrings = Readonly<Record<string, string>>;

const TRANSLATIONS: Readonly<Record<string, ShellStrings>> = {
  zh_CN: { '&Theme': '主题(&T)', System: '跟随系统', Light: '浅色', Dark: '深色' },
  zh_TW: { '&Theme': '主題(&T)', System: '跟隨系統', Light: '淺色', Dark: '深色' },
  ja: { '&Theme': 'テーマ(&T)', System: 'システム', Light: 'ライト', Dark: 'ダーク' },
  ko: { '&Theme': '테마(&T)', System: '시스템', Light: '라이트', Dark: '다크' },
  fr: { '&Theme': '&Thème', System: 'Système', Light: 'Clair', Dark: 'Sombre' },
  de: { '&Theme': '&Design', System: 'System', Light: 'Hell', Dark: 'Dunkel' },
  es: { '&Theme': '&Tema', System: 'Sistema', Light: 'Claro', Dark: 'Oscuro' },
  it: { '&Theme': '&Tema', System: 'Sistema', Light: 'Chiaro', Dark: 'Scuro' },
  pt: { '&Theme': '&Tema', System: 'Sistema', Light: 'Claro', Dark: 'Escuro' },
  pt_BR: { '&Theme': '&Tema', System: 'Sistema', Light: 'Claro', Dark: 'Escuro' },
  nl: { '&Theme': '&Thema', System: 'Systeem', Light: 'Licht', Dark: 'Donker' },
  pl: { '&Theme': '&Motyw', System: 'System', Light: 'Jasny', Dark: 'Ciemny' },
  sv: { '&Theme': '&Tema', System: 'System', Light: 'Ljust', Dark: 'Mörkt' },
  nb: { '&Theme': '&Tema', System: 'System', Light: 'Lyst', Dark: 'Mørkt' },
  tr: { '&Theme': '&Tema', System: 'Sistem', Light: 'Açık', Dark: 'Koyu' },
  hu: { '&Theme': '&Téma', System: 'Rendszer', Light: 'Világos', Dark: 'Sötét' },
  ro: { '&Theme': '&Temă', System: 'Sistem', Light: 'Luminos', Dark: 'Întunecat' },
  sk: { '&Theme': '&Téma', System: 'Systém', Light: 'Svetlý', Dark: 'Tmavý' },
  el: { '&Theme': '&Θέμα', System: 'Σύστημα', Light: 'Φωτεινό', Dark: 'Σκοτεινό' },
  ru: { '&Theme': '&Тема', System: 'Системная', Light: 'Светлая', Dark: 'Тёмная' },
  uk: { '&Theme': '&Тема', System: 'Системна', Light: 'Світла', Dark: 'Темна' },
  bg: { '&Theme': '&Тема', System: 'Системна', Light: 'Светла', Dark: 'Тъмна' },
  ar: { '&Theme': '&المظهر', System: 'النظام', Light: 'فاتح', Dark: 'داكن' },
};

/** The shell's translation of a msgid, or null when it has none. */
export function shellString(language: string, message: string): string | null {
  return TRANSLATIONS[language]?.[message] ?? null;
}
