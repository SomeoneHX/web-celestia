/* C++ code produced by gperf version 3.0.3 */
/* Command-line: /Library/Developer/CommandLineTools/usr/bin/gperf -m4 --output-file=native/generated/location.inc celengine/location.gperf  */
/* Computed positions: -k'1-2' */

#if !((' ' == 32) && ('!' == 33) && ('"' == 34) && ('#' == 35) \
      && ('%' == 37) && ('&' == 38) && ('\'' == 39) && ('(' == 40) \
      && (')' == 41) && ('*' == 42) && ('+' == 43) && (',' == 44) \
      && ('-' == 45) && ('.' == 46) && ('/' == 47) && ('0' == 48) \
      && ('1' == 49) && ('2' == 50) && ('3' == 51) && ('4' == 52) \
      && ('5' == 53) && ('6' == 54) && ('7' == 55) && ('8' == 56) \
      && ('9' == 57) && (':' == 58) && (';' == 59) && ('<' == 60) \
      && ('=' == 61) && ('>' == 62) && ('?' == 63) && ('A' == 65) \
      && ('B' == 66) && ('C' == 67) && ('D' == 68) && ('E' == 69) \
      && ('F' == 70) && ('G' == 71) && ('H' == 72) && ('I' == 73) \
      && ('J' == 74) && ('K' == 75) && ('L' == 76) && ('M' == 77) \
      && ('N' == 78) && ('O' == 79) && ('P' == 80) && ('Q' == 81) \
      && ('R' == 82) && ('S' == 83) && ('T' == 84) && ('U' == 85) \
      && ('V' == 86) && ('W' == 87) && ('X' == 88) && ('Y' == 89) \
      && ('Z' == 90) && ('[' == 91) && ('\\' == 92) && (']' == 93) \
      && ('^' == 94) && ('_' == 95) && ('a' == 97) && ('b' == 98) \
      && ('c' == 99) && ('d' == 100) && ('e' == 101) && ('f' == 102) \
      && ('g' == 103) && ('h' == 104) && ('i' == 105) && ('j' == 106) \
      && ('k' == 107) && ('l' == 108) && ('m' == 109) && ('n' == 110) \
      && ('o' == 111) && ('p' == 112) && ('q' == 113) && ('r' == 114) \
      && ('s' == 115) && ('t' == 116) && ('u' == 117) && ('v' == 118) \
      && ('w' == 119) && ('x' == 120) && ('y' == 121) && ('z' == 122) \
      && ('{' == 123) && ('|' == 124) && ('}' == 125) && ('~' == 126))
/* The character set is not based on ISO-646.  */
#error "gperf generated tables don't work with this execution character set. Please report a bug to <bug-gnu-gperf@gnu.org>."
#endif

#line 8 "celengine/location.gperf"
struct FeatureNameEntry { const char* name; Location::FeatureType featureType; };
/* maximum key range = 79, duplicates = 0 */

class FeatureNamesMap
{
private:
  static inline unsigned int hash (const char *str, unsigned int len);
public:
  static const struct FeatureNameEntry *getFeatureType (const char *str, unsigned int len);
};

