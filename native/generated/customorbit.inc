/* C++ code produced by gperf version 3.0.3 */
/* Command-line: /Library/Developer/CommandLineTools/usr/bin/gperf -m4 --output-file=native/generated/customorbit.inc celephem/customorbit.gperf  */
/* Computed positions: -k'1,5,11,$' */

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

#line 8 "celephem/customorbit.gperf"
struct CustomOrbitEntry { const char* name; CustomOrbitType orbitType; };
/* maximum key range = 112, duplicates = 0 */

class CustomOrbitMap
{
private:
  static inline unsigned int hash (const char *str, unsigned int len);
public:
  static const struct CustomOrbitEntry *getOrbitType (const char *str, unsigned int len);
};

inline unsigned int
CustomOrbitMap::hash (register const char *str, register unsigned int len)
{
  static const unsigned char asso_values[] =
    {
      126, 126, 126, 126, 126, 126, 126, 126, 126, 126,
      126, 126, 126, 126, 126, 126, 126, 126, 126, 126,
      126, 126, 126, 126, 126, 126, 126, 126, 126, 126,
      126, 126, 126, 126, 126, 126, 126, 126, 126, 126,
      126, 126, 126, 126, 126,  44, 126, 126,  22, 126,
      126, 126, 126, 126, 126, 126,   9, 126, 126, 126,
      126, 126, 126, 126, 126, 126, 126, 126, 126, 126,
      126, 126, 126, 126, 126, 126, 126, 126, 126, 126,
      126, 126, 126, 126, 126, 126, 126, 126, 126, 126,
      126, 126, 126, 126, 126, 126, 126,  36,   8,   2,
       55,   7, 126,  14,  15,  31,   2, 126,  42,   9,
        3,  21,  28, 126,  41,   2,  39,   3,  19, 126,
      126,  61, 126, 126, 126, 126, 126, 126, 126, 126,
      126, 126, 126, 126, 126, 126, 126, 126, 126, 126,
      126, 126, 126, 126, 126, 126, 126, 126, 126, 126,
      126, 126, 126, 126, 126, 126, 126, 126, 126, 126,
      126, 126, 126, 126, 126, 126, 126, 126, 126, 126,
      126, 126, 126, 126, 126, 126, 126, 126, 126, 126,
      126, 126, 126, 126, 126, 126, 126, 126, 126, 126,
      126, 126, 126, 126, 126, 126, 126, 126, 126, 126,
      126, 126, 126, 126, 126, 126, 126, 126, 126, 126,
      126, 126, 126, 126, 126, 126, 126, 126, 126, 126,
      126, 126, 126, 126, 126, 126, 126, 126, 126, 126,
      126, 126, 126, 126, 126, 126, 126, 126, 126, 126,
      126, 126, 126, 126, 126, 126, 126, 126, 126, 126,
      126, 126, 126, 126, 126, 126
    };
  register unsigned int hval = len;

  switch (hval)
    {
      default:
        hval += asso_values[(unsigned char)str[10]];
      /*FALLTHROUGH*/
      case 10:
      case 9:
      case 8:
      case 7:
      case 6:
      case 5:
        hval += asso_values[(unsigned char)str[4]];
      /*FALLTHROUGH*/
      case 4:
      case 3:
      case 2:
      case 1:
        hval += asso_values[(unsigned char)str[0]];
        break;
    }
  return hval + asso_values[(unsigned char)str[len - 1]];
}

