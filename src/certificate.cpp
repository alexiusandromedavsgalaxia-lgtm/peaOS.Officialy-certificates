#include "certificate.hpp"

namespace certificate {
namespace {
bool equal_bytes(const uint8_t* a, const uint8_t* b, uint32_t n) {
    if (!a || !b) return false;
    for (uint32_t i = 0; i < n; ++i) if (a[i] != b[i]) return false;
    return true;
}
}

Status validate_server(const Certificate* cert, const ServerValidation& server,
                      const uint8_t* expected_origin_hash,
                      const uint8_t* package_hash) {
    if (!cert || cert->magic != kMagic || cert->version != kVersion || cert->serial == 0)
        return Status::Invalid;
    if (!server.reachable) return Status::ServerUnavailable;
    if (server.revoked || !server.active) return Status::NotActiveOnServer;
    if (!server.signature_valid) return Status::SignatureInvalid;
    if (!server.issuer_valid) return Status::IssuerMismatch;
    if (!server.origin_valid || !equal_bytes(cert->origin_hash, expected_origin_hash, kSha256Size))
        return Status::OriginMismatch;
    if (!server.package_valid || !package_hash) return Status::PackageMismatch;
    return Status::Valid;
}

bool expired(const Certificate* cert, uint64_t now) {
    if (!cert || cert->magic != kMagic || cert->version != kVersion || now == 0) return true;
    return cert->expires_at <= cert->issued_at || now < cert->issued_at || now >= cert->expires_at;
}
}