inline unsigned int
FeatureNamesMap::hash (register const char *str, register unsigned int len)
{
  static const unsigned char asso_values[] =
    {
      82, 82, 82, 82, 82, 82, 82, 82, 82, 82,
      82, 82, 82, 82, 82, 82, 82, 82, 82, 82,
      82, 82, 82, 82, 82, 82, 82, 82, 82, 82,
      82, 82, 82, 82, 82, 82, 82, 82, 82, 82,
      82, 82, 82, 82, 82, 82, 82, 82, 82, 82,
      82, 82, 82, 82, 82, 82, 82, 82, 82, 82,
      82, 82, 82, 82, 82,  4, 51, 37, 82,  1,
      41,  6, 24,  9,  2, 82, 25, 40, 14, 26,
      15, 34,  7, 42,  0, 22, 11, 14, 43, 49,
      30, 82, 19, 82, 82, 82, 82, 36,  8, 82,
      82, 82, 82, 82, 82, 45, 82, 82, 82, 82,
      82, 35, 82, 82, 35, 82, 82, 82, 82, 82,
      82, 82, 82, 82, 82, 82, 82, 82, 82, 82,
      82, 82, 82, 82, 82, 82, 82, 82, 82, 82,
      82, 82, 82, 82, 82, 82, 82, 82, 82, 82,
      82, 82, 82, 82, 82, 82, 82, 82, 82, 82,
      82, 82, 82, 82, 82, 82, 82, 82, 82, 82,
      82, 82, 82, 82, 82, 82, 82, 82, 82, 82,
      82, 82, 82, 82, 82, 82, 82, 82, 82, 82,
      82, 82, 82, 82, 82, 82, 82, 82, 82, 82,
      82, 82, 82, 82, 82, 82, 82, 82, 82, 82,
      82, 82, 82, 82, 82, 82, 82, 82, 82, 82,
      82, 82, 82, 82, 82, 82, 82, 82, 82, 82,
      82, 82, 82, 82, 82, 82, 82, 82, 82, 82,
      82, 82, 82, 82, 82, 82, 82, 82, 82, 82,
      82, 82, 82, 82, 82, 82, 82, 82, 82, 82
    };
  return len + asso_values[(unsigned char)str[1]] + asso_values[(unsigned char)str[0]+4];
}

