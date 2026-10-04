// Emscripten bindings for Celestia's engine.
//
// This file is the Web front end's platform layer and nothing more. The scene
// is driven by CelestiaCore, Celestia's own front end core: it is not Qt
// dependent (the SDL front end drives the same class), it reads celestia.cfg
// itself, and it owns the universe, the simulation and the renderer. The
// binding's job is to create the GL context the way CelestiaGlWidget and the
// SDL GL context do, to start the core, and to convert its results for
// JavaScript.
//
// Anything that looks like engine behaviour -- the loading order, the pick ray,
// the mouse drag semantics -- belongs to CelestiaCore or to the front end that
// calls it, and is deliberately not reimplemented here.

#include <algorithm>
#include <cctype>
#include <cmath>
#include <functional>
#include <map>
#include <memory>
#include <string>
#include <string_view>
#include <vector>

#include <Eigen/Core>
#include <Eigen/Geometry>

#include <emscripten/bind.h>
#include <emscripten/html5.h>
#include <emscripten/val.h>

#include <celastro/units.h>
#include <celmath/geomutil.h>
#include <celutil/logger.h>
#include <celengine/asterism.h>
#include <celengine/body.h>
#include <celengine/marker.h>
#include <celephem/orbit.h>
#include <celephem/rotation.h>
#include <celutil/greek.h>
#include <celengine/dsodb.h>
#include <celengine/glsupport.h>
#include <celengine/render.h>
#include <celengine/selection.h>
#include <celengine/solarsys.h>
#include <celengine/simulation.h>
#include <celengine/starbrowser.h>
#include <celengine/stardb.h>
#include <celengine/universe.h>
#include <celestia/celestiacore.h>
#include <celestia/eclipsefinder.h>

using namespace emscripten;

