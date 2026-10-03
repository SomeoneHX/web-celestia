// Emscripten bindings for Celestia's engine.
//
// The objects exposed here are Celestia's own: Universe, StarDatabase,
// SolarSystemCatalog, Simulation and Selection are compiled from their original
// sources, and the assembly order follows CelestiaCore::initSimulation in
// src/celestia/celestiacore.cpp. Nothing in this file reimplements engine logic;
// it only wires the objects together and converts results for JavaScript.

#include <fstream>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

#include <Eigen/Core>
#include <Eigen/Geometry>

#include <emscripten/bind.h>
#include <emscripten/html5.h>

#include <celastro/units.h>
#include <celmath/geomutil.h>
#include <celmath/mathlib.h>
#include <celutil/logger.h>
#include <celengine/asterism.h>
#include <celengine/boundaries.h>
#include <celengine/dsodb.h>
#include <celengine/dsodbbuilder.h>
#include <celengine/frame.h>
#include <celengine/glsupport.h>
#include <celengine/meshmanager.h>
#include <celengine/observer.h>
#include <celengine/perspectiveprojectionmode.h>
#include <celengine/render.h>
#include <celengine/resourcesystem.h>
#include <celengine/selection.h>
#include <celengine/simulation.h>
#include <celengine/solarsys.h>
#include <celengine/stardb.h>
#include <celengine/stardbbuilder.h>
#include <celengine/starname.h>
#include <celengine/texmanager.h>
#include <celengine/universe.h>
#include <celengine/urlmanager.h>

using namespace emscripten;

namespace
{

/** Kilometres in one light year, from celastro/units.h. */
constexpr double KM_PER_LY = celestia::astro::KM_PER_LY<double>;

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
 * Owns the engine objects across the same lifetime the front ends manage.
 *
 * Universe, StarDatabaseBuilder and SolarSystemsBuilder only keep references to
 * the geometry and texture paths, so those are held here as CelestiaCore holds
 * them.
 */
class CelestiaEngine
{
public:
    CelestiaEngine()
        : geometryPaths(std::make_shared<celestia::engine::GeometryPaths>()),
          texturePaths(std::make_shared<celestia::engine::TexturePaths>()),
          resourceSystem(std::make_shared<celestia::engine::ResourceSystem>()),
          geometryManager(std::make_shared<celestia::engine::GeometryManager>(geometryPaths, texturePaths, *resourceSystem)),
          universe(std::make_unique<Universe>(geometryManager, std::make_unique<celestia::engine::UrlManager>())),
          observerSettings(std::make_shared<celestia::engine::ObserverSettings>())
    {
        // CelestiaCore installs the global logger in its constructor, and the
        // engine logs through GetLogger() without checking it -- an error
        // anywhere would otherwise dereference a null pointer. Standard output
        // and error reach the browser console through the module's print hooks.
        celestia::util::CreateLogger(celestia::util::Level::Info);
    }

    ~CelestiaEngine()
    {
        celestia::util::DestroyLogger();
    }

    /** Raises or lowers how much the engine logs. 0 error, 3 verbose. */
    void setLogLevel(int level)
    {
        if (auto* logger = celestia::util::GetLogger(); logger != nullptr)
            logger->setLevel(static_cast<celestia::util::Level>(std::clamp(level, 0, 4)));
    }

    /**
     * Loads a star catalogue the way Celestia's loadStars does: the binary
     * catalogue first, then the name database, then any text catalogues.
     *
     * The two paths are read through the Emscripten file system, so callers
     * write the files there first.
     */
    bool loadStars(const std::string& binaryPath,
                   const std::string& namesPath,
                   const std::vector<std::string>& textCatalogs)
    {
        Universe* u = currentUniverse();
        if (u == nullptr)
            return false;

        StarDatabaseBuilder builder(*geometryPaths, *texturePaths, *u->getUrlManager());

        if (!binaryPath.empty())
        {
            std::ifstream stars(binaryPath, std::ios::binary);
            if (!stars.good() || !builder.loadBinary(stars))
                return false;
        }

        std::unique_ptr<StarNameDatabase> namesDB;
        if (!namesPath.empty())
        {
            std::ifstream names(namesPath);
            if (names.good())
                namesDB = StarNameDatabase::readNames(names);
        }
        if (namesDB == nullptr)
        {
            celestia::util::GetLogger()->error("could not read star names from {}\n", namesPath);
            namesDB = std::make_unique<StarNameDatabase>();
        }
        builder.setNameDatabase(std::move(namesDB));

        for (const auto& text : textCatalogs)
        {
            std::istringstream stream(text);
            if (!builder.load(stream, std::filesystem::path{}))
                return false;
        }

        auto catalog = builder.finish();
        if (catalog == nullptr)
            return false;

        starCount = static_cast<int>(catalog->size());
        u->setStarCatalog(std::move(catalog));
        return true;
    }

