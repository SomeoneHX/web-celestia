/* C++ code produced by gperf version 3.0.3 */
/* Command-line: /Library/Developer/CommandLineTools/usr/bin/gperf -m4 --output-file=native/generated/commands.inc celscript/legacy/commands.gperf  */
/* Computed positions: -k'1,4' */

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

#line 8 "celscript/legacy/commands.gperf"
struct LegacyCommand { const char* name; ParseCommandPtr parser; };
/* maximum key range = 58, duplicates = 0 */

class LegacyCommands
{
private:
  static inline unsigned int hash (const char *str, unsigned int len);
public:
  static const struct LegacyCommand *getCommand (const char *str, unsigned int len);
};

inline unsigned int
LegacyCommands::hash (register const char *str, register unsigned int len)
{
  static const unsigned char asso_values[] =
    {
      61, 61, 61, 61, 61, 61, 61, 61, 61, 61,
      61, 61, 61, 61, 61, 61, 61, 61, 61, 61,
      61, 61, 61, 61, 61, 61, 61, 61, 61, 61,
      61, 61, 61, 61, 61, 61, 61, 61, 61, 61,
      61, 61, 61, 61, 61, 61, 61, 61, 61, 61,
      61, 61, 61, 61, 61, 61, 61, 61, 61, 61,
      61, 61, 61, 61, 61, 61, 61, 61, 61, 61,
      61, 61, 61, 61, 61, 61, 61, 61, 61, 61,
      61, 61, 61, 61, 61, 61, 61, 61, 61, 61,
      61, 61, 61, 61, 61, 61, 61, 61, 36, 10,
      25, 48,  0,  0, 35, 61, 18, 61, 22,  6,
      61, 32,  0, 23,  0,  0, 16,  5, 24, 20,
      10, 61,  1, 61, 61, 61, 61, 61, 61, 61,
      61, 61, 61, 61, 61, 61, 61, 61, 61, 61,
      61, 61, 61, 61, 61, 61, 61, 61, 61, 61,
      61, 61, 61, 61, 61, 61, 61, 61, 61, 61,
      61, 61, 61, 61, 61, 61, 61, 61, 61, 61,
      61, 61, 61, 61, 61, 61, 61, 61, 61, 61,
      61, 61, 61, 61, 61, 61, 61, 61, 61, 61,
      61, 61, 61, 61, 61, 61, 61, 61, 61, 61,
      61, 61, 61, 61, 61, 61, 61, 61, 61, 61,
      61, 61, 61, 61, 61, 61, 61, 61, 61, 61,
      61, 61, 61, 61, 61, 61, 61, 61, 61, 61,
      61, 61, 61, 61, 61, 61, 61, 61, 61, 61,
      61, 61, 61, 61, 61, 61, 61, 61, 61, 61,
      61, 61, 61, 61, 61, 61, 61
    };
  register unsigned int hval = len;

  switch (hval)
    {
      default:
        hval += asso_values[(unsigned char)str[3]+1];
      /*FALLTHROUGH*/
      case 3:
      case 2:
      case 1:
        hval += asso_values[(unsigned char)str[0]];
        break;
    }
  return hval;
}

