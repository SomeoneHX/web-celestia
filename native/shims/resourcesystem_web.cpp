// Web build of ResourceSystem.
//
// The desktop implementation decodes textures and meshes on a worker pool.
// Emscripten only provides std::thread when every translation unit is compiled
// with -pthread, and pthreads in the browser require cross-origin isolation, so
// this build runs decode tasks inline on the calling thread instead. The
// observable behaviour matches the original: a submitted task completes before
// submit() returns, and the per-frame hooks work the same way. Only the worker
// pool differs, so the bodies below other than the constructor and submit() are
// the originals from celengine/resourcesystem.cpp.

#include <celengine/resourcesystem.h>

#include <algorithm>
#include <utility>

namespace celestia::engine
{

ResourceSystem::ResourceSystem(unsigned /*numWorkers*/)
{
}

ResourceSystem::~ResourceSystem()
{
    shutdown();
}

void
ResourceSystem::shutdown() noexcept
{
    m_stop = true;
    std::queue<DecodeTask> empty;
    std::swap(m_work, empty);
}

void
ResourceSystem::submit(DecodeTask task)
{
    if (!task)
        return;

    task();
}

void
ResourceSystem::beginFrame() noexcept
{
    ++m_currentFrame;
}

void
ResourceSystem::drainCaches()
{
    const std::size_t budget = m_uploadBudgetBytes;
    const std::size_t count = m_caches.size();
    if (budget == 0 || count == 0)
        return;

    std::size_t remaining = budget;
    const std::size_t start = m_drainCursor % count;
    m_iterating = true;
    for (std::size_t k = 0; k < count; ++k)
    {
        if (remaining == 0)
            break;
        auto* cache = m_caches[(start + k) % count];
        if (cache == nullptr)
            continue;
        const std::size_t uploaded = cache->drainReady(remaining);
        remaining = uploaded >= remaining ? 0 : remaining - uploaded;
    }
    finishCacheIteration();
    ++m_drainCursor;
}

void
ResourceSystem::purgeIfDue()
{
    if (m_purgeIntervalFrames == 0 || m_currentFrame == 0 ||
        (m_currentFrame % m_purgeIntervalFrames) != 0)
        return;

    m_iterating = true;
    for (auto* cache : m_caches)
    {
        if (cache != nullptr)
            cache->purgeStale(m_graceFrames);
    }
    finishCacheIteration();
}

void
ResourceSystem::registerCache(ResourceCacheBase* cache)
{
    if (cache == nullptr)
        return;

    auto present = [cache](const std::vector<ResourceCacheBase*>& v)
    {
        return std::find(v.begin(), v.end(), cache) != v.end();
    };
    if (present(m_caches) || present(m_pendingCaches))
        return;

    if (m_iterating)
        m_pendingCaches.push_back(cache);
    else
        m_caches.push_back(cache);
}

void
ResourceSystem::unregisterCache(ResourceCacheBase* cache) noexcept
{
    for (auto*& slot : m_caches)
    {
        if (slot == cache)
            slot = nullptr;
    }
    m_pendingCaches.erase(
        std::remove(m_pendingCaches.begin(), m_pendingCaches.end(), cache),
        m_pendingCaches.end());

    if (!m_iterating)
    {
        m_caches.erase(std::remove(m_caches.begin(), m_caches.end(), nullptr),
                       m_caches.end());
    }
}

void
ResourceSystem::finishCacheIteration()
{
    m_iterating = false;
    m_caches.erase(std::remove(m_caches.begin(), m_caches.end(), nullptr),
                   m_caches.end());
    for (auto* cache : m_pendingCaches)
    {
        if (std::find(m_caches.begin(), m_caches.end(), cache) == m_caches.end())
            m_caches.push_back(cache);
    }
    m_pendingCaches.clear();
}

void
ResourceSystem::workerLoop()
{
}

} // namespace celestia::engine
