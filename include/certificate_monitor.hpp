#pragma once

#include <stdint.h>
#include "certificate.hpp"

namespace certificate_monitor {
constexpr uint64_t kCheckIntervalSeconds = 5ull * 60ull;
constexpr uint32_t kMaxTrackedCertificates = 256;

enum class InstallState : uint8_t { Unknown, Installed, Missing, Invalid, Expired, Active, Revoked, ServerUnavailable };

struct CertificateRecord {
    uint64_t serial;
    uint8_t certificate_id[16];
    uint8_t distribution;
    InstallState state;
    bool installed;
    bool server_active;
    bool server_revoked;
    uint64_t last_checked;
};

struct Inventory {
    uint32_t total;
    uint32_t installed;
    uint32_t active;
    uint32_t revoked;
    uint32_t expired;
    uint32_t invalid;
    uint32_t server_unavailable;
    uint32_t local_distribution;
    uint32_t web_distribution;
};

void init(uint64_t now);
bool register_certificate(const certificate::Certificate* cert, bool installed, uint64_t now);
bool remove_certificate(uint64_t serial);
uint32_t check_all(const certificate::ServerValidation& server, const uint8_t* expected_origin_hash,
                   const uint8_t* package_hash, uint64_t now);
bool tick(uint64_t now, const certificate::ServerValidation& server,
          const uint8_t* expected_origin_hash, const uint8_t* package_hash);
const Inventory& inventory();
const CertificateRecord* records(uint32_t* count);
}
