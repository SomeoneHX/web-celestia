/* C++ code produced by gperf version 3.0.3 */
/* Command-line: /Library/Developer/CommandLineTools/usr/bin/gperf -m4 --output-file=native/generated/parser.inc celutil/parser.gperf  */
/* Computed positions: -k'1,$' */

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

#line 8 "celutil/parser.gperf"
struct UnitsMapEntry { const char* name; MeasurementUnit unit; };
/* maximum key range = 27, duplicates = 0 */

class UnitsMap
{
private:
  static inline unsigned int hash (const char *str, unsigned int len);
public:
  static const struct UnitsMapEntry *parseUnit (const char *str, unsigned int len);
};

inline unsigned int
UnitsMap::hash (register const char *str, register unsigned int len)
{
  static const unsigned char asso_values[] =
    {
      28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
      28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
      28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
      28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
      28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
      28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
      28, 28, 28, 28, 28, 10, 28, 28, 28, 13,
      28, 28, 28, 28, 11, 28, 28, 18, 28, 28,
      28, 28, 28, 20, 28, 13, 28, 28, 28, 28,
      28, 28, 28, 28, 28, 28, 28,  1, 28,  6,
       3, 28, 28,  2, 11, 28, 28,  2, 10,  1,
       8, 28, 12, 28,  4,  0, 28, 15, 28, 28,
      28, 10, 28, 28, 28, 28, 28, 28, 28, 28,
      28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
      28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
      28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
      28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
      28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
      28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
      28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
      28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
      28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
      28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
      28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
      28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
      28, 28, 28, 28, 28, 28
    };
  return len + asso_values[(unsigned char)str[len - 1]] + asso_values[(unsigned char)str[0]];
}

const struct UnitsMapEntry *
UnitsMap::parseUnit (register const char *str, register unsigned int len)
{
  enum
    {
      TOTAL_KEYWORDS = 26,
      MIN_WORD_LENGTH = 1,
      MAX_WORD_LENGTH = 6,
      MIN_HASH_VALUE = 1,
      MAX_HASH_VALUE = 27
    };

  static const struct UnitsMapEntry wordlist[] =
    {
      {""},
#line 24 "celutil/parser.gperf"
      {"s",      astro::TimeUnit::Second},
      {""},
#line 12 "celutil/parser.gperf"
      {"m",      astro::LengthUnit::Meter},
#line 30 "celutil/parser.gperf"
      {"mas",    astro::AngleUnit::Milliarcsecond},
#line 11 "celutil/parser.gperf"
      {"km",     astro::LengthUnit::Kilometer},
#line 37 "celutil/parser.gperf"
      {"kg",     astro::MassUnit::Kilogram},
#line 27 "celutil/parser.gperf"
      {"d",      astro::TimeUnit::Day},
#line 33 "celutil/parser.gperf"
      {"deg",    astro::AngleUnit::Degree},
#line 13 "celutil/parser.gperf"
      {"cm",     astro::LengthUnit::Centimeter},
#line 35 "celutil/parser.gperf"
      {"rad",    astro::AngleUnit::Radian},
#line 21 "celutil/parser.gperf"
      {"kpc",    astro::LengthUnit::Kiloparsec},
#line 25 "celutil/parser.gperf"
      {"min",    astro::TimeUnit::Minute},
#line 31 "celutil/parser.gperf"
      {"arcsec", astro::AngleUnit::Arcsecond},
#line 39 "celutil/parser.gperf"
      {"mJ",     astro::MassUnit::JupiterMass},
#line 32 "celutil/parser.gperf"
      {"arcmin", astro::AngleUnit::Arcminute},
#line 38 "celutil/parser.gperf"
      {"mE",     astro::MassUnit::EarthMass},
#line 15 "celutil/parser.gperf"
      {"rJ",     astro::LengthUnit::JupiterRadius},
#line 17 "celutil/parser.gperf"
      {"au",     astro::LengthUnit::AstronomicalUnit},
#line 14 "celutil/parser.gperf"
      {"rE",     astro::LengthUnit::EarthRadius},
#line 20 "celutil/parser.gperf"
      {"pc",     astro::LengthUnit::Parsec},
#line 28 "celutil/parser.gperf"
      {"y",      astro::TimeUnit::JulianYear},
#line 19 "celutil/parser.gperf"
      {"ly",     astro::LengthUnit::LightYear},
#line 26 "celutil/parser.gperf"
      {"h",      astro::TimeUnit::Hour},
#line 34 "celutil/parser.gperf"
      {"hRA",    astro::AngleUnit::Hour},
#line 18 "celutil/parser.gperf"
      {"AU",     astro::LengthUnit::AstronomicalUnit},
#line 16 "celutil/parser.gperf"
      {"rS",     astro::LengthUnit::SolarRadius},
#line 22 "celutil/parser.gperf"
      {"Mpc",    astro::LengthUnit::Megaparsec}
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
