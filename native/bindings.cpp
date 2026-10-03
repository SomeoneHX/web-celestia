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

#include <emscripten/bind.h>

#include <celastro/units.h>
#include <celengine/meshmanager.h>
#include <celengine/observer.h>
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
    }

    /** Parses a Celestia text star catalogue (.stc) and installs it. */
    bool loadStarCatalog(const std::string& text)
    {
        if (universe == nullptr)
            return false;

        StarDatabaseBuilder builder(*geometryPaths, *texturePaths, *universe->getUrlManager());
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
        universe->setStarCatalog(std::move(catalog));
        return true;
    }

    /** Parses a Celestia solar system catalogue (.ssc). */
    bool loadSolarSystem(const std::string& text)
    {
        if (universe == nullptr)
            return false;

        // Celestia installs an empty catalog before reading any .ssc file
        // (loadSSO in src/celestia/loadsso.cpp); the builder appends to it.
        if (universe->getSolarSystemCatalog() == nullptr)
            universe->setSolarSystemCatalog(std::make_unique<SolarSystemCatalog>());

        SolarSystemsBuilder builder(*universe, *geometryPaths, *texturePaths, *universe->getUrlManager());
        std::istringstream stream(text);
        const bool parsed = builder.parseSsc(stream, std::filesystem::path{});
        builder.finish();

        const auto* catalog = universe->getSolarSystemCatalog();
        solarSystemCount = catalog != nullptr ? static_cast<int>(catalog->size()) : 0;
        return parsed;
    }

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
    std::shared_ptr<celestia::engine::GeometryPaths> geometryPaths;
    std::shared_ptr<celestia::engine::TexturePaths> texturePaths;
    std::shared_ptr<celestia::engine::ResourceSystem> resourceSystem;
    std::shared_ptr<celestia::engine::GeometryManager> geometryManager;
    std::unique_ptr<Universe> universe;
    std::shared_ptr<celestia::engine::ObserverSettings> observerSettings;
    std::unique_ptr<Simulation> simulation;
    int starCount{ 0 };
    int solarSystemCount{ 0 };
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

/** Diagnostic: returns the string it was given. */
std::string echoString(const std::string& text)
{
    return text;
}

} // namespace

EMSCRIPTEN_BINDINGS(celestia_engine)
{
    register_vector<double>("VectorDouble");

    enum_<SelectionType>("SelectionType")
        .value("None", SelectionType::None)
        .value("Star", SelectionType::Star)
        .value("Body", SelectionType::Body)
        .value("DeepSky", SelectionType::DeepSky)
        .value("Location", SelectionType::Location);

    class_<CelestiaEngine>("CelestiaEngine")
        .constructor<>()
        .function("loadStarCatalog", &CelestiaEngine::loadStarCatalog)
        .function("loadSolarSystem", &CelestiaEngine::loadSolarSystem)
        .function("start", &CelestiaEngine::start)
        .function("hasSimulation", &CelestiaEngine::hasSimulation)
        .function("starCount", &CelestiaEngine::getStarCount)
        .function("solarSystemCount", &CelestiaEngine::getSolarSystemCount)
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
    function("echoString", &echoString);
}
