/* C++ code produced by gperf version 3.0.3 */
/* Command-line: /Library/Developer/CommandLineTools/usr/bin/gperf -m4 --output-file=native/generated/customrotation.inc /Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf  */
/* Computed positions: -k'5,8' */

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

#line 8 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
struct CustomRotationEntry { const char* name; CustomRotationModelType modelType; };
/* maximum key range = 43, duplicates = 0 */

class CustomRotationMap
{
private:
  static inline unsigned int hash (const char *str, unsigned int len);
public:
  static const struct CustomRotationEntry *getModelType (const char *str, unsigned int len);
};

inline unsigned int
CustomRotationMap::hash (const char *str, unsigned int len)
{
  static const unsigned char asso_values[] =
    {
      49, 49, 49, 49, 49, 49, 49, 49, 49, 49,
      49, 49, 49, 49, 49, 49, 49, 49, 49, 49,
      49, 49, 49, 49, 49, 49, 49, 49, 49, 49,
      49, 49, 49, 49, 49, 49, 49, 49, 49, 49,
      49, 49, 49, 49, 49, 49, 49, 49,  9, 49,
      49, 49, 49, 49, 49, 49, 49, 49, 49, 49,
      49, 49, 49, 49, 49, 49, 49, 49, 49, 49,
      49, 49, 49, 49, 49, 49, 49, 49, 49, 49,
      49, 49, 49, 49, 49, 49, 49, 49, 49, 49,
      49, 49, 49, 49, 49, 49, 49,  6, 30, 20,
      16,  0, 49, 23, 28,  0, 35, 49, 12,  8,
      12,  9,  0, 49, 17, 16,  3,  7, 29, 49,
      49, 12, 49, 49, 49, 49, 49, 49, 49, 49,
      49, 49, 49, 49, 49, 49, 49, 49, 49, 49,
      49, 49, 49, 49, 49, 49, 49, 49, 49, 49,
      49, 49, 49, 49, 49, 49, 49, 49, 49, 49,
      49, 49, 49, 49, 49, 49, 49, 49, 49, 49,
      49, 49, 49, 49, 49, 49, 49, 49, 49, 49,
      49, 49, 49, 49, 49, 49, 49, 49, 49, 49,
      49, 49, 49, 49, 49, 49, 49, 49, 49, 49,
      49, 49, 49, 49, 49, 49, 49, 49, 49, 49,
      49, 49, 49, 49, 49, 49, 49, 49, 49, 49,
      49, 49, 49, 49, 49, 49, 49, 49, 49, 49,
      49, 49, 49, 49, 49, 49, 49, 49, 49, 49,
      49, 49, 49, 49, 49, 49, 49, 49, 49, 49,
      49, 49, 49, 49, 49, 49
    };
  unsigned int hval = len;

  switch (hval)
    {
      default:
        hval += asso_values[(unsigned char)str[7]];
      /*FALLTHROUGH*/
      case 7:
      case 6:
      case 5:
        hval += asso_values[(unsigned char)str[4]];
        break;
    }
  return hval;
}

const struct CustomRotationEntry *
CustomRotationMap::getModelType (const char *str, unsigned int len)
{
  enum
    {
      TOTAL_KEYWORDS = 41,
      MIN_WORD_LENGTH = 6,
      MAX_WORD_LENGTH = 14,
      MIN_HASH_VALUE = 6,
      MAX_HASH_VALUE = 48
    };

  static const struct CustomRotationEntry wordlist[] =
    {
      {""}, {""}, {""}, {""}, {""}, {""},
#line 26 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"iau-io",         CustomRotationModelType::IAUIo},
#line 30 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"iau-pan",        CustomRotationModelType::IAUPan},
      {""}, {""},
#line 44 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"iau-phoebe",     CustomRotationModelType::IAUPhoebe},
#line 43 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"iau-iapetus",    CustomRotationModelType::IAUIapetus},
#line 18 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"iau-pluto",      CustomRotationModelType::IAUPluto},
#line 35 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"iau-enceladus",  CustomRotationModelType::IAUEnceladus},
#line 37 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"iau-telesto",    CustomRotationModelType::IAUTelesto},
#line 46 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"iau-ariel",      CustomRotationModelType::IAUAriel},
#line 50 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"iau-triton",     CustomRotationModelType::IAUTriton},
#line 22 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"iau-metis",      CustomRotationModelType::IAUMetis},
#line 42 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"iau-titan",      CustomRotationModelType::IAUTitan},
#line 27 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"iau-europa",     CustomRotationModelType::IAUEuropa},
#line 48 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"iau-titania",    CustomRotationModelType::IAUTitania},
#line 31 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"iau-atlas",      CustomRotationModelType::IAUAtlas},
#line 32 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"iau-prometheus", CustomRotationModelType::IAUPrometheus},
#line 34 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"iau-mimas",      CustomRotationModelType::IAUMimas},
#line 23 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"iau-adrastea",   CustomRotationModelType::IAUAdrastea},
#line 45 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"iau-miranda",    CustomRotationModelType::IAUMiranda},
#line 17 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"iau-neptune",    CustomRotationModelType::IAUNeptune},
#line 33 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"iau-pandora",    CustomRotationModelType::IAUPandora},
#line 19 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"iau-moon",       CustomRotationModelType::IAUMoon},
#line 16 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"iau-uranus",     CustomRotationModelType::IAUUranus},
#line 24 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"iau-amalthea",   CustomRotationModelType::IAUAmalthea},
#line 41 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"iau-rhea",       CustomRotationModelType::IAURhea},
#line 13 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"iau-mars",       CustomRotationModelType::IAUMars},
#line 15 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"iau-saturn",     CustomRotationModelType::IAUSaturn},
#line 21 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"iau-deimos",     CustomRotationModelType::IAUDeimos},
#line 47 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"iau-umbriel",    CustomRotationModelType::IAUUmbriel},
#line 49 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"iau-oberon",     CustomRotationModelType::IAUOberon},
#line 39 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"iau-dione",      CustomRotationModelType::IAUDione},
#line 40 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"iau-helene",     CustomRotationModelType::IAUHelene},
#line 11 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"iau-mercury",    CustomRotationModelType::IAUMercury},
#line 20 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"iau-phobos",     CustomRotationModelType::IAUPhobos},
#line 36 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"iau-tethys",     CustomRotationModelType::IAUTethys},
#line 25 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"iau-thebe",      CustomRotationModelType::IAUThebe},
#line 38 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"iau-calypso",    CustomRotationModelType::IAUCalypso},
#line 29 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"iau-callisto",   CustomRotationModelType::IAUCallisto},
#line 12 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"iau-venus",      CustomRotationModelType::IAUVenus},
#line 14 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"iau-jupiter",    CustomRotationModelType::IAUJupiter},
#line 28 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"iau-ganymede",   CustomRotationModelType::IAUGanymede},
#line 10 "/Users/hxun/Documents/Celestia/src/celephem/customrotation.gperf"
      {"earth-p03lp",    CustomRotationModelType::EarthP03lp}
    };

  if (len <= MAX_WORD_LENGTH && len >= MIN_WORD_LENGTH)
    {
      unsigned int key = hash (str, len);

      if (key <= MAX_HASH_VALUE)
        {
          const char *s = wordlist[key].name;

          if (*str == *s && !strncmp (str + 1, s + 1, len - 1) && s[len] == '\0')
            return &wordlist[key];
        }
    }
  return 0;
}
