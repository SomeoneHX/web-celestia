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
#include <celengine/dsodb.h>
#include <celengine/glsupport.h>
#include <celengine/render.h>
#include <celengine/selection.h>
#include <celengine/simulation.h>
#include <celengine/starbrowser.h>
#include <celengine/stardb.h>
#include <celengine/universe.h>
#include <celestia/celestiacore.h>

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

        core->setContextMenuHandler(&contextMenu);
        core->start();
        core->resize(width, height);

        simulation = core->getSimulation();
        renderer = core->getRenderer();
        return simulation != nullptr && renderer != nullptr;
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

    // ------------------------------------------------------------- data lists

    /**
     * Lists the bodies the engine has loaded, depth first from each system
     * root, as { path, name, classification, radiusKm }. The shell builds its
     * browsers and pickers from this rather than keeping a second copy of the
     * solar system, which is how the two used to drift apart.
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

        for (const auto& entry : *catalog)
        {
            SolarSystem* system = entry.second.get();
            if (system == nullptr)
                continue;

            // The star itself is the root of the tree the browsers show.
            if (Star* star = system->getStar(); star != nullptr)
            {
                emscripten::val root = emscripten::val::object();
                root.set("name", stars != nullptr ? stars->getStarName(*star, true) : std::string{"Sol"});
                root.set("path", stars != nullptr ? stars->getStarName(*star, true) : std::string{"Sol"});
                root.set("classification", static_cast<unsigned>(BodyClassification::Stellar));
                root.set("radiusKm", static_cast<double>(star->getRadius()));
                out.call<void>("push", root);
            }

            PlanetarySystem* planets = system->getPlanets();
            if (planets == nullptr)
                continue;

            for (int i = 0; i < planets->getSystemSize(); i++)
                walk(planets->getBody(i));
        }

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
        }

        bool hasPending{ false };
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

        // Input, forwarded to CelestiaCore as the Qt widget and its drag
        // handler forward theirs.
        .function("mouseButtonDown", &CelestiaEngine::mouseButtonDown)
        .function("mouseButtonUp", &CelestiaEngine::mouseButtonUp)
        .function("mouseMoveBy", &CelestiaEngine::mouseMoveBy)
        .function("mouseWheel", &CelestiaEngine::mouseWheel)
        .function("takeContextMenuRequest", &CelestiaEngine::takeContextMenuRequest)

        // Selection
        .function("selectObject", &CelestiaEngine::selectObject)
        .function("gotoObject", &CelestiaEngine::gotoObject)
        .function("centerSelection", &CelestiaEngine::centerSelection)
        .function("followSelection", &CelestiaEngine::followSelection)
        .function("cancelMotion", &CelestiaEngine::cancelMotion)
        .function("selectedObject", &CelestiaEngine::selectedObject)

        // Data lists for the browsers.
        .function("solarSystemObjects", &CelestiaEngine::solarSystemObjects)
        .function("searchStars", &CelestiaEngine::searchStars)
        .function("deepSkyObjects", &CelestiaEngine::deepSkyObjects)

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
