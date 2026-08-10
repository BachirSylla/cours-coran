// src/shared/data/sourates.ts
//
// Liste canonique des 114 sourates du Coran, dans l'ordre du muṣḥaf.
//   numero   : 1..114 (ordre officiel)
//   nom      : translittération française (voyelles longues : â, î, û)
//   nomArabe : nom en arabe
//
// Invariant garanti (à couvrir par un test) : exactement 114 entrées,
// numéros 1..114 uniques et contigus.

export interface Sourate {
  readonly numero: number
  readonly nom: string
  readonly nomArabe: string
}

export const SOURATES: readonly Sourate[] = [
  { numero: 1, nom: 'Al-Fâtiha', nomArabe: 'الفاتحة' },
  { numero: 2, nom: 'Al-Baqara', nomArabe: 'البقرة' },
  { numero: 3, nom: "Âl-'Imrân", nomArabe: 'آل عمران' },
  { numero: 4, nom: "An-Nisâ'", nomArabe: 'النساء' },
  { numero: 5, nom: "Al-Mâ'ida", nomArabe: 'المائدة' },
  { numero: 6, nom: "Al-An'âm", nomArabe: 'الأنعام' },
  { numero: 7, nom: "Al-A'râf", nomArabe: 'الأعراف' },
  { numero: 8, nom: 'Al-Anfâl', nomArabe: 'الأنفال' },
  { numero: 9, nom: 'At-Tawba', nomArabe: 'التوبة' },
  { numero: 10, nom: 'Yûnus', nomArabe: 'يونس' },
  { numero: 11, nom: 'Hûd', nomArabe: 'هود' },
  { numero: 12, nom: 'Yûsuf', nomArabe: 'يوسف' },
  { numero: 13, nom: "Ar-Ra'd", nomArabe: 'الرعد' },
  { numero: 14, nom: 'Ibrâhîm', nomArabe: 'إبراهيم' },
  { numero: 15, nom: 'Al-Hijr', nomArabe: 'الحجر' },
  { numero: 16, nom: 'An-Nahl', nomArabe: 'النحل' },
  { numero: 17, nom: "Al-Isrâ'", nomArabe: 'الإسراء' },
  { numero: 18, nom: 'Al-Kahf', nomArabe: 'الكهف' },
  { numero: 19, nom: 'Maryam', nomArabe: 'مريم' },
  { numero: 20, nom: 'Tâ-Hâ', nomArabe: 'طه' },
  { numero: 21, nom: "Al-Anbiyâ'", nomArabe: 'الأنبياء' },
  { numero: 22, nom: 'Al-Hajj', nomArabe: 'الحج' },
  { numero: 23, nom: "Al-Mu'minûn", nomArabe: 'المؤمنون' },
  { numero: 24, nom: 'An-Nûr', nomArabe: 'النور' },
  { numero: 25, nom: 'Al-Furqân', nomArabe: 'الفرقان' },
  { numero: 26, nom: "Ash-Shu'arâ'", nomArabe: 'الشعراء' },
  { numero: 27, nom: 'An-Naml', nomArabe: 'النمل' },
  { numero: 28, nom: 'Al-Qasas', nomArabe: 'القصص' },
  { numero: 29, nom: "Al-'Ankabût", nomArabe: 'العنكبوت' },
  { numero: 30, nom: 'Ar-Rûm', nomArabe: 'الروم' },
  { numero: 31, nom: 'Luqmân', nomArabe: 'لقمان' },
  { numero: 32, nom: 'As-Sajda', nomArabe: 'السجدة' },
  { numero: 33, nom: 'Al-Ahzâb', nomArabe: 'الأحزاب' },
  { numero: 34, nom: "Saba'", nomArabe: 'سبأ' },
  { numero: 35, nom: 'Fâtir', nomArabe: 'فاطر' },
  { numero: 36, nom: 'Yâ-Sîn', nomArabe: 'يس' },
  { numero: 37, nom: 'As-Sâffât', nomArabe: 'الصافات' },
  { numero: 38, nom: 'Sâd', nomArabe: 'ص' },
  { numero: 39, nom: 'Az-Zumar', nomArabe: 'الزمر' },
  { numero: 40, nom: 'Ghâfir', nomArabe: 'غافر' },
  { numero: 41, nom: 'Fussilat', nomArabe: 'فصلت' },
  { numero: 42, nom: 'Ash-Shûrâ', nomArabe: 'الشورى' },
  { numero: 43, nom: 'Az-Zukhruf', nomArabe: 'الزخرف' },
  { numero: 44, nom: 'Ad-Dukhân', nomArabe: 'الدخان' },
  { numero: 45, nom: 'Al-Jâthiya', nomArabe: 'الجاثية' },
  { numero: 46, nom: 'Al-Ahqâf', nomArabe: 'الأحقاف' },
  { numero: 47, nom: 'Muhammad', nomArabe: 'محمد' },
  { numero: 48, nom: 'Al-Fath', nomArabe: 'الفتح' },
  { numero: 49, nom: 'Al-Hujurât', nomArabe: 'الحجرات' },
  { numero: 50, nom: 'Qâf', nomArabe: 'ق' },
  { numero: 51, nom: 'Adh-Dhâriyât', nomArabe: 'الذاريات' },
  { numero: 52, nom: 'At-Tûr', nomArabe: 'الطور' },
  { numero: 53, nom: 'An-Najm', nomArabe: 'النجم' },
  { numero: 54, nom: 'Al-Qamar', nomArabe: 'القمر' },
  { numero: 55, nom: 'Ar-Rahmân', nomArabe: 'الرحمن' },
  { numero: 56, nom: "Al-Wâqi'a", nomArabe: 'الواقعة' },
  { numero: 57, nom: 'Al-Hadîd', nomArabe: 'الحديد' },
  { numero: 58, nom: 'Al-Mujâdila', nomArabe: 'المجادلة' },
  { numero: 59, nom: 'Al-Hashr', nomArabe: 'الحشر' },
  { numero: 60, nom: 'Al-Mumtahana', nomArabe: 'الممتحنة' },
  { numero: 61, nom: 'As-Saff', nomArabe: 'الصف' },
  { numero: 62, nom: "Al-Jumu'a", nomArabe: 'الجمعة' },
  { numero: 63, nom: 'Al-Munâfiqûn', nomArabe: 'المنافقون' },
  { numero: 64, nom: 'At-Taghâbun', nomArabe: 'التغابن' },
  { numero: 65, nom: 'At-Talâq', nomArabe: 'الطلاق' },
  { numero: 66, nom: 'At-Tahrîm', nomArabe: 'التحريم' },
  { numero: 67, nom: 'Al-Mulk', nomArabe: 'الملك' },
  { numero: 68, nom: 'Al-Qalam', nomArabe: 'القلم' },
  { numero: 69, nom: 'Al-Hâqqa', nomArabe: 'الحاقة' },
  { numero: 70, nom: "Al-Ma'ârij", nomArabe: 'المعارج' },
  { numero: 71, nom: 'Nûh', nomArabe: 'نوح' },
  { numero: 72, nom: 'Al-Jinn', nomArabe: 'الجن' },
  { numero: 73, nom: 'Al-Muzzammil', nomArabe: 'المزمل' },
  { numero: 74, nom: 'Al-Muddaththir', nomArabe: 'المدثر' },
  { numero: 75, nom: 'Al-Qiyâma', nomArabe: 'القيامة' },
  { numero: 76, nom: 'Al-Insân', nomArabe: 'الإنسان' },
  { numero: 77, nom: 'Al-Mursalât', nomArabe: 'المرسلات' },
  { numero: 78, nom: "An-Naba'", nomArabe: 'النبأ' },
  { numero: 79, nom: "An-Nâzi'ât", nomArabe: 'النازعات' },
  { numero: 80, nom: "'Abasa", nomArabe: 'عبس' },
  { numero: 81, nom: 'At-Takwîr', nomArabe: 'التكوير' },
  { numero: 82, nom: 'Al-Infitâr', nomArabe: 'الإنفطار' },
  { numero: 83, nom: 'Al-Mutaffifîn', nomArabe: 'المطففين' },
  { numero: 84, nom: 'Al-Inshiqâq', nomArabe: 'الإنشقاق' },
  { numero: 85, nom: 'Al-Burûj', nomArabe: 'البروج' },
  { numero: 86, nom: 'At-Târiq', nomArabe: 'الطارق' },
  { numero: 87, nom: "Al-A'lâ", nomArabe: 'الأعلى' },
  { numero: 88, nom: 'Al-Ghâshiya', nomArabe: 'الغاشية' },
  { numero: 89, nom: 'Al-Fajr', nomArabe: 'الفجر' },
  { numero: 90, nom: 'Al-Balad', nomArabe: 'البلد' },
  { numero: 91, nom: 'Ash-Shams', nomArabe: 'الشمس' },
  { numero: 92, nom: 'Al-Layl', nomArabe: 'الليل' },
  { numero: 93, nom: 'Ad-Duhâ', nomArabe: 'الضحى' },
  { numero: 94, nom: 'Ash-Sharh', nomArabe: 'الشرح' },
  { numero: 95, nom: 'At-Tîn', nomArabe: 'التين' },
  { numero: 96, nom: "Al-'Alaq", nomArabe: 'العلق' },
  { numero: 97, nom: 'Al-Qadr', nomArabe: 'القدر' },
  { numero: 98, nom: 'Al-Bayyina', nomArabe: 'البينة' },
  { numero: 99, nom: 'Az-Zalzala', nomArabe: 'الزلزلة' },
  { numero: 100, nom: "Al-'Âdiyât", nomArabe: 'العاديات' },
  { numero: 101, nom: "Al-Qâri'a", nomArabe: 'القارعة' },
  { numero: 102, nom: 'At-Takâthur', nomArabe: 'التكاثر' },
  { numero: 103, nom: "Al-'Asr", nomArabe: 'العصر' },
  { numero: 104, nom: 'Al-Humaza', nomArabe: 'الهمزة' },
  { numero: 105, nom: 'Al-Fîl', nomArabe: 'الفيل' },
  { numero: 106, nom: 'Quraysh', nomArabe: 'قريش' },
  { numero: 107, nom: "Al-Mâ'ûn", nomArabe: 'الماعون' },
  { numero: 108, nom: 'Al-Kawthar', nomArabe: 'الكوثر' },
  { numero: 109, nom: 'Al-Kâfirûn', nomArabe: 'الكافرون' },
  { numero: 110, nom: 'An-Nasr', nomArabe: 'النصر' },
  { numero: 111, nom: 'Al-Masad', nomArabe: 'المسد' },
  { numero: 112, nom: 'Al-Ikhlâs', nomArabe: 'الإخلاص' },
  { numero: 113, nom: 'Al-Falaq', nomArabe: 'الفلق' },
  { numero: 114, nom: 'An-Nâs', nomArabe: 'الناس' },
] as const

