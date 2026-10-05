// A gettext that actually translates.
//
// Celestia is localised through gettext: the engine's strings go through _(),
// which is gettext, and Celestia's Qt front end uses the same catalogue, which
// is why po/zh_CN.po carries both the engine's labels and the interface's --
// "Planets" and "Select Sun" in the same file. Emscripten links musl's gettext,
// whose whole implementation returns the message it was given, so nothing was
// ever translated.
//
// These definitions replace it. They read a compiled catalogue from the
// Emscripten file system -- the same .mo files Celestia's build installs under
// <localedir>/<language>/LC_MESSAGES/celestia.mo -- and do the lookup musl does
// not. The front end calls bindtextdomain once to say where they live, and the
// engine's own _() calls start returning translations with no change to the
// engine.
//
// An object file's definition takes precedence over one from a library, so these
// replace musl's without a patch to either.

#include <cstddef>
#include <cstdint>
#include <fstream>
#include <iterator>
#include <string>
#include <unordered_map>
#include <vector>

namespace
{

/** The magic of a little endian .mo, and the version we can read. */
constexpr std::uint32_t MO_MAGIC = 0x950412deU;

struct Catalog
{
    std::unordered_map<std::string, std::string> messages;
    bool loaded{ false };
};

std::string g_localeDirectory;
std::string g_domain{ "messages" };
std::unordered_map<std::string, Catalog> g_catalogs;

/** .mo stores every integer little endian, in three parallel tables. */
std::uint32_t readUint32(const std::vector<char>& data, std::size_t at)
{
    if (at + 4 > data.size())
        return 0;
    return static_cast<std::uint32_t>(static_cast<unsigned char>(data[at]))
         | (static_cast<std::uint32_t>(static_cast<unsigned char>(data[at + 1])) << 8)
         | (static_cast<std::uint32_t>(static_cast<unsigned char>(data[at + 2])) << 16)
         | (static_cast<std::uint32_t>(static_cast<unsigned char>(data[at + 3])) << 24);
}

std::string readString(const std::vector<char>& data, std::uint32_t table, std::uint32_t index)
{
    const std::size_t entry = static_cast<std::size_t>(table) + static_cast<std::size_t>(index) * 8;
    const std::uint32_t length = readUint32(data, entry);
    const std::uint32_t offset = readUint32(data, entry + 4);
    if (offset + length > data.size())
        return {};
    return std::string(data.data() + offset, length);
}

Catalog& catalogFor(const std::string& domain)
{
    Catalog& catalog = g_catalogs[domain];
    if (catalog.loaded || g_localeDirectory.empty())
        return catalog;

    catalog.loaded = true;

    std::ifstream file(g_localeDirectory + "/" + domain + ".mo", std::ios::binary);
    if (!file.good())
        return catalog;

    const std::vector<char> data{ std::istreambuf_iterator<char>(file), std::istreambuf_iterator<char>() };
    if (data.size() < 28 || readUint32(data, 0) != MO_MAGIC)
        return catalog;

    const std::uint32_t count = readUint32(data, 8);
    const std::uint32_t originalTable = readUint32(data, 12);
    const std::uint32_t translationTable = readUint32(data, 16);

    for (std::uint32_t i = 0; i < count; i++)
    {
        const std::string id = readString(data, originalTable, i);
        // The first entry is the header, and a plural form repeats the id with a
        // NUL and the index after it; the singular translation is the one kept.
        if (id.empty() || id.find('\0') != std::string::npos)
            continue;

        catalog.messages[id] = readString(data, translationTable, i);
    }

    return catalog;
}

const char* translate(const char* domain, const char* msgid)
{
    if (msgid == nullptr)
        return msgid;

    const Catalog& catalog = catalogFor(domain != nullptr ? domain : g_domain.c_str());
    const auto found = catalog.messages.find(msgid);
    return found == catalog.messages.end() ? msgid : found->second.c_str();
}

} // namespace

extern "C"
{

char* bindtextdomain(const char* domainname, const char* dirname)
{
    g_localeDirectory = dirname != nullptr ? dirname : "";
    g_domain = domainname != nullptr ? domainname : "messages";
    g_catalogs.clear();
    return const_cast<char*>(dirname);
}

char* textdomain(const char* domainname)
{
    if (domainname != nullptr)
        g_domain = domainname;
    return const_cast<char*>(g_domain.c_str());
}

char* gettext(const char* msgid)
{
    return const_cast<char*>(translate(g_domain.c_str(), msgid));
}

char* dgettext(const char* domainname, const char* msgid)
{
    return const_cast<char*>(translate(domainname, msgid));
}

char* dcgettext(const char* domainname, const char* msgid, int)
{
    return const_cast<char*>(translate(domainname, msgid));
}

char* pgettext(const char* msgctxt, const char* msgid)
{
    if (msgid == nullptr)
        return nullptr;
    if (msgctxt == nullptr || *msgctxt == '\0')
        return gettext(msgid);

    // A catalogue stores a contextualised message under "context\x04message".
    const Catalog& catalog = catalogFor(g_domain);
    const std::string key = std::string{ msgctxt } + '\x04' + msgid;
    const auto found = catalog.messages.find(key);
    // The msgid is returned rather than the key that was looked up, which is a
    // local and would not outlive the call.
    return const_cast<char*>(found == catalog.messages.end() ? msgid : found->second.c_str());
}

char* ngettext(const char* msgid, const char* msgidPlural, unsigned long count)
{
    return const_cast<char*>(translate(g_domain.c_str(), count == 1 ? msgid : msgidPlural));
}

char* dngettext(const char* domainname, const char* msgid, const char* msgidPlural, unsigned long count)
{
    return const_cast<char*>(translate(domainname, count == 1 ? msgid : msgidPlural));
}

char* dcngettext(const char* domainname, const char* msgid, const char* msgidPlural, unsigned long count, int)
{
    return const_cast<char*>(translate(domainname, count == 1 ? msgid : msgidPlural));
}

} // extern "C"