    /** Parses a Celestia text star catalogue (.stc) and installs it. */
    bool loadStarCatalog(const std::string& text)
    {
        Universe* u = currentUniverse();
        if (u == nullptr)
            return false;

        StarDatabaseBuilder builder(*geometryPaths, *texturePaths, *u->getUrlManager());
        // Every star definition carries a name, and the builder writes those
        // through the name database. Celestia creates it from starnames.dat
        // before it reads any catalogue; loading a catalogue on its own starts
        // from an empty one.
        builder.setNameDatabase(std::make_unique<StarNameDatabase>());
        std::istringstream stream(text);
        if (!builder.load(stream, std::filesystem::path{}))
            return false;

        auto catalog = builder.finish();
        if (catalog == nullptr)
            return false;

        starCount = static_cast<int>(catalog->size());
        u->setStarCatalog(std::move(catalog));
        return true;
    }

    /** Parses a Celestia solar system catalogue (.ssc). */
    bool loadSolarSystem(const std::string& text)
    {
        Universe* u = currentUniverse();
        if (u == nullptr)
            return false;

        // Celestia installs an empty catalog before reading any .ssc file
        // (loadSSO in src/celestia/loadsso.cpp); the builder appends to it.
        if (u->getSolarSystemCatalog() == nullptr)
            u->setSolarSystemCatalog(std::make_unique<SolarSystemCatalog>());

        SolarSystemsBuilder builder(*u, *geometryPaths, *texturePaths, *u->getUrlManager());
        std::istringstream stream(text);
        const bool parsed = builder.parseSsc(stream, std::filesystem::path{});
        builder.finish();

        const auto* catalog = u->getSolarSystemCatalog();
        solarSystemCount = catalog != nullptr ? static_cast<int>(catalog->size()) : 0;
        return parsed;
    }

    /** Parses Celestia deep sky catalogues (.dsc) and installs them. */
    bool loadDeepSky(const std::vector<std::string>& catalogs)
    {
        Universe* u = currentUniverse();
        if (u == nullptr)
            return false;

        DSODatabaseBuilder builder(*geometryPaths, *u->getUrlManager());
        for (const auto& text : catalogs)
        {
            std::istringstream stream(text);
            if (!builder.load(stream, std::filesystem::path{}))
                return false;
        }

        auto catalog = builder.finish();
        if (catalog == nullptr)
            return false;

        dsoCount = static_cast<int>(catalog->size());
        u->setDSOCatalog(std::move(catalog));
        return true;
    }

    /** Parses the asterisms file and installs it. */
    bool loadAsterisms(const std::string& text)
    {
        Universe* u = currentUniverse();
        if (u == nullptr || u->getStarCatalog() == nullptr)
            return false;

        std::istringstream stream(text);
        auto asterisms = ReadAsterismList(stream, *u->getStarCatalog());
        if (asterisms == nullptr)
            return false;

        asterismCount = static_cast<int>(asterisms->size());
        u->setAsterisms(std::move(asterisms));
        return true;
    }

    /** Parses the constellation boundaries file and installs it. */
    bool loadBoundaries(const std::string& text)
    {
        Universe* u = currentUniverse();
        if (u == nullptr)
            return false;

        std::istringstream stream(text);
        auto boundaries = ReadBoundaries(stream);
        if (boundaries == nullptr)
            return false;

        u->setBoundaries(std::move(boundaries));
        return true;
    }