/** Accès O(1) par numéro de sourate. */
export const SOURATE_PAR_NUMERO: ReadonlyMap<number, Sourate> = new Map(
  SOURATES.map((s) => [s.numero, s])
)

/** Libellé d'affichage, ex. « 2 · Al-Baqara ». */
export function libelleSourate(s: Sourate): string {
  return `${s.numero} · ${s.nom}`
}

/**
 * Clé de comparaison d'un nom : minuscules, sans diacritiques ni signes de
 * translittération. « Âl-'Imrân », « al imran » et « ALIMRAN » donnent la même
 * chaîne — sans quoi la recherche exigerait une orthographe exacte.
 */
export function normaliserRecherche(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diacritiques latins (â, î, û…)
    .toLowerCase()
    .replace(/['’`\-_\s]/g, '')
}

/** Index de recherche construit une fois pour toutes. */
const INDEX = SOURATES.map((sourate) => ({
  sourate,
  cle: normaliserRecherche(sourate.nom),
}))

export function trouverParNumero(numero: number | null | undefined): Sourate | undefined {
  return numero === null || numero === undefined ? undefined : SOURATE_PAR_NUMERO.get(numero)
}

/**
 * Retrouve une sourate à partir d'un nom saisi librement — indispensable pour
 * les séances enregistrées avant l'existence du numéro.
 */
export function trouverParNom(nom: string | null | undefined): Sourate | undefined {
  if (!nom || nom.trim() === '') return undefined

  const cle = normaliserRecherche(nom)
  if (cle === '') return undefined

  const exact = INDEX.find((entree) => entree.cle === cle)
  if (exact) return exact.sourate

  // Tolérance : « al baqarah » ou « baqara » retrouvent Al-Baqara — mais
  // uniquement si le rapprochement est **sans ambiguïté**. « nas » correspond à
  // plusieurs sourates : mieux vaut ne rien retrouver que se tromper.
  const candidats = INDEX.filter(
    (entree) => entree.cle.includes(cle) || cle.includes(entree.cle)
  )

  return candidats.length === 1 ? candidats[0]?.sourate : undefined
}

/**
 * Filtre les sourates par numéro **ou** par nom (translittéré ou arabe).
 * Une requête vide renvoie la liste complète : le sélecteur s'ouvre garni.
 * L'ordre canonique est toujours préservé.
 */
export function chercherSourates(requete: string): Sourate[] {
  const brut = requete.trim()
  if (brut === '') return [...SOURATES]

  // Requête purement numérique : correspondance exacte d'abord, puis préfixe
  // (« 1 » propose 1, 10–19 et 100–114).
  if (/^\d+$/.test(brut)) {
    const numero = Number(brut)
    const exact = SOURATE_PAR_NUMERO.get(numero)
    const prefixes = SOURATES.filter(
      (sourate) => sourate.numero !== numero && String(sourate.numero).startsWith(brut)
    )

    return exact ? [exact, ...prefixes] : prefixes
  }

  const cle = normaliserRecherche(brut)

  return SOURATES.filter((sourate, index) => {
    // L'arabe ne porte pas de diacritiques latins : simple inclusion.
    if (sourate.nomArabe.includes(brut)) return true

    return cle !== '' && (INDEX[index]?.cle.includes(cle) ?? false)
  })
}
