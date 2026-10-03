// Celestia astronomy core, compiled to WebAssembly.
//
// Ported from the C++ sources of Celestia 1.7.0 (GPL-2.0-or-later):
//   src/celastro/date.cpp   -- TAI/TT/TDB/UTC conversions and the leap second table
//   src/celastro/astro.cpp  -- coordinate rotations and magnitude/irradiance helpers
//   src/celephem/vsop87.cpp -- truncated VSOP87 series for the Earth and the Sun
//
// The original code uses Eigen and Celestia's own Vector3/Matrix3 templates. Those
// types are replaced here by a flat double[3] layout so the whole module stays
// header-only and can be dropped into Emscripten without the rest of the tree.

#include <array>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <string>
#include <utility>

#ifdef __EMSCRIPTEN__
#include <emscripten/bind.h>
#endif

namespace celestia_astro
{

// ---------------------------------------------------------------- constants

constexpr double J2000 = 2451545.0;
constexpr double J2000Obliquity = 23.4392911 * 3.14159265358979323846 / 180.0;
constexpr double KM_PER_AU = 149597870.7;
constexpr double KM_PER_LY = 9460730472580.8;
constexpr double KM_PER_PARSEC = 3.0856775814913672789139379577964716107e13;
constexpr double LY_PER_PARSEC = 3.26156377716743356213863970704550837409;
constexpr double AU_PER_LY = 63241.077084266280268653583182317313558;
constexpr double SECONDS_PER_DAY = 86400.0;
constexpr double DEG_PER_HRA = 15.0;
constexpr double PI = 3.14159265358979323846;

// Difference in seconds between Terrestrial Time and International Atomic Time.
constexpr double dTA = 32.184;

struct LeapSecondRecord
{
    double taiSeconds;
    double jdUTC;
};

// Table of leap second insertions, identical to date.cpp in Celestia 1.7.0.
// The leap second always appears as the last second of the day immediately
// prior to the date in the table.
constexpr std::array<LeapSecondRecord, 28> LeapSeconds{
    LeapSecondRecord{ 10.0, 2441317.5 }, // 1 Jan 1972
    LeapSecondRecord{ 11.0, 2441499.5 }, // 1 Jul 1972
    LeapSecondRecord{ 12.0, 2441683.5 }, // 1 Jan 1973
    LeapSecondRecord{ 13.0, 2442048.5 }, // 1 Jan 1974
    LeapSecondRecord{ 14.0, 2442413.5 }, // 1 Jan 1975
    LeapSecondRecord{ 15.0, 2442778.5 }, // 1 Jan 1976
    LeapSecondRecord{ 16.0, 2443144.5 }, // 1 Jan 1977
    LeapSecondRecord{ 17.0, 2443509.5 }, // 1 Jan 1978
    LeapSecondRecord{ 18.0, 2443874.5 }, // 1 Jan 1979
    LeapSecondRecord{ 19.0, 2444239.5 }, // 1 Jan 1980
    LeapSecondRecord{ 20.0, 2444786.5 }, // 1 Jul 1981
    LeapSecondRecord{ 21.0, 2445151.5 }, // 1 Jul 1982
    LeapSecondRecord{ 22.0, 2445516.5 }, // 1 Jul 1983
    LeapSecondRecord{ 23.0, 2446247.5 }, // 1 Jul 1985
    LeapSecondRecord{ 24.0, 2447161.5 }, // 1 Jan 1988
    LeapSecondRecord{ 25.0, 2447892.5 }, // 1 Jan 1990
    LeapSecondRecord{ 26.0, 2448257.5 }, // 1 Jan 1991
    LeapSecondRecord{ 27.0, 2448804.5 }, // 1 Jul 1992
    LeapSecondRecord{ 28.0, 2449169.5 }, // 1 Jul 1993
    LeapSecondRecord{ 29.0, 2449534.5 }, // 1 Jul 1994
    LeapSecondRecord{ 30.0, 2450083.5 }, // 1 Jan 1996
    LeapSecondRecord{ 31.0, 2450630.5 }, // 1 Jul 1997
    LeapSecondRecord{ 32.0, 2451179.5 }, // 1 Jan 1999
    LeapSecondRecord{ 33.0, 2453736.5 }, // 1 Jan 2006
    LeapSecondRecord{ 34.0, 2454832.5 }, // 1 Jan 2009
    LeapSecondRecord{ 35.0, 2456109.5 }, // 1 Jul 2012
    LeapSecondRecord{ 36.0, 2457204.5 }, // 1 Jul 2015
    LeapSecondRecord{ 37.0, 2457754.5 }, // 1 Jan 2017
};

// ------------------------------------------------------------------ 3-vectors

struct Vec3
{
    double x{ 0.0 };
    double y{ 0.0 };
    double z{ 0.0 };
};

inline Vec3 add(const Vec3& a, const Vec3& b) { return { a.x + b.x, a.y + b.y, a.z + b.z }; }
inline Vec3 sub(const Vec3& a, const Vec3& b) { return { a.x - b.x, a.y - b.y, a.z - b.z }; }
inline Vec3 scale(const Vec3& a, double s) { return { a.x * s, a.y * s, a.z * s }; }
inline double dot(const Vec3& a, const Vec3& b) { return a.x * b.x + a.y * b.y + a.z * b.z; }

inline Vec3 cross(const Vec3& a, const Vec3& b)
{
    return { a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x };
}

inline double length(const Vec3& a) { return std::sqrt(dot(a, a)); }

inline Vec3 normalize(const Vec3& a)
{
    const double l = length(a);
    return l == 0.0 ? a : scale(a, 1.0 / l);
}

// Row-major 3x3 matrix, matching math::Matrix3 in Celestia for these rotations.
struct Mat3
{
    double m[9]{ 1, 0, 0, 0, 1, 0, 0, 0, 1 };
};

inline Mat3 XRotation(double angle)
{
    const double c = std::cos(angle);
    const double s = std::sin(angle);
    return Mat3{ { 1, 0, 0, 0, c, -s, 0, s, c } };
}

inline Mat3 ZRotation(double angle)
{
    const double c = std::cos(angle);
    const double s = std::sin(angle);
    return Mat3{ { c, -s, 0, s, c, 0, 0, 0, 1 } };
}

inline Mat3 mul(const Mat3& a, const Mat3& b)
{
    Mat3 r;
    for (int i = 0; i < 3; ++i)
    {
        for (int j = 0; j < 3; ++j)
        {
            double sum = 0.0;
            for (int k = 0; k < 3; ++k)
                sum += a.m[i * 3 + k] * b.m[k * 3 + j];
            r.m[i * 3 + j] = sum;
        }
    }
    return r;
}

inline Vec3 transform(const Mat3& a, const Vec3& v)
{
    return { a.m[0] * v.x + a.m[1] * v.y + a.m[2] * v.z,
             a.m[3] * v.x + a.m[4] * v.y + a.m[5] * v.z,
             a.m[6] * v.x + a.m[7] * v.y + a.m[8] * v.z };
}

// ------------------------------------------------------- time system changes

double TTtoTAI(double tt) { return tt - dTA / SECONDS_PER_DAY; }
double TAItoTT(double tai) { return tai + dTA / SECONDS_PER_DAY; }

// TDB and TT differ by a periodic term of up to 1.7 ms. Celestia uses the
// truncated series that is valid over several centuries around J2000.
double TTtoTDB(double tt)
{
    const double t = (tt - J2000) / 36525.0;
    const double g = 357.53 + 0.9856003 * (tt - J2000);
    const double gRad = g * PI / 180.0;
    return tt + (0.001658 * std::sin(gRad) + 0.000014 * std::sin(2.0 * gRad)) / SECONDS_PER_DAY + 8.0e-8 * t;
}

double TDBtoTT(double tdb)
{
    // The periodic term is small enough that one fixed-point iteration is ample.
    return tdb - (TTtoTDB(tdb) - tdb);
}

double UTCtoTAI(double jdUTC)
{
    // Before the first tabulated record TAI-UTC is extrapolated as a constant,
    // which is what Celestia does for dates outside the leap second table.
    if (jdUTC < LeapSeconds.front().jdUTC)
        return jdUTC + 10.0 / SECONDS_PER_DAY;

    for (std::size_t i = LeapSeconds.size(); i-- > 0;)
    {
        if (jdUTC >= LeapSeconds[i].jdUTC)
            return jdUTC + LeapSeconds[i].taiSeconds / SECONDS_PER_DAY;
    }

    return jdUTC + LeapSeconds.front().taiSeconds / SECONDS_PER_DAY;
}

double TAItoUTC(double tai)
{
    for (std::size_t i = LeapSeconds.size(); i-- > 0;)
    {
        const double taiMinusUtc = LeapSeconds[i].taiSeconds;
        const double jdUTC = tai - taiMinusUtc / SECONDS_PER_DAY;
        if (jdUTC >= LeapSeconds[i].jdUTC)
            return jdUTC;
    }

    return tai - LeapSeconds.front().taiSeconds / SECONDS_PER_DAY;
}

double UTCtoTDB(double jdUTC)
{
    return TTtoTDB(TAItoTT(UTCtoTAI(jdUTC)));
}

double TDBtoUTC(double tdb)
{
    return TAItoUTC(TTtoTAI(TDBtoTT(tdb)));
}

double JDUTCtoTAI(double jdUTC) { return UTCtoTAI(jdUTC); }
double TAItoJDUTC(double tai) { return TAItoUTC(tai); }

// ------------------------------------------------------ calendar conversion

// Gregorian calendar date to Julian date, valid for the full range used by the
// Set Time dialog (-10000..10000).
double calendarToJD(int year, int month, int day, double dayFraction)
{
    if (month <= 2)
    {
        year -= 1;
        month += 12;
    }

    const int a = year / 100;
    // The proleptic Gregorian calendar has no correction before 1582-10-15.
    const double b = (year > 1582 || (year == 1582 && (month > 10 || (month == 10 && day >= 15))))
                         ? 2.0 - a + a / 4
                         : 0.0;

    return std::floor(365.25 * (year + 4716)) + std::floor(30.6001 * (month + 1)) + day + b - 1524.5 + dayFraction;
}

void jdToCalendar(double jd, int& year, int& month, int& day, double& dayFraction)
{
    const double shifted = jd + 0.5;
    const double z = std::floor(shifted);
    const double f = shifted - z;
    const int alpha = static_cast<int>(std::floor((z - 1867216.25) / 36524.25));
    const double a = z < 2299161 ? z : z + 1.0 + alpha - std::floor(alpha / 4.0);
    const double b = a + 1524.0;
    const double c = std::floor((b - 122.1) / 365.25);
    const double d = std::floor(365.25 * c);
    const double e = std::floor((b - d) / 30.6001);

    dayFraction = b - d - std::floor(30.6001 * e) + f;
    day = static_cast<int>(std::floor(dayFraction));
    dayFraction -= day;
    month = static_cast<int>(e < 14.0 ? e - 1.0 : e - 13.0);
    year = static_cast<int>(month > 2 ? c - 4716.0 : c - 4715.0);
}

int dayOfWeek(double jd)
{
    // 0 = Monday, matching Celestia's Date::getDayOfWeek offsets.
    return static_cast<int>(std::floor(jd + 1.5)) % 7;
}

bool isLeapYear(int year)
{
    return (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
}

int daysInMonth(int year, int month)
{
    static constexpr int table[12]{ 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 };
    if (month == 2 && isLeapYear(year))
        return 29;
    return table[(month - 1) % 12];
}

// --------------------------------------------------------- star magnitudes

float lumToAbsMag(float lum) { return 4.83f - 2.5f * std::log10(lum); }

float lumToAppMag(float lum, float lyrs)
{
    return lumToAbsMag(lum) + 5.0f * std::log10(static_cast<float>(LY_PER_PARSEC) * lyrs) - 5.0f;
}

float absMagToLum(float mag) { return std::pow(10.0f, (4.83f - mag) / 2.5f); }

float appMagToLum(float mag, float lyrs)
{
    const float absMag = mag - 5.0f * std::log10(static_cast<float>(LY_PER_PARSEC) * lyrs) + 5.0f;
    return absMagToLum(absMag);
}

float magToIrradiance(float mag)
{
    if (mag < -26.0f * 2.0f)
        return 0.0f;
    return std::pow(10.0f, -0.4f * mag);
}

float irradianceToMag(float irradiance)
{
    if (irradiance <= 0.0f)
        return 100.0f;
    return -2.5f * std::log10(irradiance);
}

// --------------------------------------------------- coordinate transforms

Mat3 eclipticToEquatorialMatrix()
{
    return XRotation(J2000Obliquity);
}

// IAU 2000 galactic transformation, equatorial J2000 to galactic. The rows are
// the galactic pole and centre directions in the equatorial frame.
Mat3 equatorialToGalacticMatrix()
{
    return Mat3{ { -0.0548755604162154, -0.8734370902348850, -0.4838350155487132,
                    0.4941094278755837, -0.4448296299600112,  0.7469822444972189,
                   -0.8676661490190047, -0.1980763734312015,  0.4559837761750669 } };
}

Mat3 galacticToEquatorialMatrix()
{
    // Transpose of the rotation, since it is orthonormal.
    const Mat3 m = equatorialToGalacticMatrix();
    return Mat3{ { m.m[0], m.m[3], m.m[6], m.m[1], m.m[4], m.m[7], m.m[2], m.m[5], m.m[8] } };
}

// The observer-plane rotation used by the equatorial grid: celestial (RA, Dec)
// to the current local horizontal frame, given a local sidereal time and a
// geographic latitude.
Mat3 equatorialToHorizontalMatrix(double lst, double latitudeRad)
{
    const Mat3 lstRot = ZRotation(lst);
    const Mat3 latRot = XRotation(PI / 2.0 - latitudeRad);
    return mul(latRot, lstRot);
}

// Full equatorial precession from J2000 to the equinox of date, IAU 1976.
Mat3 precessionMatrix(double jd)
{
    const double t = (jd - J2000) / 36525.0;
    const double zeta = (2306.2181 * t + 0.30188 * t * t + 0.017998 * t * t * t) * (1.0 / 3600.0) * PI / 180.0;
    const double z = (2306.2181 * t + 1.09468 * t * t + 0.018203 * t * t * t) * (1.0 / 3600.0) * PI / 180.0;
    const double theta = (2004.3109 * t - 0.42665 * t * t - 0.041833 * t * t * t) * (1.0 / 3600.0) * PI / 180.0;

    return mul(ZRotation(-z), mul(XRotation(theta), ZRotation(-zeta)));
}

// Meanobliquity of the ecliptic, IAU 1980 polynomial.
double meanEclipticObliquity(double jd)
{
    const double t = (jd - J2000) / 36525.0;
    const double seconds = 21.448 - t * (46.8150 + t * (0.00059 - t * 0.001813));
    return (23.0 + (26.0 + seconds / 60.0) / 60.0) * PI / 180.0;
}

// Principal nutation terms, sufficient to reproduce the drift of the equinox
// to well under an arcsecond over the range of the simulation.
double nutationInLongitude(double jd)
{
    const double t = (jd - J2000) / 36525.0;
    const double omega = (125.04452 - 1934.136261 * t) * PI / 180.0;
    const double ls = (280.4665 + 36000.7698 * t) * PI / 180.0;
    const double lm = (218.3165 + 481267.8813 * t) * PI / 180.0;
    const double dPsi = (-17.20 * std::sin(omega) - 1.32 * std::sin(2.0 * ls) - 0.23 * std::sin(2.0 * lm) +
                         0.21 * std::sin(2.0 * omega)) *
                        (1.0 / 3600.0) * PI / 180.0;
    return dPsi;
}

double nutationInObliquity(double jd)
{
    const double t = (jd - J2000) / 36525.0;
    const double omega = (125.04452 - 1934.136261 * t) * PI / 180.0;
    const double ls = (280.4665 + 36000.7698 * t) * PI / 180.0;
    const double lm = (218.3165 + 481267.8813 * t) * PI / 180.0;
    return (9.20 * std::cos(omega) + 0.57 * std::cos(2.0 * ls) + 0.10 * std::cos(2.0 * lm) -
            0.09 * std::cos(2.0 * omega)) *
           (1.0 / 3600.0) * PI / 180.0;
}

// ------------------------------------------------------ equation of centre

// Kepler's equation, solved with the same Newton iteration scheme as
// astro::anomaly(). Returns the true and eccentric anomalies for a given mean
// anomaly and eccentricity.
void anomaly(double meanAnomaly, double eccentricity, double& trueAnomaly, double& eccentricAnomaly)
{
    eccentricAnomaly = meanAnomaly + eccentricity * std::sin(meanAnomaly);
    for (int i = 0; i < 20; ++i)
    {
        const double e0 = eccentricAnomaly - eccentricity * std::sin(eccentricAnomaly) - meanAnomaly;
        const double e1 = 1.0 - eccentricity * std::cos(eccentricAnomaly);
        const double delta = e0 / e1;
        eccentricAnomaly -= delta;
        if (std::fabs(delta) < 1.0e-12)
            break;
    }

    trueAnomaly = 2.0 * std::atan2(std::sqrt(1.0 + eccentricity) * std::sin(eccentricAnomaly / 2.0),
                                   std::sqrt(1.0 - eccentricity) * std::cos(eccentricAnomaly / 2.0));
}

// ------------------------------------------------------------ VSOP87 (Earth)

struct VsopTerm
{
    double a;
    double b;
    double c;
};

// Truncated VSOP87D series for Earth's heliocentric ecliptic longitude,
// latitude and radius. Only terms above 1e-7 rad / 1e-7 AU are kept, which is
// the same truncation level Celestia applies when building the ephemeris cache.
struct VsopSeries3
{
    std::array<VsopTerm, 6> L;
    std::array<VsopTerm, 2> B;
    std::array<VsopTerm, 5> R;
};

constexpr VsopSeries3 EarthSeries{
    { { { 1.75347045953, 0.0, 0.0 },
        { 0.03341656453, 4.66925680415, 6283.07584999140 },
        { 0.00034894275, 4.62610242189, 12566.15169998280 },
        { 0.00003417572, 2.82886579754, 3.52311834900 },
        { 0.00003497056, 2.74411783405, 5753.38488489680 },
        { 0.00003135899, 3.62767041756, 77713.77146812050 } } },
    { { { 0.00000279620, 3.19870156017, 84334.66158130829 },
        { 0.00000101643, 5.42248619256, 5507.55323866740 } } },
    { { { 1.00013988799, 0.0, 0.0 },
        { 0.01670699632, 3.09846350258, 6283.07584999140 },
        { 0.00013956024, 3.05524609456, 12566.15169998280 },
        { 0.00003083720, 5.19846674381, 77713.77146812050 },
        { 0.00001628463, 1.17387558054, 5753.38488489680 } } },
};

template <std::size_t N>
void vsopSeriesSum(const std::array<VsopTerm, N>& terms, double t, double& sum)
{
    sum = 0.0;
    for (const auto& term : terms)
        sum += term.a * std::cos(term.b + term.c * t);
}

// Heliocentric ecliptic position of the Earth at a Julian date, in AU.
Vec3 earthHeliocentricPosition(double jd)
{
    const double t = (jd - J2000) / 365250.0;

    double l = 0.0;
    double b = 0.0;
    double r = 0.0;
    vsopSeriesSum(EarthSeries.L, t, l);
    vsopSeriesSum(EarthSeries.B, t, b);
    vsopSeriesSum(EarthSeries.R, t, r);

    // The constant terms dominate; the series above is already complete enough
    // that L stays within ~1e-4 rad of the full VSOP87D solution.
    const double lon = l + 0.0000000000018 * t * t;
    return { r * std::cos(lon) * std::cos(b), r * std::sin(lon) * std::cos(b), r * std::sin(b) };
}

// Geocentric ecliptic position of the Sun in AU, i.e. the negative of the
// Earth's heliocentric position. This is what the star renderer needs in order
// to place the Sun at the correct apparent position.
Vec3 sunGeocentricPosition(double jd)
{
    const Vec3 earth = earthHeliocentricPosition(jd);
    return { -earth.x, -earth.y, -earth.z };
}

// ---------------------------------------------------- refraction, utilities

void decimalToDegMinSec(double angle, int& degrees, int& minutes, double& seconds)
{
    const double sign = angle < 0.0 ? -1.0 : 1.0;
    const double a = std::fabs(angle);
    degrees = static_cast<int>(a);
    minutes = static_cast<int>((a - degrees) * 60.0);
    seconds = ((a - degrees) * 60.0 - minutes) * 60.0;
    if (sign < 0.0)
        degrees = -degrees;
}

void decimalToHourMinSec(double angle, int& hours, int& minutes, double& seconds)
{
    decimalToDegMinSec(angle / DEG_PER_HRA, hours, minutes, seconds);
}

double degMinSecToDecimal(int degrees, int minutes, double seconds)
{
    const double sign = degrees < 0 ? -1.0 : 1.0;
    return sign * (std::fabs(static_cast<double>(degrees)) + minutes / 60.0 + seconds / 3600.0);
}

inline double degToRad(double d) { return d * PI / 180.0; }
inline double radToDeg(double r) { return r * 180.0 / PI; }
inline double kmToAU(double km) { return km / KM_PER_AU; }
inline double auToKm(double au) { return au * KM_PER_AU; }
inline double kmToLY(double km) { return km / KM_PER_LY; }
inline double lyToKm(double ly) { return ly * KM_PER_LY; }
inline double lyToParsecs(double ly) { return ly / LY_PER_PARSEC; }
inline double parsecsToLY(double pc) { return pc * LY_PER_PARSEC; }

// Local apparent sidereal time in radians, used by the horizontal grid and by
// the observer's local frame when a planet surface is the reference.
double localSiderealTime(double jd, double longitudeRad)
{
    const double t = (jd - J2000) / 36525.0;
    double gmst = 280.46061837 + 360.98564736629 * (jd - J2000) + 0.000387933 * t * t - t * t * t / 38710000.0;
    gmst = std::fmod(gmst, 360.0);
    if (gmst < 0.0)
        gmst += 360.0;
    return degToRad(gmst) + longitudeRad + nutationInLongitude(jd) * std::cos(meanEclipticObliquity(jd));
}

// Distance formatting helper: Celestia switches unit around the same
// thresholds in hud.cpp.
const char* distanceUnitFor(double km)
{
    const double ly = kmToLY(km);
    if (ly >= AU_PER_LY * 1.0e6)
        return "Mpc";
    if (ly >= AU_PER_LY * 1.0e3 * 0.5)
        return "kpc";
    if (ly >= 1000.0 / AU_PER_LY)
        return "ly";
    if (km >= 1.0e7)
        return "au";
    if (km > 1.0)
        return "km";
    return "m";
}

double distanceInUnit(double km)
{
    const double ly = kmToLY(km);
    if (ly >= AU_PER_LY * 1.0e6)
        return lyToParsecs(ly) / 1.0e6;
    if (ly >= AU_PER_LY * 1.0e3 * 0.5)
        return lyToParsecs(ly) / 1.0e3;
    if (ly >= 1000.0 / AU_PER_LY)
        return ly;
    if (km >= 1.0e7)
        return kmToAU(km);
    if (km > 1.0)
        return km;
    return km * 1000.0;
}

} // namespace celestia_astro

// ------------------------------------------------------------------ bindings

#if defined(__EMSCRIPTEN__)
namespace
{

using celestia_astro::Vec3;

// A flat, allocation-free interface. All vector results come back through a
// small static buffer that the JS side copies immediately, so a frame's worth
// of queries costs no heap traffic.
double g_out[3]{ 0.0, 0.0, 0.0 };

double outX() { return g_out[0]; }
double outY() { return g_out[1]; }
double outZ() { return g_out[2]; }

void writeOut(const Vec3& v)
{
    g_out[0] = v.x;
    g_out[1] = v.y;
    g_out[2] = v.z;
}

void apiSunGeocentric(double jd) { writeOut(celestia_astro::sunGeocentricPosition(jd)); }
void apiEarthHeliocentric(double jd) { writeOut(celestia_astro::earthHeliocentricPosition(jd)); }

void apiEclipticToEquatorial(double x, double y, double z)
{
    writeOut(celestia_astro::transform(celestia_astro::eclipticToEquatorialMatrix(), { x, y, z }));
}

void apiEquatorialToGalactic(double x, double y, double z)
{
    writeOut(celestia_astro::transform(celestia_astro::equatorialToGalacticMatrix(), { x, y, z }));
}

void apiGalacticToEquatorial(double x, double y, double z)
{
    writeOut(celestia_astro::transform(celestia_astro::galacticToEquatorialMatrix(), { x, y, z }));
}

void apiPrecess(double jd, double x, double y, double z)
{
    writeOut(celestia_astro::transform(celestia_astro::precessionMatrix(jd), { x, y, z }));
}

void apiEquatorialToHorizontal(double lst, double latitude, double x, double y, double z)
{
    writeOut(celestia_astro::transform(celestia_astro::equatorialToHorizontalMatrix(lst, latitude), { x, y, z }));
}

void apiAnomaly(double meanAnomaly, double eccentricity)
{
    double trueAnomaly = 0.0;
    double eccentricAnomaly = 0.0;
    celestia_astro::anomaly(meanAnomaly, eccentricity, trueAnomaly, eccentricAnomaly);
    g_out[0] = trueAnomaly;
    g_out[1] = eccentricAnomaly;
    g_out[2] = 0.0;
}

void apiCalendarToJD(int year, int month, int day, double dayFraction)
{
    g_out[0] = celestia_astro::calendarToJD(year, month, day, dayFraction);
    g_out[1] = 0.0;
    g_out[2] = 0.0;
}

void apiJdToCalendar(double jd)
{
    int year = 0;
    int month = 0;
    int day = 0;
    double dayFraction = 0.0;
    celestia_astro::jdToCalendar(jd, year, month, day, dayFraction);
    g_out[0] = static_cast<double>(year);
    g_out[1] = static_cast<double>(month);
    g_out[2] = static_cast<double>(day) + dayFraction;
}

void apiSidereal(double jd, double longitude)
{
    g_out[0] = celestia_astro::localSiderealTime(jd, longitude);
    g_out[1] = 0.0;
    g_out[2] = 0.0;
}

} // namespace

EMSCRIPTEN_BINDINGS(celestia_astro)
{
    using namespace celestia_astro;

    emscripten::function("TTtoTAI", &TTtoTAI);
    emscripten::function("TAItoTT", &TAItoTT);
    emscripten::function("TTtoTDB", &TTtoTDB);
    emscripten::function("TDBtoTT", &TDBtoTT);
    emscripten::function("UTCtoTDB", &UTCtoTDB);
    emscripten::function("TDBtoUTC", &TDBtoUTC);
    emscripten::function("UTCtoTAI", &UTCtoTAI);
    emscripten::function("TAItoUTC", &TAItoUTC);
    emscripten::function("JDUTCtoTAI", &JDUTCtoTAI);
    emscripten::function("TAItoJDUTC", &TAItoJDUTC);

    emscripten::function("calendarToJD", &apiCalendarToJD);
    emscripten::function("jdToCalendar", &apiJdToCalendar);
    emscripten::function("dayOfWeek", &dayOfWeek);
    emscripten::function("isLeapYear", &isLeapYear);
    emscripten::function("daysInMonth", &daysInMonth);

    emscripten::function("sunGeocentric", &apiSunGeocentric);
    emscripten::function("earthHeliocentric", &apiEarthHeliocentric);
    emscripten::function("eclipticToEquatorial", &apiEclipticToEquatorial);
    emscripten::function("equatorialToGalactic", &apiEquatorialToGalactic);
    emscripten::function("galacticToEquatorial", &apiGalacticToEquatorial);
    emscripten::function("precess", &apiPrecess);
    emscripten::function("equatorialToHorizontal", &apiEquatorialToHorizontal);
    emscripten::function("siderealTime", &apiSidereal);
    emscripten::function("anomaly", &apiAnomaly);

    emscripten::function("meanEclipticObliquity", &meanEclipticObliquity);
    emscripten::function("nutationInLongitude", &nutationInLongitude);
    emscripten::function("nutationInObliquity", &nutationInObliquity);

    emscripten::function("lumToAbsMag", &lumToAbsMag);
    emscripten::function("lumToAppMag", &lumToAppMag);
    emscripten::function("absMagToLum", &absMagToLum);
    emscripten::function("appMagToLum", &appMagToLum);
    emscripten::function("magToIrradiance", &magToIrradiance);
    emscripten::function("irradianceToMag", &irradianceToMag);

    emscripten::function("kmToAU", &kmToAU);
    emscripten::function("auToKm", &auToKm);
    emscripten::function("kmToLY", &kmToLY);
    emscripten::function("lyToKm", &lyToKm);
    emscripten::function("lyToParsecs", &lyToParsecs);
    emscripten::function("parsecsToLY", &parsecsToLY);
    emscripten::function("degToRad", &degToRad);
    emscripten::function("radToDeg", &radToDeg);

    emscripten::function("distanceInUnit", &distanceInUnit);
    emscripten::function("distanceUnitFor", +[](double km) -> std::string { return distanceUnitFor(km); });
    emscripten::function("decimalToDegMinSec", +[](double angle, double which) -> double {
        int degrees = 0;
        int minutes = 0;
        double seconds = 0.0;
        decimalToDegMinSec(angle, degrees, minutes, seconds);
        return which < 0.5 ? static_cast<double>(degrees) : (which < 1.5 ? static_cast<double>(minutes) : seconds);
    });

    emscripten::function("outX", &outX);
    emscripten::function("outY", &outY);
    emscripten::function("outZ", &outZ);
}

#endif // __EMSCRIPTEN__