namespace
{

/** Kilometres in one light year, from celastro/units.h. */
constexpr double KM_PER_LY = celestia::astro::KM_PER_LY<double>;

/** Builds a JavaScript array from three coordinates. */
emscripten::val toArray(double x, double y, double z)
{
    emscripten::val array = emscripten::val::array();
    array.call<void>("push", x);
    array.call<void>("push", y);
    array.call<void>("push", z);
    return array;
}

/** The same for the four components of a quaternion, x, y, z, w. */
emscripten::val toArray(double x, double y, double z, double w)
{
    emscripten::val array = emscripten::val::array();
    array.call<void>("push", x);
    array.call<void>("push", y);
    array.call<void>("push", z);
    array.call<void>("push", w);
    return array;
}

/** Lower-cases an ASCII string, for the case insensitive name filters. */
std::string toLower(std::string_view text)
{
    std::string result(text);
    std::transform(result.begin(), result.end(), result.begin(),
                   [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    return result;
}

/**
 * Case insensitive wildcard match, the conversion Qt applies to the spectral
 * type field (QRegularExpression::fromWildcard): '*' matches any run including
 * an empty one, '?' matches a single character.
 */
bool wildcardMatch(std::string_view pattern, std::string_view text)
{
    std::size_t p = 0;
    std::size_t t = 0;
    std::size_t starP = std::string_view::npos;
    std::size_t starT = 0;

    const auto equal = [](char a, char b)
    {
        return std::tolower(static_cast<unsigned char>(a)) == std::tolower(static_cast<unsigned char>(b));
    };

    while (t < text.size())
    {
        if (p < pattern.size() && (pattern[p] == '?' || equal(pattern[p], text[t])))
        {
            ++p;
            ++t;
        }
        else if (p < pattern.size() && pattern[p] == '*')
        {
            starP = p++;
            starT = t;
        }
        else if (starP != std::string_view::npos)
        {
            p = starP + 1;
            t = ++starT;
        }
        else
        {
            return false;
        }
    }

    while (p < pattern.size() && pattern[p] == '*')
        ++p;

    return p == pattern.size();
}

std::string selectionTypeName(SelectionType type)
{
    switch (type)
    {
    case SelectionType::Star:     return "Star";
    case SelectionType::Body:     return "Body";
    case SelectionType::DeepSky:  return "DeepSky";
    case SelectionType::Location: return "Location";
    case SelectionType::None:     break;
    }
    return "None";
}

} // namespace

/**
 * Drives Celestia's own front end core on behalf of the Web front end.
 */
class CelestiaEngine
{
public:
    CelestiaEngine()
    {
        // CelestiaCore installs the global logger in its constructor, and the
        // engine logs through GetLogger() without checking it, so an error
        // anywhere would dereference a null pointer. Standard output and error
        // reach the browser console through the module's print hooks.
        celestia::util::CreateLogger(celestia::util::Level::Info);
    }

    ~CelestiaEngine()
    {
        core.reset();
        celestia::util::DestroyLogger();
    }

    /** Raises or lowers how much the engine logs. 0 error, 3 verbose. */
    void setLogLevel(int level)
    {
        if (auto* logger = celestia::util::GetLogger(); logger != nullptr)
            logger->setLevel(static_cast<celestia::util::Level>(std::clamp(level, 0, 4)));
    }

    /** How wide the core's own text layout thinks a string is, in pixels. */
    int getTextWidth(const std::string& text) const
    {
        return core != nullptr ? core->getTextWidth(text) : 0;
    }

    /** The time zone bias the core's HUD applies, in minutes. */
    int timeZoneBias() const { return core != nullptr ? core->getTimeZoneBias() : 0; }
    void setTimeZoneBias(int bias) { if (core != nullptr) core->setTimeZoneBias(bias); }

    /**
     * The display settings the core holds, so the shell's menus and preferences
     * can show what is actually in effect rather than keeping their own copy of
     * every one of them. Read them back instead of mirroring the writes.
     */
    emscripten::val settings() const
    {
        emscripten::val out = emscripten::val::object();
        if (renderer == nullptr)
            return out;

        out.set("renderFlags", static_cast<double>(static_cast<std::uint64_t>(renderer->getRenderFlags())));
        out.set("labelMode", static_cast<unsigned>(renderer->getLabelMode()));
        out.set("orbitMask", static_cast<unsigned>(renderer->getOrbitMask()));
        out.set("starStyle", static_cast<int>(renderer->getStarStyle()));
        out.set("resolution", static_cast<int>(renderer->getResolution()));
        out.set("starColorTable", static_cast<int>(renderer->getStarColorTable()));
        out.set("faintestAM45deg", static_cast<double>(renderer->getFaintestAM45deg()));
        out.set("ambientLightLevel", static_cast<double>(renderer->getAmbientLightLevel()));
        out.set("tintSaturation", static_cast<double>(renderer->getTintSaturation()));
        out.set("minimumFeatureSize", static_cast<double>(renderer->getMinimumFeatureSize()));
        out.set("atmosphereSegmentCount", static_cast<unsigned>(renderer->getAtmosphereSegmentCount()));
        out.set("cloudSegmentCount", static_cast<unsigned>(renderer->getCloudSegmentCount()));
        out.set("separateRayleighMieScaleHeights", renderer->getSeparateRayleighMieScaleHeights());
        out.set("starPointRadius", static_cast<double>(renderer->getStarPointRadius()));
        out.set("starOptimization", static_cast<double>(renderer->getStarOptimization()));
        out.set("starMaxIrradiance", static_cast<double>(renderer->getStarMaxIrradiance()));
        out.set("starDimClipFactor", static_cast<double>(renderer->getStarDimClipFactor()));
        out.set("starExposure", static_cast<double>(renderer->getStarExposure()));
        out.set("toneMappingMode", static_cast<int>(renderer->getToneMappingMode()));
        out.set("toneMappingExposure", static_cast<double>(renderer->getToneMappingExposure()));
        out.set("hudDetail", core != nullptr ? core->getHudDetail() : 0);
        out.set("dateFormat", core != nullptr ? static_cast<int>(core->getDateFormat()) : 0);
        out.set("timeZoneBias", core != nullptr ? core->getTimeZoneBias() : 0);
        out.set("measurementSystem", core != nullptr ? static_cast<int>(core->getMeasurementSystem()) : 0);

        if (simulation != nullptr)
        {
            out.set("faintestVisible", static_cast<double>(simulation->getFaintestVisible()));
            out.set("timeScale", simulation->getTimeScale());
            out.set("paused", simulation->getPauseState());
        }

        return out;
    }

    /** View > HUD Detail, which the core holds. */
    int hudDetail() const { return core != nullptr ? core->getHudDetail() : 0; }
    void setHudDetail(int detail) { if (core != nullptr) core->setHudDetail(detail); }

    /** Preferences > Date format, which the core holds. */
    int dateFormat() const { return core != nullptr ? static_cast<int>(core->getDateFormat()) : 0; }
    void setDateFormat(int format) { if (core != nullptr) core->setDateFormat(static_cast<celestia::astro::Date::Format>(format)); }

    /**
     * The location feature types the observer shows, a Location::FeatureType
     * mask.
     *
     * It travels as a decimal string rather than a number: the mask uses bits up
     * to 63, which a JavaScript number cannot hold -- the default of all ones
     * comes back rounded to 2^64 as a double, and every bit test against it is
     * then wrong.
     */
    std::string locationFilter() const
    {
        const Observer* observer = currentObserver();
        return observer != nullptr ? std::to_string(observer->getLocationFilter()) : std::string{"0"};
    }

    void setLocationFilter(const std::string& mask)
    {
        if (simulation == nullptr)
            return;
        try
        {
            simulation->getObserver().setLocationFilter(std::stoull(mask));
        }
        catch (const std::exception&)
        {
            // A malformed mask leaves the filter alone.
        }
    }

    /** The alternate surface the observer displays, or empty for the base one. */
    std::string displayedSurface() const
    {
        const Observer* observer = currentObserver();
        return observer != nullptr ? observer->getDisplayedSurface() : std::string{};
    }

    void setDisplayedSurface(const std::string& surface)
    {
        if (simulation != nullptr)
            simulation->getObserver().setDisplayedSurface(surface);
    }

    /** Time > Light Delay, which CelestiaCore holds. */
    bool lightDelayActive() const { return core != nullptr && core->getLightDelayActive(); }
    void setLightDelayActive(bool active) { if (core != nullptr) core->setLightDelayActive(active); }

    /**
     * Shows a transient message, the way Celestia's own front ends do:
     * CelestiaAppWindow calls appCore->flash, and the HUD draws it for the
     * duration. The shell does not draw messages of its own.
     */
    void flash(const std::string& message, double duration)
    {
        if (core != nullptr)
            core->flash(message, duration);
    }

    /**
     * The renderer information Celestia's own OpenGL Info dialog shows, read
     * from the renderer rather than from a list the shell keeps.
     */
    emscripten::val rendererInfo() const
    {
        emscripten::val out = emscripten::val::object();
        if (renderer == nullptr)
            return out;

        std::map<std::string, std::string> info;
        if (!renderer->getInfo(info))
            return out;

        for (const auto& [key, value] : info)
            out.set(key, value);

        return out;
    }

    /**
     * Creates the GL context and starts CelestiaCore on it.
     *
     * The context is the front end's job: Emscripten leaves GL unbound until one
     * is asked for, and CelestiaCore issues GL calls from its first statement.
     * gl::init and gl::checkVersion are the front end's too -- CelestiaGlWidget
     * and the SDL front end both call them before handing over to the core.
     *
     * The catalogue files and celestia.cfg have to be in the file system already;
     * CelestiaCore::initSimulation reads the config and loads them itself.
     */
    bool initRenderer(const std::string& canvasSelector, int width, int height)
    {
        if (!glContextInitialised)
        {
            EmscriptenWebGLContextAttributes attributes;
            emscripten_webgl_init_context_attributes(&attributes);
            attributes.majorVersion = 2;
            attributes.minorVersion = 0;
            attributes.alpha = false;
            attributes.depth = true;
            attributes.stencil = true;
            attributes.antialias = true;
            attributes.preserveDrawingBuffer = true;

            glContext = emscripten_webgl_create_context(canvasSelector.c_str(), &attributes);
            if (glContext <= 0)
                return false;

            emscripten_webgl_make_context_current(glContext);

            // gl::maxTextureSize and friends start at zero and are only filled
            // in here. Without this every texture that gets built divides by
            // maxTextureSize and no surface is ever uploaded.
            if (!celestia::gl::init() || !celestia::gl::checkVersion(celestia::gl::GLES_3_0))
                return false;

            glContextInitialised = true;
        }

        core = std::make_unique<CelestiaCore>();

        // Reads celestia.cfg from the working directory, which lists the star,
        // solar system and deep sky catalogues.
        if (!core->initSimulation())
            return false;

        if (!core->initRenderer(celestia::engine::TextureResolution::medres))
            return false;

        // The initial display settings are the front end's, exactly as
        // CelestiaGlWidget::initializeGL sets them. CelestiaCore::initRenderer
        // turns on stars, planets, atmospheres and automatic magnitude only --
        // galaxies, nebulae, clusters and the rest of the default set are the
        // front end's to apply, which is why they were missing.
        applyFrontEndDefaults();

        core->setContextMenuHandler(&contextMenu);
        core->start();
        core->resize(width, height);

        simulation = core->getSimulation();
        renderer = core->getRenderer();
        return simulation != nullptr && renderer != nullptr;
    }

    /**
     * The settings Celestia's Qt front end applies to a fresh renderer, from the
     * DEFAULT_* constants in qtglwidget.cpp. Everything else it sets comes from
     * the config, which CelestiaCore has already applied.
     */
    void applyFrontEndDefaults()
    {
        if (core == nullptr)
            return;

        Renderer* r = core->getRenderer();
        Simulation* sim = core->getSimulation();
        if (r == nullptr)
            return;

        r->setRenderFlags(RenderFlags::DefaultRenderFlags);
        r->setOrbitMask(BodyClassification::DefaultOrbitMask);
        r->setLabelMode(RenderLabels::LocationLabels | RenderLabels::I18nConstellationLabels);
        r->setAmbientLightLevel(0.0f);
        r->setTintSaturation(0.5f);
        r->setStarStyle(StarStyle::FuzzyPointStars);
        r->setStarColorTable(ColorTableType::SunWhite);

        if (sim != nullptr)
        {
            sim->getActiveObserver()->setLocationFilter(Observer::DefaultLocationFilter);
            sim->setFaintestVisible(8.0f);
        }
    }

    bool hasSimulation() const { return simulation != nullptr; }
    bool hasRenderer() const { return renderer != nullptr; }

    /** Draws one frame with Celestia's own renderer. */
    void renderFrame()
    {
        if (core != nullptr)
            core->draw();
    }

    void resizeRenderer(int width, int height)
    {
        if (core != nullptr)
            core->resize(width, height);
    }

    // -------------------------------------------------------------- catalogues

    int getStarCount() const
    {
        const Universe* u = currentUniverse();
        StarDatabase* stars = u != nullptr ? u->getStarCatalog() : nullptr;
        return stars != nullptr ? static_cast<int>(stars->size()) : 0;
    }

    int getSolarSystemCount() const
    {
        const Universe* u = currentUniverse();
        SolarSystemCatalog* systems = u != nullptr ? u->getSolarSystemCatalog() : nullptr;
        return systems != nullptr ? static_cast<int>(systems->size()) : 0;
    }

    int getDSOCount() const
    {
        const Universe* u = currentUniverse();
        DSODatabase* dsos = u != nullptr ? u->getDSOCatalog() : nullptr;
        return dsos != nullptr ? static_cast<int>(dsos->size()) : 0;
    }

    int getAsterismCount() const
    {
        const Universe* u = currentUniverse();
        AsterismList* asterisms = u != nullptr ? u->getAsterisms() : nullptr;
        return asterisms != nullptr ? static_cast<int>(asterisms->size()) : 0;
    }

    // ----------------------------------------------------------------- camera

    std::vector<double> observerPositionLy() const
    {
        const Observer* observer = currentObserver();
        if (observer == nullptr)
            return {};
        const Eigen::Vector3d position = observer->getPosition().toLy();
        return { position.x(), position.y(), position.z() };
    }

    void setObserverPositionLy(double x, double y, double z)
    {
        if (simulation == nullptr)
            return;
        // UniversalCoord counts micro light years; observerPositionLy returns
        // light years, so a value handed back has to be scaled to match.
        simulation->setObserverPosition(UniversalCoord(x * 1.0e6, y * 1.0e6, z * 1.0e6));
    }

    std::vector<double> observerOrientation() const
    {
        const Observer* observer = currentObserver();
        if (observer == nullptr)
            return {};
        const Eigen::Quaterniond q = observer->getOrientation();
        return { q.x(), q.y(), q.z(), q.w() };
    }

    void setObserverOrientation(double x, double y, double z, double w)
    {
        if (simulation != nullptr)
            simulation->setObserverOrientation(Eigen::Quaternionf(w, x, y, z));
    }

    double observerFov() const
    {
        const Observer* observer = currentObserver();
        return observer != nullptr ? observer->getFOV() : 0.0;
    }

    /**
     * The observer's speed in km/s and whether it is travelling, which is the
     * pair the HUD shows. Celestia's own HUD reads the same two from the
     * observer (hud.cpp).
     */
    emscripten::val observerMotion() const
    {
        emscripten::val out = emscripten::val::object();
        const Observer* observer = currentObserver();
        out.set("speedKmS", observer != nullptr ? observer->getVelocity().norm() : 0.0);
        out.set("travelling", observer != nullptr &&
                              observer->getMode() == Observer::ObserverMode::Travelling);
        return out;
    }

    void setObserverFov(double fov)
    {
        if (simulation != nullptr)
            simulation->getObserver().setFOV(static_cast<float>(fov));
    }


    // -------------------------------------------------------------- selection

    /** Selects an object by path without moving the observer. */
    bool selectObject(const std::string& path)
    {
        if (simulation == nullptr)
            return false;
        const Selection selection = simulation->findObjectFromPath(path);
        if (selection.empty())
            return false;
        simulation->setSelection(selection);
        return true;
    }

    /** Selects an object and places the observer distanceKm away from it. */
    bool gotoObject(const std::string& path, double distanceKm)
    {
        if (!selectObject(path))
            return false;
        simulation->gotoSelection(0.0, distanceKm, Eigen::Vector3f::UnitY(),
                                  ObserverFrame::CoordinateSystem::Ecliptical);
        return true;
    }

    /**
     * Travels to a body and stops above a longitude and latitude on it, which is
     * what the Qt Go To Object dialog's position fields feed.
     */
    bool gotoObjectLongLat(const std::string& path, double distanceKm,
                           double longitudeRad, double latitudeRad)
    {
        if (!selectObject(path))
            return false;

        simulation->gotoSelectionLongLat(5.0, distanceKm, static_cast<float>(longitudeRad),
                                          static_cast<float>(latitudeRad), Eigen::Vector3f::UnitY());
        return true;
    }

    /** Aim the camera at the current selection. */
    void centerSelection() { if (simulation != nullptr) simulation->centerSelection(0.5); }
    void followSelection() { if (simulation != nullptr) simulation->follow(); }
    void cancelMotion() { if (simulation != nullptr) simulation->cancelMotion(); }

    // ----------------------------------------------------------------- input
    //
    // Raw pointer events, forwarded straight to CelestiaCore. It owns the click
    // semantics: picking with its own four pixel tolerance, centring when the
    // same object is clicked twice, the modifier branches of a drag, and the
    // dolly on the wheel. The front end does not interpret them.

    /** Button and modifier bits, from CelestiaCore's own enum. */
    void mouseButtonDown(float x, float y, int button)
    {
        if (core != nullptr)
            core->mouseButtonDown(x, y, button);
    }

    void mouseButtonUp(float x, float y, int button)
    {
        if (core != nullptr)
            core->mouseButtonUp(x, y, button);
    }

    /** dx and dy are deltas in drawable pixels, as the Qt drag handler sends. */
    void mouseMoveBy(float dx, float dy, int buttons)
    {
        if (core != nullptr)
            core->mouseMove(dx, dy, buttons);
    }

    void mouseWheel(float motion, int modifiers)
    {
        if (core != nullptr)
            core->mouseWheel(motion, modifiers);
    }

    /**
     * A typed character, with CelestiaCore's modifier bits. The core's own
     * charEntered holds the whole command set: the key bindings the shell
     * carried in TypeScript were a port of it, so the shell now forwards keys
     * instead. Returns whether the core was given the key.
     */
    bool charEntered(const std::string& text, int modifiers)
    {
        if (core == nullptr || text.empty())
            return false;
        core->charEntered(text.c_str(), modifiers);
        return true;
    }

    /**
     * A special key, by CelestiaCore's own numbering: Left 1, Right 2, Up 3,
     * Down 4, Home 5, End 6, and so on through its Key enum.
     */
    void keyDown(int key, int modifiers)
    {
        if (core != nullptr)
            core->keyDown(key, modifiers);
    }

    void keyUp(int key, int modifiers)
    {
        if (core != nullptr)
            core->keyUp(key, modifiers);
    }

    /**
     * The context menu CelestiaCore asked for, or null.
     *
     * mouseButtonUp requests one when a right click hits something, through the
     * ContextMenuHandler installed below. Reading this consumes the request, so
     * the shell opens exactly one menu per click.
     */
    emscripten::val takeContextMenuRequest()
    {
        if (!contextMenu.hasPending)
            return emscripten::val::null();

        contextMenu.hasPending = false;
        emscripten::val out = emscripten::val::object();
        out.set("x", contextMenu.pendingX);
        out.set("y", contextMenu.pendingY);
        out.set("selection", selectionToVal(contextMenu.pendingSelection));
        return out;
    }

    /**
     * Selects the object the last context menu was for.
     *
     * A right click picks but does not select -- CelestiaCore::mouseButtonUp only
     * asks the handler for a menu -- so each of the popup's actions sets the
     * selection first, which is what SelectionPopup's slots do in Qt.
     */
    bool selectContextMenuObject()
    {
        if (!contextMenu.hasSelection || simulation == nullptr)
            return false;

        simulation->setSelection(contextMenu.pendingSelection);
        return true;
    }

    /**
     * Reports what the engine has selected, so the shell can show the object the
     * viewport actually picked. Null when nothing is selected. The name and the
     * path come from the catalogues the engine is holding, which is what keeps
     * them in step with the rendered scene.
     */
    emscripten::val selectedObject()
    {
        return simulation != nullptr ? selectionToVal(simulation->getSelection())
                                     : emscripten::val::null();
    }

    /**
     * Just the selected object's name, for the shell to watch cheaply.
     *
     * The core has no notification when the selection changes, and it changes on
     * its own -- Celestia's startup script selects the Earth several seconds in --
     * so the shell polls this rather than describing the whole selection every
     * frame.
     */
    std::string selectionName() const
    {
        if (simulation == nullptr)
            return {};
        const Selection selection = simulation->getSelection();
        if (selection.empty())
            return {};

        const Universe* u = currentUniverse();
        switch (selection.getType())
        {
        case SelectionType::Body:
            return selection.body() != nullptr ? selection.body()->getName(true) : std::string{};
        case SelectionType::Star:
            return selection.star() != nullptr && u != nullptr && u->getStarCatalog() != nullptr
                ? u->getStarCatalog()->getStarName(*selection.star(), true) : std::string{};
        case SelectionType::DeepSky:
            return selection.deepsky() != nullptr && u != nullptr && u->getDSOCatalog() != nullptr
                ? u->getDSOCatalog()->getDSOName(selection.deepsky(), true) : std::string{};
        default:
            return {};
        }
    }


    // ----------------------------------------------------------- event finder

    /**
     * Celestia's own eclipse finder, the one qteventfinder.cpp runs, searching
     * for eclipses of the body a path names between two dates.
     *
     * typeMask is Eclipse::Type: Solar 1, Lunar 2. The result entries carry the
     * two bodies by name and path, so the shell can select and travel to them
     * without holding any catalogue of its own.
     */
    emscripten::val findEclipses(const std::string& path, double startDate,
                                 double endDate, int typeMask)
    {
        emscripten::val out = emscripten::val::array();
        const Body* body = findBody(path);
        if (body == nullptr)
            return out;

        std::vector<Eclipse> eclipses;
        EclipseFinder finder(body);
        finder.findEclipses(startDate, endDate, static_cast<Eclipse::Type>(typeMask), eclipses);

        Universe* u = currentUniverse();
        StarDatabase* stars = u != nullptr ? u->getStarCatalog() : nullptr;

        for (const Eclipse& eclipse : eclipses)
        {
            if (eclipse.occulter == nullptr || eclipse.receiver == nullptr)
                continue;

            emscripten::val entry = emscripten::val::object();
            entry.set("occulter", eclipse.occulter->getName(true));
            entry.set("occulterPath", stars != nullptr ? eclipse.occulter->getPath(stars) : std::string{});
            entry.set("receiver", eclipse.receiver->getName(true));
            entry.set("receiverPath", stars != nullptr ? eclipse.receiver->getPath(stars) : std::string{});
            entry.set("startTime", eclipse.startTime);
            entry.set("endTime", eclipse.endTime);
            out.call<void>("push", entry);
        }

        return out;
    }

    // --------------------------------------------------------------- markers
    //
    // Celestia keeps markers in the Universe and the renderer draws them, which
    // is why the shell cannot keep its own: nothing would appear on the viewport.

    /** Marks an object, the way Universe::markObject does for the Qt browsers. */
    bool markObject(const std::string& path, int symbol, double size,
                    int red, int green, int blue, int alpha, const std::string& label)
    {
        Universe* u = currentUniverse();
        if (u == nullptr || simulation == nullptr)
            return false;

        const Selection selection = simulation->findObjectFromPath(path);
        if (selection.empty())
            return false;

        const celestia::MarkerRepresentation representation(
            static_cast<celestia::MarkerRepresentation::Symbol>(symbol),
            static_cast<float>(size),
            Color(static_cast<float>(red) / 255.0f, static_cast<float>(green) / 255.0f,
                  static_cast<float>(blue) / 255.0f, static_cast<float>(alpha) / 255.0f),
            label);

        u->markObject(selection, representation, 1, true, celestia::ConstantSize);
        return true;
    }

    bool unmarkObject(const std::string& path)
    {
        Universe* u = currentUniverse();
        if (u == nullptr || simulation == nullptr)
            return false;
        const Selection selection = simulation->findObjectFromPath(path);
        if (selection.empty())
            return false;
        u->unmarkObject(selection, 1);
        return true;
    }

    void unmarkAll()
    {
        if (Universe* u = currentUniverse(); u != nullptr)
            u->unmarkAll();
    }

    bool isMarked(const std::string& path)
    {
        Universe* u = currentUniverse();
        if (u == nullptr || simulation == nullptr)
            return false;
        const Selection selection = simulation->findObjectFromPath(path);
        return !selection.empty() && u->isMarked(selection, 1);
    }

    // ------------------------------------------------- the information panel
    //
    // These are the reads qtinfopanel.cpp makes for a body's page. They hand
    // back the engine's own values: the units, the thresholds that choose them
    // and the text are the front end's, which is where Qt keeps them too.

    /** The header block of a body's page: name, size, rings, atmosphere, lifespan. */
    emscripten::val bodyInfo(const std::string& path)
    {
        emscripten::val out = emscripten::val::object();
        Universe* u = currentUniverse();
        if (simulation == nullptr || u == nullptr)
            return out;

        const Selection selection = simulation->findObjectFromPath(path);
        const Body* body = selection.body();
        if (body == nullptr)
            return out;

        out.set("name", body->getName(true));
        out.set("classification", static_cast<unsigned>(body->getClassification()));
        out.set("ellipsoid", body->isEllipsoid());
        out.set("radiusKm", static_cast<double>(body->getRadius()));
        out.set("infoUrl", std::string{ u->getInfoURL(selection) });

        BodyFeaturesManager* features = GetBodyFeaturesManager();
        out.set("hasRings", features != nullptr && features->getRings(body) != nullptr);
        out.set("hasAtmosphere", features != nullptr && features->getAtmosphere(body) != nullptr);

        double begin = 0.0;
        double end = 0.0;
        body->getLifespan(begin, end);
        out.set("lifespanBegin", begin);
        out.set("lifespanEnd", end);

        const double t = simulation->getTime();
        const celestia::ephem::Orbit* orbit = body->getOrbit(t);
        out.set("orbitPeriodic", orbit != nullptr && orbit->isPeriodic());
        out.set("orbitPeriod", orbit != nullptr ? orbit->getPeriod() : 0.0);

        const celestia::ephem::RotationModel* rotation = body->getRotationModel(t);
        out.set("rotationPeriodic", rotation != nullptr && rotation->isPeriodic());
        out.set("rotationPeriod", rotation != nullptr ? rotation->getPeriod() : 0.0);

        return out;
    }

    /**
     * The orbit sampled at t: position and velocity, and the range the orbit is
     * valid over. qtinfopanel.cpp samples it twice, a little apart, and derives
     * the elements from the two -- the arithmetic is the front end's.
     */
    emscripten::val bodyOrbitState(const std::string& path, double t)
    {
        emscripten::val out = emscripten::val::object();
        const Body* body = findBody(path);
        if (body == nullptr)
            return out;

        const celestia::ephem::Orbit* orbit = body->getOrbit(t);
        if (orbit == nullptr)
            return out;

        double begin = 0.0;
        double end = 0.0;
        orbit->getValidRange(begin, end);

        out.set("periodic", orbit->isPeriodic());
        out.set("validBegin", begin);
        out.set("validEnd", end);

        const Eigen::Vector3d position = orbit->positionAtTime(t);
        const Eigen::Vector3d velocity = orbit->velocityAtTime(t);
        out.set("positionKm", toArray(position.x(), position.y(), position.z()));
        out.set("velocityKmPerDay", toArray(velocity.x(), velocity.y(), velocity.z()));

        return out;
    }

    /**
     * The three orientations qtinfopanel.cpp combines to decide whether a body
     * rotates prograde: the equator, the body frame and the orbit frame.
     */
    emscripten::val bodyFrames(const std::string& path, double t)
    {
        emscripten::val out = emscripten::val::object();
        const Body* body = findBody(path);
        if (body == nullptr)
            return out;

        if (const celestia::ephem::RotationModel* rotation = body->getRotationModel(t); rotation != nullptr)
        {
            const Eigen::Quaterniond equator = rotation->equatorOrientationAtTime(t);
            out.set("equatorOrientation", toArray(equator.x(), equator.y(), equator.z(), equator.w()));
        }

        if (const std::shared_ptr<const ReferenceFrame>& frame = body->getBodyFrame(t); frame != nullptr)
        {
            const Eigen::Quaterniond orientation = frame->getOrientation(t);
            out.set("bodyFrameOrientation", toArray(orientation.x(), orientation.y(), orientation.z(), orientation.w()));
        }

        if (const std::shared_ptr<const ReferenceFrame>& frame = body->getOrbitFrame(t); frame != nullptr)
        {
            const Eigen::Quaterniond orientation = frame->getOrientation(t);
            out.set("orbitFrameOrientation", toArray(orientation.x(), orientation.y(), orientation.z(), orientation.w()));
        }

        return out;
    }

    /**
     * celutil's ReplaceGreekLetterAbbr, which the star page applies to the name
     * the catalogue gives.
     */
    std::string greekName(const std::string& name) const
    {
        return ReplaceGreekLetterAbbr(name);
    }

    // ------------------------------------------------------------- data lists

    /**
     * Lists the bodies of the solar system the observer is in, depth first from
     * its star, as { path, name, classification, radiusKm }. The shell builds its
     * browser from this rather than keeping a second copy of the solar system,
     * which is how the two used to drift apart.
     *
     * classification is a bit from celengine/body.h (Planet, Moon, Asteroid,
     * Comet, Spacecraft, DwarfPlanet, MinorMoon, ...).
     */
    emscripten::val solarSystemObjects()
    {
        emscripten::val out = emscripten::val::array();
        Universe* u = currentUniverse();
        if (u == nullptr)
            return out;

        SolarSystemCatalog* catalog = u->getSolarSystemCatalog();
        if (catalog == nullptr)
            return out;

        StarDatabase* stars = u->getStarCatalog();

        std::function<void(Body*)> walk = [&](Body* body)
        {
            if (body == nullptr)
                return;

            emscripten::val entry = emscripten::val::object();
            entry.set("name", body->getName(true));
            entry.set("path", stars != nullptr ? body->getPath(stars) : body->getName(true));
            entry.set("classification", static_cast<unsigned>(body->getClassification()));
            entry.set("radiusKm", static_cast<double>(body->getRadius()));
            out.call<void>("push", entry);

            if (PlanetarySystem* system = body->getSatellites(); system != nullptr)
            {
                for (int i = 0; i < system->getSystemSize(); i++)
                    walk(system->getBody(i));
            }
        };

        // One system, the one the observer is in: qtsolarsystembrowser.cpp builds
        // its tree from Simulation::getNearestSolarSystem, not from the whole
        // catalogue, which would be over eleven thousand bodies.
        SolarSystem* system = simulation != nullptr ? simulation->getNearestSolarSystem() : nullptr;
        if (system == nullptr)
            return out;

        // The star is the root of the tree the browser shows.
        if (Star* star = system->getStar(); star != nullptr)
        {
            const std::string name = stars != nullptr ? stars->getStarName(*star, true) : std::string{"Sol"};
            emscripten::val root = emscripten::val::object();
            root.set("name", name);
            root.set("path", name);
            root.set("classification", static_cast<unsigned>(BodyClassification::Stellar));
            root.set("radiusKm", static_cast<double>(star->getRadius()));
            out.call<void>("push", root);
        }

        PlanetarySystem* planets = system->getPlanets();
        if (planets == nullptr)
            return out;

        for (int i = 0; i < planets->getSystemSize(); i++)
            walk(planets->getBody(i));

        return out;
    }

    /**
     * Runs Celestia's own star browser, so the celestial browser lists what the
     * Qt front end lists. qtcelestialbrowser.cpp builds an engine::StarBrowser
     * over the loaded catalogue and reads Name, Distance, App. mag, Abs. mag and
     * Type from it; this returns exactly those columns.
     *
     * comparison: 0 nearest, 1 apparent magnitude, 2 absolute magnitude.
     * filter: bit set of Visible 1, Multiple 2, WithPlanets 4, SpectralType 8;
     * 0 is everything. As in the Qt front end, a spectral filter is only applied
     * when the caller also sets the SpectralType bit.
     * spectralFilter: wildcard pattern ('*' and '?'), case insensitive, empty for
     * no filter. qtcelestialbrowser.cpp builds a QRegularExpression::fromWildcard
     * from the same box.
     */
    emscripten::val searchStars(unsigned size, int comparison, unsigned filter,
                                const std::string& spectralFilter)
    {
        emscripten::val out = emscripten::val::array();
        Universe* u = currentUniverse();
        if (u == nullptr || simulation == nullptr || u->getStarCatalog() == nullptr)
            return out;

        celestia::engine::StarBrowser browser(
            u, size,
            static_cast<celestia::engine::StarBrowser::Comparison>(comparison),
            static_cast<celestia::engine::StarBrowser::Filter>(filter));
        browser.setPosition(simulation->getObserver().getPosition());
        browser.setTime(simulation->getTime());

        if (const std::string pattern = toLower(spectralFilter); !pattern.empty())
        {
            browser.setSpectralTypeFilter([pattern](const char* type)
            {
                return type != nullptr && wildcardMatch(pattern, toLower(type));
            });
        }

        std::vector<celestia::engine::StarBrowserRecord> records;
        browser.populate(records);

        StarDatabase* stars = u->getStarCatalog();
        for (const auto& record : records)
        {
            const Star* star = record.star;
            emscripten::val row = emscripten::val::object();
            row.set("name", stars->getStarName(*star, true));
            row.set("distanceLy", static_cast<double>(record.distance));
            row.set("appMag", static_cast<double>(record.appMag));
            row.set("absMag", static_cast<double>(star->getAbsoluteMagnitude()));
            row.set("spectralType", std::string{star->getSpectralType()});

            const Eigen::Vector3f position = star->getPosition();
            row.set("positionLy", toArray(position.x(), position.y(), position.z()));
            out.call<void>("push", row);
        }

        return out;
    }

    /**
     * Lists the deep sky catalogue the way the Qt deep sky browser walks it
     * (qtdeepskybrowser.cpp): catalogue order, entries without a name skipped.
     * The browser's Distance and App. mag columns are derived from these, since
     * both depend on where the observer is standing.
     *
     * absoluteMagnitude is DSO_DEFAULT_ABS_MAGNITUDE (-1000) when the catalogue
     * does not carry one, which is how the Qt browser decides to leave the
     * App. mag cell empty.
     *
     * objType is the category (Galaxy, Globular, Nebula, OpenCluster) that the
     * browser's radio buttons select; type is the morphological class the table
     * shows, and what the name filter matches.
     */
    emscripten::val deepSkyObjects()
    {
        emscripten::val out = emscripten::val::array();
        Universe* u = currentUniverse();
        if (u == nullptr)
            return out;

        DSODatabase* catalog = u->getDSOCatalog();
        if (catalog == nullptr)
            return out;

        const std::uint32_t count = catalog->size();
        for (std::uint32_t i = 0; i < count; i++)
        {
            const DeepSkyObject* dso = catalog->getDSO(i);
            if (dso == nullptr)
                continue;

            const std::string name = catalog->getDSOName(dso, true);
            if (name.empty())
                continue;

            emscripten::val entry = emscripten::val::object();
            entry.set("name", name);
            entry.set("type", std::string{dso->getType()});
            // The category the browser's radio buttons filter on, which is not
            // the morphological type the Type column shows.
            entry.set("objType", static_cast<unsigned>(dso->getObjType()));
            entry.set("absoluteMagnitude", static_cast<double>(dso->getAbsoluteMagnitude()));

            const Eigen::Vector3d position = dso->getPosition();
            entry.set("positionLy", toArray(position.x(), position.y(), position.z()));
            out.call<void>("push", entry);
        }

        return out;
    }

    // ------------------------------------------------------- display settings
    //
    // These mirror what CelestiaCore's menus and preferences dialog write. The
    // shell keeps its own copies for its panels; the values are the same bit
    // patterns and enumerations, so they can be handed straight over.

    /** Bit set from celengine/renderflags.h. Passed as a double: the shell
     *  holds it as a bigint and every defined bit fits in 53 bits. */
    void setRenderFlags(double flags)
    {
        if (renderer != nullptr)
            renderer->setRenderFlags(static_cast<RenderFlags>(static_cast<std::uint64_t>(flags)));
    }

    double renderFlags() const
    {
        if (renderer == nullptr)
            return 0.0;
        return static_cast<double>(static_cast<std::uint64_t>(renderer->getRenderFlags()));
    }

    void setLabelMode(unsigned mode)
    {
        if (renderer != nullptr)
            renderer->setLabelMode(static_cast<RenderLabels>(mode));
    }

    unsigned labelMode() const
    {
        if (renderer == nullptr)
            return 0u;
        return static_cast<unsigned>(renderer->getLabelMode());
    }

    void setOrbitMask(unsigned mask)
    {
        if (renderer != nullptr)
            renderer->setOrbitMask(static_cast<BodyClassification>(mask));
    }

    unsigned orbitMask() const
    {
        if (renderer == nullptr)
            return 0u;
        return static_cast<unsigned>(renderer->getOrbitMask());
    }

    void setStarStyle(int style)
    {
        if (renderer != nullptr)
            renderer->setStarStyle(static_cast<StarStyle>(style));
    }

    int starStyle() const
    {
        if (renderer == nullptr)
            return 0;
        return static_cast<int>(renderer->getStarStyle());
    }

    void setFaintestVisible(double magnitude)
    {
        if (simulation != nullptr)
            simulation->setFaintestVisible(static_cast<float>(magnitude));
    }

    void setFaintestAM45deg(double magnitude)
    {
        if (renderer != nullptr)
            renderer->setFaintestAM45deg(static_cast<float>(magnitude));
    }

    void setAmbientLightLevel(double level)
    {
        if (renderer != nullptr)
            renderer->setAmbientLightLevel(static_cast<float>(level));
    }

    void setTintSaturation(double saturation)
    {
        if (renderer != nullptr)
            renderer->setTintSaturation(static_cast<float>(saturation));
    }

    void setMinimumFeatureSize(double size)
    {
        if (renderer != nullptr)
            renderer->setMinimumFeatureSize(static_cast<float>(size));
    }

    void setAtmosphereSegmentCount(unsigned count)
    {
        if (renderer != nullptr)
            renderer->setAtmosphereSegmentCount(count);
    }

    void setCloudSegmentCount(unsigned count)
    {
        if (renderer != nullptr)
            renderer->setCloudSegmentCount(count);
    }

    void setSeparateRayleighMieScaleHeights(bool separate)
    {
        if (renderer != nullptr)
            renderer->setSeparateRayleighMieScaleHeights(separate);
    }

    void setResolution(int resolution)
    {
        if (renderer != nullptr)
            renderer->setResolution(static_cast<celestia::engine::TextureResolution>(resolution));
    }

    void setToneMappingMode(int mode)
    {
        if (renderer != nullptr)
            renderer->setToneMappingMode(static_cast<ToneMappingMode>(mode));
    }

    void setToneMappingExposure(double exposure)
    {
        if (renderer != nullptr)
            renderer->setToneMappingExposure(static_cast<float>(exposure));
    }

    // ------------------------------------------------------- object queries

    bool objectExists(const std::string& path) const
    {
        return simulation != nullptr && !simulation->findObjectFromPath(path).empty();
    }

    std::vector<double> objectPositionKm(const std::string& path, double tdb) const
    {
        if (simulation == nullptr)
            return {};
        const Selection selection = simulation->findObjectFromPath(path);
        if (selection.empty())
            return {};
        const Eigen::Vector3d position = selection.getPosition(tdb).toLy();
        return { position.x() * KM_PER_LY, position.y() * KM_PER_LY, position.z() * KM_PER_LY };
    }

    double objectRadiusKm(const std::string& path) const
    {
        if (simulation == nullptr)
            return 0.0;
        const Selection selection = simulation->findObjectFromPath(path);
        return selection.empty() ? 0.0 : selection.radius();
    }

    std::string objectType(const std::string& path) const
    {
        if (simulation == nullptr)
            return "None";
        return selectionTypeName(simulation->findObjectFromPath(path).getType());
    }

    // ------------------------------------------------------------------ time

    /**
     * Advances the simulation by dt seconds. CelestiaCore::tick runs the whole
     * per-frame step: the clock, the observer journeys and the time control.
     */
    void advanceTime(double dt)
    {
        if (core != nullptr)
            core->tick(dt);
    }

    double getTime() const { return simulation != nullptr ? simulation->getTime() : 0.0; }
    void setTime(double tdb) { if (simulation != nullptr) simulation->setTime(tdb); }

    /**
     * The time control, which the core owns: tick advances the clock by
     * dt * timeScale unless it is paused, so the shell's time toolbar drives
     * these and reads the date back from getTime.
     */
    double timeScale() const { return simulation != nullptr ? simulation->getTimeScale() : 1.0; }
    void setTimeScale(double scale) { if (simulation != nullptr) simulation->setTimeScale(scale); }

    bool paused() const { return simulation != nullptr && simulation->getPauseState(); }
    void setPaused(bool paused) { if (simulation != nullptr) simulation->setPauseState(paused); }

private:
    /**
     * Receives the right click pick CelestiaCore makes, so the shell can open
     * its own menu where the engine asked for one.
     */
    class ContextMenuRequest : public CelestiaCore::ContextMenuHandler
    {
    public:
        void requestContextMenu(float x, float y, Selection selection) override
        {
            pendingX = x;
            pendingY = y;
            pendingSelection = selection;
            hasPending = true;
            hasSelection = true;
        }

        bool hasPending{ false };
        /* Kept after the request is read: a right click does not change the
           core's selection -- mouseButtonUp only picks and asks for the menu --
           so the menu's actions have to set it themselves, as the Qt popup's
           slots do. */
        bool hasSelection{ false };
        float pendingX{ 0.0f };
        float pendingY{ 0.0f };
        Selection pendingSelection;
    };

    /** Describes a selection for JavaScript. Null when it is empty. */
    emscripten::val selectionToVal(const Selection& selection)
    {
        if (selection.empty() || simulation == nullptr)
            return emscripten::val::null();

        Universe* u = currentUniverse();
        emscripten::val out = emscripten::val::object();
        out.set("type", selectionTypeName(selection.getType()));
        out.set("name", std::string{});
        out.set("path", std::string{});

        switch (selection.getType())
        {
        case SelectionType::Body:
            if (const Body* body = selection.body(); body != nullptr)
            {
                out.set("name", body->getName(true));
                if (u != nullptr)
                    out.set("path", body->getPath(u->getStarCatalog()));
            }
            break;
        case SelectionType::Star:
            if (const Star* star = selection.star(); star != nullptr && u != nullptr)
                out.set("name", u->getStarCatalog()->getStarName(*star, true));
            break;
        case SelectionType::DeepSky:
            if (const DeepSkyObject* dso = selection.deepsky(); dso != nullptr && u != nullptr)
                out.set("name", u->getDSOCatalog()->getDSOName(dso, true));
            break;
        default:
            break;
        }

        out.set("radiusKm", selection.radius());

        const UniversalCoord position = selection.getPosition(simulation->getTime());
        const Eigen::Vector3d km = position.offsetFromKm(UniversalCoord(0.0, 0.0, 0.0));
        out.set("positionKm", toArray(km.x(), km.y(), km.z()));

        return out;
    }

    /** The Universe, which CelestiaCore's Simulation owns. */
    Universe* currentUniverse() const
    {
        return simulation != nullptr ? simulation->getUniverse() : nullptr;
    }

    Observer* currentObserver() const
    {
        return simulation != nullptr ? simulation->getActiveObserver() : nullptr;
    }

    /** The body a path names, or null. */
    const Body* findBody(const std::string& path) const
    {
        if (simulation == nullptr)
            return nullptr;
        return simulation->findObjectFromPath(path).body();
    }

    /**
     * Celestia's own front end core, which owns the universe, the simulation and
     * the renderer. It is not Qt dependent -- the SDL front end drives the same
     * class -- and it reads celestia.cfg itself, so the loading order, the
     * renderer's detail options and the projection mode all come from Celestia
     * rather than from this file. The pointers borrow from it and are only valid
     * once it has been initialised.
     */
    std::unique_ptr<CelestiaCore> core;
    Simulation* simulation{ nullptr };
    Renderer* renderer{ nullptr };
    ContextMenuRequest contextMenu;

    EMSCRIPTEN_WEBGL_CONTEXT_HANDLE glContext{ 0 };
    bool glContextInitialised{ false };
};

EMSCRIPTEN_BINDINGS(celestia_engine)
{
    register_vector<double>("VectorDouble");
    register_vector<std::string>("VectorString");

    class_<CelestiaEngine>("CelestiaEngine")
        .constructor<>()
        .function("setLogLevel", &CelestiaEngine::setLogLevel)
        .function("rendererInfo", &CelestiaEngine::rendererInfo)
        .function("settings", &CelestiaEngine::settings)
        .function("flash", &CelestiaEngine::flash)
        .function("lightDelayActive", &CelestiaEngine::lightDelayActive)
        .function("setLightDelayActive", &CelestiaEngine::setLightDelayActive)
        .function("timeZoneBias", &CelestiaEngine::timeZoneBias)
        .function("setTimeZoneBias", &CelestiaEngine::setTimeZoneBias)
        .function("hudDetail", &CelestiaEngine::hudDetail)
        .function("setHudDetail", &CelestiaEngine::setHudDetail)
        .function("dateFormat", &CelestiaEngine::dateFormat)
        .function("setDateFormat", &CelestiaEngine::setDateFormat)
        .function("displayedSurface", &CelestiaEngine::displayedSurface)
        .function("setDisplayedSurface", &CelestiaEngine::setDisplayedSurface)
        .function("locationFilter", &CelestiaEngine::locationFilter)
        .function("setLocationFilter", &CelestiaEngine::setLocationFilter)
        .function("getTextWidth", &CelestiaEngine::getTextWidth)

        // Lifecycle. initRenderer creates the GL context and starts
        // CelestiaCore, which loads the catalogues named by celestia.cfg.
        .function("initRenderer", &CelestiaEngine::initRenderer)
        .function("renderFrame", &CelestiaEngine::renderFrame)
        .function("resizeRenderer", &CelestiaEngine::resizeRenderer)
        .function("hasSimulation", &CelestiaEngine::hasSimulation)
        .function("hasRenderer", &CelestiaEngine::hasRenderer)

        // Counts, read from the catalogues CelestiaCore loaded.
        .function("starCount", &CelestiaEngine::getStarCount)
        .function("solarSystemCount", &CelestiaEngine::getSolarSystemCount)
        .function("dsoCount", &CelestiaEngine::getDSOCount)
        .function("asterismCount", &CelestiaEngine::getAsterismCount)

        // Camera
        .function("observerPositionLy", &CelestiaEngine::observerPositionLy)
        .function("setObserverPositionLy", &CelestiaEngine::setObserverPositionLy)
        .function("observerOrientation", &CelestiaEngine::observerOrientation)
        .function("setObserverOrientation", &CelestiaEngine::setObserverOrientation)
        .function("observerFov", &CelestiaEngine::observerFov)
        .function("setObserverFov", &CelestiaEngine::setObserverFov)
        .function("observerMotion", &CelestiaEngine::observerMotion)

        // Input, forwarded to CelestiaCore as the Qt widget and its drag
        // handler forward theirs.
        .function("mouseButtonDown", &CelestiaEngine::mouseButtonDown)
        .function("mouseButtonUp", &CelestiaEngine::mouseButtonUp)
        .function("mouseMoveBy", &CelestiaEngine::mouseMoveBy)
        .function("mouseWheel", &CelestiaEngine::mouseWheel)
        .function("takeContextMenuRequest", &CelestiaEngine::takeContextMenuRequest)
        .function("selectContextMenuObject", &CelestiaEngine::selectContextMenuObject)
        .function("charEntered", &CelestiaEngine::charEntered)
        .function("keyDown", &CelestiaEngine::keyDown)
        .function("keyUp", &CelestiaEngine::keyUp)

        // Selection
        .function("selectObject", &CelestiaEngine::selectObject)
        .function("gotoObject", &CelestiaEngine::gotoObject)
        .function("gotoObjectLongLat", &CelestiaEngine::gotoObjectLongLat)
        .function("centerSelection", &CelestiaEngine::centerSelection)
        .function("followSelection", &CelestiaEngine::followSelection)
        .function("cancelMotion", &CelestiaEngine::cancelMotion)
        .function("selectedObject", &CelestiaEngine::selectedObject)
        .function("selectionName", &CelestiaEngine::selectionName)

        // Data lists for the browsers.
        .function("solarSystemObjects", &CelestiaEngine::solarSystemObjects)
        .function("searchStars", &CelestiaEngine::searchStars)
        .function("deepSkyObjects", &CelestiaEngine::deepSkyObjects)

        // The information panel's reads, as qtinfopanel.cpp makes them.
        .function("bodyInfo", &CelestiaEngine::bodyInfo)
        .function("bodyOrbitState", &CelestiaEngine::bodyOrbitState)
        .function("bodyFrames", &CelestiaEngine::bodyFrames)
        .function("greekName", &CelestiaEngine::greekName)
        .function("findEclipses", &CelestiaEngine::findEclipses)

        // Markers, which the engine keeps and draws.
        .function("markObject", &CelestiaEngine::markObject)
        .function("unmarkObject", &CelestiaEngine::unmarkObject)
        .function("unmarkAll", &CelestiaEngine::unmarkAll)
        .function("isMarked", &CelestiaEngine::isMarked)

        // Display settings
        .function("setRenderFlags", &CelestiaEngine::setRenderFlags)
        .function("renderFlags", &CelestiaEngine::renderFlags)
        .function("setLabelMode", &CelestiaEngine::setLabelMode)
        .function("labelMode", &CelestiaEngine::labelMode)
        .function("setOrbitMask", &CelestiaEngine::setOrbitMask)
        .function("orbitMask", &CelestiaEngine::orbitMask)
        .function("setStarStyle", &CelestiaEngine::setStarStyle)
        .function("starStyle", &CelestiaEngine::starStyle)
        .function("setFaintestVisible", &CelestiaEngine::setFaintestVisible)
        .function("setFaintestAM45deg", &CelestiaEngine::setFaintestAM45deg)
        .function("setAmbientLightLevel", &CelestiaEngine::setAmbientLightLevel)
        .function("setTintSaturation", &CelestiaEngine::setTintSaturation)
        .function("setMinimumFeatureSize", &CelestiaEngine::setMinimumFeatureSize)
        .function("setAtmosphereSegmentCount", &CelestiaEngine::setAtmosphereSegmentCount)
        .function("setCloudSegmentCount", &CelestiaEngine::setCloudSegmentCount)
        .function("setSeparateRayleighMieScaleHeights", &CelestiaEngine::setSeparateRayleighMieScaleHeights)
        .function("setResolution", &CelestiaEngine::setResolution)
        .function("setToneMappingMode", &CelestiaEngine::setToneMappingMode)
        .function("setToneMappingExposure", &CelestiaEngine::setToneMappingExposure)

        // Object queries and the clock.
        .function("objectExists", &CelestiaEngine::objectExists)
        .function("objectPositionKm", &CelestiaEngine::objectPositionKm)
        .function("objectRadiusKm", &CelestiaEngine::objectRadiusKm)
        .function("objectType", &CelestiaEngine::objectType)
        .function("advanceTime", &CelestiaEngine::advanceTime)
        .function("getTime", &CelestiaEngine::getTime)
        .function("setTime", &CelestiaEngine::setTime)
        .function("timeScale", &CelestiaEngine::timeScale)
        .function("setTimeScale", &CelestiaEngine::setTimeScale)
        .function("paused", &CelestiaEngine::paused)
        .function("setPaused", &CelestiaEngine::setPaused);
}