    // ---------------------------------------------------------------- camera

    /** Observer position in light years. */
    std::vector<double> observerPositionLy() const
    {
        const Observer* observer = currentObserver();
        if (observer == nullptr)
            return {};
        const auto position = observer->getPosition().toLy();
        return { position.x(), position.y(), position.z() };
    }

    void setObserverPositionLy(double x, double y, double z)
    {
        if (simulation != nullptr)
            simulation->setObserverPosition(UniversalCoord(x, y, z));
    }

    /** Observer orientation as a quaternion, x y z w. */
    std::vector<double> observerOrientation() const
    {
        const Observer* observer = currentObserver();
        if (observer == nullptr)
            return {};
        const auto q = observer->getOrientation();
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

    /** Selects an object by path without moving the observer. */
    bool selectObject(const std::string& path)
    {
        if (simulation == nullptr)
            return false;
        const auto selection = simulation->findObjectFromPath(path, false);
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

    /**
     * Selects whatever lies under a viewport pixel and returns its selection
     * type. The pick ray is built the way CelestiaCore::getPickRay does, except
     * that the single full-window viewport makes the view mapping a plain
     * normalisation.
     */
    std::string pickAt(double x, double y, int width, int height)
    {
        if (simulation == nullptr || renderer == nullptr || width <= 0 || height <= 0)
            return "None";

        const float aspect = static_cast<float>(width) / static_cast<float>(height);
        const float pickX = (static_cast<float>(x) / static_cast<float>(width) - 0.5f) * aspect;
        const float pickY = 0.5f - static_cast<float>(y) / static_cast<float>(height);

        const Eigen::Vector3f ray = renderer->getProjectionMode()->getPickRay(
            pickX, pickY, simulation->getObserver().getZoom());

        const Selection selection = simulation->pickObject(ray, renderer->getRenderFlags(), 0.0f);
        simulation->setSelection(selection);
        return selectionTypeName(selection.getType());
    }

    /** Advances the simulation clock by dt days. */
    void advanceTime(double dt) { if (simulation != nullptr) simulation->update(dt); }

    /**
     * Turns the observer for a mouse drag. The rotation rate scales with the
     * field of view and the drawable size, the way CelestiaCore::mouseMove does
     * for a left drag with no reference object.
     */
    void rotateObserverByDrag(double dx, double dy, int width, int height)
    {
        if (simulation == nullptr || width <= 0 || height <= 0)
            return;

        const float coarseness =
            celestia::math::radToDeg(simulation->getObserver().getFOV()) / 30.0f;
        const Eigen::Quaternionf q =
            celestia::math::XRotation(static_cast<float>(dy / height) * coarseness) *
            celestia::math::YRotation(static_cast<float>(dx / width) * coarseness);
        simulation->rotate(q.conjugate());
    }

    /** Moves the observer closer to or further from the selection. */
    void changeDistance(float factor)
    {
        if (simulation != nullptr)
            simulation->changeOrbitDistance(static_cast<float>(factor));
    }

    /**
     * Reports the file a texture name resolves to, so the assets mounted in the
     * file system can be checked against what a catalogue asks for. Empty when
     * the name resolves to nothing, which is what leaves a body untextured.
     */
    std::string resolveTexture(const std::string& name)
    {
        const auto handle = texturePaths->getHandle(name, std::filesystem::path{});
        if (handle == celestia::util::TextureHandle::Invalid)
            return {};

        celestia::engine::TextureInfo info;
        if (!texturePaths->getInfo(handle, celestia::engine::TextureResolution::medres, info))
            return {};

        return info.path.string();
    }

    /** Reports the file a mesh name resolves to. Empty when nothing resolves. */
    std::string resolveModel(const std::string& name)
    {
        const auto handle = geometryPaths->getHandle(name, std::filesystem::path{});
        if (handle == celestia::engine::GeometryHandle::Invalid ||
            handle == celestia::engine::GeometryHandle::Empty)
            return {};

        celestia::engine::GeometryInfo info;
        if (!geometryPaths->getInfo(handle, info))
            return {};

        return info.path.string();
    }

    /** Creates the renderer and its GL resources for a drawable of this size. */
    bool initRenderer(const std::string& canvasSelector, int width, int height)
    {
        if (simulation == nullptr)
            return false;

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

            // The front end fills in the GL capability tables before the
            // renderer exists: CelestiaGlWidget::initializeGL calls gl::init()
            // and then gl::checkVersion(). Renderer::init does neither, and
            // gl::maxTextureSize starts at zero, so without this every texture
            // that gets built divides by it and no surface is ever uploaded.
            if (!celestia::gl::init() || !celestia::gl::checkVersion(celestia::gl::GLES_3_0))
                return false;

            glContextInitialised = true;
        }

        if (renderer == nullptr)
            renderer = std::make_unique<Renderer>();

        const Renderer::DetailOptions options;
        if (!renderer->init(width, height, options,
                            celestia::engine::TextureResolution::medres,
                            geometryManager, texturePaths, resourceSystem))
            return false;

        renderer->resize(width, height);

        // Renderer::init does not create a projection mode; CelestiaCore
        // installs one afterwards, and render() dereferences it immediately.
        // The screen distance and DPI are CelestiaCore's own defaults.
        renderer->setProjectionMode(std::make_shared<celestia::engine::PerspectiveProjectionMode>(
            static_cast<float>(width), static_cast<float>(height), 400, 96));
        return true;
    }

    /** Draws one frame with Celestia's own renderer. */
    void renderFrame()
    {
        if (simulation != nullptr && renderer != nullptr)
            simulation->render(*renderer);
    }

    void resizeRenderer(int width, int height)
    {
        if (renderer != nullptr)
            renderer->resize(width, height);
    }

    bool hasRenderer() const { return renderer != nullptr; }

    /** Creates the Simulation, taking ownership of the Universe as CelestiaCore does. */
    void start()
    {
        if (universe == nullptr || simulation != nullptr)
            return;
        simulation = std::make_unique<Simulation>(std::move(universe), observerSettings);
    }

    bool hasSimulation() const { return simulation != nullptr; }
    int getStarCount() const { return starCount; }
    int getSolarSystemCount() const { return solarSystemCount; }
    int getDSOCount() const { return dsoCount; }
    int getAsterismCount() const { return asterismCount; }

    /** Object lookup through the running simulation. */
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

    double getTime() const { return simulation != nullptr ? simulation->getTime() : 0.0; }
    void setTime(double tdb) { if (simulation != nullptr) simulation->setTime(tdb); }

private:
    /** The Universe, whether or not the Simulation has taken it over. */
    Universe* currentUniverse() const
    {
        return simulation != nullptr ? simulation->getUniverse() : universe.get();
    }

    Observer* currentObserver() const
    {
        return simulation != nullptr ? simulation->getActiveObserver() : nullptr;
    }

    std::shared_ptr<celestia::engine::GeometryPaths> geometryPaths;
    std::shared_ptr<celestia::engine::TexturePaths> texturePaths;
    std::shared_ptr<celestia::engine::ResourceSystem> resourceSystem;
    std::shared_ptr<celestia::engine::GeometryManager> geometryManager;
    std::unique_ptr<Universe> universe;
    std::shared_ptr<celestia::engine::ObserverSettings> observerSettings;
    std::unique_ptr<Simulation> simulation;
    std::unique_ptr<Renderer> renderer;
    EMSCRIPTEN_WEBGL_CONTEXT_HANDLE glContext{ 0 };
    bool glContextInitialised{ false };
    int starCount{ 0 };
    int solarSystemCount{ 0 };
    int dsoCount{ 0 };
    int asterismCount{ 0 };
};

namespace
{

/** Position of a selection in kilometres, as a flat array. */
std::vector<double> selectionPositionKm(const Selection& selection, double tdb)
{
    const auto position = selection.getPosition(tdb).toLy();
    return { position.x() * KM_PER_LY, position.y() * KM_PER_LY, position.z() * KM_PER_LY };
}

/** Resolves a path such as "Sol/Earth/Moon" through the real Universe. */
Selection findObject(const Simulation& simulation, const std::string& path)
{
    return simulation.findObjectFromPath(path, false);
}

} // namespace

EMSCRIPTEN_BINDINGS(celestia_engine)
{
    register_vector<double>("VectorDouble");
    register_vector<std::string>("VectorString");

    enum_<SelectionType>("SelectionType")
        .value("None", SelectionType::None)
        .value("Star", SelectionType::Star)
        .value("Body", SelectionType::Body)
        .value("DeepSky", SelectionType::DeepSky)
        .value("Location", SelectionType::Location);

    class_<CelestiaEngine>("CelestiaEngine")
        .constructor<>()
        .function("loadStars", &CelestiaEngine::loadStars)
        .function("loadStarCatalog", &CelestiaEngine::loadStarCatalog)
        .function("loadSolarSystem", &CelestiaEngine::loadSolarSystem)
        .function("start", &CelestiaEngine::start)
        .function("hasSimulation", &CelestiaEngine::hasSimulation)
        .function("starCount", &CelestiaEngine::getStarCount)
        .function("solarSystemCount", &CelestiaEngine::getSolarSystemCount)
        .function("dsoCount", &CelestiaEngine::getDSOCount)
        .function("asterismCount", &CelestiaEngine::getAsterismCount)
        .function("loadDeepSky", &CelestiaEngine::loadDeepSky)
        .function("loadAsterisms", &CelestiaEngine::loadAsterisms)
        .function("loadBoundaries", &CelestiaEngine::loadBoundaries)
        .function("initRenderer", &CelestiaEngine::initRenderer)
        .function("renderFrame", &CelestiaEngine::renderFrame)
        .function("resizeRenderer", &CelestiaEngine::resizeRenderer)
        .function("hasRenderer", &CelestiaEngine::hasRenderer)
        .function("observerPositionLy", &CelestiaEngine::observerPositionLy)
        .function("setObserverPositionLy", &CelestiaEngine::setObserverPositionLy)
        .function("observerOrientation", &CelestiaEngine::observerOrientation)
        .function("setObserverOrientation", &CelestiaEngine::setObserverOrientation)
        .function("rotateObserverByDrag", &CelestiaEngine::rotateObserverByDrag)
        .function("changeDistance", &CelestiaEngine::changeDistance)
        .function("setLogLevel", &CelestiaEngine::setLogLevel)
        .function("resolveTexture", &CelestiaEngine::resolveTexture)
        .function("resolveModel", &CelestiaEngine::resolveModel)
        .function("observerFov", &CelestiaEngine::observerFov)
        .function("setObserverFov", &CelestiaEngine::setObserverFov)
        .function("selectObject", &CelestiaEngine::selectObject)
        .function("gotoObject", &CelestiaEngine::gotoObject)
        .function("centerSelection", &CelestiaEngine::centerSelection)
        .function("followSelection", &CelestiaEngine::followSelection)
        .function("cancelMotion", &CelestiaEngine::cancelMotion)
        .function("pickAt", &CelestiaEngine::pickAt)
        .function("advanceTime", &CelestiaEngine::advanceTime)
        .function("objectExists", &CelestiaEngine::objectExists)
        .function("objectPositionKm", &CelestiaEngine::objectPositionKm)
        .function("objectRadiusKm", &CelestiaEngine::objectRadiusKm)
        .function("objectType", &CelestiaEngine::objectType)
        .function("getTime", &CelestiaEngine::getTime)
        .function("setTime", &CelestiaEngine::setTime);

    class_<Simulation>("Simulation")
        .function("getTime", &Simulation::getTime)
        .function("setTime", &Simulation::setTime)
        .function("update", &Simulation::update)
        .function("setSelection", &Simulation::setSelection)
        .function("getSelection", &Simulation::getSelection)
        .function("getTimeScale", &Simulation::getTimeScale)
        .function("setTimeScale", &Simulation::setTimeScale);

    class_<Selection>("Selection")
        .function("isEmpty", &Selection::empty)
        .function("radius", &Selection::radius)
        .function("getPositionKm", &selectionPositionKm)
        .function("isVisible", &Selection::isVisible)
        .function("typeName", +[](const Selection& self) { return selectionTypeName(self.getType()); });

    function("findObject", &findObject);
}