const struct FeatureNameEntry *
FeatureNamesMap::getFeatureType (register const char *str, register unsigned int len)
{
  enum
    {
      TOTAL_KEYWORDS = 67,
      MIN_WORD_LENGTH = 2,
      MAX_WORD_LENGTH = 12,
      MIN_HASH_VALUE = 3,
      MAX_HASH_VALUE = 81
    };

  static const struct FeatureNameEntry wordlist[] =
    {
      {""}, {""}, {""},
#line 46 "celengine/location.gperf"
      {"PE",           Location::Patera},
#line 29 "celengine/location.gperf"
      {"FT",           Location::Fretum},
#line 24 "celengine/location.gperf"
      {"FE",           Location::Flexus},
#line 45 "celengine/location.gperf"
      {"PA",           Location::Palus},
#line 10 "celengine/location.gperf"
      {"AA",           Location::Crater},
#line 23 "celengine/location.gperf"
      {"FA",           Location::Facula},
#line 50 "celengine/location.gperf"
      {"PR",           Location::Promontorium},
#line 12 "celengine/location.gperf"
      {"AR",           Location::Arcus},
#line 28 "celengine/location.gperf"
      {"FR",           Location::Farrum},
#line 14 "celengine/location.gperf"
      {"CA",           Location::Catena},
#line 54 "celengine/location.gperf"
      {"RT",           Location::Reticulum},
#line 51 "celengine/location.gperf"
      {"RE",           Location::Regio},
#line 20 "celengine/location.gperf"
      {"CR",           Location::Corona},
#line 61 "celengine/location.gperf"
      {"ST",           Location::LandingSite},
#line 59 "celengine/location.gperf"
      {"SE",           Location::Serpens},
#line 22 "celengine/location.gperf"
      {"ER",           Location::EruptiveCenter},
#line 52 "celengine/location.gperf"
      {"RG",           Location::Ring},
#line 56 "celengine/location.gperf"
      {"SA",           Location::Saxum},
#line 31 "celengine/location.gperf"
      {"LA",           Location::Labes},
#line 53 "celengine/location.gperf"
      {"RI",           Location::Rima},
#line 36 "celengine/location.gperf"
      {"LG",           Location::LargeRinged},
#line 49 "celengine/location.gperf"
      {"PU",           Location::Plume},
#line 60 "celengine/location.gperf"
      {"SI",           Location::Sinus},
#line 37 "celengine/location.gperf"
      {"LI",           Location::Linea},
#line 47 "celengine/location.gperf"
      {"PL",           Location::Planitia},
#line 11 "celengine/location.gperf"
      {"AL",           Location::Albedo},
#line 25 "celengine/location.gperf"
      {"FL",           Location::Fluctus},
#line 27 "celengine/location.gperf"
      {"FO",           Location::Fossa},
#line 38 "celengine/location.gperf"
      {"LN",           Location::Lingula},
#line 16 "celengine/location.gperf"
      {"CH",           Location::Chaos},
#line 17 "celengine/location.gperf"
      {"CL",           Location::Collum},
#line 19 "celengine/location.gperf"
      {"CO",           Location::Colles},
#line 55 "celengine/location.gperf"
      {"RU",           Location::Rupes},
#line 67 "celengine/location.gperf"
      {"VA",           Location::Vallis},
#line 41 "celengine/location.gperf"
      {"ME",           Location::Mare},
#line 62 "celengine/location.gperf"
      {"SU",           Location::Sulcus},
#line 33 "celengine/location.gperf"
      {"LU",           Location::Lacuna},
#line 40 "celengine/location.gperf"
      {"MA",           Location::Macula},
#line 69 "celengine/location.gperf"
      {"VI",           Location::Virga},
#line 48 "celengine/location.gperf"
      {"PM",           Location::Planum},
#line 39 "celengine/location.gperf"
      {"LO",           Location::Lobus},
#line 26 "celengine/location.gperf"
      {"FM",           Location::Flumen},
#line 13 "celengine/location.gperf"
      {"AS",           Location::Astrum},
#line 64 "celengine/location.gperf"
      {"TE",           Location::Tessera},
#line 74 "celengine/location.gperf"
      {"Crater",       Location::Crater},
#line 18 "celengine/location.gperf"
      {"CM",           Location::Chasma},
#line 63 "celengine/location.gperf"
      {"TA",           Location::Terra},
#line 42 "celengine/location.gperf"
      {"MN",           Location::Mensa},
#line 75 "celengine/location.gperf"
      {"Cosmodrome",   Location::Cosmodrome},
#line 21 "celengine/location.gperf"
      {"DO",           Location::Dorsum},
#line 58 "celengine/location.gperf"
      {"SC",           Location::Scopulus},
#line 34 "celengine/location.gperf"
      {"LC",           Location::Lacus},
#line 71 "celengine/location.gperf"
      {"City",         Location::City},
#line 30 "celengine/location.gperf"
      {"IN",           Location::Insula},
#line 57 "celengine/location.gperf"
      {"SF",           Location::Satellite},
#line 35 "celengine/location.gperf"
      {"LF",           Location::LandingSite},
#line 15 "celengine/location.gperf"
      {"CB",           Location::Cavus},
#line 76 "celengine/location.gperf"
      {"Ring",         Location::Ring},
#line 72 "celengine/location.gperf"
      {"Observatory",  Location::Observatory},
#line 43 "celengine/location.gperf"
      {"MO",           Location::Mons},
#line 73 "celengine/location.gperf"
      {"Landing Site", Location::LandingSite},
#line 70 "celengine/location.gperf"
      {"XX",           Location::Other},
#line 66 "celengine/location.gperf"
      {"UN",           Location::Undae},
      {""}, {""},
#line 32 "celengine/location.gperf"
      {"LB",           Location::Labyrinthus},
#line 65 "celengine/location.gperf"
      {"TH",           Location::Tholus},
      {""}, {""}, {""}, {""},
#line 68 "celengine/location.gperf"
      {"VS",           Location::Vastitas},
      {""}, {""}, {""}, {""}, {""}, {""},
#line 44 "celengine/location.gperf"
      {"OC",           Location::Oceanus}
    };

  if (len <= MAX_WORD_LENGTH && len >= MIN_WORD_LENGTH)
    {
      unsigned int key = hash (str, len);

      if (key <= MAX_HASH_VALUE)
        {
          register const char *s = wordlist[key].name;

          if (*str == *s && !strncmp (str + 1, s + 1, len - 1) && s[len] == '\0')
            return &wordlist[key];
        }
    }
  return 0;
}