const struct CustomOrbitEntry *
CustomOrbitMap::getOrbitType (register const char *str, register unsigned int len)
{
  enum
    {
      TOTAL_KEYWORDS = 76,
      MIN_WORD_LENGTH = 2,
      MAX_WORD_LENGTH = 15,
      MIN_HASH_VALUE = 14,
      MAX_HASH_VALUE = 125
    };

  static const struct CustomOrbitEntry wordlist[] =
    {
      {""}, {""}, {""}, {""}, {""}, {""}, {""}, {""}, {""},
      {""}, {""}, {""}, {""}, {""},
#line 17 "celephem/customorbit.gperf"
      {"uranus",          CustomOrbitType::Uranus},
#line 14 "celephem/customorbit.gperf"
      {"mars",            CustomOrbitType::Mars},
#line 13 "celephem/customorbit.gperf"
      {"moon",            CustomOrbitType::Moon},
      {""},
#line 73 "celephem/customorbit.gperf"
      {"mimas",           CustomOrbitType::TASS17Mimas},
#line 41 "celephem/customorbit.gperf"
      {"uranus-sun",      CustomOrbitType::JplUranusSun},
#line 18 "celephem/customorbit.gperf"
      {"neptune",         CustomOrbitType::Neptune},
      {""}, {""},
#line 42 "celephem/customorbit.gperf"
      {"neptune-sun",     CustomOrbitType::JplNeptuneSun},
      {""}, {""},
#line 55 "celephem/customorbit.gperf"
      {"jpl-emb-sun",     CustomOrbitType::JplEmbSun},
#line 28 "celephem/customorbit.gperf"
      {"jpl-earth-sun",   CustomOrbitType::JplEarthSun},
#line 11 "celephem/customorbit.gperf"
      {"venus",           CustomOrbitType::Venus},
#line 29 "celephem/customorbit.gperf"
      {"jpl-mars-sun",    CustomOrbitType::JplMarsSun},
#line 33 "celephem/customorbit.gperf"
      {"jpl-neptune-sun", CustomOrbitType::JplNeptuneSun},
#line 61 "celephem/customorbit.gperf"
      {"jpl-sun-ssb",     CustomOrbitType::JplSunSsb},
#line 47 "celephem/customorbit.gperf"
      {"jpl-earth-ssb",   CustomOrbitType::JplEarthSsb},
#line 48 "celephem/customorbit.gperf"
      {"jpl-mars-ssb",    CustomOrbitType::JplMarsSsb},
#line 37 "celephem/customorbit.gperf"
      {"earth-sun",       CustomOrbitType::JplEarthSun},
#line 52 "celephem/customorbit.gperf"
      {"jpl-neptune-ssb", CustomOrbitType::JplNeptuneSsb},
#line 56 "celephem/customorbit.gperf"
      {"jpl-emb-ssb",     CustomOrbitType::JplEmbSsb},
#line 59 "celephem/customorbit.gperf"
      {"jpl-earth-emb",   CustomOrbitType::JplEarthEmb},
#line 71 "celephem/customorbit.gperf"
      {"ganymede",        CustomOrbitType::Ganymede},
#line 27 "celephem/customorbit.gperf"
      {"jpl-venus-sun",   CustomOrbitType::JplVenusSun},
#line 57 "celephem/customorbit.gperf"
      {"jpl-moon-emb",    CustomOrbitType::JplMoonEmb},
#line 99 "celephem/customorbit.gperf"
      {"vsop87-sun",      CustomOrbitType::VSOP87Sun},
#line 12 "celephem/customorbit.gperf"
      {"earth",           CustomOrbitType::Earth},
#line 94 "celephem/customorbit.gperf"
      {"vsop87-mars",     CustomOrbitType::VSOP87Mars},
#line 46 "celephem/customorbit.gperf"
      {"jpl-venus-ssb",   CustomOrbitType::JplVenusSsb},
#line 92 "celephem/customorbit.gperf"
      {"vsop87-venus",    CustomOrbitType::VSOP87Venus},
#line 97 "celephem/customorbit.gperf"
      {"vsop87-uranus",   CustomOrbitType::VSOP87Uranus},
#line 96 "celephem/customorbit.gperf"
      {"vsop87-saturn",   CustomOrbitType::VSOP87Saturn},
#line 34 "celephem/customorbit.gperf"
      {"jpl-pluto-sun",   CustomOrbitType::JplPlutoSun},
#line 81 "celephem/customorbit.gperf"
      {"phoebe",          CustomOrbitType::Phoebe},
#line 78 "celephem/customorbit.gperf"
      {"titan",           CustomOrbitType::TASS17Titan},
#line 86 "celephem/customorbit.gperf"
      {"oberon",          CustomOrbitType::Oberon},
#line 16 "celephem/customorbit.gperf"
      {"saturn",          CustomOrbitType::Saturn},
#line 53 "celephem/customorbit.gperf"
      {"jpl-pluto-ssb",   CustomOrbitType::JplPlutoSsb},
#line 69 "celephem/customorbit.gperf"
      {"io",              CustomOrbitType::Io},
#line 82 "celephem/customorbit.gperf"
      {"miranda",         CustomOrbitType::Miranda},
#line 40 "celephem/customorbit.gperf"
      {"saturn-sun",      CustomOrbitType::JplSaturnSun},
#line 67 "celephem/customorbit.gperf"
      {"phobos",          CustomOrbitType::Phobos},
#line 39 "celephem/customorbit.gperf"
      {"jupiter-sun",     CustomOrbitType::JplJupiterSun},
#line 63 "celephem/customorbit.gperf"
      {"htc20-helene",    CustomOrbitType::Helene},
#line 74 "celephem/customorbit.gperf"
      {"enceladus",       CustomOrbitType::TASS17Enceladus},
#line 43 "celephem/customorbit.gperf"
      {"pluto-sun",       CustomOrbitType::JplPlutoSun},
#line 72 "celephem/customorbit.gperf"
      {"callisto",        CustomOrbitType::Callisto},
#line 30 "celephem/customorbit.gperf"
      {"jpl-jupiter-sun", CustomOrbitType::JplJupiterSun},
#line 38 "celephem/customorbit.gperf"
      {"mars-sun",        CustomOrbitType::JplMarsSun},
#line 31 "celephem/customorbit.gperf"
      {"jpl-saturn-sun",  CustomOrbitType::JplSaturnSun},
#line 32 "celephem/customorbit.gperf"
      {"jpl-uranus-sun",  CustomOrbitType::JplUranusSun},
#line 79 "celephem/customorbit.gperf"
      {"hyperion",        CustomOrbitType::TASS17Hyperion},
#line 49 "celephem/customorbit.gperf"
      {"jpl-jupiter-ssb", CustomOrbitType::JplJupiterSsb},
#line 87 "celephem/customorbit.gperf"
      {"triton",          CustomOrbitType::Triton},
#line 50 "celephem/customorbit.gperf"
      {"jpl-saturn-ssb",  CustomOrbitType::JplSaturnSsb},
#line 51 "celephem/customorbit.gperf"
      {"jpl-uranus-ssb",  CustomOrbitType::JplUranusSsb},
#line 36 "celephem/customorbit.gperf"
      {"venus-jpl",       CustomOrbitType::JplVenusSun},
#line 64 "celephem/customorbit.gperf"
      {"htc20-telesto",   CustomOrbitType::Telesto},
#line 76 "celephem/customorbit.gperf"
      {"dione",           CustomOrbitType::TASS17Dione},
#line 19 "celephem/customorbit.gperf"
      {"pluto",           CustomOrbitType::Pluto},
#line 58 "celephem/customorbit.gperf"
      {"jpl-moon-earth",  CustomOrbitType::JplMoonEarth},
#line 70 "celephem/customorbit.gperf"
      {"europa",          CustomOrbitType::Europa},
      {""},
#line 80 "celephem/customorbit.gperf"
      {"iapetus",         CustomOrbitType::TASS17Iapetus},
#line 10 "celephem/customorbit.gperf"
      {"mercury",         CustomOrbitType::Mercury},
#line 77 "celephem/customorbit.gperf"
      {"rhea",            CustomOrbitType::TASS17Rhea},
      {""},
#line 84 "celephem/customorbit.gperf"
      {"umbriel",         CustomOrbitType::Umbriel},
#line 68 "celephem/customorbit.gperf"
      {"deimos",          CustomOrbitType::Deimos},
#line 85 "celephem/customorbit.gperf"
      {"titania",         CustomOrbitType::Titania},
      {""}, {""},
#line 98 "celephem/customorbit.gperf"
      {"vsop87-neptune",  CustomOrbitType::VSOP87Neptune},
#line 15 "celephem/customorbit.gperf"
      {"jupiter",         CustomOrbitType::Jupiter},
#line 26 "celephem/customorbit.gperf"
      {"jpl-mercury-sun", CustomOrbitType::JplMercurySun},
      {""}, {""}, {""},
#line 93 "celephem/customorbit.gperf"
      {"vsop87-earth",    CustomOrbitType::VSOP87Earth},
#line 45 "celephem/customorbit.gperf"
      {"jpl-mercury-ssb", CustomOrbitType::JplMercurySsb},
      {""}, {""}, {""},
#line 65 "celephem/customorbit.gperf"
      {"htc20-calypso",   CustomOrbitType::Calypso},
      {""}, {""}, {""}, {""}, {""},
#line 91 "celephem/customorbit.gperf"
      {"vsop87-mercury",  CustomOrbitType::VSOP87Mercury},
      {""},
#line 35 "celephem/customorbit.gperf"
      {"mercury-jpl",     CustomOrbitType::JplMercurySun},
#line 75 "celephem/customorbit.gperf"
      {"tethys",          CustomOrbitType::TASS17Tethys},
      {""}, {""}, {""}, {""}, {""},
#line 95 "celephem/customorbit.gperf"
      {"vsop87-jupiter",  CustomOrbitType::VSOP87Jupiter},
      {""}, {""}, {""}, {""}, {""}, {""}, {""}, {""}, {""},
      {""},
#line 83 "celephem/customorbit.gperf"
      {"ariel",           CustomOrbitType::Ariel}
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
