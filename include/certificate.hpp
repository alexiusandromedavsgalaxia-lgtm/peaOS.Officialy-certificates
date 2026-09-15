#pragma once

#include <stdint.h>

namespace certificate {
constexpr uint32_t kMagic = 0x50434150;
constexpr uint16_t kVersion = 2;
constexpr uint8_t kMaxApplications = 5;
constexpr uint64_t kValiditySeconds = 90ull * 24ull * 60ull * 60ull;
constexpr uint8_t kSha256Size = 32;
constexpr uint8_t kEd25519SignatureSize = 64;

enum class Distribution : uint8_t { Local = 0, WebDistribution = 1 };
enum class Status : uint8_t {
    Valid, Missing, Invalid, Expired, ApplicationLimit, WebDistributionRequired,
    Revoked, OriginMismatch, SignatureInvalid, IssuerMismatch, PackageMismatch,
    ServerUnavailable, NotActiveOnServer
};

struct Certificate {
    uint32_t magic;
    uint16_t version;
    uint16_t reserved;
    uint64_t issued_at;
    uint64_t expires_at;
    uint64_t serial;
    uint8_t application_count;
    uint8_t distribution;
    uint8_t reserved2[6];
    uint8_t certificate_id[16];
    uint8_t issuer_key_id[16];
    uint8_t origin_hash[kSha256Size];
    uint8_t signature[kEd25519SignatureSize];
};

struct ServerValidation {
    bool reachable;
    bool active;
    bool revoked;
    bool signature_valid;
    bool issuer_valid;
    bool origin_valid;
    bool package_valid;
};

Status validate_server(const Certificate* cert, const ServerValidation& server,
                      const uint8_t* expected_origin_hash,
                      const uint8_t* package_hash);

bool expired(const Certificate* cert, uint64_t now);
}