const struct LegacyCommand *
LegacyCommands::getCommand (register const char *str, register unsigned int len)
{
  enum
    {
      TOTAL_KEYWORDS = 57,
      MIN_WORD_LENGTH = 3,
      MAX_WORD_LENGTH = 23,
      MIN_HASH_VALUE = 3,
      MAX_HASH_VALUE = 60
    };

  static const struct LegacyCommand wordlist[] =
    {
      {""}, {""}, {""},
#line 11 "celscript/legacy/commands.gperf"
      {"set",                     &parseSetCommand},
#line 15 "celscript/legacy/commands.gperf"
      {"goto",                    &parseGotoCommand},
#line 62 "celscript/legacy/commands.gperf"
      {"play",                    &parsePlayCommand},
#line 12 "celscript/legacy/commands.gperf"
      {"select",                  &parseSelectCommand},
#line 17 "celscript/legacy/commands.gperf"
      {"gotoloc",                 &parseGotoLocCommand},
#line 13 "celscript/legacy/commands.gperf"
      {"setframe",                &parseSetFrameCommand},
#line 58 "celscript/legacy/commands.gperf"
      {"setradius",               &parseSetRadiusCommand},
#line 34 "celscript/legacy/commands.gperf"
      {"move",                    &parseMoveCommand},
#line 16 "celscript/legacy/commands.gperf"
      {"gotolonglat",             &parseGotoLongLatCommand},
#line 20 "celscript/legacy/commands.gperf"
      {"follow",                  &parseParameterlessCommand<CommandFollow>},
#line 28 "celscript/legacy/commands.gperf"
      {"cls",                     &parseParameterlessCommand<CommandClearScreen>},
#line 36 "celscript/legacy/commands.gperf"
      {"setorientation",          &parseSetOrientationCommand},
#line 66 "celscript/legacy/commands.gperf"
      {"setringstexture",         &parseSetRingsTextureCommand},
#line 48 "celscript/legacy/commands.gperf"
      {"preloadtex",              &parsePreloadTexCommand},
#line 61 "celscript/legacy/commands.gperf"
      {"settextcolor",            &parseSetTextColorCommand},
#line 59 "celscript/legacy/commands.gperf"
      {"setlinecolor",            &parseSetLineColorCommand},
#line 60 "celscript/legacy/commands.gperf"
      {"setlabelcolor",           &parseSetLabelColorCommand},
#line 29 "celscript/legacy/commands.gperf"
      {"time",                    &parseTimeCommand},
#line 19 "celscript/legacy/commands.gperf"
      {"center",                  &parseCenterCommand},
#line 52 "celscript/legacy/commands.gperf"
      {"capture",                 &parseCaptureCommand},
#line 44 "celscript/legacy/commands.gperf"
      {"setfaintestautomag45deg", &parseSetFaintestAutoMag45DegCommand},
#line 30 "celscript/legacy/commands.gperf"
      {"timerate",                &parseTimeRateCommand},
#line 47 "celscript/legacy/commands.gperf"
      {"settextureresolution",    &parseSetTextureResolutionCommand},
#line 14 "celscript/legacy/commands.gperf"
      {"setsurface",              &parseSetSurfaceCommand},
#line 54 "celscript/legacy/commands.gperf"
      {"splitview",               &parseSplitViewCommand},
#line 39 "celscript/legacy/commands.gperf"
      {"labels",                  &parseLabelsCommand},
#line 10 "celscript/legacy/commands.gperf"
      {"wait",                    &parseWaitCommand},
#line 18 "celscript/legacy/commands.gperf"
      {"seturl",                  &parseSetUrlCommand},
#line 23 "celscript/legacy/commands.gperf"
      {"chase",                   &parseParameterlessCommand<CommandChase>},
#line 49 "celscript/legacy/commands.gperf"
      {"mark",                    &parseMarkCommand},
#line 65 "celscript/legacy/commands.gperf"
      {"setwindowbordersvisible", &parseSetWindowBordersVisibleCommand},
#line 35 "celscript/legacy/commands.gperf"
      {"setposition",             &parseSetPositionCommand},
#line 55 "celscript/legacy/commands.gperf"
      {"deleteview",              &parseDeleteViewCommand},
#line 21 "celscript/legacy/commands.gperf"
      {"synchronous",             &parseParameterlessCommand<CommandSynchronous>},
#line 27 "celscript/legacy/commands.gperf"
      {"print",                   &parsePrintCommand},
#line 43 "celscript/legacy/commands.gperf"
      {"setvisibilitylimit",      &parseSetVisibilityLimitCommand},
#line 63 "celscript/legacy/commands.gperf"
      {"overlay",                 &parseOverlayCommand},
#line 41 "celscript/legacy/commands.gperf"
      {"constellations",          &parseConstellationsCommand},
#line 25 "celscript/legacy/commands.gperf"
      {"cancel",                  &parseParameterlessCommand<CommandCancel>},
#line 33 "celscript/legacy/commands.gperf"
      {"rotate",                  &parseRotateCommand},
#line 64 "celscript/legacy/commands.gperf"
      {"verbosity",               &parseVerbosityCommand},
#line 42 "celscript/legacy/commands.gperf"
      {"constellationcolor",      &parseConstellationColorCommand},
#line 56 "celscript/legacy/commands.gperf"
      {"singleview",              &parseParameterlessCommand<CommandSingleView>},
#line 24 "celscript/legacy/commands.gperf"
      {"track",                   &parseParameterlessCommand<CommandTrack>},
#line 50 "celscript/legacy/commands.gperf"
      {"unmark",                  &parseUnmarkCommand},
#line 22 "celscript/legacy/commands.gperf"
      {"lock",                    &parseParameterlessCommand<CommandLock>},
#line 57 "celscript/legacy/commands.gperf"
      {"setactiveview",           &parseSetActiveViewCommand},
#line 51 "celscript/legacy/commands.gperf"
      {"unmarkall",               &parseParameterlessCommand<CommandUnmarkAll>},
#line 45 "celscript/legacy/commands.gperf"
      {"setambientlight",         &parseSetAmbientLightCommand},
#line 37 "celscript/legacy/commands.gperf"
      {"lookback",                &parseParameterlessCommand<CommandLookBack>},
#line 46 "celscript/legacy/commands.gperf"
      {"setgalaxylightgain",      &parseSetGalaxyLightGainCommand},
      {""},
#line 32 "celscript/legacy/commands.gperf"
      {"orbit",                   &parseOrbitCommand},
#line 31 "celscript/legacy/commands.gperf"
      {"changedistance",          &parseChangeDistanceCommand},
#line 26 "celscript/legacy/commands.gperf"
      {"exit",                    &parseParameterlessCommand<CommandExit>},
#line 53 "celscript/legacy/commands.gperf"
      {"renderpath",              &parseParameterlessCommand<CommandNoOp>},
#line 38 "celscript/legacy/commands.gperf"
      {"renderflags",             &parseRenderFlagsCommand},
#line 40 "celscript/legacy/commands.gperf"
      {"orbitflags",              &parseOrbitFlagsCommand}
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
